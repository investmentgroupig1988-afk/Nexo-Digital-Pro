import assert from "node:assert/strict";
import test from "node:test";
import type { BacktestSummary } from "./signal-backtest";
import {
  V3_ENTRY_CANDIDATES,
  V3_HYPOTHESES,
  entryGatePasses,
  filterV3Entries,
  isV3CandleUsable,
  selectV3BeforeSealed,
  v3CandidateCount,
  v3Period,
  type V3FeatureSnapshot,
  type V3SetupEntry,
} from "./signal-strategy-v3";

test("V3 admits only candles closed at the effective observation time", () => {
  const observedAt = new Date("2026-08-28T12:00:00.000Z");
  assert.equal(isV3CandleUsable("2026-08-28T11:59:59.999Z", observedAt), true);
  assert.equal(isV3CandleUsable("2026-08-28T12:00:00.000Z", observedAt), true);
  assert.equal(isV3CandleUsable("2026-08-28T12:00:00.001Z", observedAt), false);
});

test("V3 has a bounded, documented entry-hypothesis set", () => {
  assert.equal(v3CandidateCount(), 26);
  assert.equal(new Set(V3_ENTRY_CANDIDATES).size, V3_ENTRY_CANDIDATES.length);
  for (const candidate of V3_ENTRY_CANDIDATES) {
    assert.ok(V3_HYPOTHESES[candidate].length > 20);
  }
});

test("isolated and combined entry filters use only the causal feature snapshot", () => {
  const entry = setup({
    htf1hDirection: "LONG",
    htf4hDirection: "LONG",
    extensionAtr: 0.7,
    volatilityRegime: "NORMAL",
    breakoutConfirmed: true,
    pullbackContinuation: true,
    momentumConfirmed: true,
  });
  assert.equal(filterV3Entries([entry], "HTF_DUAL_ALIGNED").length, 1);
  assert.equal(filterV3Entries([entry], "EXTENSION_MAX_075_ATR").length, 1);
  assert.equal(filterV3Entries([entry], "QUALITY_BREAKOUT_HTF").length, 1);
  assert.equal(filterV3Entries([entry], "QUALITY_PULLBACK_HTF").length, 1);
  assert.equal(filterV3Entries([entry], "QUALITY_MOMENTUM_HTF").length, 1);

  const contradicted = setup({ ...entry.feature, htf4hDirection: "SHORT" });
  assert.equal(filterV3Entries([contradicted], "HTF_NO_STRONG_CONTRADICTION").length, 0);
  assert.equal(filterV3Entries([contradicted], "QUALITY_BREAKOUT_HTF").length, 0);
});

test("the pre-sealed selector cannot rank on HOLDOUT or PSEUDO_FORWARD", () => {
  const weak = {
    candidate: "weak",
    development5Bps: summary(60, -0.02, 0.95),
    development10Bps: summary(60, -0.04, 0.9),
    validation5Bps: summary(30, -0.01, 0.98),
    validation10Bps: summary(30, -0.03, 0.92),
    holdout5Bps: summary(1_000, 5, 10),
  };
  const stable = {
    candidate: "stable",
    development5Bps: summary(60, 0.03, 1.1),
    development10Bps: summary(60, 0.01, 1.02),
    validation5Bps: summary(30, 0.02, 1.08),
    validation10Bps: summary(30, 0.005, 1.01),
    holdout5Bps: summary(1, -10, 0),
  };
  const selected = selectV3BeforeSealed([weak, stable], { development: 30, validation: 20 });
  assert.equal(selected[0]?.candidate, "stable");
  assert.equal(entryGatePasses(selected[0]!), true);
});

test("entry promotion gate requires positive 5 and 10 bps in development and validation", () => {
  const candidate = {
    candidate: "candidate",
    development5Bps: summary(50, 0.04, 1.2),
    development10Bps: summary(50, 0.01, 1.05),
    validation5Bps: summary(30, 0.02, 1.1),
    validation10Bps: summary(30, -0.001, 0.99),
  };
  assert.equal(entryGatePasses(candidate), false);
  candidate.validation10Bps = summary(30, 0, 1);
  assert.equal(entryGatePasses(candidate), true);
});

test("V3 uses fixed chronological development, validation, holdout and pseudo-forward partitions", () => {
  const start = new Date("2022-08-28T00:00:00.000Z");
  const end = new Date("2026-08-28T00:00:00.000Z");
  const at = (fraction: number) => new Date(start.getTime() + (end.getTime() - start.getTime()) * fraction).toISOString();
  assert.equal(v3Period(at(0.1), start, end), "DEVELOPMENT");
  assert.equal(v3Period(at(0.45), start, end), "VALIDATION");
  assert.equal(v3Period(at(0.7), start, end), "HOLDOUT");
  assert.equal(v3Period(at(0.85), start, end), "PSEUDO_FORWARD");
});

function setup(overrides: Partial<V3FeatureSnapshot> = {}): V3SetupEntry {
  const feature: V3FeatureSnapshot = {
    localTrend: "bullish",
    localEmaDirection: "LONG",
    localStructure: "higher_high_and_higher_low",
    volatilityRegime: "NORMAL",
    volatilityPercentile: 0.5,
    htf1hDirection: "LONG",
    htf4hDirection: "LONG",
    trendRegime: "ALIGNED_TREND",
    extensionAtr: 0.5,
    directionalMoveAtr: 0.4,
    volumeRatio: 1.2,
    bodyRatio: 0.7,
    breakoutDirect: true,
    breakoutConfirmed: true,
    breakoutRetest: false,
    pullbackContinuation: false,
    momentumConfirmed: false,
    structureRejection: false,
    utcHour: 15,
    argBraHour: 12,
    ...overrides,
  };
  return {
    timeframe: "15m",
    direction: "LONG",
    entryIndex: 200,
    openedAt: "2026-08-28T12:00:00.000Z",
    entryPrice: 100,
    baselineStopLoss: 99,
    baselineTakeProfit: 101.5,
    baselineRiskReward: 1.5,
    atrAtEntry: 1,
    feature,
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
    winRateIncludingExpired: 33.33,
    winRateExcludingExpired: 50,
    lossRate: 33.33,
    expiredRate: 33.34,
    averageRiskReward: 1.5,
    expectancyR,
    profitFactor,
    maximumDrawdownR: 4,
    consecutiveWins: 2,
    consecutiveLosses: 2,
    averageDurationCandles: 6,
    medianDurationCandles: 6,
    medianStopPct: 0.5,
    medianTargetPct: 0.75,
    medianStopAtr: 1.5,
    medianTargetAtr: 2.25,
    averageExpiredR: 0,
  };
}
