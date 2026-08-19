import { existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  auditActions,
  auditLogs,
  closeDatabase,
  eq,
  getDatabase,
  users,
} from "./index";

const root = resolve(import.meta.dirname, "../../..");
const envPath = resolve(root, ".env");
if (!process.env.DATABASE_URL && existsSync(envPath)) process.loadEnvFile(envPath);

const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
if (!process.env.DATABASE_URL || !email) {
  throw new Error("DATABASE_URL and ADMIN_EMAIL are required. Register the account before promoting it.");
}

const db = getDatabase();
try {
  const [user] = await db
    .select({ id: users.id, role: users.role })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (!user) {
    throw new Error("No registered user was found for ADMIN_EMAIL.");
  }

  if (user.role !== "admin") {
    await db.transaction(async (transaction) => {
      await transaction
        .update(users)
        .set({ role: "admin", updatedAt: new Date() })
        .where(eq(users.id, user.id));
      await transaction.insert(auditLogs).values({
        targetUserId: user.id,
        action: auditActions.roleChanged,
        metadata: { role: "admin", bootstrap: true },
      });
    });
  }

  console.log(`Administrator role is active for ${email}.`);
} finally {
  await closeDatabase();
}
