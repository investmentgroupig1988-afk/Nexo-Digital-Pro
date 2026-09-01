import assert from "node:assert/strict";
import test from "node:test";
import {
  V6_ENTRY_FAMILIES,
  V6_PREREGISTRATION,
  V6_PREREGISTRATION_HASH,
  V6_TIMEFRAMES,
  computeV6PreregistrationHash,
} from "./signal-strategy-v6-snapshot";

test("V6 preregistration is immutable and hash-verified before results", () => {
  assert.equal(computeV6PreregistrationHash(), V6_PREREGISTRATION_HASH);
  assert.equal(Object.isFrozen(V6_PREREGISTRATION), true);
  assert.equal(Object.isFrozen(V6_PREREGISTRATION.exitResearch), true);
  assert.equal(V6_PREREGISTRATION.commercialStrategyChanged, false);
  assert.equal(V6_PREREGISTRATION.databaseWrites, false);
  assert.equal(V6_PREREGISTRATION.telegramCalls, false);
});

test("V6 has bounded timeframes, entry hypotheses and exit search spaces", () => {
  assert.deepEqual(V6_TIMEFRAMES, ["5m", "15m", "1h", "4h"]);
  assert.equal(V6_ENTRY_FAMILIES.length, 14);
  assert.equal(new Set(V6_ENTRY_FAMILIES).size, V6_ENTRY_FAMILIES.length);
  assert.equal(V6_PREREGISTRATION.selection.entryShortlistLimitPerTimeframe, 3);
  assert.equal(V6_PREREGISTRATION.selection.finalCandidateLimit, 4);
  assert.ok(V6_PREREGISTRATION.exitResearch.atrRiskMultiples.length <= 6);
  assert.ok(V6_PREREGISTRATION.exitResearch.expiryCandles.length <= 6);
});

test("V6 partitions are chronological and locked OOS is outside selection periods", () => {
  const periods = V6_PREREGISTRATION.periods;
  assert.equal(periods.train.end, periods.development.start);
  assert.equal(periods.development.end, periods.validation.start);
  assert.equal(periods.validation.end, periods.lockedOutOfSample.start);
  assert.equal(periods.lockedOutOfSample.end, V6_PREREGISTRATION.dataset.endExclusive);
  assert.match(V6_PREREGISTRATION.selection.ranking, /validation\/OOS fields are forbidden/);
});
