import assert from "node:assert/strict";
import test from "node:test";
import type { ClosedAnalysisCandle } from "./signal-backtest";
import {
  calculateV8Indicators,
  generateV8Entries,
  isV8CandleClosed,
} from "./signal-strategy-v8";
import {
  computeV8PreregistrationHash,
  V8_FAMILIES,
  V8_PREREGISTRATION,
  V8_PREREGISTRATION_HASH,
} from "./signal-strategy-v8-snapshot";

test("V8 preregistration is frozen before market results", () => {
  assert.notEqual(V8_PREREGISTRATION_HASH, "PENDING");
  assert.equal(computeV8PreregistrationHash(), V8_PREREGISTRATION_HASH);
});

test("V8 closed-candle boundary is deterministic", () => {
  const observedAt = new Date("2026-08-30T12:00:00.000Z");
  assert.equal(isV8CandleClosed("2026-08-30T11:59:59.999Z", observedAt), true);
  assert.equal(isV8CandleClosed("2026-08-30T12:00:00.000Z", observedAt), true);
  assert.equal(isV8CandleClosed("2026-08-30T12:00:00.001Z", observedAt), false);
  assert.equal(isV8CandleClosed("invalid", observedAt), false);
});

test("V8 indicators do not change when future candles are appended", () => {
  const candles = sampleCandles(180);
  const prefix = calculateV8Indicators(candles.slice(0, 150));
  const full = calculateV8Indicators(candles);
  for (const key of Object.keys(prefix) as Array<keyof typeof prefix>) {
    assert.equal(prefix[key][149], full[key][149], `${key} used a future candle`);
  }
});

test("V8 research excludes every candle that is still open", () => {
  const candles = sampleCandles(240);
  const observedAt = new Date(candles[219].closeTime);
  const generated = generateV8Entries({ candles, timeframe: "5m", analysisStart: new Date(candles[100].timestamp), observedAt });
  for (const family of V8_FAMILIES) {
    assert.ok(generated[family].every((entry) => Date.parse(entry.openedAt) <= observedAt.getTime()));
  }
});

test("V8 entries preserve the fixed preregistered geometry", () => {
  const candles = sampleCandles(500);
  const observedAt = new Date(candles.at(-1)!.closeTime);
  const generated = generateV8Entries({ candles, timeframe: "15m", analysisStart: new Date(candles[100].timestamp), observedAt });
  for (const family of V8_FAMILIES) {
    for (const entry of generated[family]) {
      assert.equal(entry.baselineRiskReward, 1.5);
      assert.ok(entry.v8.stopAtr >= V8_PREREGISTRATION.commonRisk.minimumStopAtr);
      assert.ok(entry.v8.stopAtr <= V8_PREREGISTRATION.commonRisk.maximumStopAtr);
      assert.equal(entry.v8.family, family);
    }
  }
});

test("V8 preregistration has a bounded hypothesis set and no live side effects", () => {
  assert.equal(V8_FAMILIES.length, 6);
  assert.equal(V8_PREREGISTRATION.liveIntegration, false);
  assert.equal(V8_PREREGISTRATION.schedulerChanged, false);
  assert.equal(V8_PREREGISTRATION.databaseWrites, false);
  assert.equal(V8_PREREGISTRATION.telegramCalls, false);
  assert.equal(V8_PREREGISTRATION.selection.noPostResultRetuning, true);
});

function sampleCandles(count: number): ClosedAnalysisCandle[] {
  const start = Date.parse("2026-01-01T00:00:00.000Z");
  let previous = 50_000;
  return Array.from({ length: count }, (_, index) => {
    const trend = index * 2.2;
    const wave = Math.sin(index / 4) * 120 + Math.sin(index / 17) * 240;
    const close = 50_000 + trend + wave;
    const open = previous;
    const high = Math.max(open, close) + 35 + Math.abs(Math.sin(index)) * 30;
    const low = Math.min(open, close) - 35 - Math.abs(Math.cos(index)) * 30;
    const timestamp = new Date(start + index * 300_000).toISOString();
    const closeTime = new Date(start + (index + 1) * 300_000 - 1).toISOString();
    previous = close;
    return { timestamp, closeTime, open, high, low, close, volume: 100 + (index % 13) * 8 };
  });
}
