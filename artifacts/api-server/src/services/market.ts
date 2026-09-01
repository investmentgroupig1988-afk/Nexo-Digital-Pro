import axios from "axios";

const BINANCE_API_URLS = [
  "https://api.binance.com/api/v3",
  "https://data-api.binance.vision/api/v3",
];
const DEFAULT_INTERVAL = "1m";
const DEFAULT_LIMIT = 50;

export type MarketCandle = {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type CryptoMarketData = {
  symbol: string;
  price: number;
  currency: "USDT";
  unit: "base_asset";
  updatedAt: string;
  provider: "binance";
  assetClass: "crypto";
};

type BinanceTickerResponse = {
  symbol: string;
  price: string;
};

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

function shouldTryBinanceFallback(error: unknown): boolean {
  if (!axios.isAxiosError(error)) {
    return true;
  }

  const status = error.response?.status;
  return status === undefined || status === 403 || status === 429 || status === 451;
}

export async function getBinance<T>(
  path: string,
  params: Record<string, string | number>,
): Promise<T> {
  let lastError: unknown;

  for (const baseUrl of BINANCE_API_URLS) {
    try {
      const response = await axios.get<T>(`${baseUrl}${path}`, {
        params,
        timeout: 10_000,
      });
      return response.data;
    } catch (error) {
      lastError = error;
      if (!shouldTryBinanceFallback(error)) {
        throw error;
      }
    }
  }

  throw lastError ?? new Error("Binance market data is unavailable.");
}

function normalizeSymbol(symbol: string): string {
  return symbol.trim().toUpperCase();
}

export function validateSymbol(symbol: string): boolean {
  return /^[A-Z0-9]{2,20}$/.test(normalizeSymbol(symbol));
}

export async function getMarketData(symbol: string): Promise<{
  symbol: string;
  price: number;
  candles: MarketCandle[];
}> {
  const normalizedSymbol = normalizeSymbol(symbol);
  if (!validateSymbol(normalizedSymbol)) {
    throw new Error("Invalid Binance symbol.");
  }

  const [ticker, rawCandles] = await Promise.all([
    getBinance<BinanceTickerResponse>("/ticker/price", {
      symbol: normalizedSymbol,
    }),
    getBinance<BinanceKline[]>("/klines", {
      symbol: normalizedSymbol,
      interval: DEFAULT_INTERVAL,
      limit: DEFAULT_LIMIT,
    }),
  ]);

  const price = Number(ticker.price);
  const candles = rawCandles.map((kline) => ({
    openTime: kline[0],
    open: Number(kline[1]),
    high: Number(kline[2]),
    low: Number(kline[3]),
    close: Number(kline[4]),
    volume: Number(kline[5]),
  }));

  if (!Number.isFinite(price) || price <= 0 || candles.length < 2) {
    throw new Error("Binance returned incomplete market data.");
  }

  return { symbol: normalizedSymbol, price, candles };
}

export async function getCryptoMarketData(symbol: string): Promise<CryptoMarketData> {
  const data = await getMarketData(symbol);

  return {
    symbol: data.symbol,
    price: data.price,
    currency: "USDT",
    unit: "base_asset",
    updatedAt: new Date().toISOString(),
    provider: "binance",
    assetClass: "crypto",
  };
}

export const marketConfig = {
  interval: DEFAULT_INTERVAL,
  limit: DEFAULT_LIMIT,
};