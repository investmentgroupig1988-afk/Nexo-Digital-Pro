import assert from "node:assert/strict";
import { test } from "node:test";
import type { HistoricalTimeframe } from "./historical";
import {
  evaluateEntry,
  summarizeBacktest,
  validateCandleSeries,
  type BaselineEntry,
  type ClosedAnalysisCandle,
  type ExitConfiguration,
} from "./signal-backtest";

const timeframe: HistoricalTimeframe = "5m";
const configuration: ExitConfiguration = {
  name: "TEST_ATR",
  riskMode: "ATR",
  atrMultiple: 1,
  rewardRisk: 1.5,
  expiryCandles: 2,
};

test("offline exits preserve R:R and use only candles after the entry", () => {
  const candles = series([
    [100, 101, 99, 100],
    [100, 115, 99, 114],
    [114, 116, 90, 91],
  ]);
  const trade = evaluateEntry(candles, entry(), configuration);
  assert.equal(trade.outcome, "WIN");
  assert.equal(trade.riskUsd, 10);
  assert.equal(trade.targetUsd, 15);
  assert.equal(trade.realizedR, 1.5);
  assert.equal(trade.durationCandles, 1);
});

test("same-candle TP and SL ambiguity is resolved conservatively", () => {
  const candles = series([
    [100, 101, 99, 100],
    [100, 116, 89, 101],
    [101, 102, 100, 101],
  ]);
  const trade = evaluateEntry(candles, entry(), configuration);
  assert.equal(trade.outcome, "LOSS");
  assert.equal(trade.realizedR, -1);
});

test("expired trades retain mark-to-market R and bounded post-expiry evidence", () => {
  const candles = series([
    [100, 101, 99, 100],
    [100, 105, 98, 103],
    [103, 108, 101, 105],
    [105, 116, 104, 115],
  ]);
  const trade = evaluateEntry(candles, entry(), configuration);
  assert.equal(trade.outcome, "EXPIRED");
  assert.equal(trade.realizedR, 0.5);
  assert.equal(trade.postExpiryOutcome, "WIN");
  assert.equal(trade.postExpiryAdditionalCandles, 1);
});

test("summary treats expired as part of total accuracy and economic expectancy", () => {
  const base = evaluateEntry(series([[100, 101, 99, 100], [100, 115, 99, 114], [114, 116, 110, 115]]), entry(), configuration);
  const expired = evaluateEntry(series([[100, 101, 99, 100], [100, 105, 98, 103], [103, 108, 101, 105]]), entry(), configuration);
  const loss = evaluateEntry(series([[100, 101, 99, 100], [100, 105, 89, 90], [90, 92, 88, 91]]), entry(), configuration);
  const summary = summarizeBacktest([base, expired, loss]);
  assert.equal(summary.signals, 3);
  assert.equal(summary.wins, 1);
  assert.equal(summary.losses, 1);
  assert.equal(summary.expired, 1);
  assert.ok(Math.abs((summary.winRateIncludingExpired ?? 0) - 100 / 3) < 1e-12);
  assert.equal(summary.winRateExcludingExpired, 50);
  assert.ok(Math.abs((summary.expectancyR ?? 0) - (1.5 + 0.5 - 1) / 3) < 1e-12);
});

test("summary deducts round-trip friction in R without changing outcomes", () => {
  const win = evaluateEntry(series([[100, 101, 99, 100], [100, 115, 99, 114], [114, 116, 110, 115]]), entry(), configuration);
  const loss = evaluateEntry(series([[100, 101, 99, 100], [100, 105, 89, 90], [90, 92, 88, 91]]), entry(), configuration);
  const summary = summarizeBacktest([win, loss], 25);
  // Each trade risks 10% of entry. 25 bps (0.25%) therefore costs 0.025 R per trade.
  assert.equal(summary.frictionBps, 25);
  assert.equal(summary.wins, 1);
  assert.equal(summary.losses, 1);
  assert.ok(Math.abs((summary.expectancyR ?? 0) - 0.225) < 1e-12);
  assert.ok(Math.abs((summary.profitFactor ?? 0) - 1.475 / 1.025) < 1e-12);
});

test("summary rejects invalid friction assumptions", () => {
  assert.throws(() => summarizeBacktest([], -1), /non-negative/);
});

test("candle quality identifies gaps, duplicates and incomplete data", () => {
  const candles = series([[100, 101, 99, 100], [100, 101, 99, 100], [100, 101, 99, 100]]);
  candles[1] = { ...candles[1], timestamp: candles[0].timestamp, closeTime: candles[0].closeTime };
  candles[2] = { ...candles[2], timestamp: new Date(Date.parse(candles[0].timestamp) + 15 * 60_000).toISOString(), closeTime: new Date(Date.parse(candles[0].timestamp) + 20 * 60_000 - 1).toISOString() };
  const quality = validateCandleSeries(candles, 5 * 60_000, new Date(Date.parse(candles[0].timestamp) + 16 * 60_000));
  assert.equal(quality.duplicateTimestamps, 1);
  assert.equal(quality.gaps, 2);
  assert.equal(quality.incompleteCandles, 1);
});

function entry(): BaselineEntry {
  return {
    timeframe,
    direction: "LONG",
    entryIndex: 0,
    openedAt: "2026-01-01T00:00:00.000Z",
    entryPrice: 100,
    baselineStopLoss: 80,
    baselineTakeProfit: 130,
    baselineRiskReward: 1.5,
    atrAtEntry: 10,
  };
}

function series(values: Array<[number, number, number, number]>): ClosedAnalysisCandle[] {
  return values.map(([open, high, low, close], index) => ({
    timestamp: new Date(Date.UTC(2026, 0, 1, 0, index * 5)).toISOString(),
    closeTime: new Date(Date.UTC(2026, 0, 1, 0, index * 5 + 5) - 1).toISOString(),
    open,
    high,
    low,
    close,
    volume: 1,
  }));
}
