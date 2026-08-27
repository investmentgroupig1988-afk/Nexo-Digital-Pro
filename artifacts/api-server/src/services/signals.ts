import { and, desc, eq, getDatabase, inArray, signals, sql } from "@workspace/db";
import type { HistoricalCandle, HistoricalTimeframe } from "./historical";
import type { TechnicalAnalysisResult } from "./technical";
import { COMMERCIAL_SIGNAL_TIMEFRAMES, evaluateSignal, resolveSignal, SIGNAL_STRATEGY_VERSION } from "./signal-engine";
import { summarizeTotalHistory } from "./signal-metrics";

type SignalDatabase = ReturnType<typeof getDatabase>;

export async function buildSignalDashboard(input: {
  symbol: "BTCUSDT";
  timeframe: HistoricalTimeframe;
  candles: HistoricalCandle[];
  technical: TechnicalAnalysisResult;
  historyTimeframe?: string | null;
  multiTimeframe?: Record<string, "bullish" | "bearish" | "sideways" | null>;
  now?: Date;
}, database: SignalDatabase = getDatabase()) {
  await resolveOpenSignals(input.symbol, input.timeframe, input.candles, input.now ?? new Date(), database);
  let [active] = await database.select().from(signals)
    .where(and(eq(signals.symbol, input.symbol), eq(signals.timeframe, input.timeframe), eq(signals.status, "OPEN")))
    .orderBy(desc(signals.openedAt)).limit(1);
  const evaluation = evaluateSignal(input);
  let signalCreated = false;

  if (!active && evaluation.outcome !== "NO_SIGNAL") {
    try {
      [active] = await database.insert(signals).values({
        symbol: input.symbol,
        timeframe: input.timeframe,
        direction: evaluation.outcome,
        entryPrice: String(evaluation.entryPrice),
        stopLoss: String(evaluation.stopLoss),
        takeProfit: String(evaluation.takeProfit),
        riskRewardRatio: String(evaluation.riskRewardRatio),
        status: "OPEN",
        openedAt: evaluation.openedAt,
        expiresAt: evaluation.expiresAt,
        returnPct: null,
        result: "OPEN",
        strategyVersion: SIGNAL_STRATEGY_VERSION,
        configurationFingerprint: evaluation.configurationFingerprint,
        indicatorSnapshot: evaluation.snapshot,
      }).returning();
      signalCreated = true;
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      [active] = await database.select().from(signals)
        .where(and(eq(signals.symbol, input.symbol), eq(signals.timeframe, input.timeframe), eq(signals.status, "OPEN")))
        .orderBy(desc(signals.openedAt)).limit(1);
    }
  }

  const historyRows = await database.select().from(signals)
    .orderBy(desc(signals.openedAt), desc(signals.createdAt)).limit(100);
  const scopedRows = input.historyTimeframe ? historyRows.filter((signal) => signal.timeframe === input.historyTimeframe) : historyRows;
  const settled = scopedRows.filter((signal) => signal.status === "WIN" || signal.status === "LOSS");
  const wins = settled.filter((signal) => signal.status === "WIN").length;
  const losses = settled.filter((signal) => signal.status === "LOSS").length;
  const total = settled.length;
  const accumulatedReturnPct = total ? settled.reduce((sum, signal) => sum + Number(signal.returnPct ?? 0), 0) : null;
  const totalHistoryRows = await database.select({
    status: signals.status,
    count: sql<number>`count(*)::int`,
  }).from(signals).where(and(
    eq(signals.symbol, input.symbol),
    inArray(signals.timeframe, [...COMMERCIAL_SIGNAL_TIMEFRAMES]),
    inArray(signals.status, ["WIN", "LOSS", "EXPIRED"]),
  )).groupBy(signals.status);

  const trends = Object.values(input.multiTimeframe ?? {}).filter((trend): trend is "bullish" | "bearish" | "sideways" => trend !== null);
  const directional = trends.filter((trend) => trend !== "sideways");
  const alignedCount = directional.length ? Math.max(directional.filter((trend) => trend === "bullish").length, directional.filter((trend) => trend === "bearish").length) : 0;
  return {
    _internal: { analysisOutcome: evaluation.outcome, signalCreated },
    activeSignal: active ? publicSignal(active) : null,
    evaluation: active ? active.direction : "NO_SIGNAL",
    message: active ? null : "Esperando una configuración válida.",
    context: evaluation.context,
    multiTimeframe: { trends: input.multiTimeframe ?? {}, alignedCount, total: trends.length },
    metrics: {
      total,
      wins,
      losses,
      winRate: total ? round((wins / total) * 100) : null,
      lossRate: total ? round((losses / total) * 100) : null,
      accumulatedReturnPct: accumulatedReturnPct === null ? null : round(accumulatedReturnPct),
    },
    totalHistory: summarizeTotalHistory(totalHistoryRows),
    history: scopedRows.filter((signal) => signal.status !== "OPEN").slice(0, 50).map(publicSignal),
  };
}

export async function resolveOpenSignals(symbol: string, timeframe: string, candles: HistoricalCandle[], now: Date, database: SignalDatabase = getDatabase()) {
  const open = await database.select().from(signals).where(and(eq(signals.symbol, symbol), eq(signals.timeframe, timeframe), eq(signals.status, "OPEN")));
  for (const signal of open) {
    const resolution = resolveSignal({
      direction: signal.direction as "LONG" | "SHORT",
      entryPrice: Number(signal.entryPrice),
      stopLoss: Number(signal.stopLoss),
      takeProfit: Number(signal.takeProfit),
      openedAt: signal.openedAt!,
      expiresAt: signal.expiresAt,
    }, candles, now);
    if (resolution.status !== "OPEN") {
      await database.update(signals).set({
        status: resolution.status,
        result: resolution.status,
        closedAt: resolution.closedAt,
        returnPct: String(resolution.returnPct),
      }).where(eq(signals.id, signal.id));
    }
  }
}

function publicSignal(signal: typeof signals.$inferSelect) {
  return {
    id: signal.id,
    symbol: signal.symbol,
    timeframe: signal.timeframe,
    direction: signal.direction,
    entryPrice: signal.entryPrice,
    stopLoss: signal.stopLoss,
    takeProfit: signal.takeProfit,
    riskRewardRatio: signal.riskRewardRatio,
    status: signal.status,
    openedAt: signal.openedAt,
    closedAt: signal.closedAt,
    returnPct: signal.returnPct,
    result: signal.result,
    strategyVersion: signal.strategyVersion,
    createdAt: signal.createdAt,
  };
}

function isUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: string; message?: string; cause?: unknown };
  return candidate.code === "23505" || candidate.message?.includes("unique constraint") === true || isUniqueViolation(candidate.cause);
}

function round(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}
