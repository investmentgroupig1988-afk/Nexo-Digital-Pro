import { netRealizedR, percentile, type BacktestTrade, type ClosedAnalysisCandle } from "./signal-backtest";
import type { SignalDirection } from "./signal-engine";
import { contextAvailableAt, type V2ContextPoint } from "./signal-strategy-v2";
import type { V4FactorValues } from "./signal-strategy-v4";
import type { V6Entry } from "./signal-strategy-v6";
import {
  V7_FEATURE_IDS,
  V7_PREREGISTRATION,
  type V7FeatureId,
  type V7StructuralCandidate,
  type V7Timeframe,
} from "./signal-strategy-v7-snapshot";

export type V7MtfState = "ALIGNED" | "OPPOSED" | "NEUTRAL";
export type V7TrendRegime = "TREND_UP" | "TREND_DOWN" | "RANGE";
export type V7VolatilityRegime = "HIGH_VOLATILITY" | "NORMAL_VOLATILITY" | "LOW_VOLATILITY" | "UNKNOWN_VOLATILITY";
export type V7VolatilityEvolution = "VOLATILITY_EXPANSION" | "VOLATILITY_STABLE" | "VOLATILITY_COMPRESSION" | "VOLATILITY_UNKNOWN";
export type V7Session = "ASIA" | "EUROPE" | "NEW_YORK" | "ASIA_EU_OVERLAP" | "EU_US_OVERLAP" | "WEEKEND" | "WEEKDAY";
export type V7FeatureVector = Record<V7FeatureId, number>;
export type V7Entry = V6Entry & {
  v7: {
    htf15mDirection: SignalDirection | null;
    nearestMtfState: V7MtfState;
    stackedMtfState: V7MtfState;
    trendRegime: V7TrendRegime;
    volatilityRegime: V7VolatilityRegime;
    volatilityEvolution: V7VolatilityEvolution;
    volatilityChangeRatio: number | null;
    sessions: V7Session[];
    weekend: boolean;
    features: V7FeatureVector;
  };
};
export type V7Trade = BacktestTrade & {
  feature: V7Entry["feature"];
  qualityFactors: V4FactorValues;
  v7: V7Entry["v7"];
};
export type V7LabeledPoint = {
  entry: V7Entry;
  trade: V7Trade;
  netR5Bps: number;
};
export type V7ManualScoreModel = {
  features: Array<{
    id: V7FeatureId;
    direction: 1 | -1;
    trainRho: number;
    developmentRho: number;
    trainValues: number[];
  }>;
};
export type V7LogisticModel = {
  featureIds: V7FeatureId[];
  means: number[];
  standardDeviations: number[];
  weights: number[];
  bias: number;
  positiveRate: number;
};
export type V7DecisionStump = {
  featureId: V7FeatureId;
  threshold: number;
  operator: "GTE" | "LTE";
  trainAcceptedFraction: number;
  trainExpectancy5Bps: number;
};

export function annotateV7Entry(input: {
  entry: V6Entry;
  candles: ClosedAnalysisCandle[];
  contexts15m: V2ContextPoint[];
  timeframe: V7Timeframe;
}): V7Entry {
  const candle = input.candles[input.entry.entryIndex];
  if (candle === undefined) throw new Error("V7 entry references a missing execution candle.");
  if (input.entry.v6.evaluatedAt !== candle.closeTime) {
    throw new Error("V7 entry evaluation time must equal its closed execution candle closeTime.");
  }
  const observedAtMs = Date.parse(candle.closeTime);
  const context15m = contextAvailableAt(input.contexts15m, observedAtMs);
  if (context15m !== null && context15m.closeTimeMs > observedAtMs) {
    throw new Error("V7 selected a future 15m context candle.");
  }
  const htf15mDirection = strictContextDirection(context15m);
  const nearestDirections = nearestContextDirections(input.entry, input.timeframe, htf15mDirection);
  const stackedDirections = stackedContextDirections(input.entry, input.timeframe, htf15mDirection);
  const nearestMtfState = mtfState(input.entry.direction, nearestDirections);
  const stackedMtfState = mtfState(input.entry.direction, stackedDirections);
  const volatilityChangeRatio = causalVolatilityChangeRatio(input.candles.slice(Math.max(0, input.entry.entryIndex - 28), input.entry.entryIndex + 1));
  const volatilityEvolution = volatilityEvolutionFromRatio(volatilityChangeRatio);
  const closeDate = new Date(candle.closeTime);
  const sessions = sessionsAt(closeDate);
  const trendRegime = input.entry.feature.localTrend === "bullish" ? "TREND_UP"
    : input.entry.feature.localTrend === "bearish" ? "TREND_DOWN" : "RANGE";
  const volatilityRegime = input.entry.feature.volatilityRegime === "HIGH" ? "HIGH_VOLATILITY"
    : input.entry.feature.volatilityRegime === "NORMAL" ? "NORMAL_VOLATILITY"
      : input.entry.feature.volatilityRegime === "LOW" ? "LOW_VOLATILITY" : "UNKNOWN_VOLATILITY";
  const features = buildV7FeatureVector({
    entry: input.entry,
    volatilityChangeRatio,
    nearestMtfState,
    stackedMtfState,
    weekend: sessions.includes("WEEKEND"),
  });
  return {
    ...input.entry,
    v7: {
      htf15mDirection,
      nearestMtfState,
      stackedMtfState,
      trendRegime,
      volatilityRegime,
      volatilityEvolution,
      volatilityChangeRatio,
      sessions,
      weekend: sessions.includes("WEEKEND"),
      features,
    },
  };
}

export function acceptsV7StructuralCandidate(entry: V7Entry, candidate: V7StructuralCandidate): boolean {
  const directionalTrend = (entry.v7.trendRegime === "TREND_UP" && entry.direction === "LONG")
    || (entry.v7.trendRegime === "TREND_DOWN" && entry.direction === "SHORT");
  switch (candidate) {
    case "BASELINE_ALL": return true;
    case "LOCAL_TREND_DIRECTIONAL": return directionalTrend;
    case "VOLATILITY_EXPANSION_DIRECTIONAL": return directionalTrend && entry.v7.volatilityEvolution === "VOLATILITY_EXPANSION";
    case "MTF_NEAREST_ALIGNED": return entry.v7.nearestMtfState === "ALIGNED";
    case "MTF_STACK_ALIGNED": return entry.v7.stackedMtfState === "ALIGNED";
    case "MTF_NO_CONTRADICTION": return entry.v7.stackedMtfState !== "OPPOSED";
    case "REGIME_MTF_COMPOSITE": return directionalTrend
      && entry.v7.nearestMtfState === "ALIGNED"
      && entry.v7.volatilityRegime !== "LOW_VOLATILITY";
    case "SESSION_ASIA": return entry.v7.sessions.includes("ASIA");
    case "SESSION_EUROPE": return entry.v7.sessions.includes("EUROPE");
    case "SESSION_NEW_YORK": return entry.v7.sessions.includes("NEW_YORK");
    case "SESSION_EU_US_OVERLAP": return entry.v7.sessions.includes("EU_US_OVERLAP");
    case "WEEKDAY_ONLY": return !entry.v7.weekend;
    case "WEEKEND_ONLY": return entry.v7.weekend;
  }
}

export function v7RegimeLabels(entry: Pick<V7Entry, "v7">): string[] {
  return [entry.v7.trendRegime, entry.v7.volatilityRegime, entry.v7.volatilityEvolution];
}

export function sessionsAt(value: Date): V7Session[] {
  const hour = value.getUTCHours();
  const day = value.getUTCDay();
  const result: V7Session[] = [];
  if (insideHour(hour, 0, 8)) result.push("ASIA");
  if (insideHour(hour, 7, 16)) result.push("EUROPE");
  if (insideHour(hour, 13, 22)) result.push("NEW_YORK");
  if (insideHour(hour, 7, 8)) result.push("ASIA_EU_OVERLAP");
  if (insideHour(hour, 13, 16)) result.push("EU_US_OVERLAP");
  result.push(day === 0 || day === 6 ? "WEEKEND" : "WEEKDAY");
  return result;
}

export function causalVolatilityChangeRatio(candles: ClosedAnalysisCandle[]): number | null {
  if (candles.length < 29) return null;
  const ranges = candles.slice(1).map((candle, index) => {
    const previousClose = candles[index].close;
    return Math.max(
      candle.high - candle.low,
      Math.abs(candle.high - previousClose),
      Math.abs(candle.low - previousClose),
    ) / Math.max(Number.EPSILON, previousClose);
  });
  const previous = average(ranges.slice(-28, -14));
  const current = average(ranges.slice(-14));
  return previous <= 0 ? null : current / previous;
}

export function volatilityEvolutionFromRatio(ratio: number | null): V7VolatilityEvolution {
  if (ratio === null || !Number.isFinite(ratio)) return "VOLATILITY_UNKNOWN";
  if (ratio >= 1.25) return "VOLATILITY_EXPANSION";
  if (ratio <= 0.8) return "VOLATILITY_COMPRESSION";
  return "VOLATILITY_STABLE";
}

export function buildV7LabeledPoints(entries: V7Entry[], trades: V7Trade[]): V7LabeledPoint[] {
  const byKey = new Map(entries.map((entry) => [entryKey(entry), entry]));
  return trades.flatMap((trade) => {
    const entry = byKey.get(entryKey(trade));
    const value = netRealizedR(trade, V7_PREREGISTRATION.costs.realisticBps);
    return entry === undefined || value === null ? [] : [{ entry, trade, netR5Bps: value }];
  });
}

export function deriveManualScoreModel(train: V7LabeledPoint[], development: V7LabeledPoint[]): V7ManualScoreModel {
  const minimum = 0.03;
  const selected = V7_FEATURE_IDS.flatMap((id) => {
    const trainRho = spearman(train.map((point) => point.entry.v7.features[id]), train.map((point) => point.netR5Bps));
    const developmentRho = spearman(development.map((point) => point.entry.v7.features[id]), development.map((point) => point.netR5Bps));
    if (trainRho === null || developmentRho === null) return [];
    if (Math.abs(trainRho) < minimum || Math.abs(developmentRho) < minimum || Math.sign(trainRho) !== Math.sign(developmentRho)) return [];
    return [{
      id,
      direction: (trainRho > 0 ? 1 : -1) as 1 | -1,
      trainRho,
      developmentRho,
      trainValues: train.map((point) => point.entry.v7.features[id]).sort((left, right) => left - right),
    }];
  });
  return { features: selected };
}

export function manualStructuralScore(entry: V7Entry, model: V7ManualScoreModel): number | null {
  if (model.features.length === 0) return null;
  return average(model.features.map((feature) => {
    const rank = empiricalCdf(feature.trainValues, entry.v7.features[feature.id]);
    return feature.direction === 1 ? rank : 1 - rank;
  })) * 100;
}

export function fitV7LogisticModel(points: V7LabeledPoint[]): V7LogisticModel {
  if (points.length < 20) throw new Error("V7 logistic model requires at least twenty TRAIN observations.");
  const featureIds = [...V7_FEATURE_IDS];
  const matrix = points.map((point) => featureIds.map((id) => point.entry.v7.features[id]));
  const means = featureIds.map((_, index) => average(matrix.map((row) => row[index])));
  const standardDeviations = featureIds.map((_, index) => sampleStandardDeviation(matrix.map((row) => row[index]), means[index]) || 1);
  const normalized = matrix.map((row) => row.map((value, index) => (value - means[index]) / standardDeviations[index]));
  const labels = points.map((point) => point.trade.outcome === "WIN" ? 1 : 0);
  const weights = Array<number>(featureIds.length).fill(0);
  let bias = logit(clamp(labels.reduce((sum, value) => sum + value, 0) / labels.length, 0.001, 0.999));
  const config = V7_PREREGISTRATION.simpleModels.logistic;
  for (let iteration = 0; iteration < config.iterations; iteration += 1) {
    const gradient = Array<number>(weights.length).fill(0);
    let biasGradient = 0;
    for (let rowIndex = 0; rowIndex < normalized.length; rowIndex += 1) {
      const probability = sigmoid(dot(weights, normalized[rowIndex]) + bias);
      const error = probability - labels[rowIndex];
      biasGradient += error;
      for (let column = 0; column < weights.length; column += 1) gradient[column] += error * normalized[rowIndex][column];
    }
    bias -= config.learningRate * biasGradient / normalized.length;
    for (let column = 0; column < weights.length; column += 1) {
      weights[column] -= config.learningRate * (gradient[column] / normalized.length + config.l2 * weights[column]);
    }
  }
  return { featureIds, means, standardDeviations, weights, bias, positiveRate: average(labels) };
}

export function logisticQualityScore(entry: V7Entry, model: V7LogisticModel): number {
  const normalized = model.featureIds.map((id, index) =>
    (entry.v7.features[id] - model.means[index]) / model.standardDeviations[index]);
  return sigmoid(dot(model.weights, normalized) + model.bias) * 100;
}

export function fitDecisionStump(points: V7LabeledPoint[]): V7DecisionStump | null {
  if (points.length < 20) return null;
  let best: V7DecisionStump | null = null;
  for (const featureId of V7_FEATURE_IDS) {
    const values = points.map((point) => point.entry.v7.features[featureId]);
    for (let decile = 1; decile <= 9; decile += 1) {
      const threshold = percentile(values, decile / 10);
      if (threshold === null) continue;
      for (const operator of ["GTE", "LTE"] as const) {
        const accepted = points.filter((point) => operator === "GTE"
          ? point.entry.v7.features[featureId] >= threshold
          : point.entry.v7.features[featureId] <= threshold);
        const fraction = accepted.length / points.length;
        if (fraction < V7_PREREGISTRATION.simpleModels.decisionStump.minimumAcceptedFraction) continue;
        const expectancy = average(accepted.map((point) => point.netR5Bps));
        const candidate: V7DecisionStump = { featureId, threshold, operator, trainAcceptedFraction: fraction, trainExpectancy5Bps: expectancy };
        if (best === null || candidate.trainExpectancy5Bps > best.trainExpectancy5Bps) best = candidate;
      }
    }
  }
  return best;
}

export function decisionStumpAccepts(entry: V7Entry, stump: V7DecisionStump): boolean {
  const value = entry.v7.features[stump.featureId];
  return stump.operator === "GTE" ? value >= stump.threshold : value <= stump.threshold;
}

export function scoreThreshold(scores: number[], acceptedFraction: number): number {
  if (scores.length === 0) return Number.POSITIVE_INFINITY;
  if (acceptedFraction >= 1) return Number.NEGATIVE_INFINITY;
  return percentile(scores, 1 - acceptedFraction) ?? Number.POSITIVE_INFINITY;
}

export function featureAttribution(points: V7LabeledPoint[]) {
  return Object.fromEntries(V7_FEATURE_IDS.map((featureId) => {
    const values = points.map((point) => point.entry.v7.features[featureId]);
    const outcome = (label: BacktestTrade["outcome"]) => distribution(points.filter((point) => point.trade.outcome === label)
      .map((point) => point.entry.v7.features[featureId]));
    const quintileThresholds = [0.2, 0.4, 0.6, 0.8].map((quantile) => percentile(values, quantile) ?? 0);
    const buckets = Array.from({ length: 5 }, (_, index) => {
      const selected = points.filter((point) => quintileIndex(point.entry.v7.features[featureId], quintileThresholds) === index);
      return {
        signals: selected.length,
        expectancy5Bps: selected.length ? average(selected.map((point) => point.netR5Bps)) : null,
      };
    });
    return [featureId, {
      WIN: outcome("WIN"),
      LOSS: outcome("LOSS"),
      EXPIRED: outcome("EXPIRED"),
      spearmanNetR5Bps: spearman(values, points.map((point) => point.netR5Bps)),
      quintilesLowToHigh: buckets,
      monotonic: monotonicExpectancy(buckets.map((bucket) => bucket.expectancy5Bps)),
    }];
  }));
}

export function spearman(left: number[], right: number[]): number | null {
  if (left.length !== right.length || left.length < 3) return null;
  return pearson(ranks(left), ranks(right));
}

function buildV7FeatureVector(input: {
  entry: V6Entry;
  volatilityChangeRatio: number | null;
  nearestMtfState: V7MtfState;
  stackedMtfState: V7MtfState;
  weekend: boolean;
}): V7FeatureVector {
  const factor = input.entry.qualityFactors;
  const rsi = input.entry.rsiAtEntry;
  const directionalRsi = rsi === null || rsi === undefined ? 0.5
    : input.entry.direction === "LONG" ? rsi / 100 : (100 - rsi) / 100;
  return {
    ...factor,
    VOLATILITY_PERCENTILE: finiteOr(input.entry.feature.volatilityPercentile, 0.5),
    VOLATILITY_CHANGE_RATIO: clamp(finiteOr(input.volatilityChangeRatio, 1), 0, 3),
    DIRECTIONAL_MOVE_ATR: clamp(input.entry.feature.directionalMoveAtr, -3, 3),
    BODY_RATIO: clamp(input.entry.feature.bodyRatio, 0, 1),
    ATR_PERCENT: clamp(finiteOr(input.entry.atrPctAtEntry, 0), 0, 20),
    DIRECTIONAL_RSI: clamp(directionalRsi, 0, 1),
    NEAREST_MTF_ALIGNMENT: stateValue(input.nearestMtfState),
    STACKED_MTF_ALIGNMENT: stateValue(input.stackedMtfState),
    WEEKEND: input.weekend ? 1 : 0,
  };
}

function nearestContextDirections(entry: V6Entry, timeframe: V7Timeframe, htf15mDirection: SignalDirection | null): Array<SignalDirection | null> {
  if (timeframe === "5m") return [htf15mDirection];
  if (timeframe === "15m") return [entry.feature.htf1hDirection];
  if (timeframe === "1h") return [entry.feature.htf4hDirection];
  return [strictLocalDirection(entry)];
}

function stackedContextDirections(entry: V6Entry, timeframe: V7Timeframe, htf15mDirection: SignalDirection | null): Array<SignalDirection | null> {
  if (timeframe === "5m") return [htf15mDirection, entry.feature.htf1hDirection];
  if (timeframe === "15m") return [entry.feature.htf1hDirection, entry.feature.htf4hDirection];
  if (timeframe === "1h") return [entry.feature.htf4hDirection];
  return [strictLocalDirection(entry)];
}

function strictContextDirection(context: V2ContextPoint | null): SignalDirection | null {
  if (context?.trend === "bullish" && context.emaDirection === "LONG") return "LONG";
  if (context?.trend === "bearish" && context.emaDirection === "SHORT") return "SHORT";
  return null;
}

function strictLocalDirection(entry: V6Entry): SignalDirection | null {
  if (entry.feature.localTrend === "bullish" && entry.feature.localEmaDirection === "LONG") return "LONG";
  if (entry.feature.localTrend === "bearish" && entry.feature.localEmaDirection === "SHORT") return "SHORT";
  return null;
}

function mtfState(direction: SignalDirection, contexts: Array<SignalDirection | null>): V7MtfState {
  const available = contexts.filter((value): value is SignalDirection => value !== null);
  if (available.some((value) => value !== direction)) return "OPPOSED";
  if (available.length === contexts.length && available.length > 0 && available.every((value) => value === direction)) return "ALIGNED";
  return "NEUTRAL";
}

function stateValue(state: V7MtfState): number {
  return state === "ALIGNED" ? 1 : state === "OPPOSED" ? 0 : 0.5;
}

function insideHour(hour: number, start: number, end: number): boolean {
  return hour >= start && hour < end;
}

function entryKey(entry: Pick<V7Entry, "entryIndex" | "direction" | "openedAt"> | Pick<V7Trade, "entryIndex" | "direction" | "openedAt">): string {
  return `${entry.entryIndex}:${entry.direction}:${entry.openedAt}`;
}

function empiricalCdf(sortedValues: number[], value: number): number {
  let low = 0;
  let high = sortedValues.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (sortedValues[middle] <= value) low = middle + 1;
    else high = middle;
  }
  return sortedValues.length === 0 ? 0.5 : low / sortedValues.length;
}

function distribution(values: number[]) {
  return {
    count: values.length,
    mean: values.length ? average(values) : null,
    p25: percentile(values, 0.25),
    p50: percentile(values, 0.5),
    p75: percentile(values, 0.75),
  };
}

function quintileIndex(value: number, thresholds: number[]): number {
  const index = thresholds.findIndex((threshold) => value <= threshold);
  return index < 0 ? 4 : index;
}

function monotonicExpectancy(values: Array<number | null>): { nonDecreasing: boolean; spearman: number | null } {
  const usable = values.map((value, index) => ({ value, index }))
    .filter((item): item is { value: number; index: number } => item.value !== null);
  return {
    nonDecreasing: usable.length >= 3 && usable.every((item, index) => index === 0 || item.value >= usable[index - 1].value),
    spearman: usable.length >= 3 ? spearman(usable.map((item) => item.index), usable.map((item) => item.value)) : null,
  };
}

function ranks(values: number[]): number[] {
  const sorted = values.map((value, index) => ({ value, index })).sort((left, right) => left.value - right.value);
  const result = Array<number>(values.length);
  let cursor = 0;
  while (cursor < sorted.length) {
    let end = cursor + 1;
    while (end < sorted.length && sorted[end].value === sorted[cursor].value) end += 1;
    const rank = (cursor + end - 1) / 2;
    for (let index = cursor; index < end; index += 1) result[sorted[index].index] = rank;
    cursor = end;
  }
  return result;
}

function pearson(left: number[], right: number[]): number | null {
  if (left.length !== right.length || left.length < 2) return null;
  const leftMean = average(left);
  const rightMean = average(right);
  let numerator = 0;
  let leftSquared = 0;
  let rightSquared = 0;
  for (let index = 0; index < left.length; index += 1) {
    const l = left[index] - leftMean;
    const r = right[index] - rightMean;
    numerator += l * r;
    leftSquared += l ** 2;
    rightSquared += r ** 2;
  }
  const denominator = Math.sqrt(leftSquared * rightSquared);
  return denominator === 0 ? null : numerator / denominator;
}

function sampleStandardDeviation(values: number[], mean: number): number {
  if (values.length < 2) return 0;
  return Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1));
}

function sigmoid(value: number): number {
  if (value >= 0) return 1 / (1 + Math.exp(-value));
  const exponential = Math.exp(value);
  return exponential / (1 + exponential);
}

function logit(value: number): number {
  return Math.log(value / (1 - value));
}

function dot(left: number[], right: number[]): number {
  return left.reduce((sum, value, index) => sum + value * right[index], 0);
}

function finiteOr(value: number | null | undefined, fallback: number): number {
  return value !== null && value !== undefined && Number.isFinite(value) ? value : fallback;
}

function average(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, Number.isFinite(value) ? value : minimum));
}
