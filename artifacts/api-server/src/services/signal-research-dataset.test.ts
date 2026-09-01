import assert from "node:assert/strict";
import test from "node:test";
import { inspectResearchDataset, researchDatasetChecksum } from "./signal-research-dataset";
import type { ClosedAnalysisCandle } from "./signal-backtest";

test("research dataset metadata is deterministic and reports temporal gaps without filling them", () => {
  const candles = [candle(0), candle(1), candle(3)];
  const input = {
    symbol: "BTCUSDT",
    timeframe: "5m" as const,
    candles,
    start: new Date(candles[0].timestamp),
    endExclusive: new Date(Date.parse(candles.at(-1)!.timestamp) + 5 * 60_000),
    observedAt: new Date(candles.at(-1)!.closeTime),
  };
  const first = inspectResearchDataset(input);
  const repeated = inspectResearchDataset(input);

  assert.deepEqual(repeated, first);
  assert.equal(first.quality.gaps, 1);
  assert.equal(first.candleCount, 3);
  assert.equal(first.invalidOhlc, 0);
  assert.equal(first.sha256, researchDatasetChecksum(candles));
});

test("research checksum changes when an OHLC value changes", () => {
  const candles = [candle(0), candle(1)];
  const modified = [candles[0], { ...candles[1], close: candles[1].close + 0.01 }];
  assert.notEqual(researchDatasetChecksum(candles), researchDatasetChecksum(modified));
});

test("research metadata rejects open and invalid candles through explicit diagnostics", () => {
  const valid = candle(0);
  const open = { ...candle(1), closeTime: "2026-01-01T00:20:00.000Z" };
  const invalid = { ...candle(2), high: 90 };
  const metadata = inspectResearchDataset({
    symbol: "BTCUSDT",
    timeframe: "5m",
    candles: [valid, open, invalid],
    start: new Date(valid.timestamp),
    endExclusive: new Date("2026-01-01T00:15:00.000Z"),
    observedAt: new Date("2026-01-01T00:14:59.999Z"),
  });

  assert.equal(metadata.quality.incompleteCandles, 1);
  assert.equal(metadata.invalidOhlc, 1);
});

function candle(index: number): ClosedAnalysisCandle {
  const openTime = Date.UTC(2026, 0, 1, 0, index * 5);
  return {
    timestamp: new Date(openTime).toISOString(),
    closeTime: new Date(openTime + 5 * 60_000 - 1).toISOString(),
    open: 100 + index,
    high: 102 + index,
    low: 99 + index,
    close: 101 + index,
    volume: 10 + index,
  };
}
