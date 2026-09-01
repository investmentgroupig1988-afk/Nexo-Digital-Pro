import assert from "node:assert/strict";
import test from "node:test";
import type { BacktestTrade } from "./signal-backtest";
import {
  approximateBreakEvenBps,
  deterministicBlockBootstrap,
  frozenSensitivityGrid,
  independentTwoYearWindows,
  rollingTwoYearWindows,
} from "./signal-hypothesis-robustness";

test("sensitivity surface is the predeclared 3x3 neighborhood and contains the frozen point", () => {
  const grid = frozenSensitivityGrid();
  assert.equal(grid.length, 9);
  assert.deepEqual([...new Set(grid.map((item) => item.atrMultiple))], [1.4, 1.5, 1.6]);
  assert.deepEqual([...new Set(grid.map((item) => item.expiryCandles))], [10, 12, 14]);
  assert.equal(grid.filter((item) => item.atrMultiple === 1.5 && item.expiryCandles === 12).length, 1);
  assert.ok(grid.every((item) => item.rewardRisk === 1.5));
});

test("independent and rolling windows are fixed through the frozen cutoff", () => {
  assert.equal(independentTwoYearWindows().length, 4);
  assert.equal(rollingTwoYearWindows().length, 7);
  assert.equal(independentTwoYearWindows().at(-1)?.end, "2026-08-28T00:00:00.000Z");
  assert.equal(rollingTwoYearWindows().at(-1)?.end, "2026-08-28T00:00:00.000Z");
});

test("break-even cost is derived from gross R and risk percent without selecting a tested cost", () => {
  const trades = [trade(0.5, 1), trade(0.5, -0.5)];
  assert.equal(approximateBreakEvenBps(trades), 12.5);
  assert.equal(approximateBreakEvenBps([trade(0.5, -0.1)]), 0);
  assert.equal(approximateBreakEvenBps([]), null);
});

test("block bootstrap is deterministic and reports sampling uncertainty", () => {
  const trades = Array.from({ length: 30 }, (_, index) => trade(0.5, index % 3 === 0 ? 1.5 : -0.4));
  const first = deterministicBlockBootstrap({ trades, iterations: 500, blockLength: 5, seed: 123 });
  const second = deterministicBlockBootstrap({ trades, iterations: 500, blockLength: 5, seed: 123 });
  assert.deepEqual(first, second);
  assert.equal(first?.sampleSize, 30);
  assert.equal(first?.frictionBps, 5);
  assert.ok((first?.maximumDrawdownR.p95 ?? 0) >= (first?.maximumDrawdownR.p50 ?? 0));
  assert.ok((first?.expectancyR.p2_5 ?? 1) <= (first?.expectancyR.p97_5 ?? 0));
});

function trade(riskPct: number, realizedR: number): BacktestTrade {
  return {
    timeframe: "1h",
    direction: "LONG",
    entryIndex: 200,
    openedAt: "2020-01-01T00:00:00.000Z",
    entryPrice: 100,
    baselineStopLoss: 99,
    baselineTakeProfit: 101.5,
    baselineRiskReward: 1.5,
    atrAtEntry: 1,
    configuration: "FROZEN",
    stopLoss: 99,
    takeProfit: 101.5,
    riskUsd: 1,
    riskPct,
    targetUsd: 1.5,
    targetPct: 1.5,
    stopAtr: 1.5,
    targetAtr: 2.25,
    outcome: realizedR > 0 ? "WIN" : "LOSS",
    closedAt: "2020-01-01T01:00:00.000Z",
    durationCandles: 1,
    durationMs: 3_600_000,
    realizedR,
    mfeUsd: 1,
    maeUsd: 1,
    mfePct: 1,
    maePct: 1,
    mfeR: 1,
    maeR: 1,
    mfeAtr: 1,
    maeAtr: 1,
    timeToMfeCandles: 1,
    timeToMaeCandles: 1,
    postExpiryOutcome: null,
    postExpiryAdditionalCandles: null,
  };
}
