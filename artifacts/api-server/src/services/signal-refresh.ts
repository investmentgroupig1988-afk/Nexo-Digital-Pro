import { logger } from "../lib/logger";
import { getHistoricalCandles, type HistoricalTimeframe } from "./historical";
import { COMMERCIAL_SIGNAL_TIMEFRAMES } from "./signal-engine";
import { buildSignalDashboard } from "./signals";
import { calculateTechnicalAnalysis } from "./technical";

const REFRESH_INTERVAL_MS = 60_000;
let timer: NodeJS.Timeout | undefined;
let running: Promise<void> | undefined;

export async function processSignalTimeframe(timeframe: HistoricalTimeframe) {
  const market = await getHistoricalCandles("BTCUSDT", timeframe, 200);
  if (market.status !== "OK") throw new Error("BTCUSDT market data unavailable");
  return buildSignalDashboard({ symbol: "BTCUSDT", timeframe, candles: market.candles, technical: calculateTechnicalAnalysis(market.candles, market.provider) });
}

export async function refreshCommercialSignals(): Promise<void> {
  const results = await Promise.allSettled(COMMERCIAL_SIGNAL_TIMEFRAMES.map(processSignalTimeframe));
  results.forEach((result, index) => {
    if (result.status === "rejected") logger.warn({ err: result.reason, timeframe: COMMERCIAL_SIGNAL_TIMEFRAMES[index] }, "Signal timeframe refresh failed");
  });
}

export function startSignalRefresh(): void {
  if (timer) return;
  const refresh = () => {
    if (running) return;
    running = refreshCommercialSignals().finally(() => { running = undefined; });
  };
  refresh();
  timer = setInterval(refresh, REFRESH_INTERVAL_MS);
  timer.unref();
}

export function stopSignalRefresh(): void {
  if (timer) clearInterval(timer);
  timer = undefined;
}
