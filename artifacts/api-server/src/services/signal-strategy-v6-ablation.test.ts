import assert from "node:assert/strict";
import test from "node:test";
import type { ClosedAnalysisCandle } from "./signal-backtest";
import { evaluateSignal } from "./signal-engine";
import { buildV6ResearchEntry, researchDirection } from "./signal-strategy-v6-ablation";
import type { TechnicalAnalysisResult } from "./technical";

test("V6 research mirror matches the frozen live baseline direction", () => {
  const technical = bullishTechnical();
  const live = evaluateSignal({ symbol: "BTCUSDT", timeframe: "15m", candles: [candle()], technical });
  assert.equal(live.outcome, "LONG");
  assert.equal(researchDirection(candle(), technical, null), "LONG");
});

test("V6 ablation removes exactly one filter without changing the frozen baseline", () => {
  const technical = bullishTechnical();
  technical.indicators.volumeRatio = 0.5;
  assert.equal(researchDirection(candle(), technical, null), null);
  assert.equal(researchDirection(candle(), technical, "WITHOUT_VOLUME"), "LONG");
  assert.equal(evaluateSignal({ symbol: "BTCUSDT", timeframe: "15m", candles: [candle()], technical }).outcome, "NO_SIGNAL");
});

test("V6 ablation cannot bypass insufficient data", () => {
  const technical = bullishTechnical();
  technical.status = "INSUFFICIENT_DATA";
  technical.dataQuality.sufficient = false;
  assert.equal(researchDirection(candle(), technical, "WITHOUT_STRUCTURE"), null);
});

test("V6 research mirror preserves the live floating-point R:R rejection", () => {
  const latest = { ...candle(), close: 1.01 };
  const technical = bullishTechnical();
  technical.indicators.ema20 = 1;
  technical.indicators.ema50 = 0.9;
  technical.indicators.ema200 = 0.8;
  technical.indicators.atr14 = 0.1;
  technical.marketStructure.support = -0.1234567;
  technical.marketStructure.resistance = 2;
  const live = evaluateSignal({ symbol: "BTCUSDT", timeframe: "15m", candles: [latest], technical });
  assert.deepEqual(live.outcome === "NO_SIGNAL" ? live.reason : live.outcome, "risk_reward_below_minimum");
  assert.equal(researchDirection(latest, technical, null), "LONG");
  assert.equal(buildV6ResearchEntry(latest, technical, "LONG", "15m", 200, [latest]), null);
});

function candle(): ClosedAnalysisCandle {
  return { timestamp: "2026-01-01T00:00:00.000Z", closeTime: "2026-01-01T00:14:59.999Z", open: 99, high: 101, low: 98, close: 100, volume: 120 };
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
