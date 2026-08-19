import { auditLogs, type AuditAction, getDatabase, users } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger";

type AuthEvent = "registration" | "login" | "logout";

const authAuditActions: Record<AuthEvent, AuditAction> = {
  registration: "USER_REGISTERED",
  login: "USER_LOGIN",
  logout: "USER_LOGOUT",
};

/**
 * Better Auth commits its identity transaction before database after-hooks run.
 * Audit persistence must therefore never turn a valid identity into an apparent
 * failed sign-up or login. Failures are logged with a safe, searchable code.
 */
export async function recordAuthEvent(userId: string, event: AuthEvent): Promise<void> {
  try {
    await getDatabase().transaction(async (transaction) => {
      if (event === "login") {
        await transaction
          .update(users)
          .set({ lastLoginAt: new Date(), updatedAt: new Date() })
          .where(eq(users.id, userId));
      }
      await transaction.insert(auditLogs).values({
        actorUserId: userId,
        targetUserId: userId,
        action: authAuditActions[event],
        metadata: { source: "email_password" },
      });
    });
  } catch (error) {
    logger.error(
      { err: error, authEvent: event, userId, errorCode: "AUTH_AUDIT_WRITE_FAILED" },
      "Authentication succeeded but its audit event could not be persisted",
    );
  }
}
