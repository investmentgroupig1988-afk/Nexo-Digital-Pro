import assert from "node:assert/strict";
import { test } from "node:test";
import { createLegalIdentity, isLegalIdentityComplete, missingLegalConfig } from "@workspace/product";

test("legal identity remains launch-blocking until all five human-operator values exist", () => {
  const incomplete = createLegalIdentity({ operatorName: "  ", supportEmail: "support@example.test" });
  assert.equal(isLegalIdentityComplete(incomplete), false);
  assert.deepEqual(missingLegalConfig(incomplete), ["LEGAL_OPERATOR_NAME", "LEGAL_TAX_ID", "LEGAL_ADDRESS", "LEGAL_EMAIL"]);

  const complete = createLegalIdentity({
    operatorName: "Nombre oficial",
    taxId: "CUIT oficial",
    address: "Domicilio oficial",
    supportEmail: "support@example.test",
    legalEmail: "legal@example.test",
  });
  assert.equal(isLegalIdentityComplete(complete), true);
  assert.deepEqual(missingLegalConfig(complete), []);
});
