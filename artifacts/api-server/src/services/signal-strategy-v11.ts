import { selectClosedHistoricalCandles, type HistoricalCandle } from "./historical";
import type { ClosedAnalysisCandle } from "./signal-backtest";
import { generateV8Entries } from "./signal-strategy-v8";
import { V8_PREREGISTRATION_HASH } from "./signal-strategy-v8-snapshot";
import {
  computeV11CandidateFingerprint,
  V11_CANDIDATE_FINGERPRINT,
  V11_FROZEN_CANDIDATE,
  V11_STRATEGY_VERSION,
  type V11ShadowSymbol,
} from "./signal-strategy-v11-snapshot";

const FOUR_HOURS_MS = 4 * 60 * 60 * 1_000;

export type FrozenV11Opportunity = {
  strategyVersion: typeof V11_STRATEGY_VERSION;
  strategyFingerprint: typeof V11_CANDIDATE_FINGERPRINT;
  symbol: V11ShadowSymbol;
  timeframe: "4h";
  sourceCandleCloseAt: Date;
  hypotheticalEntry: number;
  hypotheticalStop: number;
  hypotheticalTarget: number;
  direction: "LONG" | "SHORT";
  expiresAt: Date;
  technicalSnapshot: Record<string, unknown>;
};

export function detectFrozenV11Opportunity(input: {
  symbol: V11ShadowSymbol;
  candles: HistoricalCandle[];
  observedAt: Date;
}): FrozenV11Opportunity | null {
  assertFrozenConfiguration();
  const eligible = input.candles.filter(
    (candle): candle is ClosedAnalysisCandle => typeof candle.closeTime === "string",
  );
  const closed = selectClosedHistoricalCandles(eligible, input.observedAt);
  if (closed.length < 101) return null;

  const latestIndex = closed.length - 1;
  const latest = closed[latestIndex];
  const generated = generateV8Entries({
    candles: closed,
    timeframe: "4h",
    // Replay the complete warm history so pending divergence/confirmation state
    // evolves exactly as it did in research; only the latest entry is eligible
    // for forward persistence below.
    analysisStart: new Date(closed[100].timestamp),
    observedAt: input.observedAt,
  }).RSI_DIVERGENCE_STRUCTURE;
  const entry = generated.find((candidate) => candidate.entryIndex === latestIndex);
  if (!entry) return null;

  const sourceCandleCloseAt = new Date(entry.openedAt);
  if (sourceCandleCloseAt < new Date(V11_FROZEN_CANDIDATE.forwardCohort.eligibleAfter)) return null;
  return {
    strategyVersion: V11_STRATEGY_VERSION,
    strategyFingerprint: V11_CANDIDATE_FINGERPRINT,
    symbol: input.symbol,
    timeframe: "4h",
    sourceCandleCloseAt,
    hypotheticalEntry: entry.entryPrice,
    hypotheticalStop: entry.baselineStopLoss,
    hypotheticalTarget: entry.baselineTakeProfit,
    direction: entry.direction,
    expiresAt: new Date(
      sourceCandleCloseAt.getTime() + V11_FROZEN_CANDIDATE.exits.expiryCandles * FOUR_HOURS_MS,
    ),
    technicalSnapshot: {
      detectorFamily: entry.v8.family,
      sourcePreregistrationHash: V8_PREREGISTRATION_HASH,
      candidateFingerprint: V11_CANDIDATE_FINGERPRINT,
      atrAtEntry: entry.atrAtEntry,
      stopAtr: entry.v8.stopAtr,
      rsiAtEntry: entry.rsiAtEntry,
      diagnostics: entry.v8.diagnostics,
      sourceCandleCloseAt: entry.openedAt,
    },
  };
}

export function assertFrozenConfiguration(): void {
  if (V8_PREREGISTRATION_HASH !== V11_FROZEN_CANDIDATE.sourceResearch.preregistrationHash) {
    throw new Error("V11 source research fingerprint no longer matches the frozen candidate.");
  }
  if (computeV11CandidateFingerprint() !== V11_CANDIDATE_FINGERPRINT) {
    throw new Error("V11 candidate configuration changed without a new strategy version.");
  }
}
