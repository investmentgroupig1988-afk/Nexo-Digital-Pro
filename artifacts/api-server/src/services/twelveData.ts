import axios from "axios";
import { HistoricalCandle, HistoricalTimeframe } from "./historical";

const TWELVE_DATA_BASE_URL = "https://api.twelvedata.com";
const REQUEST_TIMEOUT_MS = 10_000;
const CACHE_TTL_MS = 30_000;

export type TwelveDataInterval = "1min" | "5min" | "15min" | "1hour" | "4hour";

export type GoldMarketData = {
  symbol: "XAUUSD";
  price: number;
  currency: "USD";
  unit: "troy_ounce";
  updatedAt: string;
  provider: "twelvedata";
  assetClass: "gold";
};

export type GoldHistoricalResult = {
  status: "OK";
  symbol: "XAUUSD";
  timeframe: HistoricalTimeframe;
  provider: "twelvedata";
  candles: HistoricalCandle[];
  availableTimeframes: readonly HistoricalTimeframe[];
  message: null;
};

export type GoldHistoricalUnavailable = {
  status: "UNAVAILABLE";
  symbol: "XAUUSD";
  timeframe: HistoricalTimeframe;
  provider: "twelvedata";
  candles: [];
  availableTimeframes: readonly [];
  message: string;
};

export class TwelveDataError extends Error {
  constructor(
    message: string,
    public readonly statusCode: 400 | 429 | 502 | 503 = 502,
  ) {
    super(message);
    this.name = "TwelveDataError";
  }
}

type TwelveDataTimeSeriesItem = {
  datetime?: unknown;
  open?: unknown;
  high?: unknown;
  low?: unknown;
  close?: unknown;
  volume?: unknown;
};

type TwelveDataTimeSeriesResponse = {
  meta?: {
    symbol?: string;
    interval?: string;
    currency?: string;
  };
  values?: TwelveDataTimeSeriesItem[];
  status?: string;
  code?: number;
  message?: string;
};

type TwelveDataPriceResponse = {
  price?: unknown;
  status?: string;
  code?: number;
  message?: string;
};

const candleCache = new Map<string, { expiresAt: number; data: GoldHistoricalResult }>();
const candleInFlight = new Map<string, Promise<GoldHistoricalResult>>();

let priceCache: { expiresAt: number; data: GoldMarketData } | undefined;
let priceInFlight: Promise<GoldMarketData> | undefined;

export function mapTimeframeToTwelveDataInterval(
  timeframe: HistoricalTimeframe,
): TwelveDataInterval {
  switch (timeframe) {
    case "1m":
      return "1min";
    case "5m":
      return "5min";
    case "15m":
      return "15min";
    case "1h":
      return "1hour";
    case "4h":
      return "4hour";
    default:
      throw new TwelveDataError(`Unsupported timeframe "${timeframe}"`, 400);
  }
}

function getApiKey(): string {
  const key = process.env.TWELVEDATA_API_KEY?.trim();
  if (!key) {
    throw new TwelveDataError(
      "Gold market data is unavailable because TWELVEDATA_API_KEY is not configured.",
      503,
    );
  }
  return key;
}

function sanitizeErrorMessage(msg: string | undefined): string {
  if (!msg) return "Twelve Data API error";
  // Ensure no sensitive query parameters or keys in message
  return msg.replace(/apikey=[^&]+/gi, "apikey=***");
}

function parseCandle(item: TwelveDataTimeSeriesItem): HistoricalCandle {
  if (typeof item.datetime !== "string" || !item.datetime.trim()) {
    throw new TwelveDataError("Twelve Data returned candle with missing timestamp.");
  }

  // Twelve Data timestamps for forex/metals are UTC strings like "2026-08-13 14:00:00" or ISO
  const dtStr = item.datetime.includes("Z") || item.datetime.includes("+")
    ? item.datetime
    : item.datetime.replace(" ", "T") + "Z";
  const parsedDate = new Date(dtStr);

  if (Number.isNaN(parsedDate.getTime())) {
    throw new TwelveDataError("Twelve Data returned candle with invalid timestamp.");
  }

  const open = Number(item.open);
  const high = Number(item.high);
  const low = Number(item.low);
  const close = Number(item.close);

  if (
    !Number.isFinite(open) ||
    !Number.isFinite(high) ||
    !Number.isFinite(low) ||
    !Number.isFinite(close) ||
    open <= 0 ||
    high <= 0 ||
    low <= 0 ||
    close <= 0
  ) {
    throw new TwelveDataError("Twelve Data returned candle with invalid OHLC numeric values.");
  }

  // Strict OHLC Validation
  if (high < Math.max(open, close) || low > Math.min(open, close) || high < low) {
    throw new TwelveDataError("Twelve Data returned candle failing OHLC relationship constraints.");
  }

  let volume: number | null = null;
  if (item.volume !== undefined && item.volume !== null && item.volume !== "") {
    const parsedVol = Number(item.volume);
    if (Number.isFinite(parsedVol) && parsedVol >= 0) {
      volume = parsedVol;
    }
  }

  return {
    timestamp: parsedDate.toISOString(),
    open,
    high,
    low,
    close,
    volume,
  };
}

export async function fetchGoldHistoricalCandles(
  timeframe: HistoricalTimeframe,
  limit: number,
): Promise<GoldHistoricalResult> {
  const apiKey = getApiKey();
  const interval = mapTimeframeToTwelveDataInterval(timeframe);

  let response;
  try {
    response = await axios.get<TwelveDataTimeSeriesResponse>(
      `${TWELVE_DATA_BASE_URL}/time_series`,
      {
        params: {
          symbol: "XAU/USD",
          interval,
          outputsize: limit,
          apikey: apiKey,
        },
        timeout: REQUEST_TIMEOUT_MS,
      },
    );
  } catch (error) {
    if (axios.isAxiosError(error)) {
      if (error.code === "ECONNABORTED") {
        throw new TwelveDataError("Twelve Data XAU/USD request timed out.", 502);
      }
      if (error.response?.status === 429) {
        throw new TwelveDataError("Twelve Data API rate limit exceeded.", 429);
      }
    }
    throw new TwelveDataError("Twelve Data XAU/USD historical data is currently unavailable.", 502);
  }

  const data = response.data;

  if (data.status === "error" || (data.code && data.code !== 200)) {
    const errorMsg = sanitizeErrorMessage(data.message);
    const isRateLimit = /rate limit|credit|api key/i.test(errorMsg);
    throw new TwelveDataError(
      `Twelve Data returned error: ${errorMsg}`,
      isRateLimit ? 429 : 502,
    );
  }

  if (!Array.isArray(data.values) || data.values.length === 0) {
    throw new TwelveDataError("Twelve Data returned no historical candles for XAU/USD.", 502);
  }

  // Parse and validate candles
  const candles = data.values.map(parseCandle);

  // Sort candles chronologically (oldest first)
  candles.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  return {
    status: "OK",
    symbol: "XAUUSD",
    timeframe,
    provider: "twelvedata",
    candles,
    availableTimeframes: ["1m", "5m", "15m", "1h", "4h"],
    message: null,
  };
}

export async function getGoldHistoricalCandlesCached(
  timeframe: HistoricalTimeframe,
  limit: number,
): Promise<GoldHistoricalResult> {
  const cacheKey = `${timeframe}:${limit}`;

  const cached = candleCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  const existingInFlight = candleInFlight.get(cacheKey);
  if (existingInFlight) {
    return existingInFlight;
  }

  const request = fetchGoldHistoricalCandles(timeframe, limit)
    .then((result) => {
      candleCache.set(cacheKey, {
        expiresAt: Date.now() + CACHE_TTL_MS,
        data: result,
      });
      return result;
    })
    .finally(() => {
      candleInFlight.delete(cacheKey);
    });

  candleInFlight.set(cacheKey, request);
  return request;
}

export async function getGoldMarketData(): Promise<GoldMarketData> {
  if (priceCache && priceCache.expiresAt > Date.now()) {
    return priceCache.data;
  }

  if (priceInFlight) {
    return priceInFlight;
  }

  const apiKey = getApiKey();

  priceInFlight = (async (): Promise<GoldMarketData> => {
    let price: number;
    let updatedAt: string;

    try {
      // First try /price endpoint
      const response = await axios.get<TwelveDataPriceResponse>(
        `${TWELVE_DATA_BASE_URL}/price`,
        {
          params: {
            symbol: "XAU/USD",
            apikey: apiKey,
          },
          timeout: REQUEST_TIMEOUT_MS,
        },
      );

      const data = response.data;
      if (data.status === "error" || !data.price) {
        throw new TwelveDataError(sanitizeErrorMessage(data.message), 502);
      }

      price = Number(data.price);
      updatedAt = new Date().toISOString();
    } catch {
      // Fallback: use recent historical 1min candle close if spot price endpoint fails
      const candlesResult = await fetchGoldHistoricalCandles("1m", 1);
      const latest = candlesResult.candles.at(-1);
      if (!latest) {
        throw new TwelveDataError("Twelve Data returned no valid price or candle data for XAU/USD.");
      }
      price = latest.close;
      updatedAt = latest.timestamp;
    }

    if (!Number.isFinite(price) || price <= 0) {
      throw new TwelveDataError("Twelve Data returned an invalid price for XAU/USD.");
    }

    const result: GoldMarketData = {
      symbol: "XAUUSD",
      price,
      currency: "USD",
      unit: "troy_ounce",
      updatedAt,
      provider: "twelvedata",
      assetClass: "gold",
    };

    priceCache = {
      expiresAt: Date.now() + CACHE_TTL_MS,
      data: result,
    };

    return result;
  })().finally(() => {
    priceInFlight = undefined;
  });

  return priceInFlight;
}
