import { auditLogs, type AuditAction, getDatabase } from "@workspace/db";

export type AuditContext = {
  ip?: string;
  userAgent?: string;
};

export async function writeAuditLog(input: {
  actorUserId?: string | null;
  targetUserId?: string | null;
  action: AuditAction;
  metadata?: Record<string, string | number | boolean | null>;
  context?: AuditContext;
}, database = getDatabase()): Promise<void> {
  await database.insert(auditLogs).values({
    actorUserId: input.actorUserId ?? null,
    targetUserId: input.targetUserId ?? null,
    action: input.action,
    metadata: input.metadata ?? {},
    ip: input.context?.ip,
    userAgent: input.context?.userAgent,
  });
}
