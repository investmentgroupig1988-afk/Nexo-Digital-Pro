import assert from "node:assert/strict";
import test from "node:test";
import {
  V7_PREREGISTRATION,
  V7_PREREGISTRATION_HASH,
  computeV7PreregistrationHash,
} from "./signal-strategy-v7-snapshot";

test("V7 preregistration hash freezes hypotheses before results", () => {
  assert.equal(computeV7PreregistrationHash(), V7_PREREGISTRATION_HASH);
  assert.notEqual(V7_PREREGISTRATION_HASH, "PENDING");
});

test("V7 remains strictly offline and leaves commercial behavior untouched", () => {
  assert.equal(V7_PREREGISTRATION.liveIntegration, false);
  assert.equal(V7_PREREGISTRATION.schedulerChanged, false);
  assert.equal(V7_PREREGISTRATION.databaseWrites, false);
  assert.equal(V7_PREREGISTRATION.telegramCalls, false);
  assert.equal(V7_PREREGISTRATION.commercialStrategyChanged, false);
  assert.equal(V7_PREREGISTRATION.baseline.exitResearchProhibited, true);
});

test("V7 selection does not use validation or OOS for pre-validation ranking", () => {
  assert.match(V7_PREREGISTRATION.candidates.ranking, /TRAIN\/DEVELOPMENT/);
  assert.match(V7_PREREGISTRATION.candidates.ranking, /VALIDATION and OOS are forbidden/);
  assert.equal(V7_PREREGISTRATION.dataset.openCandlePolicy, "closeTime <= effective observation time");
});
