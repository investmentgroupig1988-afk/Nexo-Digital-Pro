import assert from "node:assert/strict";
import test from "node:test";
import type { BacktestSummary } from "./signal-backtest";
import type { V3FeatureSnapshot } from "./signal-strategy-v3";
import {
  acceptsV5Family,
  selectV5ResearchShortlist,
  selectV5ValidatedFinalist,
  v5CandidateDefinitions,
  v5ExitConfiguration,
  v5Period,
  v5StabilityGrid,
  type V5Entry,
} from "./signal-strategy-v5";
import {
  V5_PREREGISTRATION,
  V5_PREREGISTRATION_HASH,
  computeV5PreregistrationHash,
} from "./signal-strategy-v5-snapshot";

test("V5 preregistration is immutable and hash-verified before market evaluation", () => {
  assert.equal(Object.isFrozen(V5_PREREGISTRATION), true);
  assert.equal(Object.isFrozen(V5_PREREGISTRATION.entryFamilies), true);
  assert.equal(computeV5PreregistrationHash(), V5_PREREGISTRATION_HASH);
  assert.equal(V5_PREREGISTRATION.experimentCount.totalPrimaryCombinations, 36);
});

test("V5 entry families require causal alignment, volatility, volume and declared quality", () => {
  const entry = setup();
  assert.equal(acceptsV5Family(entry, "HIGH_VOL_TREND_QUALITY"), true);
  assert.equal(acceptsV5Family({ ...entry, v5: { ...entry.v5, fourHourVolatilityPercentile: 0.7 } }, "HIGH_VOL_TREND_QUALITY"), false);
  assert.equal(acceptsV5Family(setup({ htf4hDirection: "SHORT" }), "HIGH_VOL_TREND_QUALITY"), false);
  assert.equal(acceptsV5Family(setup({ volumeRatio: 0.9 }), "HIGH_VOL_TREND_QUALITY"), false);
  assert.equal(acceptsV5Family(setup({ breakoutConfirmed: false }), "HIGH_VOL_TREND_QUALITY"), false);
});

test("V5 partitions are chronological and the selector cannot consume locked OOS", () => {
  assert.equal(v5Period("2018-01-01T00:00:00.000Z"), "EXTERNAL_PRE_SAMPLE");
  assert.equal(v5Period("2020-01-01T00:00:00.000Z"), "RESEARCH");
  assert.equal(v5Period("2023-01-01T00:00:00.000Z"), "VALIDATION");
  assert.equal(v5Period("2025-01-01T00:00:00.000Z"), "LOCKED_OOS");
  assert.equal(v5Period("2026-08-29T00:00:00.000Z"), "FORWARD");

  const strongerResearch = researchCandidate("HIGH_VOL_TREND_QUALITY", 0.08, 1.2);
  const weakerResearch = researchCandidate("TREND_MOMENTUM_LIQUID", 0.03, 1.1);
  const shortlist = selectV5ResearchShortlist([
    { ...strongerResearch, lockedOosExpectancy: -10 } as typeof strongerResearch,
    { ...weakerResearch, lockedOosExpectancy: 10 } as typeof weakerResearch,
  ]);
  assert.equal(shortlist[0]?.definition.entryFamily, "HIGH_VOL_TREND_QUALITY");
});

test("validation selects only research-shortlisted candidates that pass validation costs", () => {
  const first = {
    ...researchCandidate("HIGH_VOL_TREND_QUALITY", 0.08, 1.2),
    validation5Bps: summary(20, 0.03, 1.1),
    validation10Bps: summary(20, 0.005, 1.01),
  };
  const failed = {
    ...researchCandidate("TREND_MOMENTUM_LIQUID", 0.1, 1.3),
    validation5Bps: summary(20, -0.01, 0.95),
    validation10Bps: summary(20, -0.04, 0.8),
  };
  assert.equal(selectV5ValidatedFinalist([first, failed])?.definition.entryFamily, "HIGH_VOL_TREND_QUALITY");
});

test("exits and stability are bounded, volatility-normalized and retain R:R 1.5", () => {
  assert.equal(v5CandidateDefinitions("5m").length, 9);
  assert.deepEqual(v5ExitConfiguration("ATR_1_0", "5m"), {
    name: "V5_ATR_1_0_5m",
    riskMode: "ATR",
    atrMultiple: 1,
    rewardRisk: 1.5,
    expiryCandles: 12,
  });
  const percent = v5ExitConfiguration("PERCENT_NORMALIZED", "1h");
  assert.equal(percent.riskPercent, 0.75);
  const stability = v5StabilityGrid({ timeframe: "1h", entryFamily: "HIGH_VOL_TREND_QUALITY", exitFamily: "ATR_1_0" });
  assert.equal(stability.length, 9);
  assert.ok(stability.every((item) => item.rewardRisk === 1.5));
});

function setup(overrides: Partial<V3FeatureSnapshot> = {}): V5Entry {
  const feature: V3FeatureSnapshot = {
    localTrend: "bullish",
    localEmaDirection: "LONG",
    localStructure: "higher_high_and_higher_low",
    volatilityRegime: "NORMAL",
    volatilityPercentile: 0.5,
    htf1hDirection: "LONG",
    htf4hDirection: "LONG",
    trendRegime: "ALIGNED_TREND",
    extensionAtr: 0.8,
    directionalMoveAtr: 0.5,
    volumeRatio: 1.2,
    bodyRatio: 0.7,
    breakoutDirect: true,
    breakoutConfirmed: true,
    breakoutRetest: false,
    pullbackContinuation: false,
    momentumConfirmed: false,
    structureRejection: false,
    utcHour: 12,
    argBraHour: 9,
    ...overrides,
  };
  return {
    timeframe: "15m",
    direction: "LONG",
    entryIndex: 200,
    openedAt: "2020-01-01T00:00:00.000Z",
    entryPrice: 100,
    baselineStopLoss: 99,
    baselineTakeProfit: 101.5,
    baselineRiskReward: 1.5,
    atrAtEntry: 1,
    feature,
    v5: { evaluatedAt: "2020-01-01T00:14:59.999Z", fourHourVolatilityPercentile: 0.8 },
  };
}

function researchCandidate(entryFamily: "HIGH_VOL_TREND_QUALITY" | "TREND_MOMENTUM_LIQUID", expectancy: number, pf: number) {
  return {
    definition: { timeframe: "5m" as const, entryFamily, exitFamily: "ATR_1_0" as const },
    research5Bps: summary(60, expectancy, pf),
    research10Bps: summary(60, Math.max(0, expectancy - 0.02), Math.max(1, pf - 0.05)),
  };
}

function summary(signals: number, expectancyR: number, profitFactor: number): BacktestSummary {
  return {
    frictionBps: 5,
    signals,
    wins: Math.floor(signals / 3),
    losses: Math.floor(signals / 3),
    expired: signals - Math.floor(signals / 3) * 2,
    censored: 0,
    winRateIncludingExpired: 33,
    winRateExcludingExpired: 50,
    lossRate: 33,
    expiredRate: 34,
    averageRiskReward: 1.5,
    expectancyR,
    profitFactor,
    maximumDrawdownR: 3,
    consecutiveWins: 2,
    consecutiveLosses: 2,
    averageDurationCandles: 6,
    medianDurationCandles: 6,
    medianStopPct: 0.5,
    medianTargetPct: 0.75,
    medianStopAtr: 1,
    medianTargetAtr: 1.5,
    averageExpiredR: 0,
  };
}
