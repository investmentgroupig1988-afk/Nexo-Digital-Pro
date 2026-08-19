import { Router, type IRouter, type Request } from "express";
import { z } from "zod";
import { and, auditActions, auditLogs, desc, eq, getDatabase, ilike, or, sessions, users } from "@workspace/db";
import { currentAuthenticatedUser, requirePermission } from "../auth/session";
import { trustedMutationOrigin } from "../middlewares/security";
import { AccessStateError, getEffectiveAccess, grantLifetimeAccess, listAccessHistory, restoreAccess, revokeAccess } from "../services/access";
import { writeAuditLog } from "../services/audit";
import { serializeAccess } from "./account";

const router: IRouter = Router();
const userIdSchema = z.string().trim().min(1).max(128);
const reasonSchema = z.object({ reason: z.string().trim().max(500).optional() });
const roleSchema = z.object({ role: z.enum(["user", "admin"]) });

router.use(trustedMutationOrigin);

router.get("/admin/users", requirePermission("users.read"), async (req, res, next) => {
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

router.get("/admin/users/:id", requirePermission("users.read"), async (req, res, next) => {
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

router.post("/admin/users/:id/grant-access", requirePermission("access.grant"), async (req, res, next) => {
  try {
    const targetUserId = userIdSchema.parse(req.params.id);
    const input = reasonSchema.parse(req.body);
    if (!await findUser(targetUserId)) {
      res.status(404).json({ error: "User not found." });
      return;
    }
    const actor = currentAuthenticatedUser(res);
    const result = await grantLifetimeAccess({ userId: targetUserId, actorUserId: actor.id, reason: input.reason, context: requestAuditContext(req) });
    res.status(result.changed ? 201 : 200).json({ access: serializeAccess({ hasAccess: true, grant: result.grant }), changed: result.changed });
  } catch (error) {
    sendAdminError(error, res, next);
  }
});

router.post("/admin/users/:id/revoke-access", requirePermission("access.revoke"), async (req, res, next) => {
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

router.post("/admin/users/:id/restore-access", requirePermission("access.grant"), async (req, res, next) => {
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

router.post("/admin/users/:id/block", requirePermission("users.block"), async (req, res, next) => {
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

router.post("/admin/users/:id/unblock", requirePermission("users.block"), async (req, res, next) => {
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

router.post("/admin/users/:id/role", requirePermission("admins.manage"), async (req, res, next) => {
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

router.get("/admin/audit", requirePermission("analytics.read"), async (req, res, next) => {
  try {
    const limit = z.coerce.number().int().min(1).max(200).default(100).parse(req.query.limit);
    const entries = await getDatabase().select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(limit);
    res.json({ audit: entries });
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
  next(error);
}

export default router;
