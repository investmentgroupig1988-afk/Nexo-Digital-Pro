import assert from "node:assert/strict";
import test from "node:test";
import type { ClosedAnalysisCandle } from "./signal-backtest";
import { generateV9Entries, matchV9Abcd, matchV9DoublePattern, matchV9HeadShoulders, type V9Pivot } from "./signal-strategy-v9";
import { computeV9PreregistrationHash, V9_FAMILIES, V9_PREREGISTRATION, V9_PREREGISTRATION_HASH } from "./signal-strategy-v9-snapshot";

test("V9 preregistration is frozen before the market replay", () => {
  assert.equal(computeV9PreregistrationHash(), V9_PREREGISTRATION_HASH);
  assert.equal(V9_FAMILIES.length, 4);
  assert.equal(V9_PREREGISTRATION.selection.noPostResultRetuning, true);
});

test("double top and double bottom require comparable confirmed extrema and neckline depth", () => {
  const top = matchV9DoublePattern([
    pivot(0, "HIGH", 100), pivot(10, "LOW", 90), pivot(20, "HIGH", 100.2),
  ], 1);
  assert.deepEqual(top, { direction: "SHORT", neckline: 90, stopAnchor: 100.2 });
  const bottom = matchV9DoublePattern([
    pivot(0, "LOW", 90), pivot(10, "HIGH", 100), pivot(20, "LOW", 89.8),
  ], 1);
  assert.deepEqual(bottom, { direction: "LONG", neckline: 100, stopAnchor: 89.8 });
  assert.equal(matchV9DoublePattern([
    pivot(0, "HIGH", 100), pivot(10, "LOW", 99.5), pivot(20, "HIGH", 100.1),
  ], 1), null);
});

test("head and shoulders is symmetric, has a distinct head and is directionally classified", () => {
  const result = matchV9HeadShoulders([
    pivot(0, "HIGH", 100), pivot(5, "LOW", 92), pivot(12, "HIGH", 104), pivot(18, "LOW", 91), pivot(24, "HIGH", 100.5),
  ], 2);
  assert.equal(result?.direction, "SHORT");
  assert.equal(result?.stopAnchor, 104);
  assert.equal(result?.necklineA.price, 92);
  assert.equal(result?.necklineB.price, 91);
});

test("AB=CD reversal uses the fixed ratio window without future candles", () => {
  const bearish = matchV9Abcd([
    pivot(0, "LOW", 100), pivot(5, "HIGH", 110), pivot(10, "LOW", 104), pivot(15, "HIGH", 114),
  ]);
  assert.equal(bearish?.direction, "SHORT");
  assert.equal(bearish?.bcRatio, 0.6);
  assert.equal(bearish?.cdRatio, 1);
  assert.equal(matchV9Abcd([
    pivot(0, "LOW", 100), pivot(5, "HIGH", 110), pivot(10, "LOW", 101), pivot(15, "HIGH", 112),
  ]), null);
});

test("an appended still-open candle cannot change any V9 entry", () => {
  const closed = oscillatingCandles(180);
  const observedAt = new Date(closed.at(-1)!.closeTime);
  const withoutOpen = generateV9Entries({ candles: closed, timeframe: "15m", analysisStart: new Date(closed[100].timestamp), observedAt });
  const lastClose = closed.at(-1)!.close;
  const open = candle(180, lastClose * 3, lastClose * 4, lastClose * 0.1, lastClose * 2, observedAt.getTime() + 900_000);
  const withOpen = generateV9Entries({ candles: [...closed, open], timeframe: "15m", analysisStart: new Date(closed[100].timestamp), observedAt });
  assert.deepEqual(indexes(withOpen), indexes(withoutOpen));
});

test("V9 tooling declares no live, database, scheduler or Telegram side effects", () => {
  assert.equal(V9_PREREGISTRATION.liveIntegration, false);
  assert.equal(V9_PREREGISTRATION.schedulerChanged, false);
  assert.equal(V9_PREREGISTRATION.databaseWrites, false);
  assert.equal(V9_PREREGISTRATION.telegramCalls, false);
});

function pivot(index: number, type: V9Pivot["type"], price: number): V9Pivot {
  return { index, type, price };
}

function indexes(value: ReturnType<typeof generateV9Entries>) {
  return Object.fromEntries(Object.entries(value).map(([family, entries]) => [family, entries.map((entry) => entry.entryIndex)]));
}

function oscillatingCandles(count: number): ClosedAnalysisCandle[] {
  return Array.from({ length: count }, (_, index) => {
    const close = 100 + Math.sin(index / 4) * 5 + Math.sin(index / 13) * 2;
    const previous = index === 0 ? close : 100 + Math.sin((index - 1) / 4) * 5 + Math.sin((index - 1) / 13) * 2;
    return candle(index, previous, Math.max(previous, close) + 1, Math.min(previous, close) - 1, close, Date.UTC(2026, 0, 1) + (index + 1) * 900_000);
  });
}

function candle(index: number, open: number, high: number, low: number, close: number, closeTime: number): ClosedAnalysisCandle {
  return {
    timestamp: new Date(closeTime - 900_000).toISOString(),
    closeTime: new Date(closeTime).toISOString(),
    open,
    high,
    low,
    close,
    volume: 1_000 + index,
  };
}
