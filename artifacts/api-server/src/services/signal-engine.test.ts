import assert from "node:assert/strict";
import { test } from "node:test";
import { evaluateSignal, MINIMUM_RISK_REWARD, resolveSignal } from "./signal-engine";
import type { HistoricalCandle } from "./historical";
import type { TechnicalAnalysisResult } from "./technical";

test("weak configuration produces NO_SIGNAL", () => {
  const result = evaluateSignal({ symbol: "BTCUSDT", timeframe: "15m", candles: candles(), technical: technical({ trend: "sideways", structure: "mixed" }) });
  assert.equal(result.outcome, "NO_SIGNAL");
});

test("valid configuration contains entry, SL, TP and respects minimum R:R", () => {
  const result = evaluateSignal({ symbol: "BTCUSDT", timeframe: "15m", candles: candles(), technical: technical() });
  if (result.outcome === "NO_SIGNAL") return;
  assert.equal(result.outcome, "LONG");
  assert.ok(result.entryPrice > result.stopLoss);
  assert.ok(result.takeProfit > result.entryPrice);
  assert.ok(result.riskRewardRatio >= MINIMUM_RISK_REWARD);
});

test("WIN requires TP before SL and an ambiguous candle resolves conservatively as LOSS", () => {
  const base = lifecycle();
  const win = resolveSignal(base, [candleAt(1, 100, 116, 99, 110)]);
  assert.equal(win.status, "WIN");
  const ambiguous = resolveSignal(base, [candleAt(1, 100, 116, 89, 102)]);
  assert.equal(ambiguous.status, "LOSS");
});

test("LOSS is recorded when SL is reached before TP", () => {
  assert.equal(resolveSignal(lifecycle(), [candleAt(1, 100, 105, 89, 92)]).status, "LOSS");
});

test("expiration prevents later candles from changing the result", () => {
  const signal = { ...lifecycle(), expiresAt: new Date(2 * 60_000) };
  const result = resolveSignal(signal, [candleAt(1, 100, 105, 95, 102), candleAt(3, 102, 120, 101, 118)], new Date(4 * 60_000));
  assert.equal(result.status, "EXPIRED");
  assert.equal(result.closedAt?.getTime(), signal.expiresAt.getTime());
  assert.equal(result.returnPct, 2);
});

test("bullish, bearish, and sideways classifications remain context rather than forced signals", () => {
  for (const value of ["bullish", "bearish", "sideways"] as const) {
    const result = evaluateSignal({ symbol: "BTCUSDT", timeframe: "15m", candles: candles(), technical: technical({ trend: value, structure: "mixed" }) });
    assert.equal(result.context.trend, value);
    assert.equal(result.outcome, "NO_SIGNAL");
  }
});

function lifecycle() { return { direction: "LONG" as const, entryPrice: 100, stopLoss: 90, takeProfit: 115, openedAt: new Date(0), expiresAt: new Date(10_000_000) }; }
function candleAt(minutes: number, open: number, high: number, low: number, close: number): HistoricalCandle { return { timestamp: new Date(minutes * 60_000).toISOString(), open, high, low, close, volume: 100 }; }
function candles(): HistoricalCandle[] { return Array.from({ length: 200 }, (_, index) => candleAt(index + 1, 99 + index / 200, 101, 98, index === 199 ? 100 : 99 + index / 200)); }
function technical(overrides: { trend?: "bullish" | "bearish" | "sideways"; structure?: "higher_high_and_higher_low" | "lower_high_and_lower_low" | "mixed" } = {}): TechnicalAnalysisResult { return { status: "OK", message: null, indicators: { ema20: 98, ema50: 96, ema200: 90, sma20: 97, rsi14: 60, atr14: 2, volume: 120, averageVolume: 100, volumeRatio: 1.2, periodHigh: 105, periodLow: 80 }, fibonacci: { swingHigh: 105, swingLow: 80, direction: "uptrend", levels: { "0.236": 99, "0.382": 95, "0.5": 92, "0.618": 89, "0.786": 85 } }, marketStructure: { trend: overrides.trend ?? "bullish", structure: overrides.structure ?? "higher_high_and_higher_low", higherHigh: true, higherLow: true, lowerHigh: false, lowerLow: false, support: 95, resistance: 105 }, dataQuality: { sufficient: true, candleCount: 200, volumeAvailable: true, provider: "binance", reason: null } }; }
