import { createHash } from "node:crypto";

export const V5_RESEARCH_ID = "SIGNAL_ENGINE_V5_PREREGISTERED_2026_08_29";
export const V5_TIMEFRAMES = ["5m", "15m", "1h", "4h"] as const;
export const V5_ENTRY_FAMILIES = [
  "HIGH_VOL_TREND_QUALITY",
  "TREND_MOMENTUM_LIQUID",
  "STRUCTURE_PULLBACK_REGIME",
] as const;
export const V5_EXIT_FAMILIES = ["ATR_1_0", "ATR_1_25", "PERCENT_NORMALIZED"] as const;

export const V5_PREREGISTRATION = deepFreeze({
  id: V5_RESEARCH_ID,
  registeredAt: "2026-08-29T00:00:00.000Z",
  objective: "Find net expectancy and temporal robustness through selective entry quality, not win-rate maximization.",
  symbol: "BTCUSDT",
  provider: "Binance public Spot klines",
  candlePolicy: "Only candles with closeTime <= effective observation time; every context is causal.",
  liveIntegration: false,
  periods: {
    externalPreSampleAudit: {
      start: "2017-10-01T00:00:00.000Z",
      end: "2018-08-28T00:00:00.000Z",
      selectionAccess: false,
      caveat: "Chronologically earlier, not a final forward holdout; used only after finalists are frozen.",
    },
    research: {
      start: "2018-08-28T00:00:00.000Z",
      end: "2022-08-28T00:00:00.000Z",
      selectionAccess: true,
      contamination: "Previously inspected in the V3/V4 BTC robustness audit.",
    },
    validation: {
      start: "2022-08-28T00:00:00.000Z",
      end: "2024-08-28T00:00:00.000Z",
      selectionAccess: true,
      contamination: "Overlaps V3/V4 discovery-era research.",
    },
    lockedOutOfSample: {
      start: "2024-08-28T00:00:00.000Z",
      end: "2026-08-28T00:00:00.000Z",
      selectionAccess: false,
      contamination: "Previously observed at aggregate strategy level; locked only with respect to V5 candidate selection.",
    },
    trueForwardStart: "2026-08-28T00:00:00.000Z",
  },
  costs: {
    ideal: { totalBps: 0, feeBps: 0, spreadBps: 0, slippageBps: 0 },
    primary: { totalBps: 5, feeBps: 3, spreadBps: 1, slippageBps: 1 },
    stress: { totalBps: 10, feeBps: 6, spreadBps: 2, slippageBps: 2 },
  },
  commonEntryRequirements: {
    baselineConfluenceRequired: true,
    closedCandleRequired: true,
    marketVolatilityContext: "Causal percentile of confirmed 4h realized true-range percentage.",
    timeframeAlignment: {
      "5m": "confirmed 1h and 4h directions must both equal signal direction",
      "15m": "confirmed 1h and 4h directions must both equal signal direction",
      "1h": "confirmed 4h direction must equal signal direction",
      "4h": "local EMA direction must equal signal and local trend must not be sideways",
    },
  },
  entryFamilies: {
    HIGH_VOL_TREND_QUALITY: {
      hypothesis: "Baseline setups have edge only when broad volatility is high, direction is aligned, and at least one causal quality pattern confirms the entry.",
      fourHourVolatilityPercentileMinimumInclusive: 0.75,
      fourHourVolatilityPercentileMaximumInclusive: 1,
      maximumExtensionAtrInclusive: 1,
      minimumVolumeRatioInclusive: 1,
      qualityPatternsAny: ["breakoutConfirmed", "pullbackContinuation", "momentumConfirmed", "structureRejection"],
    },
    TREND_MOMENTUM_LIQUID: {
      hypothesis: "Aligned breakout/momentum entries work in elevated but non-extreme volatility with confirmed relative volume.",
      fourHourVolatilityPercentileMinimumInclusive: 0.6,
      fourHourVolatilityPercentileMaximumInclusive: 0.95,
      maximumExtensionAtrInclusive: 1.25,
      minimumVolumeRatioInclusive: 1.05,
      qualityPatternsAny: ["breakoutConfirmed", "momentumConfirmed"],
    },
    STRUCTURE_PULLBACK_REGIME: {
      hypothesis: "Aligned pullback/rejection entries avoid chasing and work when broad volatility is at least moderately elevated.",
      fourHourVolatilityPercentileMinimumInclusive: 0.6,
      fourHourVolatilityPercentileMaximumInclusive: 1,
      maximumExtensionAtrInclusive: 0.75,
      minimumVolumeRatioInclusive: 1,
      qualityPatternsAny: ["pullbackContinuation", "structureRejection"],
    },
  },
  exits: {
    ATR_1_0: { riskMode: "ATR", atrMultiple: 1, rewardRisk: 1.5, expiryCandles: 12 },
    ATR_1_25: { riskMode: "ATR", atrMultiple: 1.25, rewardRisk: 1.5, expiryCandles: 12 },
    PERCENT_NORMALIZED: {
      riskMode: "PERCENT",
      riskPercentByTimeframe: { "5m": 0.35, "15m": 0.5, "1h": 0.75, "4h": 1.25 },
      rewardRisk: 1.5,
      expiryCandles: 12,
    },
  },
  selection: {
    researchMinimumSignals: { "5m": 40, "15m": 25, "1h": 12, "4h": 6 },
    validationMinimumSignals: { "5m": 15, "15m": 10, "1h": 5, "4h": 3 },
    researchGate: "expectancy 5bps > 0, PF 5bps > 1, expectancy 10bps >= 0, PF 10bps >= 1, minimum sample",
    validationGate: "same edge and sample conditions as research",
    researchShortlistLimitPerTimeframe: 3,
    ranking: "maximize the minimum 5bps expectancy across RESEARCH and VALIDATION, then lower combined drawdown; LOCKED OOS and external pre-sample are forbidden inputs",
  },
  stability: {
    scope: "Finalist entry family with selected exit family; diagnostic only and never substitutes another point.",
    atrRiskMultipliersRelativeToSelected: [0.9, 1, 1.1],
    percentRiskMultipliersRelativeToSelected: [0.9, 1, 1.1],
    expiryCandles: [10, 12, 14],
    positiveCellCriterion: "combined RESEARCH + VALIDATION expectancy 5bps > 0 and PF 5bps > 1",
    minimumPositiveResearchValidationCellsAt5Bps: 5,
  },
  promotionGate: {
    lockedOutOfSample: "expectancy 5bps > 0, PF 5bps > 1, expectancy 10bps >= 0, PF 10bps >= 1",
    externalPreSample: "expectancy 5bps > 0 and PF 5bps > 1 when sample >= 5; otherwise explicitly insufficient",
    stabilityRequired: true,
    bootstrap: "5bps block-bootstrap median expectancy > 0 and probability positive expectancy >= 60%",
    minimumLockedSignals: { "5m": 15, "15m": 10, "1h": 5, "4h": 3 },
    finalAction: "At most PROMOTE TO FORWARD; never commercial live from backtest.",
  },
  experimentCount: {
    entryFamilies: 3,
    exitsPerTimeframe: 3,
    combinationsPerTimeframe: 9,
    totalPrimaryCombinations: 36,
  },
} as const);

export const V5_PREREGISTRATION_HASH = "bcfd606e06b72204337ae925028c3434a4c9898cd2003927a52fbe6bdb1ba32f";

export type V5Timeframe = (typeof V5_TIMEFRAMES)[number];
export type V5EntryFamily = (typeof V5_ENTRY_FAMILIES)[number];
export type V5ExitFamily = (typeof V5_EXIT_FAMILIES)[number];

export function computeV5PreregistrationHash(): string {
  return createHash("sha256").update(canonicalJson(V5_PREREGISTRATION)).digest("hex");
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.entries(value).sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => `${JSON.stringify(key)}:${canonicalJson(nested)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function deepFreeze<T>(value: T): Readonly<T> {
  if (value !== null && typeof value === "object") {
    Object.freeze(value);
    for (const nested of Object.values(value)) deepFreeze(nested);
  }
  return value;
}
