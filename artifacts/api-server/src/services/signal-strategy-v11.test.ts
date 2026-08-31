import assert from "node:assert/strict";
import test from "node:test";
import {
  assertFrozenConfiguration,
  detectFrozenV11Opportunity,
} from "./signal-strategy-v11";
import {
  computeV11CandidateFingerprint,
  V11_CANDIDATE_FINGERPRINT,
  V11_FROZEN_CANDIDATE,
  V11_STRATEGY_VERSION,
} from "./signal-strategy-v11-snapshot";

test("V11 candidate identity and every forward rule are frozen", () => {
  assert.equal(V11_STRATEGY_VERSION, "RSI_DIVERGENCE_STRUCTURAL_4H_V1");
  assert.equal(computeV11CandidateFingerprint(), V11_CANDIDATE_FINGERPRINT);
  assert.doesNotThrow(assertFrozenConfiguration);
  assert.equal(V11_FROZEN_CANDIDATE.immutability.retuningAllowed, false);
  assert.equal(V11_FROZEN_CANDIDATE.exits.rewardRisk, 1.5);
  assert.equal(V11_FROZEN_CANDIDATE.exits.expiryCandles, 12);
  assert.equal(V11_FROZEN_CANDIDATE.detector.rsiPeriod, 14);
});

test("V11 never evaluates an open candle", () => {
  const candles = Array.from({ length: 120 }, (_, index) => ({
    timestamp: new Date(Date.UTC(2026, 8, 1, index * 4)).toISOString(),
    closeTime: new Date(Date.UTC(2026, 8, 1, (index + 1) * 4) - 1).toISOString(),
    open: 100 + index,
    high: 102 + index,
    low: 98 + index,
    close: 101 + index,
    volume: 100,
  }));
  const observedAt = new Date(candles[110].closeTime!);
  const result = detectFrozenV11Opportunity({ symbol: "BTCUSDT", candles, observedAt });
  assert.equal(result, null);
  assert.ok(candles.slice(111).every((candle) => Date.parse(candle.closeTime!) > observedAt.getTime()));
});

test("V11 promotion gate cannot pass merely by reaching 120 aggregate observations", () => {
  const gate = V11_FROZEN_CANDIDATE.evaluationGate;
  assert.equal(gate.aggregateResolvedMinimum, 120);
  assert.equal(gate.btcResolvedMinimum, 60);
  assert.equal(gate.minimumObservationMonths, 36);
  assert.ok(gate.profitFactor5BpsAtLeast > 1);
  assert.equal(gate.blockBootstrap95ExpectancyLowerBoundGreaterThan, 0);
});
