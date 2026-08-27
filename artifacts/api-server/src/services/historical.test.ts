import assert from "node:assert/strict";
import test from "node:test";
import {
  isCandleClosedAt,
  selectClosedBinanceCandles,
  type BinanceKline,
  type HistoricalTimeframe,
} from "./historical";
import { evaluateSignal } from "./signal-engine";
import { calculateTechnicalAnalysis } from "./technical";
import type { TechnicalAnalysisResult } from "./technical";

const TIMEFRAME_MS: Record<Exclude<HistoricalTimeframe, "1m">, number> = {
  "5m": 5 * 60_000,
  "15m": 15 * 60_000,
  "1h": 60 * 60_000,
  "4h": 4 * 60 * 60_000,
};

for (const [timeframe, intervalMs] of Object.entries(TIMEFRAME_MS)) {
  test(`${timeframe} includes a candle at its exact close and excludes the next open candle`, () => {
    const start = Date.UTC(2026, 7, 27, 12);
    const closed = kline(start, intervalMs, 100);
    const open = kline(start + intervalMs, intervalMs, 101);
    const observedAt = closed[6];

    assert.equal(isCandleClosedAt(closed[6], observedAt), true);
    assert.equal(isCandleClosedAt(open[6], observedAt), false);
    assert.deepEqual(
      selectClosedBinanceCandles([closed, open], observedAt, 2).map((candle) => candle.timestamp),
      [new Date(start).toISOString()],
    );
  });
}

test("several closed candles plus one forming candle deliver only closed input", () => {
  const intervalMs = TIMEFRAME_MS["15m"];
  const start = Date.UTC(2026, 7, 27, 0);
  const raw = [0, 1, 2, 3].map((index) => kline(start + intervalMs * index, intervalMs, 100 + index));
  const observedAt = raw[2][6];

  const selected = selectClosedBinanceCandles(raw, observedAt, 3);

  assert.equal(selected.length, 3);
  assert.deepEqual(selected.map((candle) => candle.timestamp), raw.slice(0, 3).map((candle) => new Date(candle[0]).toISOString()));
  assert.equal(selected.some((candle) => candle.timestamp === new Date(raw[3][0]).toISOString()), false);
});

test("removing a forming candle preserves the evaluated signal fingerprint", () => {
  const intervalMs = TIMEFRAME_MS["5m"];
  const start = Date.UTC(2026, 7, 26, 0);
  const closedRaw = Array.from({ length: 200 }, (_, index) => kline(start + intervalMs * index, intervalMs, index === 199 ? 100 : 99));
  const forming = kline(start + intervalMs * 200, intervalMs, 130);
  const observedAt = closedRaw.at(-1)![6];
  const closedOnly = selectClosedBinanceCandles(closedRaw, observedAt, 200);
  const withFormingCandle = selectClosedBinanceCandles([...closedRaw, forming], observedAt, 200);

  assert.deepEqual(withFormingCandle, closedOnly);
  const first = evaluateSignal({ symbol: "BTCUSDT", timeframe: "5m", candles: closedOnly, technical: bullishTechnical() });
  const repeated = evaluateSignal({ symbol: "BTCUSDT", timeframe: "5m", candles: withFormingCandle, technical: bullishTechnical() });
  assert.equal(first.outcome, "LONG");
  assert.equal(repeated.outcome, "LONG");
  assert.equal(repeated.configurationFingerprint, first.configurationFingerprint);
  assert.equal(repeated.openedAt.toISOString(), first.openedAt.toISOString());
});

test("too few closed candles after filtering fails safely with NO_SIGNAL", () => {
  const intervalMs = TIMEFRAME_MS["5m"];
  const start = Date.UTC(2026, 7, 26, 0);
  const closedRaw = Array.from({ length: 199 }, (_, index) => kline(start + intervalMs * index, intervalMs, 99));
  const forming = kline(start + intervalMs * 199, intervalMs, 130);
  const observedAt = closedRaw.at(-1)![6];
  const selected = selectClosedBinanceCandles([...closedRaw, forming], observedAt, 200);
  const technical = calculateTechnicalAnalysis(selected, "binance");
  const result = evaluateSignal({ symbol: "BTCUSDT", timeframe: "5m", candles: selected, technical });

  assert.equal(selected.length, 199);
  assert.equal(technical.status, "INSUFFICIENT_DATA");
  assert.equal(result.outcome, "NO_SIGNAL");
  if (result.outcome === "NO_SIGNAL") assert.equal(result.reason, "insufficient_data");
});

function kline(openTime: number, intervalMs: number, close: number): BinanceKline {
  return [openTime, "99", "101", "98", String(close), "120", openTime + intervalMs - 1, "0", 1, "0", "0", "0"];
}

function bullishTechnical(): TechnicalAnalysisResult {
  return {
    status: "OK",
    message: null,
    indicators: { ema20: 98, ema50: 96, ema200: 90, sma20: 97, rsi14: 60, atr14: 2, volume: 120, averageVolume: 100, volumeRatio: 1.2, periodHigh: 105, periodLow: 80 },
    fibonacci: { swingHigh: 105, swingLow: 80, direction: "uptrend", levels: { "0.236": 99, "0.382": 95, "0.5": 92, "0.618": 89, "0.786": 85 } },
    marketStructure: { trend: "bullish", structure: "higher_high_and_higher_low", higherHigh: true, higherLow: true, lowerHigh: false, lowerLow: false, support: 95, resistance: 105 },
    dataQuality: { sufficient: true, candleCount: 200, volumeAvailable: true, provider: "binance", reason: null },
  };
}
