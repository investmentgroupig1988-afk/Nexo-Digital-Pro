import {
  accessGrantStatuses,
  accessGrants,
  and,
  desc,
  eq,
  gt,
  isNull,
  or,
  accessPlans,
  accessTypes,
  type AccessPlan,
  type AuditAction,
  getDatabase,
} from "@workspace/db";
import { type AuditContext, writeAuditLog } from "./audit";

export type EffectiveAccess = {
  hasAccess: boolean;
  grant: typeof accessGrants.$inferSelect | null;
};

export class AccessStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AccessStateError";
  }
}

export async function getEffectiveAccess(userId: string): Promise<EffectiveAccess> {
  const now = new Date();
  const [grant] = await getDatabase()
    .select()
    .from(accessGrants)
    .where(and(
      eq(accessGrants.userId, userId),
      eq(accessGrants.status, accessGrantStatuses.active),
      or(isNull(accessGrants.expiresAt), gt(accessGrants.expiresAt, now)),
    ))
    .orderBy(desc(accessGrants.grantedAt), desc(accessGrants.createdAt))
    .limit(1);

  return { hasAccess: Boolean(grant), grant: grant ?? null };
}

export async function listAccessHistory(userId: string) {
  return getDatabase()
    .select()
    .from(accessGrants)
    .where(eq(accessGrants.userId, userId))
    .orderBy(desc(accessGrants.createdAt));
}

export async function grantLifetimeAccess(input: {
  userId: string;
  actorUserId: string;
  reason?: string;
  context?: AuditContext;
}) {
  const existing = await getEffectiveAccess(input.userId);
  if (existing.grant) return { grant: existing.grant, changed: false };

  const now = new Date();
  const [grant] = await getDatabase().insert(accessGrants).values({
    userId: input.userId,
    plan: accessPlans.foundersLifetime,
    accessType: accessTypes.adminManual,
    status: accessGrantStatuses.active,
    grantedAt: now,
    grantedBy: input.actorUserId,
    reason: input.reason?.trim() || null,
    // FOUNDERS_LIFETIME remains active without an expiration timestamp.
    expiresAt: null,
    updatedAt: now,
  }).returning();

  await writeAccessAudit(input, "ACCESS_GRANTED", grant.id);
  return { grant, changed: true };
}

export async function revokeAccess(input: {
  userId: string;
  actorUserId: string;
  reason?: string;
  context?: AuditContext;
}) {
  const effective = await getEffectiveAccess(input.userId);
  if (!effective.grant) throw new AccessStateError("The user has no active access to revoke.");

  const now = new Date();
  const [grant] = await getDatabase().update(accessGrants).set({
    status: accessGrantStatuses.revoked,
    revokedAt: now,
    revokedBy: input.actorUserId,
    reason: input.reason?.trim() || effective.grant.reason,
    updatedAt: now,
  }).where(eq(accessGrants.id, effective.grant.id)).returning();

  await writeAccessAudit(input, "ACCESS_REVOKED", grant.id);
  return grant;
}

export async function restoreAccess(input: {
  userId: string;
  actorUserId: string;
  reason?: string;
  context?: AuditContext;
}) {
  const existing = await getEffectiveAccess(input.userId);
  if (existing.grant) return { grant: existing.grant, changed: false };

  const [previous] = await getDatabase()
    .select()
    .from(accessGrants)
    .where(and(eq(accessGrants.userId, input.userId), eq(accessGrants.status, accessGrantStatuses.revoked)))
    .orderBy(desc(accessGrants.updatedAt))
    .limit(1);
  if (!previous) throw new AccessStateError("The user has no revoked access to restore.");

  const now = new Date();
  const [grant] = await getDatabase().update(accessGrants).set({
    status: accessGrantStatuses.active,
    grantedAt: now,
    grantedBy: input.actorUserId,
    revokedAt: null,
    revokedBy: null,
    reason: input.reason?.trim() || previous.reason,
    expiresAt: previous.plan === accessPlans.foundersLifetime ? null : previous.expiresAt,
    updatedAt: now,
  }).where(eq(accessGrants.id, previous.id)).returning();

  await writeAccessAudit(input, "ACCESS_RESTORED", grant.id);
  return { grant, changed: true };
}

async function writeAccessAudit(
  input: { userId: string; actorUserId: string; context?: AuditContext },
  action: AuditAction,
  grantId: string,
): Promise<void> {
  await writeAuditLog({
    actorUserId: input.actorUserId,
    targetUserId: input.userId,
    action,
    metadata: { grantId },
    context: input.context,
  });
}
