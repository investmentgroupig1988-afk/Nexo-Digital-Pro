import assert from "node:assert/strict";
import test from "node:test";
import type { BacktestSummary, BacktestTrade, ClosedAnalysisCandle } from "./signal-backtest";
import type { V3FeatureSnapshot, V3SetupEntry } from "./signal-strategy-v3";
import {
  V4_FACTOR_IDS,
  deriveV4Thresholds,
  filterV4Threshold,
  monotonicBucketEvidence,
  scoreV4Opportunities,
  selectV4BeforeSealed,
  v4Bucket,
  v4EntryGatePasses,
  v4MfeMaeDistribution,
} from "./signal-strategy-v4";

test("V4 refuses to score a still-open entry candle", () => {
  const candles = candleSeries(21, new Date("2026-08-28T12:00:00.000Z"));
  candles[20].closeTime = "2026-08-28T12:00:00.001Z";
  assert.throws(() => scoreV4Opportunities({
    entries: [setup(20)], candles, timeframe: "15m", observedAt: new Date("2026-08-28T12:00:00.000Z"),
  }), /not closed/);
});

test("quality score uses nine bounded equally weighted causal factors", () => {
  const observedAt = new Date("2026-08-28T12:00:00.000Z");
  const candles = candleSeries(21, observedAt);
  const [scored] = scoreV4Opportunities({ entries: [setup(20)], candles, timeframe: "15m", observedAt });
  assert.deepEqual(Object.keys(scored.qualityFactors), [...V4_FACTOR_IDS]);
  for (const factor of Object.values(scored.qualityFactors)) assert.ok(factor >= 0 && factor <= 1);
  const expected = Object.values(scored.qualityFactors).reduce((sum, value) => sum + value, 0)
    / V4_FACTOR_IDS.length * 100;
  assert.equal(scored.qualityScore, expected);
});

test("score thresholds are derived only from development entries and remain frozen", () => {
  const development = Array.from({ length: 100 }, (_, index) => scored(index));
  const before = deriveV4Thresholds(development);
  const sealedOutliers = [scored(1_000), scored(-1_000)];
  assert.deepEqual(deriveV4Thresholds(development), before);
  assert.notDeepEqual(deriveV4Thresholds([...development, ...sealedOutliers]), before);
  assert.equal(v4Bucket(scored(95), before), "TOP_10");
  assert.equal(filterV4Threshold(development, "TOP_20", before).length, 20);
});

test("pre-sealed selection and entry gate cannot observe holdout fields", () => {
  const weak = candidate("weak", -0.02, -0.01, -0.03, -0.02);
  const strong = candidate("strong", 0.04, 0.03, 0.01, 0.005);
  const ranked = selectV4BeforeSealed([
    { ...weak, holdout: summary(1_000, 10, 10) },
    { ...strong, holdout: summary(1, -10, 0) },
  ], { development: 20, validation: 10 });
  assert.equal(ranked[0]?.candidate, "strong");
  assert.equal(v4EntryGatePasses(ranked[0]!), true);
});

test("monotonic evidence distinguishes ordered from non-ordered buckets", () => {
  const ordered = monotonicBucketEvidence([-0.2, -0.1, 0, 0.1, 0.2]);
  assert.equal(ordered.strict, true);
  assert.equal(ordered.spearman, 1);
  const unstable = monotonicBucketEvidence([-0.2, 0.2, -0.1, 0.1, 0]);
  assert.equal(unstable.strict, false);
  assert.ok((unstable.spearman ?? 1) < 0.5);
});

test("MFE and MAE target-feasibility percentiles are descriptive only", () => {
  const trades = [1, 2, 3, 4].map((value) => ({
    mfeAtr: value,
    maeAtr: value / 2,
    timeToMfeCandles: value * 2,
  })) as BacktestTrade[];
  const distribution = v4MfeMaeDistribution(trades);
  assert.equal(distribution.mfeAtr.p50, 2.5);
  assert.equal(distribution.maeAtr.p75, 1.625);
  assert.equal(distribution.timeToMfeCandles.p90, 7.4);
});

function candleSeries(count: number, observedAt: Date): ClosedAnalysisCandle[] {
  return Array.from({ length: count }, (_, index) => ({
    timestamp: new Date(observedAt.getTime() - (count - index) * 60_000).toISOString(),
    closeTime: new Date(observedAt.getTime() - (count - index - 1) * 60_000).toISOString(),
    open: 100 + index * 0.1,
    high: 101 + index * 0.1,
    low: 99 + index * 0.1,
    close: 100.5 + index * 0.1,
    volume: 100,
  }));
}

function setup(entryIndex: number): V3SetupEntry {
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
    bodyRatio: 0.65,
    breakoutDirect: false,
    breakoutConfirmed: false,
    breakoutRetest: false,
    pullbackContinuation: true,
    momentumConfirmed: true,
    structureRejection: false,
    utcHour: 12,
    argBraHour: 9,
  };
  return {
    timeframe: "15m", direction: "LONG", entryIndex,
    openedAt: "2026-08-28T11:59:00.000Z", entryPrice: 102,
    baselineStopLoss: 100, baselineTakeProfit: 105, baselineRiskReward: 1.5,
    atrAtEntry: 1, rsiAtEntry: 60, feature,
  };
}

function scored(qualityScore: number) {
  return { ...setup(20), qualityScore, qualityFactors: Object.fromEntries(V4_FACTOR_IDS.map((id) => [id, 0.5])) } as ReturnType<typeof scoreV4Opportunities>[number];
}

function candidate(name: string, dev5: number, val5: number, dev10: number, val10: number) {
  return {
    candidate: name,
    development5Bps: summary(40, dev5, dev5 > 0 ? 1.1 : 0.9),
    development10Bps: summary(40, dev10, dev10 >= 0 ? 1 : 0.9),
    validation5Bps: summary(20, val5, val5 > 0 ? 1.1 : 0.9),
    validation10Bps: summary(20, val10, val10 >= 0 ? 1 : 0.9),
  };
}

function summary(signals: number, expectancyR: number, profitFactor: number): BacktestSummary {
  return {
    frictionBps: 5, signals, wins: Math.floor(signals / 3), losses: Math.floor(signals / 3),
    expired: signals - Math.floor(signals / 3) * 2, censored: 0,
    winRateIncludingExpired: 33.33, winRateExcludingExpired: 50, lossRate: 33.33, expiredRate: 33.34,
    averageRiskReward: 1.5, expectancyR, profitFactor, maximumDrawdownR: 4,
    consecutiveWins: 2, consecutiveLosses: 2, averageDurationCandles: 6, medianDurationCandles: 6,
    medianStopPct: 0.5, medianTargetPct: 0.75, medianStopAtr: 1.5, medianTargetAtr: 2.25, averageExpiredR: 0,
  };
}
