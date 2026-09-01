import {
  selectClosedHistoricalCandles,
  type HistoricalCandle,
  type HistoricalTimeframe,
} from "./historical";
import {
  evaluateSignal,
  MINIMUM_RISK_REWARD,
  SIGNAL_EXPIRATION_CANDLES,
  type SignalEvaluation,
  type SignalDirection,
} from "./signal-engine";
import { calculateTechnicalAnalysis, type TechnicalAnalysisResult } from "./technical";

export type ClosedAnalysisCandle = HistoricalCandle & { closeTime: string };
export type BacktestOutcome = "WIN" | "LOSS" | "EXPIRED" | "CENSORED";
export type BacktestPeriod = "TRAIN" | "DEVELOPMENT" | "VALIDATION" | "OUT_OF_SAMPLE";
export type VolatilityRegime = "HIGH" | "NORMAL" | "LOW";
export type TrendRegime = "ALIGNED_TREND" | "OPPOSING_TREND" | "SIDEWAYS" | "UNAVAILABLE";

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
  atrPctAtEntry?: number;
  rsiAtEntry?: number | null;
  volumeRatioAtEntry?: number | null;
  structureStopAtr?: number | null;
  favorableObstacleAtr?: number | null;
  alignedTimeframes?: number | null;
  volatilityRegimeAtEntry?: VolatilityRegime | null;
  volatilityPercentileAtEntry?: number | null;
  trendRegimeAtEntry?: TrendRegime | null;
  referenceTrendAtEntry?: "bullish" | "bearish" | "sideways" | null;
};

export type ExitConfiguration = {
  name: string;
  riskMode: "BASELINE" | "CAPPED_ATR" | "ATR" | "PERCENT";
  atrMultiple?: number;
  riskPercent?: number;
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
  timeToMfeCandles: number | null;
  timeToMaeCandles: number | null;
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

export type ClosedReplayDecision = {
  candles: ClosedAnalysisCandle[];
  technical: TechnicalAnalysisResult;
  evaluation: SignalEvaluation;
};

const FOLLOW_UP_EXPIRY_MULTIPLIER = 3;
// Research-only floor. The live engine continues to enforce MINIMUM_RISK_REWARD (1.5).
export const OFFLINE_MINIMUM_RISK_REWARD = 1;

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
    const replay = evaluateClosedReplayDecision({
      candles: candles.slice(Math.max(0, index - 199), index + 1),
      timeframe,
      observedAt: new Date(candles[index].closeTime),
      limit: 200,
    });
    const { technical, evaluation } = replay;
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
      atrPctAtEntry: (atrAtEntry / evaluation.entryPrice) * 100,
      rsiAtEntry: technical.indicators.rsi14,
      volumeRatioAtEntry: technical.indicators.volumeRatio,
      structureStopAtr: structureStopDistanceAtr(
        evaluation.outcome,
        evaluation.entryPrice,
        technical.marketStructure.support,
        technical.marketStructure.resistance,
        atrAtEntry,
      ),
      favorableObstacleAtr: favorableObstacleDistanceAtr(
        evaluation.outcome,
        evaluation.entryPrice,
        technical.marketStructure.support,
        technical.marketStructure.resistance,
        atrAtEntry,
      ),
      ...causalVolatilityRegime(replay.candles),
    };
    entries.push(entry);
    const resolution = evaluateEntry(candles, entry, baselineConfiguration());
    nextEligibleIndex = resolution.durationCandles === null
      ? candles.length
      : index + resolution.durationCandles;
  }

  return entries;
}

/**
 * Offline/replay boundary for the frozen live strategy. It intentionally uses
 * the same closed-candle selector as the Binance live adapter before invoking
 * the same technical-analysis and signal-decision functions.
 */
export function evaluateClosedReplayDecision(input: {
  candles: ClosedAnalysisCandle[];
  timeframe: HistoricalTimeframe;
  observedAt: Date;
  limit?: number;
}): ClosedReplayDecision {
  const candles = selectClosedHistoricalCandles(
    input.candles,
    input.observedAt,
    input.limit ?? 200,
  );
  const technical = calculateTechnicalAnalysis(candles, "binance");
  return {
    candles,
    technical,
    evaluation: evaluateSignal({
      symbol: "BTCUSDT",
      timeframe: input.timeframe,
      candles,
      technical,
    }),
  };
}

export function causalVolatilityRegime(candles: ClosedAnalysisCandle[]): {
  volatilityRegimeAtEntry: VolatilityRegime | null;
  volatilityPercentileAtEntry: number | null;
} {
  const trueRangePct = candles.slice(1).map((candle, index) => {
    const previousClose = candles[index].close;
    if (!Number.isFinite(previousClose) || previousClose <= 0) return null;
    const range = Math.max(
      candle.high - candle.low,
      Math.abs(candle.high - previousClose),
      Math.abs(candle.low - previousClose),
    );
    return Number.isFinite(range) ? range / previousClose * 100 : null;
  }).filter((value): value is number => value !== null);
  const rolling = trueRangePct.slice(13).map((_, index) => {
    const values = trueRangePct.slice(index, index + 14);
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  });
  const current = rolling.at(-1);
  const reference = rolling.slice(0, -1);
  if (current === undefined || reference.length < 30) {
    return { volatilityRegimeAtEntry: null, volatilityPercentileAtEntry: null };
  }
  const belowOrEqual = reference.filter((value) => value <= current).length;
  const percentileRank = belowOrEqual / reference.length;
  return {
    volatilityRegimeAtEntry: percentileRank >= 0.75 ? "HIGH" : percentileRank <= 0.25 ? "LOW" : "NORMAL",
    volatilityPercentileAtEntry: percentileRank,
  };
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
  if (configuration.rewardRisk < OFFLINE_MINIMUM_RISK_REWARD) {
    throw new Error(`Candidate ${configuration.name} violates offline minimum R:R ${OFFLINE_MINIMUM_RISK_REWARD}.`);
  }
  if (!Number.isInteger(configuration.expiryCandles) || configuration.expiryCandles < 1) {
    throw new Error(`Candidate ${configuration.name} has an invalid expiry horizon.`);
  }

  const baselineRisk = Math.abs(entry.entryPrice - entry.baselineStopLoss);
  const requestedAtrRisk = (configuration.atrMultiple ?? 0) * entry.atrAtEntry;
  const requestedPercentageRisk = ((configuration.riskPercent ?? 0) / 100) * entry.entryPrice;
  const risk = configuration.riskMode === "BASELINE"
    ? baselineRisk
    : configuration.riskMode === "CAPPED_ATR"
      ? Math.min(baselineRisk, requestedAtrRisk)
      : configuration.riskMode === "PERCENT"
        ? requestedPercentageRisk
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
  let timeToMfeCandles = 0;
  let timeToMaeCandles = 0;

  for (let index = entry.entryIndex + 1; index <= availableFinalIndex; index += 1) {
    const candle = candles[index];
    const favorable = entry.direction === "LONG" ? candle.high - entry.entryPrice : entry.entryPrice - candle.low;
    const adverse = entry.direction === "LONG" ? entry.entryPrice - candle.low : candle.high - entry.entryPrice;
    if (favorable > mfe) {
      mfe = favorable;
      timeToMfeCandles = index - entry.entryIndex;
    }
    if (adverse > mae) {
      mae = adverse;
      timeToMaeCandles = index - entry.entryIndex;
    }
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
    timeToMfeCandles: closeIndex === null ? null : timeToMfeCandles,
    timeToMaeCandles: closeIndex === null ? null : timeToMaeCandles,
    postExpiryOutcome: postExpiry.outcome,
    postExpiryAdditionalCandles: postExpiry.additionalCandles,
  };
}

function structureStopDistanceAtr(
  direction: SignalDirection,
  entryPrice: number,
  support: number | null,
  resistance: number | null,
  atr: number,
): number | null {
  const distance = direction === "LONG"
    ? support !== null && support < entryPrice ? entryPrice - support : null
    : resistance !== null && resistance > entryPrice ? resistance - entryPrice : null;
  return distance === null ? null : distance / atr;
}

function favorableObstacleDistanceAtr(
  direction: SignalDirection,
  entryPrice: number,
  support: number | null,
  resistance: number | null,
  atr: number,
): number | null {
  const distance = direction === "LONG"
    ? resistance !== null && resistance > entryPrice ? resistance - entryPrice : null
    : support !== null && support < entryPrice ? entryPrice - support : null;
  return distance === null ? null : distance / atr;
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
