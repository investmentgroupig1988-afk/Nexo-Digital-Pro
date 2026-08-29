import { percentile, type BacktestSummary, type BacktestTrade, type ClosedAnalysisCandle } from "./signal-backtest";
import { isCandleClosedAt, type HistoricalTimeframe } from "./historical";
import type { SignalDirection } from "./signal-engine";
import type { V3SetupEntry } from "./signal-strategy-v3";

export const V4_FACTOR_IDS = [
  "TREND_QUALITY",
  "STRUCTURE_QUALITY",
  "HTF_ALIGNMENT",
  "ENTRY_EXTENSION",
  "VOLATILITY_FIT",
  "RELATIVE_VOLUME",
  "MOMENTUM_CONFIRMATION",
  "PATTERN_QUALITY",
  "RANGE_AND_CLOSE_QUALITY",
] as const;
export const V4_BUCKETS = ["BOTTOM_30", "MIDDLE_40", "TOP_20_TO_30", "TOP_10_TO_20", "TOP_10"] as const;
export const V4_THRESHOLDS = ["TOP_30", "TOP_20", "TOP_10"] as const;
export const V4_FORWARD_HYPOTHESIS = "QUALITY_PULLBACK_HTF_1H" as const;

export type V4FactorId = (typeof V4_FACTOR_IDS)[number];
export type V4Bucket = (typeof V4_BUCKETS)[number];
export type V4ThresholdId = (typeof V4_THRESHOLDS)[number];
export type V4FactorValues = Record<V4FactorId, number>;
export type V4ScoredEntry = V3SetupEntry & {
  qualityScore: number;
  qualityFactors: V4FactorValues;
};
export type V4ScoreThresholds = {
  p30: number;
  p70: number;
  p80: number;
  p90: number;
};
export type V4PreSealedCandidate<T> = {
  candidate: T;
  development5Bps: BacktestSummary;
  development10Bps: BacktestSummary;
  validation5Bps: BacktestSummary;
  validation10Bps: BacktestSummary;
};

export function scoreV4Opportunities(input: {
  entries: V3SetupEntry[];
  candles: ClosedAnalysisCandle[];
  timeframe: Exclude<HistoricalTimeframe, "1m">;
  observedAt: Date;
}): V4ScoredEntry[] {
  return input.entries.map((entry) => {
    const candle = input.candles[entry.entryIndex];
    if (candle === undefined || !isCandleClosedAt(candle.closeTime, input.observedAt)) {
      throw new Error("V4 cannot score an opportunity whose entry candle is not closed.");
    }
    const history = input.candles.slice(Math.max(0, entry.entryIndex - 20), entry.entryIndex + 1);
    if (history.length < 21) throw new Error("V4 requires twenty prior closed candles at the entry.");
    const factors = calculateV4Factors(entry, history, input.timeframe);
    return {
      ...entry,
      qualityFactors: factors,
      qualityScore: average(Object.values(factors)) * 100,
    };
  });
}

export function calculateV4Factors(
  entry: V3SetupEntry,
  closedHistory: ClosedAnalysisCandle[],
  timeframe: Exclude<HistoricalTimeframe, "1m">,
): V4FactorValues {
  const candle = closedHistory.at(-1)!;
  const prior = closedHistory.slice(0, -1);
  const priorHigh = Math.max(...prior.map((item) => item.high));
  const priorLow = Math.min(...prior.map((item) => item.low));
  const range = Math.max(Number.EPSILON, candle.high - candle.low);
  const recentRange = Math.max(Number.EPSILON, priorHigh - priorLow);
  const rangePosition = clamp((candle.close - priorLow) / recentRange);
  const directionalRangePosition = entry.direction === "LONG" ? rangePosition : 1 - rangePosition;
  const closeLocation = entry.direction === "LONG"
    ? clamp((candle.close - candle.low) / range)
    : clamp((candle.high - candle.close) / range);
  const trendDirection = trendToDirection(entry.feature.localTrend);
  const structureDirection = structureToDirection(entry.feature.localStructure);
  const trendQuality = average([
    directionalAgreement(entry.feature.localEmaDirection, entry.direction),
    directionalAgreement(trendDirection, entry.direction),
  ]);
  const structureQuality = average([
    directionalAgreement(structureDirection, entry.direction),
    entry.feature.structureRejection ? 1 : entry.feature.pullbackContinuation ? 0.8 : 0.5,
  ]);
  const htfContexts = timeframe === "4h"
    ? []
    : timeframe === "1h" ? [entry.feature.htf4hDirection] : [entry.feature.htf1hDirection, entry.feature.htf4hDirection];
  const htfAlignment = htfContexts.length
    ? average(htfContexts.map((context) => directionalAgreement(context, entry.direction)))
    : 0.5;
  const extension = clamp(1 - entry.feature.extensionAtr / 2);
  const volatility = entry.feature.volatilityPercentile === null
    ? 0.5
    : clamp(1 - Math.abs(entry.feature.volatilityPercentile - 0.55) / 0.55);
  const volume = entry.feature.volumeRatio === null
    ? 0.5
    : clamp((entry.feature.volumeRatio - 0.5) / 1.25);
  const rsi = entry.rsiAtEntry;
  const directionalRsi = rsi === null || rsi === undefined
    ? 0.5
    : entry.direction === "LONG" ? clamp((rsi - 45) / 25) : clamp((55 - rsi) / 25);
  const momentum = average([
    directionalRsi,
    clamp((entry.feature.directionalMoveAtr + 0.25) / 1.25),
    entry.feature.momentumConfirmed ? 1 : 0.5,
  ]);
  const pattern = entry.feature.breakoutRetest || entry.feature.structureRejection
    ? 1
    : entry.feature.breakoutConfirmed || entry.feature.pullbackContinuation
      ? 0.9
      : entry.feature.momentumConfirmed ? 0.8 : entry.feature.breakoutDirect ? 0.65 : 0.3;
  const rangeAndClose = average([directionalRangePosition, closeLocation, entry.feature.bodyRatio]);
  return {
    TREND_QUALITY: trendQuality,
    STRUCTURE_QUALITY: structureQuality,
    HTF_ALIGNMENT: htfAlignment,
    ENTRY_EXTENSION: extension,
    VOLATILITY_FIT: volatility,
    RELATIVE_VOLUME: volume,
    MOMENTUM_CONFIRMATION: momentum,
    PATTERN_QUALITY: pattern,
    RANGE_AND_CLOSE_QUALITY: rangeAndClose,
  };
}

export function deriveV4Thresholds(developmentEntries: V4ScoredEntry[]): V4ScoreThresholds {
  const scores = developmentEntries.map((entry) => entry.qualityScore);
  if (scores.length < 10) throw new Error("V4 requires at least ten development opportunities to derive buckets.");
  return {
    p30: percentile(scores, 0.3)!,
    p70: percentile(scores, 0.7)!,
    p80: percentile(scores, 0.8)!,
    p90: percentile(scores, 0.9)!,
  };
}

export function v4Bucket(entry: V4ScoredEntry, thresholds: V4ScoreThresholds): V4Bucket {
  if (entry.qualityScore >= thresholds.p90) return "TOP_10";
  if (entry.qualityScore >= thresholds.p80) return "TOP_10_TO_20";
  if (entry.qualityScore >= thresholds.p70) return "TOP_20_TO_30";
  if (entry.qualityScore >= thresholds.p30) return "MIDDLE_40";
  return "BOTTOM_30";
}

export function filterV4Threshold(
  entries: V4ScoredEntry[],
  thresholdId: V4ThresholdId,
  thresholds: V4ScoreThresholds,
): V4ScoredEntry[] {
  const threshold = thresholdId === "TOP_10" ? thresholds.p90 : thresholdId === "TOP_20" ? thresholds.p80 : thresholds.p70;
  return entries.filter((entry) => entry.qualityScore >= threshold);
}

export function selectV4BeforeSealed<T, TCandidate extends V4PreSealedCandidate<T>>(
  candidates: TCandidate[],
  minimum: { development: number; validation: number },
): TCandidate[] {
  return candidates.filter((item) =>
    item.development5Bps.signals >= minimum.development
    && item.validation5Bps.signals >= minimum.validation)
    .sort((left, right) => {
      const leftWorst = Math.min(
        left.development5Bps.expectancyR ?? Number.NEGATIVE_INFINITY,
        left.validation5Bps.expectancyR ?? Number.NEGATIVE_INFINITY,
      );
      const rightWorst = Math.min(
        right.development5Bps.expectancyR ?? Number.NEGATIVE_INFINITY,
        right.validation5Bps.expectancyR ?? Number.NEGATIVE_INFINITY,
      );
      if (leftWorst !== rightWorst) return rightWorst - leftWorst;
      const leftPf = Math.min(left.development5Bps.profitFactor ?? 0, left.validation5Bps.profitFactor ?? 0);
      const rightPf = Math.min(right.development5Bps.profitFactor ?? 0, right.validation5Bps.profitFactor ?? 0);
      return rightPf - leftPf;
    });
}

export function v4EntryGatePasses(candidate: V4PreSealedCandidate<unknown>): boolean {
  return positiveEdge(candidate.development5Bps)
    && positiveEdge(candidate.validation5Bps)
    && (candidate.development10Bps.expectancyR ?? Number.NEGATIVE_INFINITY) >= 0
    && (candidate.validation10Bps.expectancyR ?? Number.NEGATIVE_INFINITY) >= 0;
}

export function v4MfeMaeDistribution(trades: BacktestTrade[]) {
  const mfe = trades.map((trade) => trade.mfeAtr).filter((value): value is number => value !== null);
  const mae = trades.map((trade) => trade.maeAtr).filter((value): value is number => value !== null);
  const timeToMfe = trades.map((trade) => trade.timeToMfeCandles).filter((value): value is number => value !== null);
  return {
    mfeAtr: percentiles(mfe),
    maeAtr: percentiles(mae),
    timeToMfeCandles: percentiles(timeToMfe),
  };
}

export function monotonicBucketEvidence(expectanciesLowToHigh: Array<number | null>) {
  const usable = expectanciesLowToHigh.map((value, index) => ({ value, index }))
    .filter((item): item is { value: number; index: number } => item.value !== null && Number.isFinite(item.value));
  if (usable.length < 4) return { strict: false, spearman: null };
  const strict = usable.every((item, index) => index === 0 || item.value >= usable[index - 1].value);
  const valueRanks = rank(usable.map((item) => item.value));
  const indexRanks = rank(usable.map((item) => item.index));
  return { strict, spearman: pearson(valueRanks, indexRanks) };
}

function directionalAgreement(context: SignalDirection | null, direction: SignalDirection): number {
  return context === null ? 0.5 : context === direction ? 1 : 0;
}

function trendToDirection(trend: V3SetupEntry["feature"]["localTrend"]): SignalDirection | null {
  return trend === "bullish" ? "LONG" : trend === "bearish" ? "SHORT" : null;
}

function structureToDirection(structure: V3SetupEntry["feature"]["localStructure"]): SignalDirection | null {
  return structure === "higher_high_and_higher_low" ? "LONG"
    : structure === "lower_high_and_lower_low" ? "SHORT" : null;
}

function percentiles(values: number[]) {
  return {
    p25: percentile(values, 0.25),
    p50: percentile(values, 0.5),
    p75: percentile(values, 0.75),
    p90: percentile(values, 0.9),
  };
}

function positiveEdge(summary: BacktestSummary): boolean {
  return (summary.expectancyR ?? Number.NEGATIVE_INFINITY) > 0 && (summary.profitFactor ?? 0) > 1;
}

function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function clamp(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

function rank(values: number[]): number[] {
  const sorted = values.map((value, index) => ({ value, index })).sort((left, right) => left.value - right.value);
  const result = Array<number>(values.length);
  sorted.forEach((item, rankIndex) => { result[item.index] = rankIndex; });
  return result;
}

function pearson(left: number[], right: number[]): number | null {
  if (left.length !== right.length || left.length < 2) return null;
  const leftMean = average(left);
  const rightMean = average(right);
  let numerator = 0;
  let leftSquare = 0;
  let rightSquare = 0;
  for (let index = 0; index < left.length; index += 1) {
    const l = left[index] - leftMean;
    const r = right[index] - rightMean;
    numerator += l * r;
    leftSquare += l * l;
    rightSquare += r * r;
  }
  const denominator = Math.sqrt(leftSquare * rightSquare);
  return denominator === 0 ? null : numerator / denominator;
}
