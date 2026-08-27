import type { HistoricalCandle, HistoricalTimeframe } from "./historical";
import {
  evaluateSignal,
  MINIMUM_RISK_REWARD,
  SIGNAL_EXPIRATION_CANDLES,
  type SignalDirection,
} from "./signal-engine";
import { calculateTechnicalAnalysis } from "./technical";

export type ClosedAnalysisCandle = HistoricalCandle & { closeTime: string };
export type BacktestOutcome = "WIN" | "LOSS" | "EXPIRED" | "CENSORED";
export type BacktestPeriod = "TRAIN" | "DEVELOPMENT" | "VALIDATION" | "OUT_OF_SAMPLE";

export type BaselineEntry = {
  timeframe: HistoricalTimeframe;
  direction: SignalDirection;
  entryIndex: number;
  openedAt: string;
  entryPrice: number;
  baselineStopLoss: number;
  baselineTakeProfit: number;
  baselineRiskReward: number;
  atrAtEntry: number;
};

export type ExitConfiguration = {
  name: string;
  riskMode: "BASELINE" | "CAPPED_ATR" | "ATR";
  atrMultiple?: number;
  rewardRisk: number;
  expiryCandles: number;
};

export type BacktestTrade = BaselineEntry & {
  configuration: string;
  stopLoss: number;
  takeProfit: number;
  riskUsd: number;
  riskPct: number;
  targetUsd: number;
  targetPct: number;
  stopAtr: number;
  targetAtr: number;
  outcome: BacktestOutcome;
  closedAt: string | null;
  durationCandles: number | null;
  durationMs: number | null;
  realizedR: number | null;
  mfeUsd: number | null;
  maeUsd: number | null;
  mfePct: number | null;
  maePct: number | null;
  mfeR: number | null;
  maeR: number | null;
  mfeAtr: number | null;
  maeAtr: number | null;
  postExpiryOutcome: "WIN" | "LOSS" | "NEITHER" | null;
  postExpiryAdditionalCandles: number | null;
};

export type BacktestSummary = {
  frictionBps: number;
  signals: number;
  wins: number;
  losses: number;
  expired: number;
  censored: number;
  winRateIncludingExpired: number | null;
  winRateExcludingExpired: number | null;
  lossRate: number | null;
  expiredRate: number | null;
  averageRiskReward: number | null;
  expectancyR: number | null;
  profitFactor: number | null;
  maximumDrawdownR: number | null;
  consecutiveWins: number;
  consecutiveLosses: number;
  averageDurationCandles: number | null;
  medianDurationCandles: number | null;
  medianStopPct: number | null;
  medianTargetPct: number | null;
  medianStopAtr: number | null;
  medianTargetAtr: number | null;
  averageExpiredR: number | null;
};

export type CandleQuality = {
  candleCount: number;
  duplicateTimestamps: number;
  outOfOrder: number;
  gaps: number;
  incompleteCandles: number;
};

const FOLLOW_UP_EXPIRY_MULTIPLIER = 3;

export function validateCandleSeries(
  candles: ClosedAnalysisCandle[],
  intervalMs: number,
  observedAt: Date,
): CandleQuality {
  let duplicates = 0;
  let outOfOrder = 0;
  let gaps = 0;
  let incompleteCandles = 0;
  const seen = new Set<number>();

  candles.forEach((candle, index) => {
    const timestamp = Date.parse(candle.timestamp);
    const closeTime = Date.parse(candle.closeTime);
    if (seen.has(timestamp)) duplicates += 1;
    seen.add(timestamp);
    if (closeTime > observedAt.getTime()) incompleteCandles += 1;
    if (index === 0) return;
    const previous = Date.parse(candles[index - 1].timestamp);
    if (timestamp < previous) outOfOrder += 1;
    if (timestamp - previous > intervalMs) gaps += Math.round((timestamp - previous) / intervalMs) - 1;
  });

  return {
    candleCount: candles.length,
    duplicateTimestamps: duplicates,
    outOfOrder,
    gaps,
    incompleteCandles,
  };
}

export function generateBaselineEntries(
  candles: ClosedAnalysisCandle[],
  timeframe: HistoricalTimeframe,
  analysisStart?: Date,
): BaselineEntry[] {
  const entries: BaselineEntry[] = [];
  let nextEligibleIndex = 199;

  for (let index = 199; index < candles.length; index += 1) {
    if (index < nextEligibleIndex) continue;
    if (analysisStart && Date.parse(candles[index].timestamp) < analysisStart.getTime()) continue;
    const window = candles.slice(Math.max(0, index - 199), index + 1);
    const technical = calculateTechnicalAnalysis(window, "binance");
    const evaluation = evaluateSignal({ symbol: "BTCUSDT", timeframe, candles: window, technical });
    if (evaluation.outcome === "NO_SIGNAL") continue;
    const atrAtEntry = technical.indicators.atr14;
    if (atrAtEntry === null || atrAtEntry <= 0) continue;

    const entry: BaselineEntry = {
      timeframe,
      direction: evaluation.outcome,
      entryIndex: index,
      openedAt: evaluation.openedAt.toISOString(),
      entryPrice: evaluation.entryPrice,
      baselineStopLoss: evaluation.stopLoss,
      baselineTakeProfit: evaluation.takeProfit,
      baselineRiskReward: evaluation.riskRewardRatio,
      atrAtEntry,
    };
    entries.push(entry);
    const resolution = evaluateEntry(candles, entry, baselineConfiguration());
    nextEligibleIndex = resolution.durationCandles === null
      ? candles.length
      : index + resolution.durationCandles;
  }

  return entries;
}

export function baselineConfiguration(): ExitConfiguration {
  return {
    name: "BASELINE",
    riskMode: "BASELINE",
    rewardRisk: MINIMUM_RISK_REWARD,
    expiryCandles: SIGNAL_EXPIRATION_CANDLES,
  };
}

export function evaluateEntry(
  candles: ClosedAnalysisCandle[],
  entry: BaselineEntry,
  configuration: ExitConfiguration,
): BacktestTrade {
  if (configuration.rewardRisk < MINIMUM_RISK_REWARD) {
    throw new Error(`Candidate ${configuration.name} violates minimum R:R ${MINIMUM_RISK_REWARD}.`);
  }
  if (!Number.isInteger(configuration.expiryCandles) || configuration.expiryCandles < 1) {
    throw new Error(`Candidate ${configuration.name} has an invalid expiry horizon.`);
  }

  const baselineRisk = Math.abs(entry.entryPrice - entry.baselineStopLoss);
  const requestedAtrRisk = (configuration.atrMultiple ?? 0) * entry.atrAtEntry;
  const risk = configuration.riskMode === "BASELINE"
    ? baselineRisk
    : configuration.riskMode === "CAPPED_ATR"
      ? Math.min(baselineRisk, requestedAtrRisk)
      : requestedAtrRisk;
  if (!Number.isFinite(risk) || risk <= 0) throw new Error(`Candidate ${configuration.name} produced invalid risk.`);

  const stopLoss = entry.direction === "LONG" ? entry.entryPrice - risk : entry.entryPrice + risk;
  const targetRisk = risk * configuration.rewardRisk;
  const takeProfit = entry.direction === "LONG" ? entry.entryPrice + targetRisk : entry.entryPrice - targetRisk;
  const finalIndex = entry.entryIndex + configuration.expiryCandles;
  const availableFinalIndex = Math.min(finalIndex, candles.length - 1);
  let outcome: BacktestOutcome = "CENSORED";
  let closeIndex: number | null = null;
  let realizedR: number | null = null;
  let mfe = 0;
  let mae = 0;

  for (let index = entry.entryIndex + 1; index <= availableFinalIndex; index += 1) {
    const candle = candles[index];
    const favorable = entry.direction === "LONG" ? candle.high - entry.entryPrice : entry.entryPrice - candle.low;
    const adverse = entry.direction === "LONG" ? entry.entryPrice - candle.low : candle.high - entry.entryPrice;
    mfe = Math.max(mfe, favorable);
    mae = Math.max(mae, adverse);
    const hitsStop = entry.direction === "LONG" ? candle.low <= stopLoss : candle.high >= stopLoss;
    const hitsTarget = entry.direction === "LONG" ? candle.high >= takeProfit : candle.low <= takeProfit;
    if (hitsStop || hitsTarget) {
      // Same-candle ambiguity is resolved conservatively, matching the live engine.
      outcome = hitsStop ? "LOSS" : "WIN";
      closeIndex = index;
      realizedR = hitsStop ? -1 : configuration.rewardRisk;
      break;
    }
  }

  if (closeIndex === null && finalIndex < candles.length) {
    outcome = "EXPIRED";
    closeIndex = finalIndex;
    const expiryClose = candles[finalIndex].close;
    const directionalMove = entry.direction === "LONG"
      ? expiryClose - entry.entryPrice
      : entry.entryPrice - expiryClose;
    realizedR = directionalMove / risk;
  }

  const postExpiry = outcome === "EXPIRED"
    ? findPostExpiryOutcome(candles, entry, stopLoss, takeProfit, finalIndex, configuration.expiryCandles)
    : { outcome: null, additionalCandles: null };
  const durationCandles = closeIndex === null ? null : closeIndex - entry.entryIndex;
  const durationMs = closeIndex === null
    ? null
    : Date.parse(candles[closeIndex].timestamp) - Date.parse(entry.openedAt);

  return {
    ...entry,
    configuration: configuration.name,
    stopLoss,
    takeProfit,
    riskUsd: risk,
    riskPct: (risk / entry.entryPrice) * 100,
    targetUsd: targetRisk,
    targetPct: (targetRisk / entry.entryPrice) * 100,
    stopAtr: risk / entry.atrAtEntry,
    targetAtr: targetRisk / entry.atrAtEntry,
    outcome,
    closedAt: closeIndex === null ? null : candles[closeIndex].timestamp,
    durationCandles,
    durationMs,
    realizedR,
    mfeUsd: closeIndex === null ? null : mfe,
    maeUsd: closeIndex === null ? null : mae,
    mfePct: closeIndex === null ? null : (mfe / entry.entryPrice) * 100,
    maePct: closeIndex === null ? null : (mae / entry.entryPrice) * 100,
    mfeR: closeIndex === null ? null : mfe / risk,
    maeR: closeIndex === null ? null : mae / risk,
    mfeAtr: closeIndex === null ? null : mfe / entry.atrAtEntry,
    maeAtr: closeIndex === null ? null : mae / entry.atrAtEntry,
    postExpiryOutcome: postExpiry.outcome,
    postExpiryAdditionalCandles: postExpiry.additionalCandles,
  };
}

export function evaluateEntries(
  candles: ClosedAnalysisCandle[],
  entries: BaselineEntry[],
  configuration: ExitConfiguration,
): BacktestTrade[] {
  return entries.map((entry) => evaluateEntry(candles, entry, configuration));
}

export function summarizeBacktest(trades: BacktestTrade[], frictionBps = 0): BacktestSummary {
  if (!Number.isFinite(frictionBps) || frictionBps < 0) {
    throw new Error("Backtest friction must be a non-negative number of basis points.");
  }
  const completed = trades.filter((trade) => trade.outcome !== "CENSORED");
  const wins = completed.filter((trade) => trade.outcome === "WIN").length;
  const losses = completed.filter((trade) => trade.outcome === "LOSS").length;
  const expired = completed.filter((trade) => trade.outcome === "EXPIRED").length;
  const binary = wins + losses;
  const realized = completed
    .map((trade) => netRealizedR(trade, frictionBps))
    .filter((value): value is number => value !== null);
  const positive = realized.filter((value) => value > 0).reduce((sum, value) => sum + value, 0);
  const negative = Math.abs(realized.filter((value) => value < 0).reduce((sum, value) => sum + value, 0));
  const durations = completed.map((trade) => trade.durationCandles).filter((value): value is number => value !== null);
  const expiredReturns = completed
    .filter((trade) => trade.outcome === "EXPIRED")
    .map((trade) => netRealizedR(trade, frictionBps))
    .filter((value): value is number => value !== null);
  let equity = 0;
  let peak = 0;
  let maximumDrawdown = 0;
  for (const value of realized) {
    equity += value;
    peak = Math.max(peak, equity);
    maximumDrawdown = Math.max(maximumDrawdown, peak - equity);
  }

  return {
    frictionBps,
    signals: completed.length,
    wins,
    losses,
    expired,
    censored: trades.length - completed.length,
    winRateIncludingExpired: ratio(wins, completed.length),
    winRateExcludingExpired: ratio(wins, binary),
    lossRate: ratio(losses, completed.length),
    expiredRate: ratio(expired, completed.length),
    averageRiskReward: average(completed.map((trade) => trade.targetUsd / trade.riskUsd)),
    expectancyR: average(realized),
    profitFactor: negative === 0 ? (positive > 0 ? Number.POSITIVE_INFINITY : null) : positive / negative,
    maximumDrawdownR: realized.length ? maximumDrawdown : null,
    consecutiveWins: longestStreak(completed, "WIN"),
    consecutiveLosses: longestStreak(completed, "LOSS"),
    averageDurationCandles: average(durations),
    medianDurationCandles: median(durations),
    medianStopPct: median(completed.map((trade) => trade.riskPct)),
    medianTargetPct: median(completed.map((trade) => trade.targetPct)),
    medianStopAtr: median(completed.map((trade) => trade.stopAtr)),
    medianTargetAtr: median(completed.map((trade) => trade.targetAtr)),
    averageExpiredR: average(expiredReturns),
  };
}

export function netRealizedR(trade: BacktestTrade, frictionBps: number): number | null {
  if (trade.realizedR === null) return null;
  if (!Number.isFinite(frictionBps) || frictionBps < 0) {
    throw new Error("Backtest friction must be a non-negative number of basis points.");
  }
  if (frictionBps === 0) return trade.realizedR;
  if (!Number.isFinite(trade.riskPct) || trade.riskPct <= 0) return null;
  // riskPct is expressed in percentage points; one basis point is 0.01 percentage points.
  return trade.realizedR - (frictionBps / 100) / trade.riskPct;
}

export function assignPeriod(openedAt: string, start: Date, end: Date): BacktestPeriod {
  const point = (Date.parse(openedAt) - start.getTime()) / (end.getTime() - start.getTime());
  if (point < 0.5) return "TRAIN";
  if (point < 0.7) return "DEVELOPMENT";
  if (point < 0.85) return "VALIDATION";
  return "OUT_OF_SAMPLE";
}

export function percentile(values: number[], quantile: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const index = (sorted.length - 1) * quantile;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

function findPostExpiryOutcome(
  candles: ClosedAnalysisCandle[],
  entry: BaselineEntry,
  stopLoss: number,
  takeProfit: number,
  expiryIndex: number,
  expiryCandles: number,
): { outcome: "WIN" | "LOSS" | "NEITHER"; additionalCandles: number | null } {
  const end = Math.min(candles.length - 1, expiryIndex + expiryCandles * FOLLOW_UP_EXPIRY_MULTIPLIER);
  for (let index = expiryIndex + 1; index <= end; index += 1) {
    const candle = candles[index];
    const hitsStop = entry.direction === "LONG" ? candle.low <= stopLoss : candle.high >= stopLoss;
    const hitsTarget = entry.direction === "LONG" ? candle.high >= takeProfit : candle.low <= takeProfit;
    if (hitsStop || hitsTarget) {
      return { outcome: hitsStop ? "LOSS" : "WIN", additionalCandles: index - expiryIndex };
    }
  }
  return { outcome: "NEITHER", additionalCandles: null };
}

function ratio(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : (numerator / denominator) * 100;
}

function average(values: number[]): number | null {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function median(values: number[]): number | null {
  return percentile(values, 0.5);
}

function longestStreak(trades: BacktestTrade[], outcome: "WIN" | "LOSS"): number {
  let current = 0;
  let longest = 0;
  for (const trade of trades) {
    current = trade.outcome === outcome ? current + 1 : 0;
    longest = Math.max(longest, current);
  }
  return longest;
}
