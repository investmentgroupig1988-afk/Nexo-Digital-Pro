import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { after, before, test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import {
  accessGrants,
  accessPlans,
  auditActions,
  auditLogs,
  eq,
  getDatabase,
  paymentRequests,
  users,
} from "@workspace/db";
import { getEffectiveAccess, grantAccess, restoreAccess, revokeAccess } from "./access";
import {
  buildPaymentReviewWhatsAppUrl,
  createPaymentRequest,
  DuplicatePaymentReferenceError,
  listMyPaymentRequests,
  listPaymentRequests,
  normalizeWhatsAppNumber,
  reviewPaymentRequest,
  type CreatePaymentRequestInput,
} from "./payment-requests";

const migrationFolder = resolve(import.meta.dirname, "../../../../lib/db/drizzle");
const pngProof = {
  fileName: "../../comprobante peligroso.png",
  mimeType: "image/png",
  dataBase64: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).toString("base64"),
};

let pglite: PGlite;
let database: ReturnType<typeof drizzle>;
let serviceDatabase: ReturnType<typeof getDatabase>;
const identities = {
  admin: identity("admin", "admin"),
  member: identity("member", "user"),
  duplicate: identity("duplicate", "user"),
  rejected: identity("rejected", "user"),
  review: identity("review", "user"),
  partner: identity("partner", "user"),
  nullWallet: identity("null-wallet", "user"),
  emptyWallet: identity("empty-wallet", "user"),
  whitespaceWallet: identity("whitespace-wallet", "user"),
  validWallet: identity("valid-wallet", "user"),
  invalidWallet: identity("invalid-wallet", "user"),
  argentinaTamper: identity("argentina-tamper", "user"),
  missingWhatsappUsdt: identity("miss-wa-usdt", "user"),
  missingWhatsappArgentina: identity("miss-wa-ars", "user"),
  invalidWhatsapp: identity("bad-wa", "user"),
  normalizedWhatsapp: identity("norm-wa", "user"),
  historical: identity("historic", "user"),
};

before(async () => {
  pglite = new PGlite();
  await applyMigrations(pglite, migrationFolder);
  database = drizzle(pglite, { schema: { accessGrants, auditLogs, paymentRequests, users } });
  serviceDatabase = database as unknown as ReturnType<typeof getDatabase>;
  await database.insert(users).values(Object.values(identities).map((user) => ({
    id: user.id,
    name: user.username,
    email: user.email,
    username: user.username,
    displayUsername: user.username,
    role: user.role,
  })));
});

after(async () => {
  await pglite.close();
});

test("support WhatsApp CTA contains only the payment request ID", () => {
  const paymentRequestId = "c7489362-bc9e-41cc-a06f-b7ded8f1ad6a";
  const url = buildPaymentReviewWhatsAppUrl(paymentRequestId, "5491151550781");
  assert.ok(url);
  const message = new URL(url).searchParams.get("text") ?? "";
  assert.equal(
    message,
    `Hola TRENORO, ya realicé mi pago y envié la solicitud. Mi ID es: ${paymentRequestId}. Quisiera solicitar la revisión de mi acceso.`,
  );
  assert.match(message, new RegExp(paymentRequestId));
  assert.doesNotMatch(message, /email|usuario|wallet|txid|referencia|comprobante|password|cookie|token/i);
});

test("USDT creates a persisted request with normalized mandatory WhatsApp", async () => {
  const result = await createPaymentRequest(identities.member, usdtRequest("a"), undefined, serviceDatabase);
  const [stored] = await database.select().from(paymentRequests).where(eq(paymentRequests.id, result.request.id));
  assert.ok(stored);
  assert.equal(stored.status, "PENDING");
  assert.equal(stored.proofDataBase64, null);
  assert.equal(stored.whatsappNumber, "+5492231234567");
  assert.equal("whatsappNumber" in result.request, false);

  const requestedAudit = (await database.select().from(auditLogs).where(eq(auditLogs.targetUserId, identities.member.id)))
    .find((entry) => entry.action === auditActions.paymentRequested);
  const requestedMetadata = requestedAudit?.metadata as Record<string, unknown> | undefined;
  assert.equal(requestedMetadata?.whatsappContactProvided, true);
  assert.doesNotMatch(JSON.stringify(requestedMetadata), /\+5492231234567/);

  await assert.rejects(
    () => createPaymentRequest(identities.member, usdtRequest("c"), undefined, serviceDatabase),
    /Ya tenés una solicitud abierta/,
  );
});

test("Argentina and USDT reject a new request without WhatsApp", async () => {
  const missingUsdt = { ...usdtRequest("6"), whatsappNumber: undefined } as unknown as CreatePaymentRequestInput;
  const missingArgentina = { ...localRequest("operation-missing-whatsapp"), whatsappNumber: undefined } as unknown as CreatePaymentRequestInput;
  await assert.rejects(
    () => createPaymentRequest(identities.missingWhatsappUsdt, missingUsdt, undefined, serviceDatabase),
    /Ingresá un número de WhatsApp de contacto/,
  );
  await assert.rejects(
    () => createPaymentRequest(identities.missingWhatsappArgentina, missingArgentina, undefined, serviceDatabase),
    /Ingresá un número de WhatsApp de contacto/,
  );
});

test("WhatsApp rejects local or malformed numbers and normalizes international input", async () => {
  await assert.rejects(
    () => createPaymentRequest(identities.invalidWhatsapp, { ...usdtRequest("7"), whatsappNumber: "223 123 4567" }, undefined, serviceDatabase),
    /código internacional/,
  );
  assert.equal(normalizeWhatsAppNumber("0054 9 223 123 4567"), "+5492231234567");

  const result = await createPaymentRequest(identities.normalizedWhatsapp, {
    ...usdtRequest("8"),
    whatsappNumber: "  +54 (9) 223-123-4567  ",
  }, undefined, serviceDatabase);
  const [stored] = await database.select().from(paymentRequests).where(eq(paymentRequests.id, result.request.id));
  assert.equal(stored.whatsappNumber, "+5492231234567");
});

test("only the admin listing exposes WhatsApp and historical null values remain readable", async () => {
  const [historical] = await database.insert(paymentRequests).values({
    userId: identities.historical.id,
    method: "USDT_TRC20",
    amount: "27",
    currency: "USDT",
    declaredPaidAt: new Date(),
    referenceOrTxid: "9".repeat(64),
    referenceFingerprint: "9".repeat(64),
  }).returning();
  assert.equal(historical.whatsappNumber, null);

  const mine = await listMyPaymentRequests(identities.normalizedWhatsapp.id, serviceDatabase);
  assert.equal(mine.length, 1);
  assert.ok(mine.every((request) => request.userId === identities.normalizedWhatsapp.id));
  assert.equal("whatsappNumber" in mine[0], false);

  const historicalMine = await listMyPaymentRequests(identities.historical.id, serviceDatabase);
  assert.equal(historicalMine.length, 1);
  assert.equal("whatsappNumber" in historicalMine[0], false);

  const adminRequests = await listPaymentRequests(serviceDatabase);
  assert.equal(adminRequests.find((request) => request.userId === identities.normalizedWhatsapp.id)?.whatsappNumber, "+5492231234567");
  assert.equal(adminRequests.find((request) => request.id === historical.id)?.whatsappNumber, null);
});

test("USDT sender wallet is optional and normalizes null, empty, and whitespace values to null", async () => {
  const cases = [
    [identities.nullWallet, null],
    [identities.emptyWallet, ""],
    [identities.whitespaceWallet, "   \t  "],
  ] as const;

  for (const [user, senderWallet] of cases) {
    const result = await createPaymentRequest(user, { ...usdtRequest(user.id[0]), senderWallet }, undefined, serviceDatabase);
    assert.equal(result.request.senderWallet, null);
    const [stored] = await database.select().from(paymentRequests).where(eq(paymentRequests.id, result.request.id));
    assert.equal(stored.senderWallet, null);
  }
});

test("USDT accepts and trims a valid TRON wallet", async () => {
  const wallet = "TJmF8D7twrHckM1LfqPwh64WgYcSgURKRS";
  const result = await createPaymentRequest(identities.validWallet, {
    ...usdtRequest("d"),
    senderWallet: `  ${wallet}  `,
  }, undefined, serviceDatabase);
  assert.equal(result.request.senderWallet, wallet);
});

test("USDT rejects an informed invalid TRON wallet without persisting a request", async () => {
  await assert.rejects(
    () => createPaymentRequest(identities.invalidWallet, { ...usdtRequest("e"), senderWallet: "not-a-tron-wallet" }, undefined, serviceDatabase),
    /La wallet remitente de TRC20 no es válida/,
  );
  assert.equal((await database.select().from(paymentRequests).where(eq(paymentRequests.userId, identities.invalidWallet.id))).length, 0);
});

test("a user cannot approve and an administrator cannot review their own request", async () => {
  const [request] = await database.select().from(paymentRequests).where(eq(paymentRequests.userId, identities.member.id));
  await assert.rejects(
    () => reviewPaymentRequest({ requestId: request.id, actor: identities.member, decision: "APPROVED" }, serviceDatabase),
    (error: unknown) => error instanceof Error && error.message === "Se requiere rol administrador.",
  );

  const own = await createPaymentRequest(identities.admin, usdtRequest("b"), undefined, serviceDatabase);
  await assert.rejects(
    () => reviewPaymentRequest({ requestId: own.request.id, actor: identities.admin, decision: "APPROVED" }, serviceDatabase),
    (error: unknown) => error instanceof Error && error.message === "No podés revisar tu propia solicitud.",
  );
});

test("admin approval atomically records APPROVED, FOUNDERS, unchanged role, and both audits", async () => {
  const [pending] = await database.select().from(paymentRequests).where(eq(paymentRequests.userId, identities.member.id));
  const result = await reviewPaymentRequest({ requestId: pending.id, actor: identities.admin, decision: "APPROVED", notes: "Pago verificado" }, serviceDatabase);
  assert.equal(result.request.status, "APPROVED");

  const [member] = await database.select().from(users).where(eq(users.id, identities.member.id));
  assert.equal(member.role, "user");
  const grants = await database.select().from(accessGrants).where(eq(accessGrants.userId, identities.member.id));
  assert.equal(grants.length, 1);
  assert.equal(grants[0].plan, accessPlans.foundersLifetime);
  assert.equal(grants[0].accessType, "PAYMENT");
  assert.equal(grants[0].status, "active");

  const audits = await database.select().from(auditLogs).where(eq(auditLogs.targetUserId, identities.member.id));
  assert.ok(audits.some((entry) => entry.action === auditActions.paymentApproved));
  assert.ok(audits.some((entry) => entry.action === auditActions.accessGranted));
});

test("the same normalized reference cannot be approved twice", async () => {
  const duplicate = await createPaymentRequest(identities.duplicate, usdtRequest("A"), undefined, serviceDatabase);
  await assert.rejects(
    () => reviewPaymentRequest({ requestId: duplicate.request.id, actor: identities.admin, decision: "APPROVED" }, serviceDatabase),
    (error: unknown) => error instanceof DuplicatePaymentReferenceError,
  );
  assert.equal((await database.select().from(accessGrants).where(eq(accessGrants.userId, identities.duplicate.id))).length, 0);
});

test("REJECTED and NEEDS_REVIEW never grant product access", async () => {
  const rejected = await createPaymentRequest(identities.rejected, localRequest("operation-rejected"), undefined, serviceDatabase);
  assert.equal(rejected.request.proof?.fileName, "comprobante peligroso.png");
  await reviewPaymentRequest({ requestId: rejected.request.id, actor: identities.admin, decision: "REJECTED", notes: "Referencia ilegible" }, serviceDatabase);
  assert.equal((await database.select().from(accessGrants).where(eq(accessGrants.userId, identities.rejected.id))).length, 0);

  const review = await createPaymentRequest(identities.review, localRequest("operation-review"), undefined, serviceDatabase);
  await reviewPaymentRequest({ requestId: review.request.id, actor: identities.admin, decision: "NEEDS_REVIEW", notes: "Adjuntar detalle" }, serviceDatabase);
  assert.equal((await database.select().from(accessGrants).where(eq(accessGrants.userId, identities.review.id))).length, 0);
});

test("the backend owns the fixed Argentina price and rejects a browser-supplied amount", async () => {
  await assert.rejects(
    () => createPaymentRequest(identities.argentinaTamper, { ...localRequest("operation-altered-price"), amount: "1" }, undefined, serviceDatabase),
    /\$40\.500 ARS/,
  );
  assert.equal((await database.select().from(paymentRequests).where(eq(paymentRequests.userId, identities.argentinaTamper.id))).length, 0);
});

test("the server rejects forged evidence instead of trusting its filename or declared MIME", async () => {
  const countBefore = (await database.select({ id: paymentRequests.id }).from(paymentRequests)).length;
  await assert.rejects(() => createPaymentRequest(identities.rejected, {
    ...localRequest("operation-forged-proof"),
    proof: { fileName: "receipt.png", mimeType: "image/png", dataBase64: Buffer.from("not a png").toString("base64") },
  }, undefined, serviceDatabase), /PDF, PNG, JPG o WEBP válidos/);
  assert.equal((await database.select({ id: paymentRequests.id }).from(paymentRequests)).length, countBefore);
});

test("PARTNER remains role=user and revoke/restore preserve the authorization boundary", async () => {
  await grantAccess({ userId: identities.partner.id, actorUserId: identities.admin.id, plan: accessPlans.partner, reason: "Alianza" }, serviceDatabase);
  assert.equal((await getEffectiveAccess(identities.partner.id, serviceDatabase)).grant?.plan, accessPlans.partner);
  assert.equal((await database.select().from(users).where(eq(users.id, identities.partner.id)))[0].role, "user");

  await revokeAccess({ userId: identities.partner.id, actorUserId: identities.admin.id }, serviceDatabase);
  const revoked = await getEffectiveAccess(identities.partner.id, serviceDatabase);
  assert.equal(revoked.hasAccess, false);
  assert.equal(revoked.grant?.status, "revoked");
  await restoreAccess({ userId: identities.partner.id, actorUserId: identities.admin.id }, serviceDatabase);
  assert.equal((await getEffectiveAccess(identities.partner.id, serviceDatabase)).hasAccess, true);
  assert.equal((await database.select().from(users).where(eq(users.id, identities.partner.id)))[0].role, "user");
});

function identity(prefix: string, role: "user" | "admin") {
  const id = randomUUID();
  return { id, username: `${prefix}_${id.slice(0, 8)}`, email: `${prefix}-${id}@example.test`, role };
}

function usdtRequest(character: string) {
  return {
    method: "USDT_TRC20" as const,
    amount: "27",
    declaredPaidAt: new Date(),
    referenceOrTxid: character.repeat(64),
    whatsappNumber: "+54 9 223 123 4567",
  };
}

function localRequest(referenceOrTxid: string) {
  return {
    method: "MERCADO_PAGO_TRANSFER" as const,
    amount: "40500",
    declaredPaidAt: new Date(),
    referenceOrTxid,
    payerName: "Persona de prueba",
    whatsappNumber: "+54 9 223 123 4567",
    proof: pngProof,
  };
}

async function applyMigrations(client: PGlite, directory: string): Promise<void> {
  const migrations = (await readdir(directory)).filter((file) => /^\d+_.+\.sql$/.test(file)).sort();
  for (const file of migrations) {
    const sql = await readFile(resolve(directory, file), "utf8");
    for (const statement of sql.split("--> statement-breakpoint")) {
      if (statement.trim()) await client.exec(statement);
    }
  }
}
