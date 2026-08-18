import { getGoldHistoricalCandles } from "./gold";
import { getBinance, type MarketCandle } from "./market";

export const SUPPORTED_TIMEFRAMES = ["1m", "5m", "15m", "1h", "4h"] as const;
export type HistoricalTimeframe = (typeof SUPPORTED_TIMEFRAMES)[number];

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 1_000;
const CACHE_TTL_MS = 20_000;

export type HistoricalCandle = {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number | null;
};

export type HistoricalDataResult =
  | {
      status: "OK";
      symbol: "BTCUSDT";
      timeframe: HistoricalTimeframe;
      provider: "binance";
      candles: HistoricalCandle[];
      availableTimeframes: readonly HistoricalTimeframe[];
      message: null;
    }
  | {
      status: "OK";
      symbol: "XAUUSD";
      timeframe: HistoricalTimeframe;
      provider: "twelvedata";
      candles: HistoricalCandle[];
      availableTimeframes: readonly HistoricalTimeframe[];
      message: null;
    }
  | {
      status: "UNAVAILABLE";
      symbol: "XAUUSD";
      timeframe: HistoricalTimeframe;
      provider: "twelvedata";
      candles: [];
      availableTimeframes: readonly [];
      message: string;
    };


export class HistoricalDataError extends Error {
  constructor(
    message: string,
    public readonly statusCode: 400 | 502 = 502,
  ) {
    super(message);
    this.name = "HistoricalDataError";
  }
}

type BinanceKline = [
  number,
  string,
  string,
  string,
  string,
  string,
  number,
  string,
  number,
  string,
  string,
  string,
];

const cache = new Map<
  string,
  { expiresAt: number; result: Extract<HistoricalDataResult, { status: "OK" }> }
>();
const inFlight = new Map<
  string,
  Promise<Extract<HistoricalDataResult, { status: "OK" }>>
>();

export function parseHistoricalTimeframe(value: string | undefined): HistoricalTimeframe {
  const timeframe = value?.trim() || "15m";
  if ((SUPPORTED_TIMEFRAMES as readonly string[]).includes(timeframe)) {
    return timeframe as HistoricalTimeframe;
  }

  throw new HistoricalDataError(
    `Unsupported timeframe "${timeframe}". Use one of: ${SUPPORTED_TIMEFRAMES.join(", ")}.`,
    400,
  );
}

export function parseHistoricalLimit(value: string | undefined): number {
  if (value === undefined || value.trim() === "") {
    return DEFAULT_LIMIT;
  }

  const limit = Number(value);
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
    throw new HistoricalDataError(
      `Invalid limit "${value}". Use an integer between 1 and ${MAX_LIMIT}.`,
      400,
    );
  }

  return limit;
}

function normalizeBinanceCandle(kline: BinanceKline): HistoricalCandle {
  const [timestamp, open, high, low, close, volume] = kline;
  const values = [Number(open), Number(high), Number(low), Number(close), Number(volume)];
  if (
    !Number.isFinite(timestamp) ||
    values.some((value) => !Number.isFinite(value)) ||
    values.slice(0, 4).some((value) => value <= 0) ||
    values[4] < 0
  ) {
    throw new HistoricalDataError("Binance returned malformed historical candle data.");
  }

  return {
    timestamp: new Date(timestamp).toISOString(),
    open: values[0],
    high: values[1],
    low: values[2],
    close: values[3],
    volume: values[4],
  };
}

async function fetchBitcoinCandles(
  timeframe: HistoricalTimeframe,
  limit: number,
): Promise<Extract<HistoricalDataResult, { status: "OK" }>> {
  const rawCandles = await getBinance<BinanceKline[]>("/klines", {
    symbol: "BTCUSDT",
    interval: timeframe,
    limit,
  });

  if (!Array.isArray(rawCandles) || rawCandles.length === 0) {
    throw new HistoricalDataError("Binance returned no historical candles.");
  }

  const candles = rawCandles.map(normalizeBinanceCandle);
  return {
    status: "OK",
    symbol: "BTCUSDT",
    timeframe,
    provider: "binance",
    candles,
    availableTimeframes: SUPPORTED_TIMEFRAMES,
    message: null,
  };
}

export async function getHistoricalCandles(
  symbol: string,
  timeframe: HistoricalTimeframe,
  limit = DEFAULT_LIMIT,
): Promise<HistoricalDataResult> {
  const normalizedSymbol = symbol.trim().toUpperCase();
  if (normalizedSymbol === "XAUUSD") {
    return getGoldHistoricalCandles(timeframe, limit);
  }
  if (normalizedSymbol !== "BTCUSDT") {
    throw new HistoricalDataError(
      "Historical candles currently support BTCUSDT and XAUUSD only.",
      400,
    );
  }

  const cacheKey = `${normalizedSymbol}:${timeframe}:${limit}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.result;
  }

  const currentRequest = inFlight.get(cacheKey);
  if (currentRequest) {
    return currentRequest;
  }

  const request = fetchBitcoinCandles(timeframe, limit)
    .then((result) => {
      cache.set(cacheKey, { result, expiresAt: Date.now() + CACHE_TTL_MS });
      return result;
    })
    .finally(() => {
      inFlight.delete(cacheKey);
    });
  inFlight.set(cacheKey, request);
  return request;
}

export function toMarketCandles(candles: HistoricalCandle[]): MarketCandle[] {
  return candles.map((candle) => ({
    openTime: new Date(candle.timestamp).getTime(),
    open: candle.open,
    high: candle.high,
    low: candle.low,
    close: candle.close,
    volume: candle.volume ?? 0,
  }));
}