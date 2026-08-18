import assert from "node:assert/strict";
import { test } from "node:test";
import { calculateTechnicalAnalysis } from "./technical";

test("technical analysis uses supplied candles and reports their provenance", () => {
  const candles = Array.from({ length: 200 }, (_, index) => {
    const close = 100 + index;
    return {
      timestamp: new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString(),
      open: close - 0.5,
      high: close + 1,
      low: close - 1,
      close,
      volume: index + 1,
    };
  });

  const result = calculateTechnicalAnalysis(candles, "binance");

  assert.equal(result.status, "OK");
  assert.equal(result.dataQuality.candleCount, 200);
  assert.equal(result.dataQuality.provider, "binance");
  assert.equal(result.indicators.ema200, 199.5);
  assert.equal(result.indicators.volume, 200);
});
