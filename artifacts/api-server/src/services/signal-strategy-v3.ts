import { evaluateSignal, type SignalDirection } from "./signal-engine";
import {
  baselineConfiguration,
  causalVolatilityRegime,
  evaluateEntry,
  type BacktestSummary,
  type BacktestTrade,
  type BaselineEntry,
  type ClosedAnalysisCandle,
  type ExitConfiguration,
  type TrendRegime,
  type VolatilityRegime,
} from "./signal-backtest";
import { isCandleClosedAt, type HistoricalTimeframe } from "./historical";
import { calculateTechnicalAnalysis, type TechnicalAnalysisResult } from "./technical";
import {
  buildV2ContextSeries,
  contextAvailableAt,
  type V2ContextPoint,
  type V2Trend,
} from "./signal-strategy-v2";

export const V3_EXECUTION_TIMEFRAMES = ["5m", "15m", "1h"] as const;
export const V3_PERIODS = ["DEVELOPMENT", "VALIDATION", "HOLDOUT", "PSEUDO_FORWARD"] as const;
export const V3_ENTRY_CANDIDATES = [
  "BASELINE_ALL",
  "REGIME_LOCAL_TREND",
  "REGIME_SIDEWAYS",
  "REGIME_LOW_VOL",
  "REGIME_NORMAL_VOL",
  "REGIME_HIGH_VOL",
  "REGIME_EXTREME_VOL",
  "REGIME_TREND_NORMAL_VOL",
  "HTF_1H_ALIGNED",
  "HTF_4H_ALIGNED",
  "HTF_DUAL_ALIGNED",
  "HTF_NO_STRONG_CONTRADICTION",
  "EXTENSION_MAX_075_ATR",
  "EXTENSION_MAX_100_ATR",
  "EXTENSION_MAX_125_ATR",
  "VOLUME_MIN_100",
  "VOLUME_MIN_120",
  "BREAKOUT_DIRECT",
  "BREAKOUT_CONFIRMED",
  "BREAKOUT_RETEST",
  "PULLBACK_CONTINUATION",
  "MOMENTUM_CONFIRMED",
  "STRUCTURE_REJECTION",
  "QUALITY_BREAKOUT_HTF",
  "QUALITY_PULLBACK_HTF",
  "QUALITY_MOMENTUM_HTF",
] as const;

export type V3ExecutionTimeframe = (typeof V3_EXECUTION_TIMEFRAMES)[number];
export type V3Period = (typeof V3_PERIODS)[number];
export type V3EntryCandidateId = (typeof V3_ENTRY_CANDIDATES)[number];

export type V3FeatureSnapshot = {
  localTrend: V2Trend;
  localEmaDirection: SignalDirection | null;
  localStructure: TechnicalAnalysisResult["marketStructure"]["structure"];
  volatilityRegime: VolatilityRegime | null;
  volatilityPercentile: number | null;
  htf1hDirection: SignalDirection | null;
  htf4hDirection: SignalDirection | null;
  trendRegime: TrendRegime;
  extensionAtr: number;
  directionalMoveAtr: number;
  volumeRatio: number | null;
  bodyRatio: number;
  breakoutDirect: boolean;
  breakoutConfirmed: boolean;
  breakoutRetest: boolean;
  pullbackContinuation: boolean;
  momentumConfirmed: boolean;
  structureRejection: boolean;
  utcHour: number;
  argBraHour: number;
};

export type V3SetupEntry = BaselineEntry & {
  feature: V3FeatureSnapshot;
};

export type V3PreSealedCandidate<T> = {
  candidate: T;
  development5Bps: BacktestSummary;
  development10Bps: BacktestSummary;
  validation5Bps: BacktestSummary;
  validation10Bps: BacktestSummary;
};

export const V3_HYPOTHESES: Readonly<Record<V3EntryCandidateId, string>> = {
  BASELINE_ALL: "Frozen baseline entry control with no additional filter.",
  REGIME_LOCAL_TREND: "Avoid locally sideways market structure.",
  REGIME_SIDEWAYS: "Measure whether the baseline has a distinct range-bound edge.",
  REGIME_LOW_VOL: "Measure setups occurring in the lower causal volatility quartile.",
  REGIME_NORMAL_VOL: "Avoid both volatility tails.",
  REGIME_HIGH_VOL: "Measure setups occurring above the causal 75th percentile.",
  REGIME_EXTREME_VOL: "Isolate the causal top volatility decile.",
  REGIME_TREND_NORMAL_VOL: "Require local directional structure without a volatility tail.",
  HTF_1H_ALIGNED: "Require confirmed 1h direction to agree with the setup.",
  HTF_4H_ALIGNED: "Require confirmed 4h direction to agree with the setup.",
  HTF_DUAL_ALIGNED: "Require both confirmed 1h and 4h directions to agree.",
  HTF_NO_STRONG_CONTRADICTION: "Reject only a confirmed contradiction from either higher timeframe.",
  EXTENSION_MAX_075_ATR: "Reject entries already extended more than 0.75 ATR from EMA20.",
  EXTENSION_MAX_100_ATR: "Reject entries already extended more than 1 ATR from EMA20.",
  EXTENSION_MAX_125_ATR: "Reject entries already extended more than 1.25 ATR from EMA20.",
  VOLUME_MIN_100: "Require volume at or above its rolling reference.",
  VOLUME_MIN_120: "Require a moderate relative-volume expansion.",
  BREAKOUT_DIRECT: "Require a closed break of the prior twenty-candle range.",
  BREAKOUT_CONFIRMED: "Require range break, strong closed body, volume, and non-extreme volatility.",
  BREAKOUT_RETEST: "Require a prior closed breakout followed by a closed retest and reclaim/rejection.",
  PULLBACK_CONTINUATION: "Require a closed EMA20 pullback continuation in local trend.",
  MOMENTUM_CONFIRMED: "Require local momentum, volume, non-extreme volatility, and limited extension.",
  STRUCTURE_REJECTION: "Require a closed rejection wick at recent structure.",
  QUALITY_BREAKOUT_HTF: "Confirmed breakout aligned with 1h and not contradicted by 4h.",
  QUALITY_PULLBACK_HTF: "Pullback continuation aligned with 1h in normal volatility.",
  QUALITY_MOMENTUM_HTF: "Momentum aligned with both higher timeframes.",
};

export function buildV3Contexts(input: {
  candles1h: ClosedAnalysisCandle[];
  candles4h: ClosedAnalysisCandle[];
}): { contexts1h: V2ContextPoint[]; contexts4h: V2ContextPoint[] } {
  return {
    contexts1h: buildV2ContextSeries(input.candles1h),
    contexts4h: buildV2ContextSeries(input.candles4h),
  };
}

export function isV3CandleUsable(closeTime: number | string | Date, observedAt: Date): boolean {
  return isCandleClosedAt(closeTime, observedAt);
}

export function generateV3BaselineSetups(input: {
  candles: ClosedAnalysisCandle[];
  timeframe: V3ExecutionTimeframe | "4h";
  contexts1h: V2ContextPoint[];
  contexts4h: V2ContextPoint[];
  analysisStart: Date;
}): V3SetupEntry[] {
  const result: V3SetupEntry[] = [];
  for (let index = 199; index < input.candles.length; index += 1) {
    const candle = input.candles[index];
    if (Date.parse(candle.timestamp) < input.analysisStart.getTime()) continue;
    const window = input.candles.slice(index - 199, index + 1);
    const technical = calculateTechnicalAnalysis(window, "binance");
    const evaluation = evaluateSignal({
      symbol: "BTCUSDT",
      timeframe: input.timeframe,
      candles: window,
      technical,
    });
    if (evaluation.outcome === "NO_SIGNAL") continue;
    const atr = technical.indicators.atr14;
    const ema20 = technical.indicators.ema20;
    if (technical.status !== "OK" || atr === null || atr <= 0 || ema20 === null) continue;

    const observedAtMs = Date.parse(candle.closeTime);
    const context1h = contextAvailableAt(input.contexts1h, observedAtMs);
    const context4h = contextAvailableAt(input.contexts4h, observedAtMs);
    const htf1hDirection = strictContextDirection(context1h?.trend ?? null, context1h?.emaDirection ?? null);
    const htf4hDirection = strictContextDirection(context4h?.trend ?? null, context4h?.emaDirection ?? null);
    const localEmaDirection = emaDirection(technical);
    const volatility = causalVolatilityRegime(window);
    const feature = buildFeature({
      candles: window,
      direction: evaluation.outcome,
      technical,
      atr,
      ema20,
      htf1hDirection,
      htf4hDirection,
      referenceDirection: input.timeframe === "4h"
        ? null
        : input.timeframe === "1h" ? htf4hDirection : htf1hDirection,
      volatility,
    });

    result.push({
      timeframe: input.timeframe,
      direction: evaluation.outcome,
      entryIndex: index,
      openedAt: evaluation.openedAt.toISOString(),
      entryPrice: evaluation.entryPrice,
      baselineStopLoss: evaluation.stopLoss,
      baselineTakeProfit: evaluation.takeProfit,
      baselineRiskReward: evaluation.riskRewardRatio,
      atrAtEntry: atr,
      atrPctAtEntry: atr / evaluation.entryPrice * 100,
      rsiAtEntry: technical.indicators.rsi14,
      volumeRatioAtEntry: technical.indicators.volumeRatio,
      volatilityRegimeAtEntry: volatility.volatilityRegimeAtEntry,
      volatilityPercentileAtEntry: volatility.volatilityPercentileAtEntry,
      trendRegimeAtEntry: feature.trendRegime,
      referenceTrendAtEntry: input.timeframe === "4h"
        ? null
        : input.timeframe === "1h"
        ? context4h?.trend ?? null
        : context1h?.trend ?? null,
      feature: { ...feature, localEmaDirection },
    });
  }
  return result;
}

export function filterV3Entries(
  entries: V3SetupEntry[],
  candidateId: V3EntryCandidateId,
): V3SetupEntry[] {
  return entries.filter((entry) => acceptsCandidate(candidateId, entry));
}

export function evaluateV3Entries(
  candles: ClosedAnalysisCandle[],
  entries: V3SetupEntry[],
  configuration: ExitConfiguration = baselineConfiguration(),
): BacktestTrade[] {
  const trades: BacktestTrade[] = [];
  let nextEligibleIndex = 0;
  for (const entry of entries) {
    if (entry.entryIndex < nextEligibleIndex) continue;
    const trade = evaluateEntry(candles, entry, configuration);
    trades.push(trade);
    nextEligibleIndex = trade.durationCandles === null
      ? candles.length
      : entry.entryIndex + Math.max(1, trade.durationCandles);
  }
  return trades;
}

export function v3Period(openedAt: string, start: Date, end: Date): V3Period {
  const point = (Date.parse(openedAt) - start.getTime()) / (end.getTime() - start.getTime());
  if (point < 0.45) return "DEVELOPMENT";
  if (point < 0.7) return "VALIDATION";
  if (point < 0.85) return "HOLDOUT";
  return "PSEUDO_FORWARD";
}

export function selectV3BeforeSealed<T>(
  candidates: Array<V3PreSealedCandidate<T>>,
  minimum = { development: 35, validation: 20 },
): Array<V3PreSealedCandidate<T>> {
  return candidates.filter((item) =>
    item.development5Bps.signals >= minimum.development
    && item.validation5Bps.signals >= minimum.validation)
    .sort(comparePreSealed);
}

export function entryGatePasses(item: V3PreSealedCandidate<unknown>): boolean {
  return positiveEdge(item.development5Bps)
    && positiveEdge(item.validation5Bps)
    && (item.development10Bps.expectancyR ?? Number.NEGATIVE_INFINITY) >= 0
    && (item.validation10Bps.expectancyR ?? Number.NEGATIVE_INFINITY) >= 0;
}

function acceptsCandidate(candidateId: V3EntryCandidateId, entry: V3SetupEntry): boolean {
  const feature = entry.feature;
  const aligned1h = feature.htf1hDirection === entry.direction;
  const aligned4h = feature.htf4hDirection === entry.direction;
  const notContradicted = !isOpposite(feature.htf1hDirection, entry.direction)
    && !isOpposite(feature.htf4hDirection, entry.direction);
  switch (candidateId) {
    case "BASELINE_ALL": return true;
    case "REGIME_LOCAL_TREND": return feature.localTrend !== "sideways";
    case "REGIME_SIDEWAYS": return feature.localTrend === "sideways";
    case "REGIME_LOW_VOL": return feature.volatilityRegime === "LOW";
    case "REGIME_NORMAL_VOL": return feature.volatilityRegime === "NORMAL";
    case "REGIME_HIGH_VOL": return feature.volatilityRegime === "HIGH";
    case "REGIME_EXTREME_VOL": return (feature.volatilityPercentile ?? 0) >= 0.9;
    case "REGIME_TREND_NORMAL_VOL": return feature.localTrend !== "sideways" && feature.volatilityRegime === "NORMAL";
    case "HTF_1H_ALIGNED": return aligned1h;
    case "HTF_4H_ALIGNED": return aligned4h;
    case "HTF_DUAL_ALIGNED": return aligned1h && aligned4h;
    case "HTF_NO_STRONG_CONTRADICTION": return notContradicted;
    case "EXTENSION_MAX_075_ATR": return feature.extensionAtr <= 0.75;
    case "EXTENSION_MAX_100_ATR": return feature.extensionAtr <= 1;
    case "EXTENSION_MAX_125_ATR": return feature.extensionAtr <= 1.25;
    case "VOLUME_MIN_100": return (feature.volumeRatio ?? 0) >= 1;
    case "VOLUME_MIN_120": return (feature.volumeRatio ?? 0) >= 1.2;
    case "BREAKOUT_DIRECT": return feature.breakoutDirect;
    case "BREAKOUT_CONFIRMED": return feature.breakoutConfirmed;
    case "BREAKOUT_RETEST": return feature.breakoutRetest;
    case "PULLBACK_CONTINUATION": return feature.pullbackContinuation;
    case "MOMENTUM_CONFIRMED": return feature.momentumConfirmed;
    case "STRUCTURE_REJECTION": return feature.structureRejection;
    case "QUALITY_BREAKOUT_HTF": return feature.breakoutConfirmed && aligned1h && !isOpposite(feature.htf4hDirection, entry.direction);
    case "QUALITY_PULLBACK_HTF": return feature.pullbackContinuation && aligned1h && feature.volatilityRegime === "NORMAL";
    case "QUALITY_MOMENTUM_HTF": return feature.momentumConfirmed && aligned1h && aligned4h;
  }
}

function buildFeature(input: {
  candles: ClosedAnalysisCandle[];
  direction: SignalDirection;
  technical: TechnicalAnalysisResult;
  atr: number;
  ema20: number;
  htf1hDirection: SignalDirection | null;
  htf4hDirection: SignalDirection | null;
  referenceDirection: SignalDirection | null;
  volatility: ReturnType<typeof causalVolatilityRegime>;
}): Omit<V3FeatureSnapshot, "localEmaDirection"> {
  const candle = input.candles.at(-1)!;
  const previous = input.candles.at(-2)!;
  const priorTwenty = input.candles.slice(-21, -1);
  const priorTwentyBeforePrevious = input.candles.slice(-22, -2);
  const priorHigh = Math.max(...priorTwenty.map((item) => item.high));
  const priorLow = Math.min(...priorTwenty.map((item) => item.low));
  const prePreviousHigh = Math.max(...priorTwentyBeforePrevious.map((item) => item.high));
  const prePreviousLow = Math.min(...priorTwentyBeforePrevious.map((item) => item.low));
  const range = candle.high - candle.low;
  const body = Math.abs(candle.close - candle.open);
  const bodyRatio = range > 0 ? body / range : 0;
  const extensionAtr = Math.abs(candle.close - input.ema20) / input.atr;
  const directionalMoveAtr = input.direction === "LONG"
    ? (candle.close - candle.open) / input.atr
    : (candle.open - candle.close) / input.atr;
  const volumeRatio = input.technical.indicators.volumeRatio;
  const direct = input.direction === "LONG" ? candle.close > priorHigh : candle.close < priorLow;
  const closeNearExtreme = input.direction === "LONG"
    ? range > 0 && (candle.high - candle.close) / range <= 0.25
    : range > 0 && (candle.close - candle.low) / range <= 0.25;
  const percentile = input.volatility.volatilityPercentileAtEntry;
  const confirmed = direct
    && bodyRatio >= 0.55
    && closeNearExtreme
    && (volumeRatio ?? 0) >= 1.1
    && percentile !== null
    && percentile >= 0.2
    && percentile <= 0.9
    && extensionAtr <= 1.5;
  const previousBreakout = input.direction === "LONG"
    ? previous.close > prePreviousHigh
    : previous.close < prePreviousLow;
  const retests = input.direction === "LONG"
    ? candle.low <= prePreviousHigh && candle.close > prePreviousHigh && candle.close > candle.open
    : candle.high >= prePreviousLow && candle.close < prePreviousLow && candle.close < candle.open;
  const localEma = emaDirection(input.technical);
  const directionalCandle = input.direction === "LONG" ? candle.close > candle.open : candle.close < candle.open;
  const touchesEma = input.direction === "LONG" ? candle.low <= input.ema20 : candle.high >= input.ema20;
  const rsi = input.technical.indicators.rsi14;
  const pullback = localEma === input.direction && touchesEma && directionalCandle && extensionAtr <= 0.75;
  const momentum = localEma === input.direction
    && directionalCandle
    && directionalMoveAtr >= 0.25
    && extensionAtr <= 1.5
    && (volumeRatio ?? 0) >= 1.05
    && percentile !== null
    && percentile >= 0.2
    && percentile <= 0.9
    && rsi !== null
    && (input.direction === "LONG" ? rsi >= 55 && rsi <= 68 : rsi >= 32 && rsi <= 45);
  const lowerWick = Math.min(candle.open, candle.close) - candle.low;
  const upperWick = candle.high - Math.max(candle.open, candle.close);
  const rejection = input.direction === "LONG"
    ? candle.low <= priorLow && lowerWick >= Math.max(body, range * 0.35) && candle.close > priorLow
    : candle.high >= priorHigh && upperWick >= Math.max(body, range * 0.35) && candle.close < priorHigh;
  const utcHour = new Date(candle.closeTime).getUTCHours();
  const argBraHour = (utcHour + 21) % 24;
  return {
    localTrend: input.technical.marketStructure.trend,
    localStructure: input.technical.marketStructure.structure,
    volatilityRegime: input.volatility.volatilityRegimeAtEntry,
    volatilityPercentile: percentile,
    htf1hDirection: input.htf1hDirection,
    htf4hDirection: input.htf4hDirection,
    trendRegime: trendRegime(input.direction, input.referenceDirection),
    extensionAtr,
    directionalMoveAtr,
    volumeRatio,
    bodyRatio,
    breakoutDirect: direct,
    breakoutConfirmed: confirmed,
    breakoutRetest: previousBreakout && retests,
    pullbackContinuation: pullback,
    momentumConfirmed: momentum,
    structureRejection: rejection,
    utcHour,
    argBraHour,
  };
}

function trendRegime(direction: SignalDirection, context: SignalDirection | null): TrendRegime {
  if (context === null) return "UNAVAILABLE";
  return direction === context ? "ALIGNED_TREND" : "OPPOSING_TREND";
}

function strictContextDirection(trend: V2Trend, ema: SignalDirection | null): SignalDirection | null {
  if (trend === "bullish" && ema === "LONG") return "LONG";
  if (trend === "bearish" && ema === "SHORT") return "SHORT";
  return null;
}

function emaDirection(technical: TechnicalAnalysisResult): SignalDirection | null {
  const { ema20, ema50, ema200 } = technical.indicators;
  if (ema20 === null || ema50 === null || ema200 === null) return null;
  if (ema20 > ema50 && ema50 > ema200) return "LONG";
  if (ema20 < ema50 && ema50 < ema200) return "SHORT";
  return null;
}

function isOpposite(context: SignalDirection | null, direction: SignalDirection): boolean {
  return context !== null && context !== direction;
}

function positiveEdge(summary: BacktestSummary): boolean {
  return (summary.expectancyR ?? Number.NEGATIVE_INFINITY) > 0
    && (summary.profitFactor ?? 0) > 1;
}

function comparePreSealed<T>(left: V3PreSealedCandidate<T>, right: V3PreSealedCandidate<T>): number {
  const leftWorst = Math.min(
    left.development5Bps.expectancyR ?? Number.NEGATIVE_INFINITY,
    left.validation5Bps.expectancyR ?? Number.NEGATIVE_INFINITY,
  );
  const rightWorst = Math.min(
    right.development5Bps.expectancyR ?? Number.NEGATIVE_INFINITY,
    right.validation5Bps.expectancyR ?? Number.NEGATIVE_INFINITY,
  );
  if (leftWorst !== rightWorst) return rightWorst - leftWorst;
  const leftAverage = ((left.development5Bps.expectancyR ?? Number.NEGATIVE_INFINITY)
    + (left.validation5Bps.expectancyR ?? Number.NEGATIVE_INFINITY)) / 2;
  const rightAverage = ((right.development5Bps.expectancyR ?? Number.NEGATIVE_INFINITY)
    + (right.validation5Bps.expectancyR ?? Number.NEGATIVE_INFINITY)) / 2;
  if (leftAverage !== rightAverage) return rightAverage - leftAverage;
  return (left.development5Bps.maximumDrawdownR ?? Number.POSITIVE_INFINITY)
    - (right.development5Bps.maximumDrawdownR ?? Number.POSITIVE_INFINITY);
}

export function v3CandidateCount(): number {
  return V3_ENTRY_CANDIDATES.length;
}

export function isV3ExecutionTimeframe(timeframe: HistoricalTimeframe): timeframe is V3ExecutionTimeframe {
  return V3_EXECUTION_TIMEFRAMES.some((candidate) => candidate === timeframe);
}
