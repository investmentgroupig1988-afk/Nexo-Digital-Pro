import assert from "node:assert/strict";
import { test } from "node:test";
import type { HistoricalTimeframe } from "./historical";
import {
  causalVolatilityRegime,
  evaluateEntry,
  evaluateClosedReplayDecision,
  baselineConfiguration,
  summarizeBacktest,
  validateCandleSeries,
  type BaselineEntry,
  type ClosedAnalysisCandle,
  type ExitConfiguration,
} from "./signal-backtest";
import { selectClosedHistoricalCandles } from "./historical";
import { evaluateSignal } from "./signal-engine";
import { calculateTechnicalAnalysis } from "./technical";

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
  assert.equal(trade.timeToMfeCandles, 1);
  assert.equal(trade.timeToMaeCandles, 1);
});

test("offline research can measure R:R 1.0 without changing the 1.5 live baseline", () => {
  const research = evaluateEntry(series([
    [100, 101, 99, 100],
    [100, 113, 99, 112],
    [112, 114, 111, 113],
  ]), entry(), { ...configuration, rewardRisk: 1 });

  assert.equal(research.targetUsd / research.riskUsd, 1);
  assert.equal(baselineConfiguration().rewardRisk, 1.5);
});

test("excursion timing records the first candle where MFE and MAE peak", () => {
  const trade = evaluateEntry(series([
    [100, 101, 99, 100],
    [100, 104, 98, 102],
    [102, 108, 99, 105],
  ]), entry(), configuration);

  assert.equal(trade.outcome, "EXPIRED");
  assert.equal(trade.mfeUsd, 8);
  assert.equal(trade.maeUsd, 2);
  assert.equal(trade.timeToMfeCandles, 2);
  assert.equal(trade.timeToMaeCandles, 1);
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

test("percentage exits scale with price and preserve requested R:R", () => {
  const percentageConfiguration: ExitConfiguration = {
    name: "TEST_PERCENTAGE",
    riskMode: "PERCENT",
    riskPercent: 2,
    rewardRisk: 1.5,
    expiryCandles: 2,
  };
  const trade = evaluateEntry(
    series([[100, 101, 99, 100], [100, 103, 97, 102], [102, 104, 101, 103]]),
    entry(),
    percentageConfiguration,
  );
  assert.equal(trade.riskUsd, 2);
  assert.equal(trade.targetUsd, 3);
  assert.equal(trade.stopAtr, 0.2);
  assert.equal(trade.targetAtr, 0.3);
  assert.equal(trade.outcome, "LOSS");
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

test("volatility regime uses only the closed history available at the entry", () => {
  const calm = Array.from({ length: 199 }, (_, index) => ({
    timestamp: new Date(Date.UTC(2026, 0, 1, 0, index * 5)).toISOString(),
    closeTime: new Date(Date.UTC(2026, 0, 1, 0, index * 5 + 5) - 1).toISOString(),
    open: 100,
    high: 101,
    low: 99,
    close: 100,
    volume: 1,
  }));
  const highRange = {
    ...calm.at(-1)!,
    timestamp: new Date(Date.UTC(2026, 0, 1, 0, 199 * 5)).toISOString(),
    closeTime: new Date(Date.UTC(2026, 0, 1, 0, 200 * 5) - 1).toISOString(),
    high: 110,
    low: 90,
  };

  const classified = causalVolatilityRegime([...calm, highRange]);

  assert.equal(classified.volatilityRegimeAtEntry, "HIGH");
  assert.equal(classified.volatilityPercentileAtEntry, 1);
});

test("offline replay and the live boundary use identical closed candles and decision", () => {
  const closed = Array.from({ length: 200 }, (_, index) => ({
    timestamp: new Date(Date.UTC(2026, 0, 1, 0, index * 5)).toISOString(),
    closeTime: new Date(Date.UTC(2026, 0, 1, 0, (index + 1) * 5) - 1).toISOString(),
    open: 100 + index * 0.01,
    high: 101 + index * 0.01,
    low: 99 + index * 0.01,
    close: 100 + index * 0.01,
    volume: 100 + index,
  }));
  const forming = {
    ...closed.at(-1)!,
    timestamp: new Date(Date.UTC(2026, 0, 1, 0, 200 * 5)).toISOString(),
    closeTime: new Date(Date.UTC(2026, 0, 1, 0, 201 * 5) - 1).toISOString(),
    close: 1_000_000,
    high: 1_000_001,
  };
  const observedAt = new Date(closed.at(-1)!.closeTime);
  const source = [...closed, forming];

  const liveCandles = selectClosedHistoricalCandles(source, observedAt, 200);
  const liveTechnical = calculateTechnicalAnalysis(liveCandles, "binance");
  const liveDecision = evaluateSignal({
    symbol: "BTCUSDT",
    timeframe: "5m",
    candles: liveCandles,
    technical: liveTechnical,
  });
  const replay = evaluateClosedReplayDecision({ candles: source, timeframe: "5m", observedAt });

  assert.deepEqual(replay.candles, liveCandles);
  assert.deepEqual(replay.technical, liveTechnical);
  assert.deepEqual(replay.evaluation, liveDecision);
  assert.equal(replay.candles.some((candle) => candle.timestamp === forming.timestamp), false);
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
