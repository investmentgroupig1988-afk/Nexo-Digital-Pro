import { createHash } from "node:crypto";
import {
  accessGrantStatuses,
  accessGrants,
  accessPlans,
  accessTypes,
  and,
  auditActions,
  auditLogs,
  desc,
  eq,
  getDatabase,
  gt,
  inArray,
  isNull,
  or,
  paymentRequestMethods,
  paymentRequests,
  paymentRequestStatuses,
  users,
  type PaymentRequestMethod,
  type PaymentRequestStatus,
} from "@workspace/db";
import type { AuditContext } from "./audit";
import { config } from "../config";
import { FOUNDERS_OFFER, PRODUCT_DISPLAY_NAME } from "@workspace/product";

export const FOUNDERS_PRICE_USD = String(FOUNDERS_OFFER.usdtPrice);
export const FOUNDERS_PRICE_ARS = String(FOUNDERS_OFFER.argentina.price);
export const USDT_TRC20_DESTINATION = "TJmF8D7twrHckM1LfqPwh64WgYcSgURKRS";
export const MAX_PROOF_BYTES = 5 * 1024 * 1024;

type PaymentDatabase = ReturnType<typeof getDatabase>;
type PublicPaymentRequestRow = Omit<typeof paymentRequests.$inferSelect, "referenceFingerprint" | "proofDataBase64" | "whatsappNumber">;

export type ProofInput = {
  fileName: string;
  mimeType: string;
  dataBase64: string;
};

export type CreatePaymentRequestInput = {
  method: PaymentRequestMethod;
  amount: string;
  declaredPaidAt: Date;
  referenceOrTxid: string;
  payerName?: string;
  senderWallet?: string | null;
  whatsappNumber: string;
  proof?: ProofInput;
};

export type PaymentIdentity = {
  id: string;
  email: string;
  username: string;
};

export class PaymentRequestError extends Error {
  constructor(message: string, readonly statusCode = 400) {
    super(message);
    this.name = "PaymentRequestError";
  }
}

export class DuplicatePaymentReferenceError extends PaymentRequestError {
  constructor() {
    super("La referencia o TXID ya está asociada a una solicitud aprobada.", 409);
    this.name = "DuplicatePaymentReferenceError";
  }
}

const publicSelection = {
  id: paymentRequests.id,
  userId: paymentRequests.userId,
  method: paymentRequests.method,
  amount: paymentRequests.amount,
  currency: paymentRequests.currency,
  declaredPaidAt: paymentRequests.declaredPaidAt,
  referenceOrTxid: paymentRequests.referenceOrTxid,
  payerName: paymentRequests.payerName,
  senderWallet: paymentRequests.senderWallet,
  proofFileName: paymentRequests.proofFileName,
  proofMimeType: paymentRequests.proofMimeType,
  proofSize: paymentRequests.proofSize,
  status: paymentRequests.status,
  notes: paymentRequests.notes,
  reviewedBy: paymentRequests.reviewedBy,
  reviewedAt: paymentRequests.reviewedAt,
  createdAt: paymentRequests.createdAt,
  updatedAt: paymentRequests.updatedAt,
};

const adminSelection = {
  ...publicSelection,
  whatsappNumber: paymentRequests.whatsappNumber,
};

export async function createPaymentRequest(
  identity: PaymentIdentity,
  input: CreatePaymentRequestInput,
  context?: AuditContext,
  database: PaymentDatabase = getDatabase(),
) {
  const normalized = normalizeInput(input);
  const created = await database.transaction(async (transaction) => {
    await transaction.select({ id: users.id }).from(users)
      .where(eq(users.id, identity.id)).limit(1).for("update");
    const [activeGrant] = await transaction.select({ id: accessGrants.id }).from(accessGrants)
      .where(and(
        eq(accessGrants.userId, identity.id),
        eq(accessGrants.status, accessGrantStatuses.active),
        or(isNull(accessGrants.expiresAt), gt(accessGrants.expiresAt, new Date())),
      )).limit(1);
    if (activeGrant) throw new PaymentRequestError("Tu cuenta ya tiene un acceso activo.", 409);
    const [openRequest] = await transaction.select({ id: paymentRequests.id }).from(paymentRequests)
      .where(and(
        eq(paymentRequests.userId, identity.id),
        inArray(paymentRequests.status, [paymentRequestStatuses.pending, paymentRequestStatuses.needsReview]),
      )).limit(1);
    if (openRequest) throw new PaymentRequestError("Ya tenés una solicitud abierta en revisión.", 409);

    const [request] = await transaction.insert(paymentRequests).values({
      userId: identity.id,
      method: normalized.method,
      amount: normalized.amount,
      currency: normalized.currency,
      declaredPaidAt: normalized.declaredPaidAt,
      referenceOrTxid: normalized.referenceOrTxid,
      referenceFingerprint: normalized.referenceFingerprint,
      payerName: normalized.payerName,
      senderWallet: normalized.senderWallet,
      whatsappNumber: normalized.whatsappNumber,
      proofFileName: normalized.proof?.fileName ?? null,
      proofMimeType: normalized.proof?.mimeType ?? null,
      proofSize: normalized.proof?.size ?? null,
      proofDataBase64: normalized.proof?.dataBase64 ?? null,
      status: paymentRequestStatuses.pending,
    }).returning(publicSelection);

    await transaction.insert(auditLogs).values({
      actorUserId: identity.id,
      targetUserId: identity.id,
      action: auditActions.paymentRequested,
      metadata: {
        paymentRequestId: request.id,
        method: request.method,
        amount: request.amount,
        currency: request.currency,
        whatsappContactProvided: true,
      },
      ip: context?.ip,
      userAgent: context?.userAgent,
    });
    return request;
  });

  return {
    request: serializePaymentRequest(created),
    whatsappUrl: buildWhatsAppUrl(created, identity),
  };
}

export async function listMyPaymentRequests(userId: string, database: PaymentDatabase = getDatabase()) {
  const requests = await database.select(publicSelection).from(paymentRequests)
    .where(eq(paymentRequests.userId, userId))
    .orderBy(desc(paymentRequests.createdAt));
  return requests.map(serializePaymentRequest);
}

export async function listPaymentRequests(database: PaymentDatabase = getDatabase()) {
  const requests = await database.select(adminSelection).from(paymentRequests).orderBy(desc(paymentRequests.createdAt));
  const identityIds = [...new Set(requests.flatMap((request) => [request.userId, request.reviewedBy]).filter((id): id is string => Boolean(id)))];
  const identities = identityIds.length
    ? await database.select({ id: users.id, email: users.email, username: users.displayUsername }).from(users).where(inArray(users.id, identityIds))
    : [];
  const byId = new Map(identities.map((identity) => [identity.id, identity]));

  return requests.map((request) => ({
    ...serializePaymentRequest(request),
    whatsappNumber: request.whatsappNumber,
    user: byId.get(request.userId) ?? null,
    reviewer: request.reviewedBy ? byId.get(request.reviewedBy) ?? null : null,
  }));
}

export async function getPaymentProof(
  requestId: string,
  actor: { id: string; role: string },
  database: PaymentDatabase = getDatabase(),
) {
  const [proof] = await database.select({
    userId: paymentRequests.userId,
    fileName: paymentRequests.proofFileName,
    mimeType: paymentRequests.proofMimeType,
    size: paymentRequests.proofSize,
    dataBase64: paymentRequests.proofDataBase64,
  }).from(paymentRequests).where(eq(paymentRequests.id, requestId)).limit(1);

  if (!proof) throw new PaymentRequestError("Solicitud no encontrada.", 404);
  if (actor.role !== "admin" && proof.userId !== actor.id) throw new PaymentRequestError("No tenés acceso a esta evidencia.", 403);
  if (!proof.fileName || !proof.mimeType || !proof.size || !proof.dataBase64) throw new PaymentRequestError("La solicitud no tiene evidencia adjunta.", 404);

  const data = Buffer.from(proof.dataBase64, "base64");
  if (data.length !== proof.size || detectMimeType(data) !== proof.mimeType) {
    throw new PaymentRequestError("La evidencia almacenada no superó la verificación de integridad.", 500);
  }
  return { fileName: proof.fileName, mimeType: proof.mimeType, data };
}

export async function reviewPaymentRequest(input: {
  requestId: string;
  actor: { id: string; role: string };
  decision: Exclude<PaymentRequestStatus, "PENDING">;
  notes?: string;
  context?: AuditContext;
}, database: PaymentDatabase = getDatabase()) {
  if (input.actor.role !== "admin") throw new PaymentRequestError("Se requiere rol administrador.", 403);

  try {
    return await database.transaction(async (transaction) => {
      const [request] = await transaction.select().from(paymentRequests)
        .where(eq(paymentRequests.id, input.requestId)).limit(1).for("update");
      if (!request) throw new PaymentRequestError("Solicitud no encontrada.", 404);
      if (request.userId === input.actor.id) throw new PaymentRequestError("No podés revisar tu propia solicitud.", 403);
      if (request.status === paymentRequestStatuses.approved || request.status === paymentRequestStatuses.rejected) {
        throw new PaymentRequestError("La solicitud ya tiene una decisión final.", 409);
      }

      const now = new Date();
      const notes = input.notes?.trim() || null;
      if (input.decision !== paymentRequestStatuses.approved && !notes) {
        throw new PaymentRequestError("Agregá una nota para rechazar o solicitar más información.");
      }

      if (input.decision === paymentRequestStatuses.approved) {
        const approvedWithSameReference = await transaction.select({ id: paymentRequests.id })
          .from(paymentRequests)
          .where(and(
            eq(paymentRequests.method, request.method),
            eq(paymentRequests.referenceFingerprint, request.referenceFingerprint),
            eq(paymentRequests.status, paymentRequestStatuses.approved),
          )).limit(1);
        if (approvedWithSameReference.some((candidate) => candidate.id !== request.id)) {
          throw new DuplicatePaymentReferenceError();
        }

        // Serialize simultaneous approvals for the same account before
        // creating or reactivating its Founders grant.
        await transaction.select({ id: users.id }).from(users)
          .where(eq(users.id, request.userId)).limit(1).for("update");
        const [previousFounders] = await transaction.select().from(accessGrants)
          .where(and(eq(accessGrants.userId, request.userId), eq(accessGrants.plan, accessPlans.foundersLifetime)))
          .orderBy(desc(accessGrants.updatedAt)).limit(1).for("update");
        let grant: typeof accessGrants.$inferSelect;
        if (previousFounders) {
          [grant] = await transaction.update(accessGrants).set({
            status: accessGrantStatuses.active,
            accessType: accessTypes.payment,
            grantedAt: now,
            grantedBy: input.actor.id,
            revokedAt: null,
            revokedBy: null,
            reason: notes ?? previousFounders.reason ?? `Pago aprobado: ${request.id}`,
            expiresAt: null,
            updatedAt: now,
          }).where(eq(accessGrants.id, previousFounders.id)).returning();
        } else {
          [grant] = await transaction.insert(accessGrants).values({
            userId: request.userId,
            plan: accessPlans.foundersLifetime,
            accessType: accessTypes.payment,
            status: accessGrantStatuses.active,
            grantedAt: now,
            grantedBy: input.actor.id,
            reason: notes ?? `Pago aprobado: ${request.id}`,
            expiresAt: null,
            updatedAt: now,
          }).returning();
        }

        const [updated] = await transaction.update(paymentRequests).set({
          status: paymentRequestStatuses.approved,
          notes,
          reviewedBy: input.actor.id,
          reviewedAt: now,
          updatedAt: now,
        }).where(eq(paymentRequests.id, request.id)).returning(publicSelection);

        await transaction.insert(auditLogs).values([
          {
            actorUserId: input.actor.id,
            targetUserId: request.userId,
            action: auditActions.paymentApproved,
            metadata: { paymentRequestId: request.id, grantId: grant.id },
            ip: input.context?.ip,
            userAgent: input.context?.userAgent,
          },
          {
            actorUserId: input.actor.id,
            targetUserId: request.userId,
            action: auditActions.accessGranted,
            metadata: { paymentRequestId: request.id, grantId: grant.id, plan: accessPlans.foundersLifetime, accessType: accessTypes.payment },
            ip: input.context?.ip,
            userAgent: input.context?.userAgent,
          },
        ]);
        return { request: serializePaymentRequest(updated), grantId: grant.id };
      }

      const action = input.decision === paymentRequestStatuses.rejected
        ? auditActions.paymentRejected
        : auditActions.paymentNeedsReview;
      const [updated] = await transaction.update(paymentRequests).set({
        status: input.decision,
        notes,
        reviewedBy: input.actor.id,
        reviewedAt: now,
        updatedAt: now,
      }).where(eq(paymentRequests.id, request.id)).returning(publicSelection);
      await transaction.insert(auditLogs).values({
        actorUserId: input.actor.id,
        targetUserId: request.userId,
        action,
        metadata: { paymentRequestId: request.id, notes },
        ip: input.context?.ip,
        userAgent: input.context?.userAgent,
      });
      return { request: serializePaymentRequest(updated), grantId: null };
    });
  } catch (error) {
    if (error instanceof PaymentRequestError) throw error;
    if (isApprovedReferenceConstraint(error)) throw new DuplicatePaymentReferenceError();
    throw error;
  }
}

function normalizeInput(input: CreatePaymentRequestInput) {
  const method = input.method;
  if (!Object.values(paymentRequestMethods).includes(method)) throw new PaymentRequestError("Método de pago inválido.");

  const declaredPaidAt = input.declaredPaidAt;
  const now = Date.now();
  if (Number.isNaN(declaredPaidAt.getTime()) || declaredPaidAt.getTime() > now + 24 * 60 * 60 * 1000 || declaredPaidAt.getTime() < now - 366 * 24 * 60 * 60 * 1000) {
    throw new PaymentRequestError("La fecha declarada de pago no es válida.");
  }

  const amount = normalizeAmount(input.amount);
  const referenceOrTxid = input.referenceOrTxid.trim();
  if (referenceOrTxid.length < 3 || referenceOrTxid.length > 255) throw new PaymentRequestError("La referencia o TXID no es válida.");

  const payerName = input.payerName?.trim() || null;
  const senderWallet = normalizeOptionalText(input.senderWallet);
  const whatsappNumber = normalizeWhatsAppNumber(input.whatsappNumber);
  const proof = input.proof ? normalizeProof(input.proof) : null;
  if (method === paymentRequestMethods.mercadoPagoTransfer) {
    if (!payerName || payerName.length > 160) throw new PaymentRequestError("Ingresá el nombre del pagador.");
    if (!proof) throw new PaymentRequestError("El comprobante es obligatorio para la transferencia Argentina.");
    if (Math.abs(Number(amount) - FOUNDERS_OFFER.argentina.price) > 0.00000001) {
      throw new PaymentRequestError("El importe Founders por transferencia argentina es $40.500 ARS.");
    }
  }
  if (method === paymentRequestMethods.usdtTrc20) {
    if (!/^[a-fA-F0-9]{64}$/.test(referenceOrTxid)) throw new PaymentRequestError("El TXID de TRC20 debe contener 64 caracteres hexadecimales.");
    if (senderWallet && !/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(senderWallet)) throw new PaymentRequestError("La wallet remitente de TRC20 no es válida.");
    if (Math.abs(Number(amount) - Number(FOUNDERS_PRICE_USD)) > 0.00000001) throw new PaymentRequestError("El importe Founders por USDT es 27.");
  }

  const normalizedReference = referenceOrTxid.normalize("NFKC").trim().toUpperCase().replace(/\s+/g, "");
  return {
    method,
    amount,
    currency: method === paymentRequestMethods.usdtTrc20 ? "USDT" : "ARS",
    declaredPaidAt,
    referenceOrTxid,
    referenceFingerprint: createHash("sha256").update(normalizedReference).digest("hex"),
    payerName,
    senderWallet,
    whatsappNumber,
    proof,
  };
}

export function normalizeWhatsAppNumber(value: string | null | undefined): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new PaymentRequestError("Ingresá un número de WhatsApp de contacto.");
  }
  const normalized = value.normalize("NFKC").trim();
  if (!/^(?:\+|00)[0-9\s().-]+$/.test(normalized)) {
    throw new PaymentRequestError("El número de WhatsApp debe incluir código internacional y tener un formato válido.");
  }
  const international = normalized.startsWith("00") ? `+${normalized.slice(2)}` : normalized;
  const digits = international.slice(1).replace(/[\s().-]/g, "");
  if (!/^[1-9]\d{7,14}$/.test(digits)) {
    throw new PaymentRequestError("El número de WhatsApp debe incluir código internacional y tener un formato válido.");
  }
  return `+${digits}`;
}

function normalizeOptionalText(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function normalizeAmount(value: string): string {
  const normalized = value.trim().replace(",", ".");
  if (!/^\d{1,12}(?:\.\d{1,8})?$/.test(normalized)) throw new PaymentRequestError("El importe no es válido.");
  const numeric = Number(normalized);
  if (!Number.isFinite(numeric) || numeric <= 0) throw new PaymentRequestError("El importe debe ser mayor que cero.");
  return numeric.toFixed(8);
}

function normalizeProof(input: ProofInput) {
  const dataBase64 = input.dataBase64.trim();
  if (!dataBase64 || dataBase64.length > Math.ceil(MAX_PROOF_BYTES / 3) * 4 + 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(dataBase64)) {
    throw new PaymentRequestError("El comprobante no tiene un formato válido.");
  }
  const data = Buffer.from(dataBase64, "base64");
  const canonical = data.toString("base64").replace(/=+$/, "");
  if (!data.length || data.length > MAX_PROOF_BYTES || canonical !== dataBase64.replace(/=+$/, "")) {
    throw new PaymentRequestError("El comprobante supera 5 MB o está dañado.");
  }
  const mimeType = detectMimeType(data);
  if (!mimeType || mimeType !== input.mimeType.trim().toLowerCase()) {
    throw new PaymentRequestError("Solo se admiten comprobantes PDF, PNG, JPG o WEBP válidos.");
  }
  const baseName = sanitizeFileName(input.fileName);
  const extension = mimeType === "application/pdf" ? ".pdf" : mimeType === "image/png" ? ".png" : mimeType === "image/webp" ? ".webp" : ".jpg";
  const withoutExtension = baseName.replace(/\.[^.]+$/, "").slice(0, 140) || "comprobante";
  return { fileName: `${withoutExtension}${extension}`, mimeType, size: data.length, dataBase64: data.toString("base64") };
}

function sanitizeFileName(value: string): string {
  const leaf = value.normalize("NFKC").split(/[\\/]/).pop() ?? "comprobante";
  return leaf.replace(/[^\p{L}\p{N}._ -]/gu, "_").replace(/\.{2,}/g, ".").replace(/^\.+/, "").trim().slice(0, 150) || "comprobante";
}

function detectMimeType(data: Buffer): string | null {
  if (data.length >= 5 && data.subarray(0, 5).toString("ascii") === "%PDF-") return "application/pdf";
  if (data.length >= 8 && data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return "image/jpeg";
  if (data.length >= 12 && data.subarray(0, 4).toString("ascii") === "RIFF" && data.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
  return null;
}

function serializePaymentRequest(value: PublicPaymentRequestRow) {
  return {
    id: value.id,
    userId: value.userId,
    method: value.method,
    amount: value.amount,
    currency: value.currency,
    declaredPaidAt: value.declaredPaidAt,
    referenceOrTxid: value.referenceOrTxid,
    payerName: value.payerName,
    senderWallet: value.senderWallet,
    proof: value.proofFileName && value.proofMimeType && value.proofSize ? {
      fileName: value.proofFileName,
      mimeType: value.proofMimeType,
      size: value.proofSize,
      url: `/api/payment-requests/${value.id}/proof`,
    } : null,
    status: value.status,
    notes: value.notes,
    reviewedBy: value.reviewedBy,
    reviewedAt: value.reviewedAt,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  };
}

function buildWhatsAppUrl(request: Pick<typeof paymentRequests.$inferSelect, "id" | "method" | "amount" | "currency" | "referenceOrTxid" | "proofFileName">, identity: PaymentIdentity): string | null {
  const method = request.method === paymentRequestMethods.usdtTrc20 ? "USDT TRC20" : "Transferencia Argentina";
  const message = [
    `Hola, solicito la verificación de mi acceso Founders a ${PRODUCT_DISPLAY_NAME}.`,
    `ID de solicitud: ${request.id}`,
    `Usuario: ${identity.username}`,
    `Email: ${identity.email}`,
    `Método: ${method}`,
    `Importe: ${formatAmount(request.amount)} ${request.currency}`,
    request.method === paymentRequestMethods.usdtTrc20 ? `Wallet destino: ${USDT_TRC20_DESTINATION}` : null,
    `Referencia / TXID: ${request.referenceOrTxid}`,
    `Evidencia cargada en la plataforma: ${request.proofFileName ? "Sí" : "No (opcional para USDT)"}.`,
  ].filter((line): line is string => Boolean(line)).join("\n");
  return config.supportWhatsappNumber ? `https://wa.me/${config.supportWhatsappNumber}?text=${encodeURIComponent(message)}` : null;
}

function formatAmount(value: string): string {
  return Number(value).toLocaleString("es-AR", { maximumFractionDigits: 8 });
}

function isApprovedReferenceConstraint(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: string; constraint?: string; message?: string };
  return candidate.code === "23505" && (candidate.constraint === "payment_requests_approved_reference_unique" || candidate.message?.includes("payment_requests_approved_reference_unique") === true);
}
