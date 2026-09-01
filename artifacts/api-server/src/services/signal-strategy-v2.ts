import type { HistoricalTimeframe } from "./historical";
import {
  causalVolatilityRegime,
  evaluateEntry,
  type BacktestSummary,
  type BacktestTrade,
  type BaselineEntry,
  type ClosedAnalysisCandle,
  type ExitConfiguration,
  type VolatilityRegime,
} from "./signal-backtest";
import type { SignalDirection } from "./signal-engine";
import { calculateTechnicalAnalysis, type TechnicalAnalysisResult } from "./technical";

export const V2_EXECUTION_TIMEFRAMES = ["5m", "15m", "1h"] as const;
export const V2_ATR_DISTANCES = [0.75, 1, 1.25, 1.5, 2, 2.5] as const;
export const V2_EXPIRY_CANDLES = [6, 12, 18, 24, 36] as const;
export const V2_ENTRY_CANDIDATES = [
  "HTF_TREND_PULLBACK",
  "DUAL_HTF_TREND_PULLBACK",
  "CONFIRMED_BREAKOUT",
  "HTF_CONFIRMED_BREAKOUT",
  "MOMENTUM_NORMAL_REGIME",
  "MULTI_TIMEFRAME_CONFLUENCE",
] as const;

export type V2ExecutionTimeframe = (typeof V2_EXECUTION_TIMEFRAMES)[number];
export type V2EntryCandidateId = (typeof V2_ENTRY_CANDIDATES)[number];
export type V2Trend = "bullish" | "bearish" | "sideways" | null;
export type V2Period = "DEVELOPMENT" | "VALIDATION" | "FINAL_HOLDOUT";

export type V2ContextPoint = {
  closeTimeMs: number;
  trend: V2Trend;
  emaDirection: SignalDirection | null;
};

export type V2FeatureFrame = {
  timeframe: V2ExecutionTimeframe;
  open: number;
  high: number;
  low: number;
  close: number;
  ema20: number;
  ema50: number;
  ema200: number;
  rsi: number;
  atr: number;
  volumeRatio: number | null;
  localTrend: V2Trend;
  localStructure: TechnicalAnalysisResult["marketStructure"]["structure"];
  support: number | null;
  resistance: number | null;
  volatilityRegime: VolatilityRegime | null;
  volatilityPercentile: number | null;
  primaryHtfTrend: V2Trend;
  primaryHtfEmaDirection: SignalDirection | null;
  secondaryHtfTrend: V2Trend;
  secondaryHtfEmaDirection: SignalDirection | null;
  priorTwentyHigh: number;
  priorTwentyLow: number;
};

export type V2Entry = BaselineEntry & {
  candidateId: V2EntryCandidateId;
};

export type V2PreHoldoutCandidate<T> = {
  candidate: T;
  development5Bps: BacktestSummary;
  development10Bps: BacktestSummary;
  validation5Bps: BacktestSummary;
  validation10Bps: BacktestSummary;
};

export function buildV2ContextSeries(candles: ClosedAnalysisCandle[]): V2ContextPoint[] {
  const result: V2ContextPoint[] = [];
  for (let index = 199; index < candles.length; index += 1) {
    const technical = calculateTechnicalAnalysis(candles.slice(index - 199, index + 1), "binance");
    result.push({
      closeTimeMs: Date.parse(candles[index].closeTime),
      trend: technical.marketStructure.trend,
      emaDirection: emaDirection(technical),
    });
  }
  return result;
}

export function contextAvailableAt(
  contexts: V2ContextPoint[],
  observedAtMs: number,
): V2ContextPoint | null {
  let low = 0;
  let high = contexts.length - 1;
  let match: V2ContextPoint | null = null;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const candidate = contexts[middle];
    if (candidate.closeTimeMs <= observedAtMs) {
      match = candidate;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return match;
}

export function evaluateV2Families(frame: V2FeatureFrame): Array<{
  candidateId: V2EntryCandidateId;
  direction: SignalDirection;
}> {
  const signals: Array<{ candidateId: V2EntryCandidateId; direction: SignalDirection }> = [];
  const localDirection = alignedLocalDirection(frame);
  const primaryDirection = contextDirection(frame.primaryHtfTrend, frame.primaryHtfEmaDirection);
  const secondaryDirection = contextDirection(frame.secondaryHtfTrend, frame.secondaryHtfEmaDirection);
  const pullbackDirection = pullback(frame);
  const breakoutDirection = confirmedBreakout(frame);
  const momentumDirection = momentum(frame);

  if (pullbackDirection !== null && pullbackDirection === primaryDirection) {
    signals.push({ candidateId: "HTF_TREND_PULLBACK", direction: pullbackDirection });
    if (secondaryDirection !== null && secondaryDirection === pullbackDirection) {
      signals.push({ candidateId: "DUAL_HTF_TREND_PULLBACK", direction: pullbackDirection });
    }
  }
  if (breakoutDirection !== null) {
    signals.push({ candidateId: "CONFIRMED_BREAKOUT", direction: breakoutDirection });
    if (breakoutDirection === primaryDirection) {
      signals.push({ candidateId: "HTF_CONFIRMED_BREAKOUT", direction: breakoutDirection });
    }
  }
  if (momentumDirection !== null && momentumDirection === primaryDirection) {
    signals.push({ candidateId: "MOMENTUM_NORMAL_REGIME", direction: momentumDirection });
  }
  if (
    localDirection !== null
    && localDirection === primaryDirection
    && (frame.timeframe === "1h" || localDirection === secondaryDirection)
    && volumeAtLeast(frame.volumeRatio, 1)
  ) {
    signals.push({ candidateId: "MULTI_TIMEFRAME_CONFLUENCE", direction: localDirection });
  }
  return signals;
}

export function generateV2Entries(input: {
  candles: ClosedAnalysisCandle[];
  timeframe: V2ExecutionTimeframe;
  contexts1h: V2ContextPoint[];
  contexts4h: V2ContextPoint[];
  analysisStart: Date;
}): Record<V2EntryCandidateId, V2Entry[]> {
  const entries = V2_ENTRY_CANDIDATES.reduce((result, id) => {
    result[id] = [];
    return result;
  }, {} as Record<V2EntryCandidateId, V2Entry[]>);
  for (let index = 199; index < input.candles.length; index += 1) {
    const candle = input.candles[index];
    if (Date.parse(candle.timestamp) < input.analysisStart.getTime()) continue;
    const window = input.candles.slice(index - 199, index + 1);
    const technical = calculateTechnicalAnalysis(window, "binance");
    if (technical.status !== "OK") continue;
    const { ema20, ema50, ema200, rsi14, atr14, volumeRatio } = technical.indicators;
    if (ema20 === null || ema50 === null || ema200 === null || rsi14 === null || atr14 === null || atr14 <= 0) {
      continue;
    }
    const observedAtMs = Date.parse(candle.closeTime);
    const context1h = contextAvailableAt(input.contexts1h, observedAtMs);
    const context4h = contextAvailableAt(input.contexts4h, observedAtMs);
    const primary = input.timeframe === "1h" ? context4h : context1h;
    const secondary = input.timeframe === "1h" ? null : context4h;
    const previousTwenty = window.slice(-21, -1);
    const volatility = causalVolatilityRegime(window);
    const frame: V2FeatureFrame = {
      timeframe: input.timeframe,
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
      ema20,
      ema50,
      ema200,
      rsi: rsi14,
      atr: atr14,
      volumeRatio,
      localTrend: technical.marketStructure.trend,
      localStructure: technical.marketStructure.structure,
      support: technical.marketStructure.support,
      resistance: technical.marketStructure.resistance,
      volatilityRegime: volatility.volatilityRegimeAtEntry,
      volatilityPercentile: volatility.volatilityPercentileAtEntry,
      primaryHtfTrend: primary?.trend ?? null,
      primaryHtfEmaDirection: primary?.emaDirection ?? null,
      secondaryHtfTrend: secondary?.trend ?? null,
      secondaryHtfEmaDirection: secondary?.emaDirection ?? null,
      priorTwentyHigh: Math.max(...previousTwenty.map((item) => item.high)),
      priorTwentyLow: Math.min(...previousTwenty.map((item) => item.low)),
    };
    const primaryDirection = contextDirection(frame.primaryHtfTrend, frame.primaryHtfEmaDirection);
    for (const signal of evaluateV2Families(frame)) {
      const baseline = baselineLikeLevels(signal.direction, frame);
      if (baseline === null) continue;
      entries[signal.candidateId].push({
        candidateId: signal.candidateId,
        timeframe: input.timeframe,
        direction: signal.direction,
        entryIndex: index,
        openedAt: candle.timestamp,
        entryPrice: candle.close,
        baselineStopLoss: baseline.stopLoss,
        baselineTakeProfit: baseline.takeProfit,
        baselineRiskReward: 1.5,
        atrAtEntry: atr14,
        atrPctAtEntry: atr14 / candle.close * 100,
        rsiAtEntry: rsi14,
        volumeRatioAtEntry: volumeRatio,
        volatilityRegimeAtEntry: frame.volatilityRegime,
        volatilityPercentileAtEntry: frame.volatilityPercentile,
        referenceTrendAtEntry: frame.primaryHtfTrend,
        trendRegimeAtEntry: signal.direction === primaryDirection
          ? "ALIGNED_TREND"
          : primaryDirection === null ? "UNAVAILABLE" : "OPPOSING_TREND",
      });
    }
  }
  return entries;
}

export function evaluateV2Candidate(
  candles: ClosedAnalysisCandle[],
  entries: V2Entry[],
  configuration: ExitConfiguration,
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

export function buildV2ExitGrid(expiryCandles = 12): ExitConfiguration[] {
  const result: ExitConfiguration[] = [];
  for (const stopAtr of V2_ATR_DISTANCES) {
    for (const targetAtr of V2_ATR_DISTANCES) {
      const rewardRisk = targetAtr / stopAtr;
      if (rewardRisk < 1.25 || rewardRisk > 2.5) continue;
      result.push({
        name: `V2_ATR_SL${stopAtr}_TP${targetAtr}_RR${round(rewardRisk)}_E${expiryCandles}`,
        riskMode: "ATR",
        atrMultiple: stopAtr,
        rewardRisk,
        expiryCandles,
      });
    }
  }
  return result;
}

export function buildV2ExpiryGrid(configuration: ExitConfiguration): ExitConfiguration[] {
  return V2_EXPIRY_CANDLES.map((expiryCandles) => ({
    ...configuration,
    name: `${configuration.name.replace(/_E\d+$/, "")}_E${expiryCandles}`,
    expiryCandles,
  }));
}

export function v2Period(openedAt: string, start: Date, end: Date): V2Period {
  const point = (Date.parse(openedAt) - start.getTime()) / (end.getTime() - start.getTime());
  if (point < 0.5) return "DEVELOPMENT";
  if (point < 0.8) return "VALIDATION";
  return "FINAL_HOLDOUT";
}

export function selectV2BeforeHoldout<T>(
  candidates: Array<V2PreHoldoutCandidate<T>>,
  minimums = { development: 30, validation: 20 },
): V2PreHoldoutCandidate<T> | null {
  const eligible = candidates.filter((item) =>
    item.development5Bps.signals >= minimums.development
    && item.validation5Bps.signals >= minimums.validation
    && item.development5Bps.expectancyR !== null
    && item.validation5Bps.expectancyR !== null);
  return eligible.sort(comparePreHoldout)[0] ?? null;
}

function comparePreHoldout<T>(left: V2PreHoldoutCandidate<T>, right: V2PreHoldoutCandidate<T>): number {
  const values = (item: V2PreHoldoutCandidate<T>) => {
    const five = [item.development5Bps, item.validation5Bps];
    const ten = [item.development10Bps, item.validation10Bps];
    return {
      worstFive: Math.min(...five.map((summary) => summary.expectancyR ?? Number.NEGATIVE_INFINITY)),
      averageFive: average(five.map((summary) => summary.expectancyR ?? Number.NEGATIVE_INFINITY)),
      worstPfFive: Math.min(...five.map((summary) => summary.profitFactor ?? 0)),
      worstTen: Math.min(...ten.map((summary) => summary.expectancyR ?? Number.NEGATIVE_INFINITY)),
      maximumDrawdown: Math.max(...five.map((summary) => summary.maximumDrawdownR ?? Number.POSITIVE_INFINITY)),
    };
  };
  const l = values(left);
  const r = values(right);
  if (l.worstFive !== r.worstFive) return r.worstFive - l.worstFive;
  if (l.averageFive !== r.averageFive) return r.averageFive - l.averageFive;
  if (l.worstPfFive !== r.worstPfFive) return r.worstPfFive - l.worstPfFive;
  if (l.worstTen !== r.worstTen) return r.worstTen - l.worstTen;
  return l.maximumDrawdown - r.maximumDrawdown;
}

function alignedLocalDirection(frame: V2FeatureFrame): SignalDirection | null {
  const long = frame.localTrend === "bullish"
    && frame.localStructure === "higher_high_and_higher_low"
    && frame.ema20 > frame.ema50
    && frame.ema50 > frame.ema200;
  const short = frame.localTrend === "bearish"
    && frame.localStructure === "lower_high_and_lower_low"
    && frame.ema20 < frame.ema50
    && frame.ema50 < frame.ema200;
  return long ? "LONG" : short ? "SHORT" : null;
}

function pullback(frame: V2FeatureFrame): SignalDirection | null {
  const long = frame.ema20 > frame.ema50
    && frame.low <= frame.ema20
    && frame.close > frame.ema20
    && frame.close > frame.open
    && frame.rsi >= 45
    && frame.rsi <= 65
    && volumeAtLeast(frame.volumeRatio, 0.8);
  const short = frame.ema20 < frame.ema50
    && frame.high >= frame.ema20
    && frame.close < frame.ema20
    && frame.close < frame.open
    && frame.rsi >= 35
    && frame.rsi <= 55
    && volumeAtLeast(frame.volumeRatio, 0.8);
  return long ? "LONG" : short ? "SHORT" : null;
}

function confirmedBreakout(frame: V2FeatureFrame): SignalDirection | null {
  const range = frame.high - frame.low;
  if (!Number.isFinite(range) || range <= 0 || !volumeAtLeast(frame.volumeRatio, 1.2)) return null;
  if (
    frame.volatilityPercentile === null
    || frame.volatilityPercentile < 0.25
    || frame.volatilityPercentile > 0.9
  ) return null;
  const bodyRatio = Math.abs(frame.close - frame.open) / range;
  const long = frame.close > frame.priorTwentyHigh
    && bodyRatio >= 0.6
    && (frame.high - frame.close) / range <= 0.25;
  const short = frame.close < frame.priorTwentyLow
    && bodyRatio >= 0.6
    && (frame.close - frame.low) / range <= 0.25;
  return long ? "LONG" : short ? "SHORT" : null;
}

function momentum(frame: V2FeatureFrame): SignalDirection | null {
  if (frame.volatilityRegime !== "NORMAL" || !volumeAtLeast(frame.volumeRatio, 1.1)) return null;
  const local = alignedLocalDirection(frame);
  if (local === "LONG" && frame.rsi >= 55 && frame.rsi <= 68) return "LONG";
  if (local === "SHORT" && frame.rsi >= 32 && frame.rsi <= 45) return "SHORT";
  return null;
}

function contextDirection(trend: V2Trend, ema: SignalDirection | null): SignalDirection | null {
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

function baselineLikeLevels(
  direction: SignalDirection,
  frame: V2FeatureFrame,
): { stopLoss: number; takeProfit: number } | null {
  const atrRisk = frame.atr * 1.5;
  const structuralStop = direction === "LONG" ? frame.support : frame.resistance;
  const stopLoss = direction === "LONG"
    ? Math.min(frame.close - atrRisk, structuralStop !== null && structuralStop < frame.close ? structuralStop : frame.close - atrRisk)
    : Math.max(frame.close + atrRisk, structuralStop !== null && structuralStop > frame.close ? structuralStop : frame.close + atrRisk);
  const risk = Math.abs(frame.close - stopLoss);
  if (!Number.isFinite(risk) || risk <= 0) return null;
  return {
    stopLoss,
    takeProfit: direction === "LONG" ? frame.close + risk * 1.5 : frame.close - risk * 1.5,
  };
}

function volumeAtLeast(value: number | null, minimum: number): boolean {
  return value !== null && value >= minimum;
}

function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function round(value: number): number {
  return Math.round(value * 1e8) / 1e8;
}

export function isV2ExecutionTimeframe(value: HistoricalTimeframe): value is V2ExecutionTimeframe {
  return V2_EXECUTION_TIMEFRAMES.some((timeframe) => timeframe === value);
}
