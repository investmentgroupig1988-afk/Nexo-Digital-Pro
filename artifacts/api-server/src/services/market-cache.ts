import { logger } from "../lib/logger";
import { analyzeMarket, type MarketSignal } from "./analyzer";
import { getMarketData } from "./market";

const REFRESH_INTERVAL_MS = 20_000;
const MAX_SIGNAL_AGE_MS = REFRESH_INTERVAL_MS * 2;

type CachedSignal = MarketSignal & { updatedAt: string };

const cache = new Map<string, CachedSignal>();
const refreshes = new Map<string, Promise<CachedSignal>>();
let refreshTimer: NodeJS.Timeout | undefined;

async function refreshSymbol(symbol: string): Promise<CachedSignal> {
  const data = await getMarketData(symbol);
  const signal = { ...analyzeMarket(data), updatedAt: new Date().toISOString() };
  cache.set(symbol, signal);
  return signal;
}

function refresh(symbol: string): Promise<CachedSignal> {
  const existing = refreshes.get(symbol);
  if (existing) return existing;

  const request = refreshSymbol(symbol).finally(() => {
    refreshes.delete(symbol);
  });
  refreshes.set(symbol, request);
  return request;
}

export function startMarketRefresh(symbol = "BTCUSDT"): void {
  const normalizedSymbol = symbol.toUpperCase();

  if (refreshTimer) return;

  const refreshScheduledSymbol = async (): Promise<void> => {
    try {
      await refresh(normalizedSymbol);
      logger.info({ symbol: normalizedSymbol }, "Market data refreshed");
    } catch (error) {
      logger.warn({ err: error, symbol: normalizedSymbol }, "Market refresh failed");
    }
  };

  void refreshScheduledSymbol();
  refreshTimer = setInterval(() => void refreshScheduledSymbol(), REFRESH_INTERVAL_MS);
  refreshTimer.unref();
}

export function stopMarketRefresh(): void {
  if (refreshTimer) clearInterval(refreshTimer);
  refreshTimer = undefined;
}

export async function getMarketSignal(symbol: string): Promise<CachedSignal> {
  const normalizedSymbol = symbol.toUpperCase();
  const cached = cache.get(normalizedSymbol);
  if (cached && Date.now() - Date.parse(cached.updatedAt) <= MAX_SIGNAL_AGE_MS) {
    return cached;
  }

  return refresh(normalizedSymbol);
}
