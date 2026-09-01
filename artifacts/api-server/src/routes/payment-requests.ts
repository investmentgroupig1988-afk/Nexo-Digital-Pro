import { Router, type IRouter, type Request } from "express";
import { z } from "zod";
import { paymentRequestMethods } from "@workspace/db";
import { currentAuthenticatedUser, requireAuthenticatedUser } from "../auth/session";
import { config } from "../config";
import { trustedMutationOrigin } from "../middlewares/security";
import {
  createPaymentRequest,
  getPaymentProof,
  listMyPaymentRequests,
  PaymentRequestError,
} from "../services/payment-requests";

const router: IRouter = Router();
const requestIdSchema = z.string().uuid();
const proofSchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  mimeType: z.string().trim().min(1).max(100),
  dataBase64: z.string().min(1),
});
const optionalTrimmedString = (maxLength: number) => z.preprocess(
  (value) => typeof value === "string" && value.trim() === "" ? undefined : value ?? undefined,
  z.string().trim().max(maxLength).optional(),
);
export const createPaymentRequestSchema = z.object({
  method: z.enum([paymentRequestMethods.mercadoPagoTransfer, paymentRequestMethods.usdtTrc20]),
  amount: z.string().trim().min(1).max(32),
  declaredPaidAt: z.coerce.date(),
  referenceOrTxid: z.string().trim().min(3).max(255),
  payerName: optionalTrimmedString(160),
  senderWallet: optionalTrimmedString(128),
  whatsappNumber: z.string().trim().min(1).max(64),
  proof: proofSchema.optional(),
});

export function ensurePaymentMethodAvailable(
  method: string,
  argentinaPaymentsEnabled = config.argentinaPaymentsEnabled,
): void {
  if (method === paymentRequestMethods.mercadoPagoTransfer && !argentinaPaymentsEnabled) {
    throw new PaymentRequestError("La transferencia argentina aún no está habilitada.", 409);
  }
}

router.use("/payment-requests", requireAuthenticatedUser());
router.use("/payment-requests", trustedMutationOrigin);

router.get("/payment-requests/me", async (_req, res, next) => {
  try {
    const actor = currentAuthenticatedUser(res);
    res.json({ requests: await listMyPaymentRequests(actor.id) });
  } catch (error) {
    next(error);
  }
});

router.post("/payment-requests", async (req, res, next) => {
  try {
    const actor = currentAuthenticatedUser(res);
    const input = createPaymentRequestSchema.parse(req.body);
    ensurePaymentMethodAvailable(input.method);
    const created = await createPaymentRequest({ id: actor.id, email: actor.email, username: actor.displayUsername }, input, requestAuditContext(req));
    res.status(201).json(created);
  } catch (error) {
    sendPaymentError(error, res, next);
  }
});

router.get("/payment-requests/:id/proof", async (req, res, next) => {
  try {
    const actor = currentAuthenticatedUser(res);
    const proof = await getPaymentProof(requestIdSchema.parse(req.params.id), actor);
    const asciiName = proof.fileName.replace(/[^\x20-\x7e]/g, "_").replaceAll('"', "_");
    res.setHeader("Content-Type", proof.mimeType);
    res.setHeader("Content-Length", String(proof.data.length));
    res.setHeader("Content-Disposition", `inline; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(proof.fileName)}`);
    res.send(proof.data);
  } catch (error) {
    sendPaymentError(error, res, next);
  }
});

export function requestAuditContext(req: Request) {
  return { ip: req.ip, userAgent: req.get("user-agent")?.slice(0, 512) };
}

export function sendPaymentError(error: unknown, res: import("express").Response, next: import("express").NextFunction): void {
  if (error instanceof z.ZodError) {
    res.status(400).json({ error: "Revisá los datos de la solicitud." });
    return;
  }
  if (error instanceof PaymentRequestError) {
    res.status(error.statusCode).json({ error: error.message });
    return;
  }
  next(error);
}

export default router;
