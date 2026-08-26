import assert from "node:assert/strict";
import { test } from "node:test";
import { FOUNDERS_OFFER } from "@workspace/product";
import { createPaymentRequestSchema, ensurePaymentMethodAvailable } from "./payment-requests";

const baseRequest = {
  method: "USDT_TRC20",
  amount: "27",
  declaredPaidAt: new Date().toISOString(),
  referenceOrTxid: "a".repeat(64),
  whatsappNumber: "+54 9 223 123 4567",
};

test("HTTP input requires WhatsApp for Argentina and USDT requests", () => {
  for (const method of ["MERCADO_PAGO_TRANSFER", "USDT_TRC20"] as const) {
    const { whatsappNumber: _whatsappNumber, ...withoutWhatsapp } = { ...baseRequest, method };
    assert.equal(createPaymentRequestSchema.safeParse(withoutWhatsapp).success, false);
  }
});

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

test("the API rejects Argentina transfers until the owner explicitly enables them", () => {
  assert.throws(
    () => ensurePaymentMethodAvailable("MERCADO_PAGO_TRANSFER", false),
    /La transferencia argentina aún no está habilitada/,
  );
  assert.doesNotThrow(() => ensurePaymentMethodAvailable("USDT_TRC20", false));
  assert.doesNotThrow(() => ensurePaymentMethodAvailable("MERCADO_PAGO_TRANSFER", true));
});

test("the official Argentina offer is centralized and arithmetically consistent", () => {
  assert.equal(FOUNDERS_OFFER.argentina.alias, "TRENORO");
  assert.equal(FOUNDERS_OFFER.argentina.alias.toLowerCase(), "trenoro");
  assert.equal(FOUNDERS_OFFER.argentina.cvu, "0000003100075319042852");
  assert.equal(FOUNDERS_OFFER.argentina.holder, "EMANUEL SEBASTIAN");
  assert.equal(FOUNDERS_OFFER.argentina.price, 40_500);
  assert.equal(FOUNDERS_OFFER.argentina.referenceUsd * FOUNDERS_OFFER.argentina.referenceRateArs, FOUNDERS_OFFER.argentina.price);
});
