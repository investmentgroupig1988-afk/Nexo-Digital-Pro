import assert from "node:assert/strict";
import { test } from "node:test";
import { createPaymentRequestSchema } from "./payment-requests";

const baseRequest = {
  method: "USDT_TRC20",
  amount: "27",
  declaredPaidAt: new Date().toISOString(),
  referenceOrTxid: "a".repeat(64),
};

test("HTTP input normalizes every omitted sender wallet representation", () => {
  for (const senderWallet of [undefined, null, "", "   \t "]) {
    const input = createPaymentRequestSchema.parse({ ...baseRequest, senderWallet });
    assert.equal(input.senderWallet, undefined);
  }
});

test("HTTP input trims an informed sender wallet for service validation", () => {
  const input = createPaymentRequestSchema.parse({
    ...baseRequest,
    senderWallet: "  TJmF8D7twrHckM1LfqPwh64WgYcSgURKRS  ",
  });
  assert.equal(input.senderWallet, "TJmF8D7twrHckM1LfqPwh64WgYcSgURKRS");
});
