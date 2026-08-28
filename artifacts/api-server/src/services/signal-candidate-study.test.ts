import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildRobustGeometryGrid,
  buildRobustPercentageGrid,
  passesOfflineFilter,
  selectCandidateBeforeOos,
} from "./signal-candidate-study";
import type { BacktestSummary, BacktestTrade } from "./signal-backtest";

test("bounded ATR grid includes research-only R:R 1.25 without changing live parameters", () => {
  const grid = buildRobustGeometryGrid();
  assert.equal(grid.length, 20);
  assert.ok(grid.every(({ rewardRisk }) => rewardRisk >= 1.25));
  assert.deepEqual(grid.at(0), { stopAtr: 0.75, targetAtr: 0.9375, rewardRisk: 1.25 });
  assert.deepEqual(grid.at(-1), { stopAtr: 2, targetAtr: 4, rewardRisk: 2 });
});

test("bounded percentage grid covers the requested 0.25%-0.50% stops", () => {
  const grid = buildRobustPercentageGrid();
  assert.equal(grid.length, 16);
  assert.deepEqual(grid.at(0), { stopPercent: 0.25, targetPercent: 0.3125, rewardRisk: 1.25 });
  assert.deepEqual(grid.at(-1), { stopPercent: 0.5, targetPercent: 1, rewardRisk: 2 });
});

test("quality filters use only diagnostics known at entry", () => {
  const trade = diagnosticTrade({
    volumeRatioAtEntry: 1.2,
    alignedTimeframes: 2,
    atrPctAtEntry: 0.6,
    structureStopAtr: 0.8,
    favorableObstacleAtr: 2,
    stopAtr: 1,
    targetAtr: 1.5,
  });
  const thresholds = { atrPctLow: 0.4, atrPctMedian: 0.6, atrPctHigh: 0.8 };
  assert.equal(passesOfflineFilter(trade, "QUALITY_COMBINED", thresholds), true);
  assert.equal(passesOfflineFilter({ ...trade, favorableObstacleAtr: 1.49 }, "STRUCTURE_COMPATIBLE", thresholds), false);
  assert.equal(passesOfflineFilter({ ...trade, alignedTimeframes: 1 }, "MTF_2", thresholds), false);
});

test("candidate selection cannot observe out-of-sample results", () => {
  const stable = { candidate: "stable", train: summary(0.1, 1.2, 5), development: summary(0.08, 1.15, 4), validation: summary(0.06, 1.1, 4) };
  const unstable = { candidate: "unstable", train: summary(0.2, 1.4, 3), development: summary(-0.01, 0.98, 5), validation: summary(0.3, 1.5, 2) };
  assert.equal(selectCandidateBeforeOos([unstable, stable])?.candidate, "stable");
});

function summary(expectancyR: number, profitFactor: number, maximumDrawdownR: number): BacktestSummary {
  return {
    frictionBps: 35, signals: 40, wins: 12, losses: 10, expired: 18, censored: 0,
    winRateIncludingExpired: 30, winRateExcludingExpired: 12 / 22 * 100, lossRate: 25, expiredRate: 45,
    averageRiskReward: 1.5, expectancyR, profitFactor, maximumDrawdownR,
    consecutiveWins: 2, consecutiveLosses: 2, averageDurationCandles: 8, medianDurationCandles: 8,
    medianStopPct: 0.5, medianTargetPct: 0.75, medianStopAtr: 1, medianTargetAtr: 1.5, averageExpiredR: 0,
  };
}

function diagnosticTrade(overrides: Partial<BacktestTrade>): BacktestTrade {
  return {
    timeframe: "5m", direction: "LONG", entryIndex: 199, openedAt: "2026-01-01T00:00:00.000Z",
    entryPrice: 100, baselineStopLoss: 99, baselineTakeProfit: 101.5, baselineRiskReward: 1.5, atrAtEntry: 1,
    configuration: "TEST", stopLoss: 99, takeProfit: 101.5, riskUsd: 1, riskPct: 1,
    targetUsd: 1.5, targetPct: 1.5, stopAtr: 1, targetAtr: 1.5, outcome: "WIN",
    closedAt: "2026-01-01T00:05:00.000Z", durationCandles: 1, durationMs: 300_000, realizedR: 1.5,
    mfeUsd: 1.5, maeUsd: 0.5, mfePct: 1.5, maePct: 0.5, mfeR: 1.5, maeR: 0.5,
    mfeAtr: 1.5, maeAtr: 0.5, postExpiryOutcome: null, postExpiryAdditionalCandles: null,
    timeToMfeCandles: 1, timeToMaeCandles: 1,
    ...overrides,
  };
}
