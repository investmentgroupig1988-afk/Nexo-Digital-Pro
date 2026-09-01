import { createHash } from "node:crypto";
import {
  netRealizedR,
  type BacktestTrade,
  type ExitConfiguration,
} from "./signal-backtest";
import {
  FROZEN_1H_FORWARD_CUTOFF,
  FROZEN_1H_HYPOTHESIS,
  FROZEN_1H_HYPOTHESIS_HASH,
  FROZEN_1H_HYPOTHESIS_ID,
} from "./signal-hypothesis-snapshot";

export {
  FROZEN_1H_EXTERNAL_ASSETS,
  FROZEN_1H_FORWARD_CUTOFF,
  FROZEN_1H_HYPOTHESIS,
  FROZEN_1H_HYPOTHESIS_HASH,
  FROZEN_1H_HYPOTHESIS_ID,
  computeFrozen1hHypothesisHash,
  type FrozenExternalAsset,
} from "./signal-hypothesis-snapshot";

export type ForwardResearchLedgerRow = {
  id: string;
  hypothesisId: typeof FROZEN_1H_HYPOTHESIS_ID;
  configHash: string;
  asset: "BTCUSDT";
  timestamp: string;
  entryCandleOpenTime: string;
  timeframe: "1h";
  direction: BacktestTrade["direction"];
  theoreticalEntry: number;
  stopLoss: number;
  takeProfit: number;
  result: BacktestTrade["outcome"];
  grossRealizedR: number | null;
  netRealizedR5Bps: number | null;
  netRealizedR10Bps: number | null;
  assumedCostsBps: readonly [5, 10];
  durationCandles: number | null;
  durationMs: number | null;
  closedAt: string | null;
};

export function frozen1hExitConfiguration(): ExitConfiguration {
  return {
    name: FROZEN_1H_HYPOTHESIS.exit.name,
    riskMode: FROZEN_1H_HYPOTHESIS.exit.riskMode,
    atrMultiple: FROZEN_1H_HYPOTHESIS.exit.atrMultiple,
    rewardRisk: FROZEN_1H_HYPOTHESIS.exit.rewardRisk,
    expiryCandles: FROZEN_1H_HYPOTHESIS.exit.expiryCandles,
  };
}

export function toForwardResearchLedgerRow(input: {
  trade: BacktestTrade;
  evaluatedAt: string;
}): ForwardResearchLedgerRow {
  const { trade } = input;
  if (trade.timeframe !== "1h") {
    throw new Error("The frozen forward ledger accepts only 1h trades.");
  }
  const evaluatedAt = Date.parse(input.evaluatedAt);
  if (!Number.isFinite(evaluatedAt) || evaluatedAt <= Date.parse(FROZEN_1H_FORWARD_CUTOFF)) {
    throw new Error(`Forward observations must start strictly after ${FROZEN_1H_FORWARD_CUTOFF}.`);
  }
  const id = createHash("sha256").update([
    FROZEN_1H_HYPOTHESIS_HASH,
    "BTCUSDT",
    input.evaluatedAt,
    trade.direction,
    trade.entryPrice,
  ].join(":" )).digest("hex");
  return {
    id,
    hypothesisId: FROZEN_1H_HYPOTHESIS_ID,
    configHash: FROZEN_1H_HYPOTHESIS_HASH,
    asset: "BTCUSDT",
    timestamp: input.evaluatedAt,
    entryCandleOpenTime: trade.openedAt,
    timeframe: "1h",
    direction: trade.direction,
    theoreticalEntry: trade.entryPrice,
    stopLoss: trade.stopLoss,
    takeProfit: trade.takeProfit,
    result: trade.outcome,
    grossRealizedR: trade.realizedR,
    netRealizedR5Bps: netRealizedR(trade, 5),
    netRealizedR10Bps: netRealizedR(trade, 10),
    assumedCostsBps: [5, 10],
    durationCandles: trade.durationCandles,
    durationMs: trade.durationMs,
    closedAt: trade.closedAt,
  };
}

export function mergeForwardResearchLedger(
  existing: ForwardResearchLedgerRow[],
  incoming: ForwardResearchLedgerRow[],
): ForwardResearchLedgerRow[] {
  const rows = new Map(existing.map((row) => [row.id, row]));
  for (const row of incoming) {
    validateForwardResearchLedgerRow(row);
    const previous = rows.get(row.id);
    if (previous === undefined || (previous.result === "CENSORED" && row.result !== "CENSORED")) {
      rows.set(row.id, row);
    }
  }
  return [...rows.values()].sort((left, right) => Date.parse(left.timestamp) - Date.parse(right.timestamp));
}

export function validateForwardResearchLedgerRow(row: ForwardResearchLedgerRow): void {
  if (row.hypothesisId !== FROZEN_1H_HYPOTHESIS_ID || row.configHash !== FROZEN_1H_HYPOTHESIS_HASH) {
    throw new Error("Forward ledger row does not match the frozen hypothesis.");
  }
  if (row.asset !== "BTCUSDT" || row.timeframe !== "1h") {
    throw new Error("Forward ledger row is outside the frozen BTCUSDT 1h scope.");
  }
  if (Date.parse(row.timestamp) <= Date.parse(FROZEN_1H_FORWARD_CUTOFF)) {
    throw new Error("Forward ledger row is not after the frozen cutoff.");
  }
}
