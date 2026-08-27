import assert from "node:assert/strict";
import test from "node:test";
import { topologyReleaseBlocker } from "./readiness";

test("an OK environment topology does not block release", () => {
  assert.equal(topologyReleaseBlocker("OK"), null);
});

test("an INCOMPLETE environment topology blocks release", () => {
  assert.equal(topologyReleaseBlocker("INCOMPLETE"), "ENVIRONMENT_TOPOLOGY");
});

test("an ERROR environment topology blocks release", () => {
  assert.equal(topologyReleaseBlocker("ERROR"), "ENVIRONMENT_TOPOLOGY");
});
