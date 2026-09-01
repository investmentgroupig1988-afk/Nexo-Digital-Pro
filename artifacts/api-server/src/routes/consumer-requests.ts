import { Router, type IRouter, type Request } from "express";
import { z } from "zod";
import { consumerRequestStatuses, consumerRequestTypes } from "@workspace/db";
import { currentAuthenticatedUser, requireAdminRole } from "../auth/session";
import { trustedMutationOrigin } from "../middlewares/security";
import { createConsumerRequest, listConsumerRequests, updateConsumerRequest, ConsumerRequestError } from "../services/consumer-requests";

const router: IRouter = Router();
const createSchema = z.object({
  type: z.enum([consumerRequestTypes.withdrawal, consumerRequestTypes.serviceCancellation]),
  email: z.string().trim().email().max(320).transform((value) => value.toLowerCase()),
  paymentReference: z.string().trim().max(255).optional(),
  description: z.string().trim().max(2_000).optional(),
});
const reviewSchema = z.object({
  status: z.enum([consumerRequestStatuses.reviewing, consumerRequestStatuses.approved, consumerRequestStatuses.rejected, consumerRequestStatuses.completed]),
  notes: z.string().trim().max(2_000).optional(),
});

router.use("/consumer-requests", trustedMutationOrigin);

router.post("/consumer-requests", async (req, res, next) => {
  try {
    const input = createSchema.parse(req.body);
    const request = await createConsumerRequest({ ...input, context: auditContext(req) });
    res.status(201).json({ request, message: "Tu solicitud quedó registrada. Conservá el código para cualquier consulta." });
  } catch (error) {
    sendError(error, res, next);
  }
});

router.get("/admin/consumer-requests", requireAdminRole(), async (_req, res, next) => {
  try { res.json({ requests: await listConsumerRequests() }); } catch (error) { next(error); }
});

router.post("/admin/consumer-requests/:id/review", requireAdminRole(), async (req, res, next) => {
  try {
    const id = z.string().uuid().parse(req.params.id);
    const input = reviewSchema.parse(req.body);
    const actor = currentAuthenticatedUser(res);
    res.json({ request: await updateConsumerRequest({ id, actorUserId: actor.id, status: input.status, notes: input.notes, context: auditContext(req) }) });
  } catch (error) {
    sendError(error, res, next);
  }
});

function auditContext(req: Request) { return { ip: req.ip, userAgent: req.get("user-agent")?.slice(0, 512) }; }
function sendError(error: unknown, res: import("express").Response, next: import("express").NextFunction) {
  if (error instanceof z.ZodError) { res.status(400).json({ error: "Revisá los datos de la solicitud." }); return; }
  if (error instanceof ConsumerRequestError) { res.status(error.statusCode).json({ error: error.message }); return; }
  next(error);
}

export default router;
