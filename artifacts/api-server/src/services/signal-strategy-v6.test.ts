import assert from "node:assert/strict";
import test from "node:test";
import type { BacktestSummary } from "./signal-backtest";
import {
  filterV6Entries,
  promotionGate,
  selectV6EntryShortlist,
  selectV6ValidatedFinalists,
  v6CostModels,
  v6ExitSearchConfigurations,
  v6ExpirySensitivity,
  v6Period,
  v6StabilitySurface,
  type V6Entry,
} from "./signal-strategy-v6";

const thresholds = { p30: 30, p70: 70, p80: 80, p90: 90 };

test("V6 costs expose separate components whose sum matches each scenario", () => {
  for (const model of Object.values(v6CostModels())) {
    assert.equal(model.feeBps + model.spreadBps + model.slippageBps + model.latencyBps, model.totalBps);
  }
  assert.equal(v6CostModels().REALISTIC.totalBps, 5);
  assert.equal(v6CostModels().STRESS.totalBps, 10);
});

test("V6 entry filters consume only frozen causal feature snapshots", () => {
  const high = entry({ qualityScore: 85 });
  assert.equal(filterV6Entries([high], "QUALITY_TOP_20", thresholds).length, 1);
  assert.equal(filterV6Entries([high], "HTF_STRONG", thresholds).length, 1);
  assert.equal(filterV6Entries([high], "HIGH_VOL_TREND_QUALITY", thresholds).length, 1);
  const futureContradiction = entry({ feature: { ...high.feature, htf4hDirection: "SHORT" } });
  assert.equal(filterV6Entries([futureContradiction], "HTF_STRONG", thresholds).length, 0);
});

test("V6 exit grid and follow-up surfaces are finite and leave baseline unchanged", () => {
  const grid = v6ExitSearchConfigurations();
  assert.equal(grid[0].name, "BASELINE");
  assert.ok(grid.length > 100 && grid.length < 300);
  assert.ok(grid.some((item) => item.rewardRisk === 1));
  assert.ok(grid.some((item) => item.rewardRisk === 2));
  assert.equal(v6ExpirySensitivity(grid[1]).length, 6);
  assert.equal(v6StabilitySurface(grid[1]).length, 27);
  assert.equal(grid[0].rewardRisk, 1.5);
  assert.equal(grid[0].expiryCandles, 12);
});

test("V6 selection sees TRAIN/DEVELOPMENT first and validation only after shortlist", () => {
  const weak = screen("weak", -0.1, 0.8);
  const stable = screen("stable", 0.1, 1.2);
  const shortlist = selectV6EntryShortlist([weak, stable]);
  assert.equal(shortlist[0]?.candidate.id, "stable");
  const validated = selectV6ValidatedFinalists([{ ...shortlist[0], validation5Bps: summary(60, 0.05, 1.12), validation10Bps: summary(60, 0.01, 1.02) }]);
  assert.equal(validated.length, 1);
});

test("V6 locked OOS promotion requires every preregistered robustness gate", () => {
  const passing = promotionGate({
    timeframe: "5m",
    outOfSample5Bps: { ...summary(100, 0.05, 1.2), profitableMonthsPct: 60 } as never,
    outOfSample10Bps: { ...summary(100, 0.01, 1.05), profitableMonthsPct: 55 } as never,
    positiveWalkForwardFraction: 0.7,
    positiveStabilityFraction: 0.7,
    bootstrapProbabilityPositivePct: 75,
  });
  assert.equal(passing.passes, true);
  const failing = promotionGate({
    timeframe: "5m",
    outOfSample5Bps: { ...summary(100, 0.05, 1.01), profitableMonthsPct: 60 } as never,
    outOfSample10Bps: { ...summary(100, -0.01, 0.99), profitableMonthsPct: 45 } as never,
    positiveWalkForwardFraction: 0.4,
    positiveStabilityFraction: 0.4,
    bootstrapProbabilityPositivePct: 50,
  });
  assert.equal(failing.passes, false);
  assert.ok(failing.reasons.length >= 4);
});

test("V6 partitions retain locked OOS as a distinct chronological state", () => {
  assert.equal(v6Period("2019-01-01T00:00:00.000Z"), "TRAIN");
  assert.equal(v6Period("2023-01-01T00:00:00.000Z"), "DEVELOPMENT");
  assert.equal(v6Period("2024-06-01T00:00:00.000Z"), "VALIDATION");
  assert.equal(v6Period("2026-01-01T00:00:00.000Z"), "LOCKED_OUT_OF_SAMPLE");
});

function entry(overrides: Partial<V6Entry> = {}): V6Entry {
  const base: V6Entry = {
    timeframe: "15m",
    direction: "LONG",
    entryIndex: 200,
    openedAt: "2023-01-01T00:00:00.000Z",
    entryPrice: 100,
    baselineStopLoss: 98,
    baselineTakeProfit: 103,
    baselineRiskReward: 1.5,
    atrAtEntry: 1,
    qualityScore: 85,
    qualityFactors: {
      TREND_QUALITY: 1, STRUCTURE_QUALITY: 1, HTF_ALIGNMENT: 1, ENTRY_EXTENSION: 1,
      VOLATILITY_FIT: 1, RELATIVE_VOLUME: 1, MOMENTUM_CONFIRMATION: 1,
      PATTERN_QUALITY: 1, RANGE_AND_CLOSE_QUALITY: 1,
    },
    feature: {
      localTrend: "bullish",
      localEmaDirection: "LONG",
      localStructure: "higher_high_and_higher_low",
      volatilityRegime: "HIGH",
      volatilityPercentile: 0.8,
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
      momentumConfirmed: true,
      structureRejection: false,
      utcHour: 12,
      argBraHour: 9,
    },
    v6: { evaluatedAt: "2023-01-01T00:15:00.000Z", fourHourVolatilityPercentile: 0.8 },
  };
  return { ...base, ...overrides };
}

function screen(id: string, expectancyR: number, profitFactor: number) {
  return {
    candidate: { id, timeframe: "5m" as const },
    train5Bps: summary(300, expectancyR, profitFactor),
    train10Bps: summary(300, expectancyR, profitFactor),
    development5Bps: summary(120, expectancyR, profitFactor),
    development10Bps: summary(120, expectancyR, profitFactor),
  };
}

function summary(signals: number, expectancyR: number, profitFactor: number): BacktestSummary {
  return {
    frictionBps: 5, signals, wins: Math.floor(signals / 3), losses: Math.floor(signals / 3),
    expired: signals - Math.floor(signals / 3) * 2, censored: 0,
    winRateIncludingExpired: 33, winRateExcludingExpired: 50, lossRate: 33, expiredRate: 34,
    averageRiskReward: 1.5, expectancyR, profitFactor, maximumDrawdownR: 5,
    consecutiveWins: 2, consecutiveLosses: 2, averageDurationCandles: 8,
    medianDurationCandles: 8, medianStopPct: 0.5, medianTargetPct: 0.75,
    medianStopAtr: 1, medianTargetAtr: 1.5, averageExpiredR: 0,
  };
}
