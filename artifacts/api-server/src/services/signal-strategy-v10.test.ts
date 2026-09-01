import assert from "node:assert/strict";
import test from "node:test";
import { computeV8PreregistrationHash, V8_PREREGISTRATION_HASH } from "./signal-strategy-v8-snapshot";
import { computeV10PreregistrationHash, V10_ASSETS, V10_FAMILIES, V10_PREREGISTRATION, V10_PREREGISTRATION_HASH } from "./signal-strategy-v10-snapshot";

test("V10 freezes the exact V8 leads and external asset set before downloads", () => {
  assert.equal(computeV10PreregistrationHash(), V10_PREREGISTRATION_HASH);
  assert.equal(computeV8PreregistrationHash(), V8_PREREGISTRATION_HASH);
  assert.deepEqual(V10_ASSETS, ["ETHUSDT", "BNBUSDT", "SOLUSDT"]);
  assert.deepEqual(V10_FAMILIES, ["BB_MACD_SQUEEZE", "RSI_DIVERGENCE_STRUCTURE"]);
  assert.equal(V10_PREREGISTRATION.sourceHypothesis.preregistrationHash, V8_PREREGISTRATION_HASH);
  assert.equal(V10_PREREGISTRATION.selection.noPostResultRetuning, true);
});

test("V10 is research-only and cannot affect commercial systems", () => {
  assert.equal(V10_PREREGISTRATION.liveIntegration, false);
  assert.equal(V10_PREREGISTRATION.schedulerChanged, false);
  assert.equal(V10_PREREGISTRATION.databaseWrites, false);
  assert.equal(V10_PREREGISTRATION.telegramCalls, false);
});
