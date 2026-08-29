import type { BacktestSummary, ExitConfiguration } from "./signal-backtest";
import type { V3SetupEntry } from "./signal-strategy-v3";
import {
  V5_ENTRY_FAMILIES,
  V5_PREREGISTRATION,
  type V5EntryFamily,
  type V5ExitFamily,
  type V5Timeframe,
} from "./signal-strategy-v5-snapshot";

export type V5Period = "EXTERNAL_PRE_SAMPLE" | "RESEARCH" | "VALIDATION" | "LOCKED_OOS" | "FORWARD";

export type V5Marker = {
  evaluatedAt: string;
  fourHourVolatilityPercentile: number | null;
};

export type V5Entry = V3SetupEntry & { v5: V5Marker };

export type V5CandidateDefinition = {
  entryFamily: V5EntryFamily;
  exitFamily: V5ExitFamily;
  timeframe: V5Timeframe;
};

export type V5ResearchCandidate = {
  definition: V5CandidateDefinition;
  research5Bps: BacktestSummary;
  research10Bps: BacktestSummary;
};

export type V5ValidatedCandidate = V5ResearchCandidate & {
  validation5Bps: BacktestSummary;
  validation10Bps: BacktestSummary;
};

export function filterV5Entries(entries: V5Entry[], family: V5EntryFamily): V5Entry[] {
  return entries.filter((entry) => acceptsV5Family(entry, family));
}

export function acceptsV5Family(entry: V5Entry, family: V5EntryFamily): boolean {
  if (!alignmentPasses(entry)) return false;
  const config = V5_PREREGISTRATION.entryFamilies[family];
  const percentile = entry.v5.fourHourVolatilityPercentile;
  if (percentile === null
    || percentile < config.fourHourVolatilityPercentileMinimumInclusive
    || percentile > config.fourHourVolatilityPercentileMaximumInclusive) return false;
  if (entry.feature.extensionAtr > config.maximumExtensionAtrInclusive) return false;
  if ((entry.feature.volumeRatio ?? Number.NEGATIVE_INFINITY) < config.minimumVolumeRatioInclusive) return false;
  return config.qualityPatternsAny.some((pattern) => entry.feature[pattern]);
}

export function v5ExitConfiguration(exitFamily: V5ExitFamily, timeframe: V5Timeframe): ExitConfiguration {
  const source = V5_PREREGISTRATION.exits[exitFamily];
  if (exitFamily === "PERCENT_NORMALIZED") {
    const percent = V5_PREREGISTRATION.exits.PERCENT_NORMALIZED;
    return {
      name: `V5_${exitFamily}_${timeframe}`,
      riskMode: "PERCENT",
      riskPercent: percent.riskPercentByTimeframe[timeframe],
      rewardRisk: percent.rewardRisk,
      expiryCandles: percent.expiryCandles,
    };
  }
  const atr = source as typeof V5_PREREGISTRATION.exits.ATR_1_0;
  return {
    name: `V5_${exitFamily}_${timeframe}`,
    riskMode: "ATR",
    atrMultiple: atr.atrMultiple,
    rewardRisk: atr.rewardRisk,
    expiryCandles: atr.expiryCandles,
  };
}

export function v5Period(evaluatedAt: string): V5Period {
  const point = Date.parse(evaluatedAt);
  const periods = V5_PREREGISTRATION.periods;
  if (point >= Date.parse(periods.externalPreSampleAudit.start)
    && point < Date.parse(periods.externalPreSampleAudit.end)) return "EXTERNAL_PRE_SAMPLE";
  if (point >= Date.parse(periods.research.start) && point < Date.parse(periods.research.end)) return "RESEARCH";
  if (point >= Date.parse(periods.validation.start) && point < Date.parse(periods.validation.end)) return "VALIDATION";
  if (point >= Date.parse(periods.lockedOutOfSample.start)
    && point < Date.parse(periods.lockedOutOfSample.end)) return "LOCKED_OOS";
  return "FORWARD";
}

export function selectV5ResearchShortlist(candidates: V5ResearchCandidate[]): V5ResearchCandidate[] {
  return candidates.filter((candidate) => selectionGate(
    candidate.definition.timeframe,
    candidate.research5Bps,
    candidate.research10Bps,
    "RESEARCH",
  )).sort(compareResearch).slice(0, V5_PREREGISTRATION.selection.researchShortlistLimitPerTimeframe);
}

export function selectV5ValidatedFinalist(candidates: V5ValidatedCandidate[]): V5ValidatedCandidate | null {
  return [...candidates].filter((candidate) => selectionGate(
    candidate.definition.timeframe,
    candidate.validation5Bps,
    candidate.validation10Bps,
    "VALIDATION",
  )).sort(compareValidated)[0] ?? null;
}

export function v5StabilityGrid(definition: V5CandidateDefinition): ExitConfiguration[] {
  const selected = v5ExitConfiguration(definition.exitFamily, definition.timeframe);
  const multipliers = V5_PREREGISTRATION.stability.atrRiskMultipliersRelativeToSelected;
  return multipliers.flatMap((multiplier) => V5_PREREGISTRATION.stability.expiryCandles.map((expiryCandles) => {
    if (selected.riskMode === "PERCENT") {
      return {
        name: `${selected.name}_STABILITY_RISK_${multiplier}_E${expiryCandles}`,
        riskMode: "PERCENT" as const,
        riskPercent: selected.riskPercent! * multiplier,
        rewardRisk: selected.rewardRisk,
        expiryCandles,
      };
    }
    return {
      name: `${selected.name}_STABILITY_RISK_${multiplier}_E${expiryCandles}`,
      riskMode: "ATR" as const,
      atrMultiple: selected.atrMultiple! * multiplier,
      rewardRisk: selected.rewardRisk,
      expiryCandles,
    };
  }));
}

export function v5CandidateDefinitions(timeframe: V5Timeframe): V5CandidateDefinition[] {
  return V5_ENTRY_FAMILIES.flatMap((entryFamily) =>
    (["ATR_1_0", "ATR_1_25", "PERCENT_NORMALIZED"] as const).map((exitFamily) => ({
      entryFamily,
      exitFamily,
      timeframe,
    })));
}

function alignmentPasses(entry: V5Entry): boolean {
  if (entry.timeframe === "5m" || entry.timeframe === "15m") {
    return entry.feature.htf1hDirection === entry.direction && entry.feature.htf4hDirection === entry.direction;
  }
  if (entry.timeframe === "1h") return entry.feature.htf4hDirection === entry.direction;
  return entry.feature.localEmaDirection === entry.direction && entry.feature.localTrend !== "sideways";
}

function selectionGate(
  timeframe: V5Timeframe,
  five: BacktestSummary,
  ten: BacktestSummary,
  period: "RESEARCH" | "VALIDATION",
): boolean {
  const minimum = period === "RESEARCH"
    ? V5_PREREGISTRATION.selection.researchMinimumSignals[timeframe]
    : V5_PREREGISTRATION.selection.validationMinimumSignals[timeframe];
  return five.signals >= minimum
    && (five.expectancyR ?? Number.NEGATIVE_INFINITY) > 0
    && (five.profitFactor ?? 0) > 1
    && (ten.expectancyR ?? Number.NEGATIVE_INFINITY) >= 0
    && (ten.profitFactor ?? 0) >= 1;
}

function compareResearch(left: V5ResearchCandidate, right: V5ResearchCandidate): number {
  const expectancy = (right.research5Bps.expectancyR ?? Number.NEGATIVE_INFINITY)
    - (left.research5Bps.expectancyR ?? Number.NEGATIVE_INFINITY);
  if (expectancy !== 0) return expectancy;
  const drawdown = (left.research5Bps.maximumDrawdownR ?? Number.POSITIVE_INFINITY)
    - (right.research5Bps.maximumDrawdownR ?? Number.POSITIVE_INFINITY);
  if (drawdown !== 0) return drawdown;
  return candidateId(left.definition).localeCompare(candidateId(right.definition));
}

function compareValidated(left: V5ValidatedCandidate, right: V5ValidatedCandidate): number {
  const leftWorst = Math.min(
    left.research5Bps.expectancyR ?? Number.NEGATIVE_INFINITY,
    left.validation5Bps.expectancyR ?? Number.NEGATIVE_INFINITY,
  );
  const rightWorst = Math.min(
    right.research5Bps.expectancyR ?? Number.NEGATIVE_INFINITY,
    right.validation5Bps.expectancyR ?? Number.NEGATIVE_INFINITY,
  );
  if (leftWorst !== rightWorst) return rightWorst - leftWorst;
  const leftDrawdown = (left.research5Bps.maximumDrawdownR ?? 0) + (left.validation5Bps.maximumDrawdownR ?? 0);
  const rightDrawdown = (right.research5Bps.maximumDrawdownR ?? 0) + (right.validation5Bps.maximumDrawdownR ?? 0);
  if (leftDrawdown !== rightDrawdown) return leftDrawdown - rightDrawdown;
  return candidateId(left.definition).localeCompare(candidateId(right.definition));
}

function candidateId(definition: V5CandidateDefinition): string {
  return `${definition.timeframe}:${definition.entryFamily}:${definition.exitFamily}`;
}
