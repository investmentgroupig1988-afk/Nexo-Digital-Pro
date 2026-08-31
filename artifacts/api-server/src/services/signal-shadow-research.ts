import {
  and,
  asc,
  eq,
  getDatabase,
  shadowResearchSignals,
} from "@workspace/db";
import { config } from "../config";
import { logger } from "../lib/logger";
import {
  getResearchHistoricalCandles,
  type HistoricalCandle,
  type ResearchBinanceSymbol,
} from "./historical";
import { resolveSignal } from "./signal-engine";
import { detectFrozenV11Opportunity } from "./signal-strategy-v11";
import type { FrozenV11Opportunity } from "./signal-strategy-v11";
import {
  V11_CANDIDATE_FINGERPRINT,
  V11_FROZEN_CANDIDATE,
  V11_SHADOW_SYMBOLS,
  V11_STRATEGY_VERSION,
  type V11ShadowSymbol,
} from "./signal-strategy-v11-snapshot";

const SHADOW_REFRESH_INTERVAL_MS = 60_000;
const COSTS_MODEL = {
  convention: "ROUND_TRIP_BPS_TO_R_BY_ENTRY_RISK_PERCENT",
  scenariosBps: [0, 5, 10],
} as const;

type ShadowDatabase = ReturnType<typeof getDatabase>;
type ShadowRow = typeof shadowResearchSignals.$inferSelect;
type FetchResearchCandles = (
  symbol: ResearchBinanceSymbol,
  timeframe: "4h",
  limit: number,
) => Promise<HistoricalCandle[]>;
type DetectOpportunity = (input: {
  symbol: V11ShadowSymbol;
  candles: HistoricalCandle[];
  observedAt: Date;
}) => FrozenV11Opportunity | null;

let timer: NodeJS.Timeout | undefined;
let running: Promise<void> | undefined;
let lastCycleStartedAt: string | null = null;
let lastCycleCompletedAt: string | null = null;
let lastCycleErrorAt: string | null = null;

export async function runShadowResearchCycle(options: {
  enabled?: boolean;
  now?: Date;
  database?: ShadowDatabase;
  fetchCandles?: FetchResearchCandles;
  detectOpportunity?: DetectOpportunity;
} = {}): Promise<{ enabled: boolean; inserted: number; resolved: number; symbolsProcessed: number }> {
  const enabled = options.enabled ?? config.shadowResearchEnabled;
  if (!enabled) return { enabled: false, inserted: 0, resolved: 0, symbolsProcessed: 0 };

  const now = options.now ?? new Date();
  const database = options.database ?? getDatabase();
  const fetchCandles = options.fetchCandles ?? getResearchHistoricalCandles;
  const detectOpportunity = options.detectOpportunity ?? detectFrozenV11Opportunity;
  let inserted = 0;
  let resolved = 0;
  let symbolsProcessed = 0;

  for (const symbol of V11_SHADOW_SYMBOLS) {
    const candles = await fetchCandles(symbol, "4h", 200);
    resolved += await resolveOpenShadowSignals(symbol, candles, now, database);
    const [stillOpen] = await database.select({ id: shadowResearchSignals.id })
      .from(shadowResearchSignals)
      .where(and(
        eq(shadowResearchSignals.strategyVersion, V11_STRATEGY_VERSION),
        eq(shadowResearchSignals.symbol, symbol),
        eq(shadowResearchSignals.status, "OPEN"),
      ))
      .limit(1);
    if (!stillOpen) inserted += await persistLatestOpportunity(symbol, candles, now, database, detectOpportunity);
    symbolsProcessed += 1;
  }
  return { enabled: true, inserted, resolved, symbolsProcessed };
}

export function startShadowResearch(): void {
  if (!config.shadowResearchEnabled || timer) return;
  const refresh = () => {
    if (running) return;
    lastCycleStartedAt = new Date().toISOString();
    running = runShadowResearchCycle().then((result) => {
      logger.info({ event: "shadow_research_cycle", ...result }, "Shadow research cycle completed");
      lastCycleErrorAt = null;
    }).catch((error) => {
      lastCycleErrorAt = new Date().toISOString();
      logger.warn({ event: "shadow_research_cycle_failed", error: safeError(error) }, "Shadow research cycle failed");
    }).finally(() => {
      lastCycleCompletedAt = new Date().toISOString();
      running = undefined;
    });
  };
  refresh();
  timer = setInterval(refresh, SHADOW_REFRESH_INTERVAL_MS);
  timer.unref();
  logger.info({ event: "shadow_research_scheduler_started", intervalMs: SHADOW_REFRESH_INTERVAL_MS }, "Shadow research scheduler started");
}

export function stopShadowResearch(): void {
  if (timer) clearInterval(timer);
  timer = undefined;
}

export async function getShadowResearchAdminView(database: ShadowDatabase = getDatabase()) {
  const rows = await database.select().from(shadowResearchSignals)
    .where(eq(shadowResearchSignals.strategyVersion, V11_STRATEGY_VERSION))
    .orderBy(asc(shadowResearchSignals.detectedAt));
  return {
    enabled: config.shadowResearchEnabled,
    strategyVersion: V11_STRATEGY_VERSION,
    strategyFingerprint: V11_CANDIDATE_FINGERPRINT,
    cohort: {
      symbols: V11_SHADOW_SYMBOLS,
      timeframe: "4h",
      eligibleAfter: V11_FROZEN_CANDIDATE.forwardCohort.eligibleAfter,
    },
    evaluationGate: V11_FROZEN_CANDIDATE.evaluationGate,
    scheduler: {
      running: Boolean(timer),
      cycleRunning: Boolean(running),
      lastCycleStartedAt,
      lastCycleCompletedAt,
      lastCycleErrorAt,
      intervalMs: SHADOW_REFRESH_INTERVAL_MS,
    },
    metrics: calculateShadowResearchMetrics(rows),
  };
}

export function calculateShadowResearchMetrics(rows: ShadowRow[]) {
  return summarizeRows(rows, true);
}

async function persistLatestOpportunity(
  symbol: V11ShadowSymbol,
  candles: HistoricalCandle[],
  now: Date,
  database: ShadowDatabase,
  detectOpportunity: DetectOpportunity,
): Promise<number> {
  const opportunity = detectOpportunity({ symbol, candles, observedAt: now });
  if (!opportunity) return 0;
  try {
    await database.insert(shadowResearchSignals).values({
      strategyVersion: opportunity.strategyVersion,
      strategyFingerprint: opportunity.strategyFingerprint,
      symbol,
      timeframe: opportunity.timeframe,
      detectedAt: now,
      sourceCandleCloseAt: opportunity.sourceCandleCloseAt,
      hypotheticalEntry: String(opportunity.hypotheticalEntry),
      hypotheticalStop: String(opportunity.hypotheticalStop),
      hypotheticalTarget: String(opportunity.hypotheticalTarget),
      direction: opportunity.direction,
      costsModel: COSTS_MODEL,
      status: "OPEN",
      expiresAt: opportunity.expiresAt,
      technicalSnapshot: opportunity.technicalSnapshot,
    });
    return 1;
  } catch (error) {
    if (isUniqueViolation(error)) return 0;
    throw error;
  }
}

async function resolveOpenShadowSignals(
  symbol: V11ShadowSymbol,
  candles: HistoricalCandle[],
  now: Date,
  database: ShadowDatabase,
): Promise<number> {
  const open = await database.select().from(shadowResearchSignals).where(and(
    eq(shadowResearchSignals.strategyVersion, V11_STRATEGY_VERSION),
    eq(shadowResearchSignals.symbol, symbol),
    eq(shadowResearchSignals.status, "OPEN"),
  ));
  let resolved = 0;
  for (const row of open) {
    const entry = Number(row.hypotheticalEntry);
    const stop = Number(row.hypotheticalStop);
    const target = Number(row.hypotheticalTarget);
    const resolution = resolveSignal({
      direction: row.direction as "LONG" | "SHORT",
      entryPrice: entry,
      stopLoss: stop,
      takeProfit: target,
      openedAt: row.sourceCandleCloseAt,
      expiresAt: row.expiresAt,
    }, candles, now);
    if (resolution.status === "OPEN" || resolution.returnPct === null || resolution.closedAt === null) continue;
    const riskPct = Math.abs(entry - stop) / entry * 100;
    const realizedR = riskPct > 0 ? resolution.returnPct / riskPct : null;
    const updated = await database.update(shadowResearchSignals).set({
      status: resolution.status,
      resolvedAt: resolution.closedAt,
      realizedR: realizedR === null ? null : String(realizedR),
      updatedAt: now,
    }).where(and(
      eq(shadowResearchSignals.id, row.id),
      eq(shadowResearchSignals.strategyVersion, V11_STRATEGY_VERSION),
      eq(shadowResearchSignals.strategyFingerprint, V11_CANDIDATE_FINGERPRINT),
      eq(shadowResearchSignals.status, "OPEN"),
    )).returning({ id: shadowResearchSignals.id });
    if (updated.length === 1) resolved += 1;
  }
  return resolved;
}

function summarizeRows(rows: ShadowRow[], includeSymbols: boolean): Record<string, unknown> {
  const settled = rows.filter((row) => row.status !== "OPEN" && row.realizedR !== null);
  const gross = settled.map((row) => Number(row.realizedR));
  const net5 = settled.map((row) => netRealizedR(row, 5));
  const net10 = settled.map((row) => netRealizedR(row, 10));
  const summary: Record<string, unknown> = {
    totalShadowSignals: rows.length,
    open: rows.filter((row) => row.status === "OPEN").length,
    win: rows.filter((row) => row.status === "WIN").length,
    loss: rows.filter((row) => row.status === "LOSS").length,
    expired: rows.filter((row) => row.status === "EXPIRED").length,
    expectancyGross: average(gross),
    expectancyNet5Bps: average(net5),
    expectancyNet10Bps: average(net10),
    profitFactorGross: profitFactor(gross),
    profitFactorNet5Bps: profitFactor(net5),
    maximumDrawdownGrossR: maximumDrawdown(gross),
    maximumDrawdownNet5BpsR: maximumDrawdown(net5),
    consecutiveLosses: longestStatusStreak(rows, "LOSS"),
  };
  if (includeSymbols) {
    summary.bySymbol = Object.fromEntries(V11_SHADOW_SYMBOLS.map((symbol) => [
      symbol,
      summarizeRows(rows.filter((row) => row.symbol === symbol), false),
    ]));
  }
  return summary;
}

function netRealizedR(row: ShadowRow, frictionBps: number): number {
  const entry = Number(row.hypotheticalEntry);
  const stop = Number(row.hypotheticalStop);
  const riskPct = Math.abs(entry - stop) / entry * 100;
  return Number(row.realizedR) - (frictionBps / 100) / riskPct;
}

function average(values: number[]): number | null {
  return values.length ? round(values.reduce((sum, value) => sum + value, 0) / values.length) : null;
}

function profitFactor(values: number[]): number | null {
  const positive = values.filter((value) => value > 0).reduce((sum, value) => sum + value, 0);
  const negative = Math.abs(values.filter((value) => value < 0).reduce((sum, value) => sum + value, 0));
  return negative > 0 ? round(positive / negative) : null;
}

function maximumDrawdown(values: number[]): number | null {
  if (!values.length) return null;
  let equity = 0;
  let peak = 0;
  let maximum = 0;
  for (const value of values) {
    equity += value;
    peak = Math.max(peak, equity);
    maximum = Math.max(maximum, peak - equity);
  }
  return round(maximum);
}

function longestStatusStreak(rows: ShadowRow[], status: "LOSS"): number {
  let current = 0;
  let longest = 0;
  for (const row of rows.filter((candidate) => candidate.status !== "OPEN")) {
    current = row.status === status ? current + 1 : 0;
    longest = Math.max(longest, current);
  }
  return longest;
}

function isUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: string; message?: string; cause?: unknown };
  return candidate.code === "23505" || candidate.message?.includes("unique constraint") === true || isUniqueViolation(candidate.cause);
}

function safeError(error: unknown): string {
  return (error instanceof Error ? error.message : "Unknown shadow research error")
    .replace(/https?:\/\/\S+/g, "[url]")
    .slice(0, 255);
}

function round(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}
