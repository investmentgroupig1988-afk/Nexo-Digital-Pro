import assert from "node:assert/strict";
import { test } from "node:test";
import type { BacktestSummary } from "./signal-backtest";
import {
  buildV2ExitGrid,
  buildV2ExpiryGrid,
  contextAvailableAt,
  evaluateV2Families,
  selectV2BeforeHoldout,
  v2Period,
  type V2FeatureFrame,
} from "./signal-strategy-v2";

test("higher-timeframe pullback uses only aligned closed contexts", () => {
  const signals = evaluateV2Families(frame());
  assert.equal(signals.some((signal) => signal.candidateId === "HTF_TREND_PULLBACK"), true);
  assert.equal(signals.some((signal) => signal.candidateId === "DUAL_HTF_TREND_PULLBACK"), true);

  const opposing = evaluateV2Families(frame({ primaryHtfTrend: "bearish", primaryHtfEmaDirection: "SHORT" }));
  assert.equal(opposing.some((signal) => signal.candidateId.includes("PULLBACK")), false);
});

test("confirmed breakout requires a closed-candle body, volume, and causal volatility", () => {
  const breakout = evaluateV2Families(frame({
    open: 100,
    high: 106,
    low: 99.5,
    close: 105.5,
    priorTwentyHigh: 104,
    volumeRatio: 1.3,
    volatilityPercentile: 0.6,
  }));
  assert.equal(breakout.some((signal) => signal.candidateId === "CONFIRMED_BREAKOUT"), true);

  const weakVolume = evaluateV2Families(frame({
    open: 100,
    high: 106,
    low: 99.5,
    close: 105.5,
    priorTwentyHigh: 104,
    volumeRatio: 1.19,
    volatilityPercentile: 0.6,
  }));
  assert.equal(weakVolume.some((signal) => signal.candidateId.includes("BREAKOUT")), false);
});

test("future higher-timeframe context is never visible to an earlier execution candle", () => {
  const contexts = [
    { closeTimeMs: 100, trend: "bearish" as const, emaDirection: "SHORT" as const },
    { closeTimeMs: 200, trend: "bullish" as const, emaDirection: "LONG" as const },
  ];
  assert.equal(contextAvailableAt(contexts, 99), null);
  assert.equal(contextAvailableAt(contexts, 199)?.trend, "bearish");
  assert.equal(contextAvailableAt(contexts, 200)?.trend, "bullish");
});

test("exit and expiry grids are bounded and never alter the live baseline", () => {
  const exits = buildV2ExitGrid();
  assert.equal(exits.length > 0 && exits.length < 20, true);
  assert.equal(exits.every((item) => item.riskMode === "ATR"), true);
  assert.equal(exits.every((item) => item.rewardRisk >= 1.25 && item.rewardRisk <= 2.5), true);
  assert.deepEqual(buildV2ExpiryGrid(exits[0]).map((item) => item.expiryCandles), [6, 12, 18, 24, 36]);
});

test("candidate selection cannot observe or rank on final holdout", () => {
  const strongBeforeHoldout = {
    candidate: "STRONG_PRE_HOLDOUT",
    development5Bps: summary(0.08, 1.2),
    development10Bps: summary(0.03, 1.08),
    validation5Bps: summary(0.04, 1.1),
    validation10Bps: summary(0.01, 1.02),
    finalHoldout: summary(-1, 0.1),
  };
  const weakBeforeHoldout = {
    candidate: "WEAK_PRE_HOLDOUT",
    development5Bps: summary(-0.01, 0.98),
    development10Bps: summary(-0.04, 0.9),
    validation5Bps: summary(0.01, 1.01),
    validation10Bps: summary(-0.02, 0.95),
    finalHoldout: summary(1, 10),
  };
  const selected = selectV2BeforeHoldout([strongBeforeHoldout, weakBeforeHoldout]);
  assert.equal(selected?.candidate, "STRONG_PRE_HOLDOUT");
});

test("V2 partitions are chronological with a sealed final 20 percent", () => {
  const start = new Date("2022-01-01T00:00:00.000Z");
  const end = new Date("2023-01-01T00:00:00.000Z");
  assert.equal(v2Period("2022-03-01T00:00:00.000Z", start, end), "DEVELOPMENT");
  assert.equal(v2Period("2022-08-01T00:00:00.000Z", start, end), "VALIDATION");
  assert.equal(v2Period("2022-11-01T00:00:00.000Z", start, end), "FINAL_HOLDOUT");
});

function frame(overrides: Partial<V2FeatureFrame> = {}): V2FeatureFrame {
  return {
    timeframe: "15m",
    open: 100,
    high: 102,
    low: 99,
    close: 101,
    ema20: 100,
    ema50: 98,
    ema200: 95,
    rsi: 58,
    atr: 2,
    volumeRatio: 1.2,
    localTrend: "bullish",
    localStructure: "higher_high_and_higher_low",
    support: 96,
    resistance: 110,
    volatilityRegime: "NORMAL",
    volatilityPercentile: 0.5,
    primaryHtfTrend: "bullish",
    primaryHtfEmaDirection: "LONG",
    secondaryHtfTrend: "bullish",
    secondaryHtfEmaDirection: "LONG",
    priorTwentyHigh: 104,
    priorTwentyLow: 94,
    ...overrides,
  };
}

function summary(expectancyR: number, profitFactor: number): BacktestSummary {
  return {
    frictionBps: 5,
    signals: 100,
    wins: 30,
    losses: 20,
    expired: 50,
    censored: 0,
    winRateIncludingExpired: 30,
    winRateExcludingExpired: 60,
    lossRate: 20,
    expiredRate: 50,
    averageRiskReward: 1.5,
    expectancyR,
    profitFactor,
    maximumDrawdownR: 5,
    consecutiveWins: 3,
    consecutiveLosses: 2,
    averageDurationCandles: 8,
    medianDurationCandles: 8,
    medianStopPct: 0.5,
    medianTargetPct: 0.75,
    medianStopAtr: 1,
    medianTargetAtr: 1.5,
    averageExpiredR: 0,
  };
}
