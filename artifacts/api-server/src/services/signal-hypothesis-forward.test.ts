import assert from "node:assert/strict";
import test from "node:test";
import type { BacktestTrade } from "./signal-backtest";
import {
  FROZEN_1H_EXTERNAL_ASSETS,
  FROZEN_1H_FORWARD_CUTOFF,
  FROZEN_1H_HYPOTHESIS,
  FROZEN_1H_HYPOTHESIS_HASH,
  computeFrozen1hHypothesisHash,
  frozen1hExitConfiguration,
  mergeForwardResearchLedger,
  toForwardResearchLedgerRow,
} from "./signal-hypothesis-forward";

test("the 1h hypothesis snapshot and external asset set are immutable and hash-verified", () => {
  assert.equal(Object.isFrozen(FROZEN_1H_HYPOTHESIS), true);
  assert.equal(Object.isFrozen(FROZEN_1H_HYPOTHESIS.entryRules), true);
  assert.deepEqual(FROZEN_1H_EXTERNAL_ASSETS, ["ETHUSDT", "BNBUSDT", "SOLUSDT"]);
  assert.equal(computeFrozen1hHypothesisHash(), FROZEN_1H_HYPOTHESIS_HASH);
});

test("the frozen exit is the exact V3 1h candidate configuration", () => {
  assert.deepEqual(frozen1hExitConfiguration(), {
    name: "V3_ATR_1_5_RR1_5_E12",
    riskMode: "ATR",
    atrMultiple: 1.5,
    rewardRisk: 1.5,
    expiryCandles: 12,
  });
});

test("forward observations must be BTC 1h and strictly after the cutoff", () => {
  assert.throws(() => ledgerRow(trade(), FROZEN_1H_FORWARD_CUTOFF), /strictly after/);
  assert.throws(() => ledgerRow(trade({ timeframe: "15m" })), /only 1h/);
  const row = ledgerRow(trade());
  assert.equal(row.asset, "BTCUSDT");
  assert.equal(row.timestamp, "2026-08-28T01:59:59.999Z");
  assert.equal(row.entryCandleOpenTime, "2026-08-28T01:00:00.000Z");
  assert.equal(row.configHash, FROZEN_1H_HYPOTHESIS_HASH);
  assert.deepEqual(row.assumedCostsBps, [5, 10]);
});

test("forward ledger deduplicates observations and permits only resolution updates", () => {
  const open = ledgerRow(trade({
    openedAt: "2026-08-28T01:00:00.000Z",
    outcome: "CENSORED",
    realizedR: null,
  }));
  const settled = ledgerRow(trade({
    openedAt: "2026-08-28T01:00:00.000Z",
    outcome: "WIN",
    realizedR: 1.5,
    closedAt: "2026-08-28T04:00:00.000Z",
    durationCandles: 3,
    durationMs: 10_800_000,
  }));
  const merged = mergeForwardResearchLedger([open], [open, settled]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0]?.result, "WIN");
});

function ledgerRow(value: BacktestTrade, evaluatedAt = "2026-08-28T01:59:59.999Z") {
  return toForwardResearchLedgerRow({ trade: value, evaluatedAt });
}

function trade(overrides: Partial<BacktestTrade> = {}): BacktestTrade {
  return {
    timeframe: "1h",
    direction: "LONG",
    entryIndex: 200,
    openedAt: "2026-08-28T01:00:00.000Z",
    entryPrice: 100,
    baselineStopLoss: 99,
    baselineTakeProfit: 101.5,
    baselineRiskReward: 1.5,
    atrAtEntry: 1,
    configuration: "V3_ATR_1_5_RR1_5_E12",
    stopLoss: 98.5,
    takeProfit: 102.25,
    riskUsd: 1.5,
    riskPct: 1.5,
    targetUsd: 2.25,
    targetPct: 2.25,
    stopAtr: 1.5,
    targetAtr: 2.25,
    outcome: "EXPIRED",
    closedAt: "2026-08-28T13:00:00.000Z",
    durationCandles: 12,
    durationMs: 43_200_000,
    realizedR: 0.1,
    mfeUsd: 1,
    maeUsd: 0.5,
    mfePct: 1,
    maePct: 0.5,
    mfeR: 0.67,
    maeR: 0.33,
    mfeAtr: 1,
    maeAtr: 0.5,
    timeToMfeCandles: 4,
    timeToMaeCandles: 2,
    postExpiryOutcome: "NEITHER",
    postExpiryAdditionalCandles: null,
    ...overrides,
  };
}
