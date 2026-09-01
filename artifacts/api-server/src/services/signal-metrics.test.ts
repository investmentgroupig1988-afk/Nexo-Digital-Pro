import assert from "node:assert/strict";
import { test } from "node:test";
import { summarizeTotalHistory } from "./signal-metrics";

test("total history includes expired signals in total and accuracy", () => {
  assert.deepEqual(
    summarizeTotalHistory([
      { status: "WIN", count: 21 },
      { status: "LOSS", count: 9 },
      { status: "EXPIRED", count: 7 },
    ]),
    { total: 37, wins: 21, losses: 9, expired: 7, accuracy: 56.756757 },
  );
});

test("total history supports empty and single-outcome histories", () => {
  assert.deepEqual(summarizeTotalHistory([]), {
    total: 0,
    wins: 0,
    losses: 0,
    expired: 0,
    accuracy: null,
  });
  assert.deepEqual(summarizeTotalHistory([{ status: "EXPIRED", count: 4 }]), {
    total: 4,
    wins: 0,
    losses: 0,
    expired: 4,
    accuracy: 0,
  });
  assert.deepEqual(summarizeTotalHistory([{ status: "LOSS", count: 3 }]), {
    total: 3,
    wins: 0,
    losses: 3,
    expired: 0,
    accuracy: 0,
  });
  assert.deepEqual(summarizeTotalHistory([{ status: "WIN", count: 5 }]), {
    total: 5,
    wins: 5,
    losses: 0,
    expired: 0,
    accuracy: 100,
  });
});

test("total history combines repeated status rows across timeframes", () => {
  assert.deepEqual(
    summarizeTotalHistory([
      { status: "WIN", count: 2 },
      { status: "WIN", count: 3 },
      { status: "LOSS", count: 1 },
      { status: "EXPIRED", count: 4 },
      { status: "OPEN", count: 99 },
      { status: "CANCELLED", count: 99 },
    ]),
    { total: 10, wins: 5, losses: 1, expired: 4, accuracy: 50 },
  );
});
