import { existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  accessGrants,
  accounts,
  auditLogs,
  closeDatabase,
  desc,
  eq,
  getDatabase,
  or,
  sessions,
  users,
} from "./index";

const root = resolve(import.meta.dirname, "../../..");
const envPath = resolve(root, ".env");
if (!process.env.DATABASE_URL && existsSync(envPath)) process.loadEnvFile(envPath);

const emails = [...new Set(
  (process.env.AUTH_DIAGNOSTIC_EMAILS ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean),
)];

if (!process.env.DATABASE_URL || emails.length === 0) {
  throw new Error("DATABASE_URL and AUTH_DIAGNOSTIC_EMAILS (comma-separated) are required. This command is read-only.");
}

const db = getDatabase();
try {
  const records = await Promise.all(emails.map(async (email) => {
    const [user] = await db
      .select({
        id: users.id,
        email: users.email,
        username: users.username,
        role: users.role,
        status: users.status,
        createdAt: users.createdAt,
        lastLoginAt: users.lastLoginAt,
      })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (!user) return { email, user: null };

    const [accountRows, sessionRows, grants, events] = await Promise.all([
      db.select({
        id: accounts.id,
        providerId: accounts.providerId,
        issuer: accounts.issuer,
        accountId: accounts.accountId,
        createdAt: accounts.createdAt,
      }).from(accounts).where(eq(accounts.userId, user.id)),
      db.select({ id: sessions.id, expiresAt: sessions.expiresAt, createdAt: sessions.createdAt })
        .from(sessions)
        .where(eq(sessions.userId, user.id)),
      db.select({
        id: accessGrants.id,
        plan: accessGrants.plan,
        accessType: accessGrants.accessType,
        status: accessGrants.status,
        grantedAt: accessGrants.grantedAt,
        revokedAt: accessGrants.revokedAt,
        expiresAt: accessGrants.expiresAt,
      }).from(accessGrants).where(eq(accessGrants.userId, user.id)),
      db.select({
        action: auditLogs.action,
        createdAt: auditLogs.createdAt,
        actorUserId: auditLogs.actorUserId,
        targetUserId: auditLogs.targetUserId,
      })
        .from(auditLogs)
        .where(or(eq(auditLogs.actorUserId, user.id), eq(auditLogs.targetUserId, user.id)))
        .orderBy(desc(auditLogs.createdAt))
        .limit(25),
    ]);

    const credential = accountRows.find((account) => (
      account.providerId === "credential" &&
      account.issuer === "local:credential" &&
      account.accountId === user.id
    ));

    return {
      email,
      user,
      credentialAccountPresent: Boolean(credential),
      accounts: accountRows,
      sessionCount: sessionRows.length,
      sessions: sessionRows,
      accessGrants: grants,
      auditEvents: events,
    };
  }));

  console.log(JSON.stringify({
    mode: "read-only",
    checkedAt: new Date().toISOString(),
    records,
  }, null, 2));
} finally {
  await closeDatabase();
}
