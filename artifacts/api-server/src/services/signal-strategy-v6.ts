import {
  baselineConfiguration,
  netRealizedR,
  percentile,
  summarizeBacktest,
  type BacktestSummary,
  type BacktestTrade,
  type ExitConfiguration,
} from "./signal-backtest";
import type { V4ScoreThresholds, V4ScoredEntry } from "./signal-strategy-v4";
import {
  V6_ENTRY_FAMILIES,
  V6_PREREGISTRATION,
  type V6EntryFamily,
  type V6Timeframe,
} from "./signal-strategy-v6-snapshot";

export type V6Period = "TRAIN" | "DEVELOPMENT" | "VALIDATION" | "LOCKED_OUT_OF_SAMPLE" | "OUTSIDE";
export type V6CostScenario = "IDEAL" | "REALISTIC" | "STRESS";
export type V6CostModel = {
  name: V6CostScenario;
  feeBps: number;
  spreadBps: number;
  slippageBps: number;
  latencyBps: number;
  totalBps: number;
};
export type V6Entry = V4ScoredEntry & {
  v6: {
    evaluatedAt: string;
    fourHourVolatilityPercentile: number | null;
  };
};
export type V6Metrics = BacktestSummary & {
  averageWinR: number | null;
  averageLossR: number | null;
  medianMfeAtr: number | null;
  medianMaeAtr: number | null;
  sharpeLikePerTrade: number | null;
  sortinoLikePerTrade: number | null;
  profitableMonthsPct: number | null;
  bestMonthR: number | null;
  worstMonthR: number | null;
  signalsPerDay: number | null;
  signalsPerWeek: number | null;
  signalsPerMonth: number | null;
};
export type V6EntryScreen<T> = {
  candidate: T;
  train5Bps: BacktestSummary;
  train10Bps: BacktestSummary;
  development5Bps: BacktestSummary;
  development10Bps: BacktestSummary;
};
export type V6EntryShortlist<T> = V6EntryScreen<T> & { eligibleForPromotion: boolean };
export type V6ValidationScreen<T> = V6EntryShortlist<T> & {
  validation5Bps: BacktestSummary;
  validation10Bps: BacktestSummary;
};

export function v6CostModels(): Record<V6CostScenario, V6CostModel> {
  const source = V6_PREREGISTRATION.costs;
  return {
    IDEAL: cost("IDEAL", source.ideal),
    REALISTIC: cost("REALISTIC", source.realistic),
    STRESS: cost("STRESS", source.stress),
  };
}

export function v6Period(openedAt: string): V6Period {
  const value = Date.parse(openedAt);
  const periods = V6_PREREGISTRATION.periods;
  if (inside(value, periods.train)) return "TRAIN";
  if (inside(value, periods.development)) return "DEVELOPMENT";
  if (inside(value, periods.validation)) return "VALIDATION";
  if (inside(value, periods.lockedOutOfSample)) return "LOCKED_OUT_OF_SAMPLE";
  return "OUTSIDE";
}

export function filterV6Entries(
  entries: V6Entry[],
  family: V6EntryFamily,
  thresholds: V4ScoreThresholds,
): V6Entry[] {
  return entries.filter((entry) => acceptsV6Entry(entry, family, thresholds));
}

export function v6ExitSearchConfigurations(): ExitConfiguration[] {
  const source = V6_PREREGISTRATION.exitResearch;
  const selectionExpiries = source.expiryCandles.filter((value) => value === 8 || value === 12 || value === 18 || value === 24);
  const atr = source.atrRiskMultiples.flatMap((atrMultiple) =>
    source.rewardRisk.flatMap((rewardRisk) =>
      selectionExpiries.map((expiryCandles) => ({
        name: `V6_ATR_S${decimalId(atrMultiple)}_RR${decimalId(rewardRisk)}_E${expiryCandles}`,
        riskMode: "ATR" as const,
        atrMultiple,
        rewardRisk,
        expiryCandles,
      }))));
  const percentage = source.percentageRisk.flatMap((riskPercent) =>
    source.percentageRewardRisk.map((rewardRisk) => ({
      name: `V6_PERCENT_S${decimalId(riskPercent)}_RR${decimalId(rewardRisk)}_E12`,
      riskMode: "PERCENT" as const,
      riskPercent,
      rewardRisk,
      expiryCandles: 12,
    })));
  return [baselineConfiguration(), ...atr, ...percentage];
}

export function v6ExpirySensitivity(configuration: ExitConfiguration): ExitConfiguration[] {
  return V6_PREREGISTRATION.exitResearch.expiryCandles.map((expiryCandles) => ({
    ...configuration,
    name: `${configuration.name}_EXPIRY_${expiryCandles}`,
    expiryCandles,
  }));
}

export function v6StabilitySurface(configuration: ExitConfiguration): ExitConfiguration[] {
  const source = V6_PREREGISTRATION.stability;
  return source.riskMultipliersRelative.flatMap((riskMultiplier) =>
    source.rewardRiskMultipliersRelative.flatMap((rewardMultiplier) =>
      source.expiryOffsets.map((expiryOffset) => ({
        ...configuration,
        name: `${configuration.name}_STABILITY_${decimalId(riskMultiplier)}_${decimalId(rewardMultiplier)}_${expiryOffset}`,
        atrMultiple: configuration.atrMultiple === undefined ? undefined : configuration.atrMultiple * riskMultiplier,
        riskPercent: configuration.riskPercent === undefined ? undefined : configuration.riskPercent * riskMultiplier,
        rewardRisk: Math.max(1, configuration.rewardRisk * rewardMultiplier),
        expiryCandles: Math.max(1, configuration.expiryCandles + expiryOffset),
      }))));
}

export function selectV6EntryShortlist<T extends { timeframe: V6Timeframe }>(
  candidates: Array<V6EntryScreen<T>>,
): Array<V6EntryShortlist<T>> {
  const passing = candidates.filter(entryGate).sort(compareEntryScreen)
    .slice(0, V6_PREREGISTRATION.selection.entryShortlistLimitPerTimeframe)
    .map((candidate) => ({ ...candidate, eligibleForPromotion: true }));
  if (passing.length > 0) return passing;
  const fallback = [...candidates].sort(compareEntryScreen)[0];
  return fallback === undefined ? [] : [{ ...fallback, eligibleForPromotion: false }];
}

export function selectV6ValidatedFinalists<T extends { timeframe: V6Timeframe }>(
  candidates: Array<V6ValidationScreen<T>>,
): Array<V6ValidationScreen<T>> {
  return candidates.filter((candidate) => candidate.eligibleForPromotion && validationGate(candidate))
    .sort((left, right) => {
      const leftWorst = Math.min(left.train5Bps.expectancyR ?? -Infinity, left.development5Bps.expectancyR ?? -Infinity, left.validation5Bps.expectancyR ?? -Infinity);
      const rightWorst = Math.min(right.train5Bps.expectancyR ?? -Infinity, right.development5Bps.expectancyR ?? -Infinity, right.validation5Bps.expectancyR ?? -Infinity);
      if (leftWorst !== rightWorst) return rightWorst - leftWorst;
      return (left.validation5Bps.maximumDrawdownR ?? Infinity) - (right.validation5Bps.maximumDrawdownR ?? Infinity);
    })
    .slice(0, 1);
}

export function summarizeV6(
  trades: BacktestTrade[],
  costModel: V6CostModel,
  elapsedDays: number,
): V6Metrics {
  const sorted = [...trades].sort((left, right) => Date.parse(left.openedAt) - Date.parse(right.openedAt));
  const base = summarizeBacktest(sorted, costModel.totalBps);
  const net = sorted.map((trade) => ({ trade, value: netRealizedR(trade, costModel.totalBps) }))
    .filter((item): item is { trade: BacktestTrade; value: number } => item.value !== null);
  const values = net.map((item) => item.value);
  const wins = values.filter((value) => value > 0);
  const losses = values.filter((value) => value < 0);
  const monthly = new Map<string, number>();
  for (const item of net) {
    const month = item.trade.openedAt.slice(0, 7);
    monthly.set(month, (monthly.get(month) ?? 0) + item.value);
  }
  const monthlyValues = [...monthly.values()];
  const mean = average(values);
  const standardDeviation = sampleStandardDeviation(values, mean);
  const downsideDeviation = Math.sqrt(average(values.filter((value) => value < 0).map((value) => value ** 2)) ?? 0);
  return {
    ...base,
    averageWinR: average(wins),
    averageLossR: average(losses),
    medianMfeAtr: percentile(sorted.map((trade) => trade.mfeAtr).filter(isNumber), 0.5),
    medianMaeAtr: percentile(sorted.map((trade) => trade.maeAtr).filter(isNumber), 0.5),
    sharpeLikePerTrade: mean === null || standardDeviation === null || standardDeviation === 0 ? null : mean / standardDeviation,
    sortinoLikePerTrade: mean === null || downsideDeviation === 0 ? null : mean / downsideDeviation,
    profitableMonthsPct: monthlyValues.length === 0 ? null : monthlyValues.filter((value) => value > 0).length / monthlyValues.length * 100,
    bestMonthR: monthlyValues.length === 0 ? null : Math.max(...monthlyValues),
    worstMonthR: monthlyValues.length === 0 ? null : Math.min(...monthlyValues),
    signalsPerDay: elapsedDays > 0 ? base.signals / elapsedDays : null,
    signalsPerWeek: elapsedDays > 0 ? base.signals / elapsedDays * 7 : null,
    signalsPerMonth: elapsedDays > 0 ? base.signals / elapsedDays * 30.4375 : null,
  };
}

export function periodDays(period: Exclude<V6Period, "OUTSIDE">): number {
  const source = period === "TRAIN" ? V6_PREREGISTRATION.periods.train
    : period === "DEVELOPMENT" ? V6_PREREGISTRATION.periods.development
      : period === "VALIDATION" ? V6_PREREGISTRATION.periods.validation
        : V6_PREREGISTRATION.periods.lockedOutOfSample;
  return (Date.parse(source.end) - Date.parse(source.start)) / 86_400_000;
}

export function tradesInV6Period<T extends BacktestTrade>(trades: T[], period: V6Period): T[] {
  return trades.filter((trade) => v6Period(trade.openedAt) === period);
}

export function promotionGate(input: {
  timeframe: V6Timeframe;
  outOfSample5Bps: V6Metrics;
  outOfSample10Bps: V6Metrics;
  positiveWalkForwardFraction: number;
  positiveStabilityFraction: number;
  bootstrapProbabilityPositivePct: number;
}): { passes: boolean; reasons: string[] } {
  const gate = V6_PREREGISTRATION.promotion;
  const minimum = V6_PREREGISTRATION.selection.minimumSignals.lockedOutOfSample[input.timeframe];
  const checks: Array<[boolean, string]> = [
    [input.outOfSample5Bps.signals >= minimum, `OOS sample >= ${minimum}`],
    [(input.outOfSample5Bps.expectancyR ?? -Infinity) > gate.oosMinimumExpectancy5Bps, "OOS expectancy at 5bps > 0"],
    [(input.outOfSample5Bps.profitFactor ?? 0) > gate.oosMinimumProfitFactor5Bps, `OOS PF at 5bps > ${gate.oosMinimumProfitFactor5Bps}`],
    [(input.outOfSample10Bps.expectancyR ?? -Infinity) >= gate.oosMinimumExpectancy10Bps, "OOS expectancy at 10bps >= 0"],
    [input.positiveWalkForwardFraction >= gate.walkForwardMinimumPositiveWindowFraction, "walk-forward majority positive"],
    [input.positiveStabilityFraction >= gate.stabilityMinimumPositiveCellFraction, "stable parameter neighborhood"],
    [input.bootstrapProbabilityPositivePct >= gate.bootstrapMinimumProbabilityPositiveExpectancyPct, "bootstrap probability gate"],
    [(input.outOfSample5Bps.profitableMonthsPct ?? 0) >= gate.profitableMonthMinimumFraction * 100, "profitable-month fraction gate"],
  ];
  return { passes: checks.every(([passes]) => passes), reasons: checks.filter(([passes]) => !passes).map(([, reason]) => reason) };
}

export function v6EntryFamilyCount(): number {
  return V6_ENTRY_FAMILIES.length;
}

function acceptsV6Entry(entry: V6Entry, family: V6EntryFamily, thresholds: V4ScoreThresholds): boolean {
  const feature = entry.feature;
  const alignedLocalTrend = (feature.localTrend === "bullish" && entry.direction === "LONG")
    || (feature.localTrend === "bearish" && entry.direction === "SHORT");
  const patterns = feature.breakoutConfirmed || feature.pullbackContinuation || feature.momentumConfirmed || feature.structureRejection;
  switch (family) {
    case "BASELINE_ALL": return true;
    case "HTF_COMPATIBLE": return htfCompatible(entry);
    case "HTF_STRONG": return htfStrong(entry);
    case "TREND_REGIME": return alignedLocalTrend && feature.localEmaDirection === entry.direction;
    case "NORMAL_VOLATILITY": return feature.volatilityRegime === "NORMAL";
    case "HIGH_VOLATILITY": return feature.volatilityRegime === "HIGH";
    case "LIMITED_EXTENSION": return feature.extensionAtr <= 1;
    case "QUALITY_TOP_30": return entry.qualityScore >= thresholds.p70;
    case "QUALITY_TOP_20": return entry.qualityScore >= thresholds.p80;
    case "QUALITY_BREAKOUT_HTF": return feature.breakoutConfirmed && htfCompatible(entry);
    case "QUALITY_PULLBACK_HTF": return feature.pullbackContinuation && htfCompatible(entry) && feature.volatilityRegime === "NORMAL";
    case "QUALITY_MOMENTUM_HTF": return feature.momentumConfirmed && htfStrong(entry);
    case "HIGH_VOL_TREND_QUALITY": return htfStrong(entry)
      && (entry.v6.fourHourVolatilityPercentile ?? -1) >= 0.75
      && feature.extensionAtr <= 1
      && (feature.volumeRatio ?? -1) >= 1
      && patterns;
    case "STRUCTURE_PULLBACK_REGIME": return htfStrong(entry)
      && (entry.v6.fourHourVolatilityPercentile ?? -1) >= 0.6
      && feature.extensionAtr <= 0.75
      && (feature.volumeRatio ?? -1) >= 1
      && (feature.pullbackContinuation || feature.structureRejection);
  }
}

function htfCompatible(entry: V6Entry): boolean {
  if (entry.timeframe === "5m" || entry.timeframe === "15m") {
    return entry.feature.htf1hDirection !== opposite(entry.direction)
      && entry.feature.htf4hDirection !== opposite(entry.direction);
  }
  if (entry.timeframe === "1h") return entry.feature.htf4hDirection !== opposite(entry.direction);
  return entry.feature.localEmaDirection === entry.direction;
}

function htfStrong(entry: V6Entry): boolean {
  if (entry.timeframe === "5m" || entry.timeframe === "15m") {
    return entry.feature.htf1hDirection === entry.direction && entry.feature.htf4hDirection === entry.direction;
  }
  if (entry.timeframe === "1h") return entry.feature.htf4hDirection === entry.direction;
  return entry.feature.localEmaDirection === entry.direction && entry.feature.localTrend !== "sideways";
}

function opposite(direction: "LONG" | "SHORT"): "LONG" | "SHORT" {
  return direction === "LONG" ? "SHORT" : "LONG";
}

function entryGate<T extends { timeframe: V6Timeframe }>(candidate: V6EntryScreen<T>): boolean {
  const minimum = V6_PREREGISTRATION.selection.minimumSignals;
  return candidate.train5Bps.signals >= minimum.train[candidate.candidate.timeframe]
    && candidate.development5Bps.signals >= minimum.development[candidate.candidate.timeframe]
    && positive(candidate.train5Bps)
    && positive(candidate.development5Bps)
    && (candidate.train10Bps.expectancyR ?? -Infinity) >= 0
    && (candidate.development10Bps.expectancyR ?? -Infinity) >= 0;
}

function validationGate<T extends { timeframe: V6Timeframe }>(candidate: V6ValidationScreen<T>): boolean {
  const minimum = V6_PREREGISTRATION.selection.minimumSignals.validation[candidate.candidate.timeframe];
  return candidate.validation5Bps.signals >= minimum
    && (candidate.validation5Bps.expectancyR ?? -Infinity) > 0
    && (candidate.validation5Bps.profitFactor ?? 0) > 1.05
    && (candidate.validation10Bps.expectancyR ?? -Infinity) >= 0;
}

function compareEntryScreen<T>(left: V6EntryScreen<T>, right: V6EntryScreen<T>): number {
  const leftWorst = Math.min(left.train5Bps.expectancyR ?? -Infinity, left.development5Bps.expectancyR ?? -Infinity);
  const rightWorst = Math.min(right.train5Bps.expectancyR ?? -Infinity, right.development5Bps.expectancyR ?? -Infinity);
  if (leftWorst !== rightWorst) return rightWorst - leftWorst;
  const leftPf = Math.min(left.train5Bps.profitFactor ?? 0, left.development5Bps.profitFactor ?? 0);
  const rightPf = Math.min(right.train5Bps.profitFactor ?? 0, right.development5Bps.profitFactor ?? 0);
  if (leftPf !== rightPf) return rightPf - leftPf;
  return ((left.train5Bps.maximumDrawdownR ?? 0) + (left.development5Bps.maximumDrawdownR ?? 0))
    - ((right.train5Bps.maximumDrawdownR ?? 0) + (right.development5Bps.maximumDrawdownR ?? 0));
}

function positive(summary: BacktestSummary): boolean {
  return (summary.expectancyR ?? -Infinity) > 0 && (summary.profitFactor ?? 0) > 1;
}

function cost(name: V6CostScenario, source: { feeBps: number; spreadBps: number; slippageBps: number; latencyBps: number; totalBps: number }): V6CostModel {
  const calculated = source.feeBps + source.spreadBps + source.slippageBps + source.latencyBps;
  if (calculated !== source.totalBps) throw new Error(`${name} cost components do not equal totalBps.`);
  return { name, ...source };
}

function inside(value: number, period: { start: string; end: string }): boolean {
  return value >= Date.parse(period.start) && value < Date.parse(period.end);
}

function decimalId(value: number): string {
  return value.toString().replace(".", "p").replace("-", "m");
}

function average(values: number[]): number | null {
  return values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function sampleStandardDeviation(values: number[], mean: number | null): number | null {
  if (values.length < 2 || mean === null) return null;
  return Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1));
}

function isNumber(value: number | null): value is number {
  return value !== null && Number.isFinite(value);
}
