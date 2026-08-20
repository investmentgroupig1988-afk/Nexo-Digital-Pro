import {
  accessGrantStatuses,
  accessGrants,
  and,
  desc,
  eq,
  gt,
  inArray,
  isNull,
  or,
  accessPlans,
  accessTypes,
  type AccessPlan,
  type AccessType,
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

type AccessDatabase = ReturnType<typeof getDatabase>;

export async function getEffectiveAccess(userId: string, database: AccessDatabase = getDatabase()): Promise<EffectiveAccess> {
  const now = new Date();
  const [grant] = await database
    .select()
    .from(accessGrants)
    .where(and(
      eq(accessGrants.userId, userId),
      eq(accessGrants.status, accessGrantStatuses.active),
      or(isNull(accessGrants.expiresAt), gt(accessGrants.expiresAt, now)),
    ))
    .orderBy(desc(accessGrants.grantedAt), desc(accessGrants.createdAt))
    .limit(1);

  if (grant) return { hasAccess: true, grant };

  const [latest] = await database.select().from(accessGrants)
    .where(eq(accessGrants.userId, userId))
    .orderBy(desc(accessGrants.updatedAt), desc(accessGrants.createdAt))
    .limit(1);
  if (!latest) return { hasAccess: false, grant: null };
  if (latest.status === accessGrantStatuses.active && latest.expiresAt && latest.expiresAt <= now) {
    return { hasAccess: false, grant: { ...latest, status: accessGrantStatuses.expired } };
  }
  return { hasAccess: false, grant: latest };
}

export async function listAccessHistory(userId: string, database: AccessDatabase = getDatabase()) {
  return database
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
}, database: AccessDatabase = getDatabase()) {
  return grantAccess({ ...input, plan: accessPlans.foundersLifetime, accessType: accessTypes.adminManual, expiresAt: null }, database);
}

export async function grantAccess(input: {
  userId: string;
  actorUserId: string;
  plan: AccessPlan;
  accessType?: AccessType;
  reason?: string;
  expiresAt?: Date | null;
  context?: AuditContext;
}, database: AccessDatabase = getDatabase()) {
  const now = new Date();
  const expiresAt = input.plan === accessPlans.foundersLifetime ? null : input.expiresAt ?? null;
  if (expiresAt && expiresAt <= now) throw new AccessStateError("The access expiration must be in the future.");

  const [existing] = await database
    .select()
    .from(accessGrants)
    .where(and(
      eq(accessGrants.userId, input.userId),
      eq(accessGrants.plan, input.plan),
      eq(accessGrants.status, accessGrantStatuses.active),
      or(isNull(accessGrants.expiresAt), gt(accessGrants.expiresAt, now)),
    ))
    .orderBy(desc(accessGrants.grantedAt), desc(accessGrants.createdAt))
    .limit(1);
  if (existing) return { grant: existing, changed: false };

  const [grant] = await database.insert(accessGrants).values({
    userId: input.userId,
    plan: input.plan,
    accessType: input.accessType ?? accessTypes.adminManual,
    status: accessGrantStatuses.active,
    grantedAt: now,
    grantedBy: input.actorUserId,
    reason: input.reason?.trim() || null,
    expiresAt,
    updatedAt: now,
  }).returning();

  await writeAccessAudit(input, "ACCESS_GRANTED", grant.id, database, {
    plan: input.plan,
    accessType: input.accessType ?? accessTypes.adminManual,
    expiresAt: expiresAt?.toISOString() ?? null,
  });
  return { grant, changed: true };
}

export async function revokeAccess(input: {
  userId: string;
  actorUserId: string;
  reason?: string;
  context?: AuditContext;
}, database: AccessDatabase = getDatabase()) {
  const now = new Date();
  const active = await database.select().from(accessGrants).where(and(
    eq(accessGrants.userId, input.userId),
    eq(accessGrants.status, accessGrantStatuses.active),
    or(isNull(accessGrants.expiresAt), gt(accessGrants.expiresAt, now)),
  )).orderBy(desc(accessGrants.grantedAt), desc(accessGrants.createdAt));
  if (!active.length) throw new AccessStateError("The user has no active access to revoke.");

  const grants = await database.update(accessGrants).set({
    status: accessGrantStatuses.revoked,
    revokedAt: now,
    revokedBy: input.actorUserId,
    reason: input.reason?.trim() || active[0].reason,
    updatedAt: now,
  }).where(inArray(accessGrants.id, active.map((grant) => grant.id))).returning();
  const grant = grants.find((candidate) => candidate.id === active[0].id) ?? grants[0];

  await writeAccessAudit(input, "ACCESS_REVOKED", grant.id, database, { revokedGrantCount: grants.length });
  return grant;
}

export async function restoreAccess(input: {
  userId: string;
  actorUserId: string;
  reason?: string;
  context?: AuditContext;
}, database: AccessDatabase = getDatabase()) {
  const existing = await getEffectiveAccess(input.userId, database);
  if (existing.hasAccess && existing.grant) return { grant: existing.grant, changed: false };

  const [previous] = await database
    .select()
    .from(accessGrants)
    .where(and(eq(accessGrants.userId, input.userId), eq(accessGrants.status, accessGrantStatuses.revoked)))
    .orderBy(desc(accessGrants.updatedAt))
    .limit(1);
  if (!previous) throw new AccessStateError("The user has no revoked access to restore.");

  const now = new Date();
  if (previous.expiresAt && previous.expiresAt <= now) {
    throw new AccessStateError("The revoked access already expired and cannot be restored.");
  }
  const [grant] = await database.update(accessGrants).set({
    status: accessGrantStatuses.active,
    grantedAt: now,
    grantedBy: input.actorUserId,
    revokedAt: null,
    revokedBy: null,
    reason: input.reason?.trim() || previous.reason,
    expiresAt: previous.plan === accessPlans.foundersLifetime ? null : previous.expiresAt,
    updatedAt: now,
  }).where(eq(accessGrants.id, previous.id)).returning();

  await writeAccessAudit(input, "ACCESS_RESTORED", grant.id, database);
  return { grant, changed: true };
}

async function writeAccessAudit(
  input: { userId: string; actorUserId: string; context?: AuditContext },
  action: AuditAction,
  grantId: string,
  database: AccessDatabase,
  metadata: Record<string, string | number | boolean | null> = {},
): Promise<void> {
  await writeAuditLog({
    actorUserId: input.actorUserId,
    targetUserId: input.userId,
    action,
    metadata: { grantId, ...metadata },
    context: input.context,
  }, database);
}
