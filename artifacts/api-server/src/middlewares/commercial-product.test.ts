import assert from "node:assert/strict";
import { test } from "node:test";
import { getCommercialProductRejection } from "./commercial-product";

test("XAUUSD is blocked at the shared backend boundary before any data provider", () => {
  for (const symbol of ["XAUUSD", " xauusd "]) {
    assert.deepEqual(getCommercialProductRejection({ symbol }), {
      statusCode: 423,
      body: {
        error: "XAUUSD estará disponible próximamente.",
        symbol: "XAUUSD",
        available: false,
      },
    });
  }
});

test("1m remains outside the commercial API while supported BTC timeframes pass", () => {
  assert.equal(getCommercialProductRejection({ timeframe: "1m" })?.statusCode, 400);
  for (const timeframe of ["5m", "15m", "1h", "4h"]) {
    assert.equal(getCommercialProductRejection({ symbol: "BTCUSDT", timeframe }), null);
  }
});
