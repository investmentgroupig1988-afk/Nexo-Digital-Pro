import { Router, type IRouter, type Request } from "express";
import { z } from "zod";
import { accessPlans, auditActions, auditLogs, desc, eq, getDatabase, ilike, inArray, or, paymentRequestStatuses, sessions, users } from "@workspace/db";
import { currentAuthenticatedUser, requireAdminRole } from "../auth/session";
import { trustedMutationOrigin } from "../middlewares/security";
import { AccessStateError, getEffectiveAccess, grantAccess, listAccessHistory, restoreAccess, revokeAccess } from "../services/access";
import { writeAuditLog } from "../services/audit";
import { listPaymentRequests, PaymentRequestError, reviewPaymentRequest } from "../services/payment-requests";
import { serializeAccess } from "./account";
import { getSignalEngineHealth } from "../services/signal-refresh";
import { getAdminReadiness } from "../services/readiness";

const router: IRouter = Router();
const userIdSchema = z.string().trim().min(1).max(128);
const reasonSchema = z.object({ reason: z.string().trim().max(500).optional() });
const grantSchema = z.object({
  reason: z.string().trim().max(500).optional(),
  plan: z.enum([accessPlans.foundersLifetime, accessPlans.partner, accessPlans.tester, accessPlans.complimentary]).default(accessPlans.foundersLifetime),
  expiresAt: z.string().datetime({ offset: true }).nullable().optional(),
}).superRefine((input, context) => {
  if (input.plan === accessPlans.foundersLifetime && input.expiresAt) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Founders no admite vencimiento.", path: ["expiresAt"] });
  }
});
const reviewSchema = z.object({
  decision: z.enum([paymentRequestStatuses.approved, paymentRequestStatuses.rejected, paymentRequestStatuses.needsReview]),
  notes: z.string().trim().max(2_000).optional(),
});
const roleSchema = z.object({ role: z.enum(["user", "admin"]) });

router.use(trustedMutationOrigin);
router.use("/admin", requireAdminRole());

router.get("/admin/users", async (req, res, next) => {
  try {
    const query = z.object({
      q: z.string().trim().max(120).optional(),
      limit: z.coerce.number().int().min(1).max(100).default(25),
    }).parse(req.query);
    const filter = query.q
      ? or(ilike(users.email, `%${query.q}%`), ilike(users.username, `%${query.q}%`))
      : undefined;
    const rows = await getDatabase()
      .select({
        id: users.id,
        email: users.email,
        username: users.displayUsername,
        role: users.role,
        status: users.status,
        createdAt: users.createdAt,
        lastLoginAt: users.lastLoginAt,
      })
      .from(users)
      .where(filter)
      .orderBy(desc(users.createdAt))
      .limit(query.limit);

    const enriched = await Promise.all(rows.map(async (user) => ({
      ...user,
      access: serializeAccess(await getEffectiveAccess(user.id)),
    })));
    res.json({ users: enriched });
  } catch (error) {
    next(error);
  }
});

router.get("/admin/users/:id", async (req, res, next) => {
  try {
    const id = userIdSchema.parse(req.params.id);
    const user = await findUser(id);
    if (!user) {
      res.status(404).json({ error: "User not found." });
      return;
    }
    const [history, audit] = await Promise.all([
      listAccessHistory(id),
      getDatabase().select().from(auditLogs).where(eq(auditLogs.targetUserId, id)).orderBy(desc(auditLogs.createdAt)).limit(100),
    ]);
    res.json({ user, access: serializeAccess(await getEffectiveAccess(id)), accessHistory: history, audit });
  } catch (error) {
    next(error);
  }
});

router.post("/admin/users/:id/grant-access", async (req, res, next) => {
  try {
    const targetUserId = userIdSchema.parse(req.params.id);
    const input = grantSchema.parse(req.body);
    if (!await findUser(targetUserId)) {
      res.status(404).json({ error: "User not found." });
      return;
    }
    const actor = currentAuthenticatedUser(res);
    const result = await grantAccess({
      userId: targetUserId,
      actorUserId: actor.id,
      plan: input.plan,
      reason: input.reason,
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
      context: requestAuditContext(req),
    });
    res.status(result.changed ? 201 : 200).json({ access: serializeAccess({ hasAccess: true, grant: result.grant }), changed: result.changed });
  } catch (error) {
    sendAdminError(error, res, next);
  }
});

router.get("/admin/payment-requests", async (_req, res, next) => {
  try {
    res.json({ requests: await listPaymentRequests() });
  } catch (error) {
    next(error);
  }
});

router.post("/admin/payment-requests/:id/review", async (req, res, next) => {
  try {
    const requestId = z.string().uuid().parse(req.params.id);
    const review = reviewSchema.parse(req.body);
    const actor = currentAuthenticatedUser(res);
    const result = await reviewPaymentRequest({
      requestId,
      actor,
      decision: review.decision,
      notes: review.notes,
      context: requestAuditContext(req),
    });
    res.json(result);
  } catch (error) {
    sendAdminError(error, res, next);
  }
});

router.post("/admin/users/:id/revoke-access", async (req, res, next) => {
  try {
    const targetUserId = userIdSchema.parse(req.params.id);
    const input = reasonSchema.parse(req.body);
    const actor = currentAuthenticatedUser(res);
    const grant = await revokeAccess({ userId: targetUserId, actorUserId: actor.id, reason: input.reason, context: requestAuditContext(req) });
    res.json({ access: serializeAccess({ hasAccess: false, grant }), changed: true });
  } catch (error) {
    sendAdminError(error, res, next);
  }
});

router.post("/admin/users/:id/restore-access", async (req, res, next) => {
  try {
    const targetUserId = userIdSchema.parse(req.params.id);
    const input = reasonSchema.parse(req.body);
    const actor = currentAuthenticatedUser(res);
    const result = await restoreAccess({ userId: targetUserId, actorUserId: actor.id, reason: input.reason, context: requestAuditContext(req) });
    res.json({ access: serializeAccess({ hasAccess: true, grant: result.grant }), changed: result.changed });
  } catch (error) {
    sendAdminError(error, res, next);
  }
});

router.post("/admin/users/:id/block", async (req, res, next) => {
  try {
    const targetUserId = userIdSchema.parse(req.params.id);
    const input = reasonSchema.parse(req.body);
    const actor = currentAuthenticatedUser(res);
    if (actor.id === targetUserId) {
      res.status(400).json({ error: "Administrators cannot block their own account." });
      return;
    }
    const [updated] = await getDatabase().update(users).set({ status: "blocked", updatedAt: new Date() }).where(eq(users.id, targetUserId)).returning({ id: users.id, status: users.status });
    if (!updated) {
      res.status(404).json({ error: "User not found." });
      return;
    }
    await getDatabase().delete(sessions).where(eq(sessions.userId, targetUserId));
    await writeAuditLog({ actorUserId: actor.id, targetUserId, action: auditActions.userBlocked, metadata: { reason: input.reason ?? null }, context: requestAuditContext(req) });
    res.json({ user: updated });
  } catch (error) {
    sendAdminError(error, res, next);
  }
});

router.post("/admin/users/:id/unblock", async (req, res, next) => {
  try {
    const targetUserId = userIdSchema.parse(req.params.id);
    const input = reasonSchema.parse(req.body);
    const actor = currentAuthenticatedUser(res);
    const [updated] = await getDatabase().update(users).set({ status: "active", updatedAt: new Date() }).where(eq(users.id, targetUserId)).returning({ id: users.id, status: users.status });
    if (!updated) {
      res.status(404).json({ error: "User not found." });
      return;
    }
    await writeAuditLog({ actorUserId: actor.id, targetUserId, action: auditActions.userUnblocked, metadata: { reason: input.reason ?? null }, context: requestAuditContext(req) });
    res.json({ user: updated });
  } catch (error) {
    sendAdminError(error, res, next);
  }
});

router.post("/admin/users/:id/role", async (req, res, next) => {
  try {
    const targetUserId = userIdSchema.parse(req.params.id);
    const input = roleSchema.parse(req.body);
    const actor = currentAuthenticatedUser(res);
    if (actor.id === targetUserId && input.role !== "admin") {
      res.status(400).json({ error: "Administrators cannot remove their own administrator role." });
      return;
    }
    const [updated] = await getDatabase().update(users).set({ role: input.role, updatedAt: new Date() }).where(eq(users.id, targetUserId)).returning({ id: users.id, role: users.role });
    if (!updated) {
      res.status(404).json({ error: "User not found." });
      return;
    }
    await writeAuditLog({ actorUserId: actor.id, targetUserId, action: auditActions.roleChanged, metadata: { role: input.role }, context: requestAuditContext(req) });
    res.json({ user: updated });
  } catch (error) {
    sendAdminError(error, res, next);
  }
});

router.get("/admin/audit", async (req, res, next) => {
  try {
    const limit = z.coerce.number().int().min(1).max(200).default(100).parse(req.query.limit);
    const entries = await getDatabase().select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(limit);
    const userIds = [...new Set(entries.flatMap((entry) => [entry.actorUserId, entry.targetUserId]).filter((id): id is string => Boolean(id)))];
    const identities = userIds.length
      ? await getDatabase().select({ id: users.id, username: users.displayUsername, email: users.email }).from(users).where(inArray(users.id, userIds))
      : [];
    const identityById = new Map(identities.map((identity) => [identity.id, { username: identity.username, email: identity.email }]));
    res.json({ audit: entries.map((entry) => ({
      ...entry,
      actor: entry.actorUserId ? identityById.get(entry.actorUserId) ?? null : null,
      target: entry.targetUserId ? identityById.get(entry.targetUserId) ?? null : null,
    })) });
  } catch (error) {
    next(error);
  }
});

router.get("/admin/signal-engine", (_req, res) => {
  res.json(getSignalEngineHealth());
});

router.get("/admin/readiness", async (_req, res, next) => {
  try {
    res.json(await getAdminReadiness());
  } catch (error) {
    next(error);
  }
});

async function findUser(id: string) {
  const [user] = await getDatabase()
    .select({
      id: users.id,
      email: users.email,
      username: users.displayUsername,
      role: users.role,
      status: users.status,
      createdAt: users.createdAt,
      updatedAt: users.updatedAt,
      lastLoginAt: users.lastLoginAt,
    })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);
  return user ?? null;
}

function requestAuditContext(req: Request) {
  return {
    ip: req.ip,
    userAgent: req.get("user-agent")?.slice(0, 512),
  };
}

function sendAdminError(error: unknown, res: import("express").Response, next: import("express").NextFunction): void {
  if (error instanceof z.ZodError) {
    res.status(400).json({ error: "Invalid request input." });
    return;
  }
  if (error instanceof AccessStateError) {
    res.status(409).json({ error: error.message });
    return;
  }
  if (error instanceof PaymentRequestError) {
    res.status(error.statusCode).json({ error: error.message });
    return;
  }
  next(error);
}

export default router;
