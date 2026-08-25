import { logger } from "../lib/logger";
import { getHistoricalCandles, type HistoricalTimeframe } from "./historical";
import { COMMERCIAL_SIGNAL_TIMEFRAMES } from "./signal-engine";
import { buildSignalDashboard } from "./signals";
import { calculateTechnicalAnalysis } from "./technical";
import { dispatchSignalNotifications } from "./signal-notifications";

const REFRESH_INTERVAL_MS = 60_000;
let timer: NodeJS.Timeout | undefined;
let running: Promise<void> | undefined;
let schedulerStartedAt: string | null = null;
let lastCycleStartedAt: string | null = null;
let lastCycleCompletedAt: string | null = null;
let nextRunAt: string | null = null;
let lastNotificationDispatchAt: string | null = null;
let lastNotificationErrorAt: string | null = null;
const timeframeState = new Map<HistoricalTimeframe, {
  provider: "binance";
  symbol: "BTCUSDT";
  lastScanAt: string | null;
  lastFetchAt: string | null;
  lastCandleAt: string | null;
  lastOutcome: "LONG" | "SHORT" | "NO_SIGNAL" | null;
  lastSignalCreatedAt: string | null;
  lastErrorAt: string | null;
  lastError: string | null;
}>();

for (const timeframe of COMMERCIAL_SIGNAL_TIMEFRAMES) timeframeState.set(timeframe, emptyState());

export async function processSignalTimeframe(timeframe: HistoricalTimeframe) {
  const state = timeframeState.get(timeframe) ?? emptyState();
  state.lastScanAt = new Date().toISOString();
  timeframeState.set(timeframe, state);
  logger.info({ event: "signal_scan_started", symbol: state.symbol, timeframe }, "Signal scan started");
  try {
    const market = await getHistoricalCandles("BTCUSDT", timeframe, 200);
    if (market.status !== "OK") throw new Error("BTCUSDT market data unavailable");
    state.lastFetchAt = new Date().toISOString();
    state.lastCandleAt = market.candles.at(-1)?.timestamp ?? null;
    logger.info({ event: "market_fetch_ok", provider: market.provider, symbol: market.symbol, timeframe, lastCandleAt: state.lastCandleAt, candleCount: market.candles.length }, "Market data fetch completed");
    const result = await buildSignalDashboard({ symbol: "BTCUSDT", timeframe, candles: market.candles, technical: calculateTechnicalAnalysis(market.candles, market.provider) });
    state.lastOutcome = isSignalOutcome(result._internal.analysisOutcome) ? result._internal.analysisOutcome : null;
    if (result._internal.signalCreated) {
      state.lastSignalCreatedAt = result.activeSignal?.createdAt?.toISOString?.() ?? result.activeSignal?.createdAt?.toString() ?? new Date().toISOString();
      logger.info({ event: "signal_created", symbol: state.symbol, timeframe, signalId: result.activeSignal?.id }, "Signal persisted and queued for notification");
    }
    logger.info({ event: "analysis_complete", symbol: state.symbol, timeframe, outcome: state.lastOutcome, signalCreated: result._internal.signalCreated }, "Signal analysis completed");
    state.lastErrorAt = null;
    state.lastError = null;
    return result;
  } catch (error) {
    state.lastErrorAt = new Date().toISOString();
    state.lastError = safeDiagnosticError(error);
    throw error;
  }
}

export async function refreshCommercialSignals(): Promise<void> {
  lastCycleStartedAt = new Date().toISOString();
  const results = await Promise.allSettled(COMMERCIAL_SIGNAL_TIMEFRAMES.map(processSignalTimeframe));
  results.forEach((result, index) => {
    if (result.status === "rejected") logger.warn({ event: "signal_scan_failed", error: safeDiagnosticError(result.reason), timeframe: COMMERCIAL_SIGNAL_TIMEFRAMES[index] }, "Signal timeframe refresh failed");
  });
  try {
    const notifications = await dispatchSignalNotifications();
    lastNotificationDispatchAt = new Date().toISOString();
    lastNotificationErrorAt = null;
    logger.info({ event: "telegram_outbox_cycle", ...notifications }, "Signal notification outbox cycle completed");
  } catch (error) {
    // Notification infrastructure must never stop signal creation/resolution.
    lastNotificationErrorAt = new Date().toISOString();
    logger.warn({ event: "telegram_outbox_cycle_failed", error: safeDiagnosticError(error) }, "Signal notification dispatch failed");
  } finally {
    lastCycleCompletedAt = new Date().toISOString();
  }
}

export function startSignalRefresh(): void {
  if (timer) return;
  schedulerStartedAt = new Date().toISOString();
  const refresh = () => {
    if (running) return;
    nextRunAt = null;
    running = refreshCommercialSignals().finally(() => {
      running = undefined;
      if (timer) nextRunAt = new Date(Date.now() + REFRESH_INTERVAL_MS).toISOString();
    });
  };
  refresh();
  timer = setInterval(refresh, REFRESH_INTERVAL_MS);
  timer.unref();
  nextRunAt = new Date(Date.now() + REFRESH_INTERVAL_MS).toISOString();
  logger.info({ event: "signal_scheduler_started", intervalMs: REFRESH_INTERVAL_MS, nextRunAt }, "Signal scheduler started");
}

export function stopSignalRefresh(): void {
  if (timer) clearInterval(timer);
  timer = undefined;
  nextRunAt = null;
}

export function getSignalEngineHealth() {
  return {
    scheduler: { running: Boolean(timer), cycleRunning: Boolean(running), startedAt: schedulerStartedAt, lastCycleStartedAt, lastCycleCompletedAt, nextRunAt, intervalMs: REFRESH_INTERVAL_MS },
    symbol: "BTCUSDT",
    provider: "binance",
    notifications: { lastDispatchAt: lastNotificationDispatchAt, lastErrorAt: lastNotificationErrorAt },
    timeframes: COMMERCIAL_SIGNAL_TIMEFRAMES.map((timeframe) => ({ timeframe, ...timeframeState.get(timeframe)! })),
  };
}

function emptyState() {
  return { provider: "binance" as const, symbol: "BTCUSDT" as const, lastScanAt: null, lastFetchAt: null, lastCandleAt: null, lastOutcome: null, lastSignalCreatedAt: null, lastErrorAt: null, lastError: null };
}

function safeDiagnosticError(error: unknown): string {
  return (error instanceof Error ? error.message : "Unknown signal engine error").replace(/https?:\/\/\S+/g, "[url]").slice(0, 255);
}

function isSignalOutcome(value: string): value is "LONG" | "SHORT" | "NO_SIGNAL" {
  return value === "LONG" || value === "SHORT" || value === "NO_SIGNAL";
}
