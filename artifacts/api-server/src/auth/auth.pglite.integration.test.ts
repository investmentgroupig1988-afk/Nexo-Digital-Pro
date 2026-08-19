import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { after, before, test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { accounts, sessions, users, verifications } from "@workspace/db";
import { createAuthForDatabase } from "./auth";

const migrationFolder = resolve(import.meta.dirname, "../../../../lib/db/drizzle");
const origin = "http://127.0.0.1";
const testPassword = "correct-password-for-isolated-postgres-test";

let pglite: PGlite;
let database: ReturnType<typeof drizzle>;
let auth: ReturnType<typeof createAuthForDatabase>;

before(async () => {
  pglite = new PGlite();
  await applyMigrations(pglite, migrationFolder);
  database = drizzle(pglite, { schema: { accounts, sessions, users, verifications } });
  auth = createAuthForDatabase(database, {
    // This value exists only to satisfy Better Auth's configuration contract;
    // PGlite is in-memory and never contacts a network database.
    databaseUrl: "postgresql://isolated-auth-test",
    betterAuthUrl: origin,
    betterAuthSecret: "isolated-auth-test-secret-that-is-at-least-thirty-two-characters",
    corsOrigins: new Set([origin]),
    nodeEnv: "test",
    authCookieSameSite: "lax",
    authCookieDomain: undefined,
  });
});

after(async () => {
  await pglite.close();
});

test("email signup atomically creates a credential account, session, and login-capable user", async () => {
  const suffix = randomUUID();
  const email = `member-${suffix}@example.test`;
  const username = `member_${suffix.replaceAll("-", "").slice(0, 20)}`;

  const signup = await auth.api.signUpEmail({
    body: { email, password: testPassword, username, displayUsername: username, name: "Member" },
    headers: new Headers({ origin }),
  });
  assert.equal(signup.user.email, email);
  assert.ok(signup.token, "signup must return a session token");

  const [storedUser] = await database.select().from(users).where(eq(users.id, signup.user.id));
  assert.ok(storedUser);
  assert.equal(storedUser.username, username);
  assert.equal(storedUser.role, "user");
  assert.equal(storedUser.status, "active");

  const [credential] = await database.select().from(accounts).where(eq(accounts.userId, signup.user.id));
  assert.ok(credential, "a credential account must be persisted with the user");
  assert.equal(credential.providerId, "credential");
  assert.equal(credential.issuer, "local:credential");
  assert.equal(credential.accountId, signup.user.id);
  assert.ok(credential.password);
  assert.notEqual(credential.password, testPassword);

  const [signupSession] = await database.select().from(sessions).where(eq(sessions.token, signup.token));
  assert.ok(signupSession, "signup must establish a persisted session");
  assert.equal(signupSession.userId, signup.user.id);

  const loginResponse = await auth.api.signInEmail({
    body: { email, password: testPassword },
    headers: new Headers({ origin }),
    asResponse: true,
  });
  assert.equal(loginResponse.status, 200);
  const login = await loginResponse.clone().json() as { token: string; user: { id: string } };
  assert.equal(login.user.id, signup.user.id);
  const [loginSession] = await database.select().from(sessions).where(eq(sessions.token, login.token));
  assert.ok(loginSession, "sign-in must establish a valid persisted session");

  const sessionCookie = loginResponse.headers.get("set-cookie")?.split(";", 1)[0];
  assert.ok(sessionCookie, "login must issue an HttpOnly session cookie");
  const logoutResponse = await auth.api.signOut({
    headers: new Headers({ cookie: sessionCookie }),
    asResponse: true,
  });
  assert.equal(logoutResponse.status, 200);
  const remainingLoginSessions = await database.select().from(sessions).where(eq(sessions.token, login.token));
  assert.equal(remainingLoginSessions.length, 0, "logout must remove the authenticated session");
});

test("duplicate email and username are rejected without producing a second identity", async () => {
  const suffix = randomUUID();
  const email = `duplicate-${suffix}@example.test`;
  const username = `duplicate_${suffix.replaceAll("-", "").slice(0, 18)}`;
  const first = { email, password: testPassword, username, displayUsername: username, name: "Duplicate" };

  await auth.api.signUpEmail({ body: first, headers: new Headers({ origin }) });
  await assert.rejects(() => auth.api.signUpEmail({
    body: { ...first, username: `${username}x`, displayUsername: `${username}x` },
    headers: new Headers({ origin }),
  }));
  await assert.rejects(() => auth.api.signUpEmail({
    body: { ...first, email: `other-${suffix}@example.test` },
    headers: new Headers({ origin }),
  }));

  const matchingUsers = await database.select().from(users).where(eq(users.email, email));
  assert.equal(matchingUsers.length, 1);
});

test("a credential write failure rolls back the complete signup transaction", async () => {
  const suffix = randomUUID();
  const email = `rollback-${suffix}@example.test`;
  const username = `rollback_${suffix.replaceAll("-", "").slice(0, 19)}`;

  // This database trigger reproduces the exact class of failure that used to
  // leave a user row behind after Better Auth could not create its account.
  await pglite.exec(`
    CREATE OR REPLACE FUNCTION fail_test_credential_insert() RETURNS trigger
    LANGUAGE plpgsql AS $$
    BEGIN
      IF NEW.user_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM "user" WHERE id = NEW.user_id AND email = '${email}'
      ) THEN
        RAISE EXCEPTION 'forced credential write failure';
      END IF;
      RETURN NEW;
    END;
    $$;
    CREATE TRIGGER reject_test_credential
    BEFORE INSERT ON "account"
    FOR EACH ROW EXECUTE FUNCTION fail_test_credential_insert();
  `);

  const accountCountBefore = (await database.select({ id: accounts.id }).from(accounts)).length;
  const sessionCountBefore = (await database.select({ id: sessions.id }).from(sessions)).length;

  await assert.rejects(() => auth.api.signUpEmail({
    body: { email, password: testPassword, username, displayUsername: username, name: "Rollback" },
    headers: new Headers({ origin }),
  }));

  const orphanUsers = await database.select().from(users).where(eq(users.email, email));
  assert.equal(orphanUsers.length, 0, "the user insert must roll back with the failed account insert");
  assert.equal((await database.select({ id: accounts.id }).from(accounts)).length, accountCountBefore);
  assert.equal((await database.select({ id: sessions.id }).from(sessions)).length, sessionCountBefore);

  await pglite.exec("DROP TRIGGER reject_test_credential ON \"account\"; DROP FUNCTION fail_test_credential_insert();");
});

async function applyMigrations(client: PGlite, directory: string): Promise<void> {
  const migrations = (await readdir(directory))
    .filter((file) => /^\d+_.+\.sql$/.test(file))
    .sort();

  for (const file of migrations) {
    const sql = await readFile(resolve(directory, file), "utf8");
    for (const statement of sql.split("--> statement-breakpoint")) {
      if (statement.trim()) await client.exec(statement);
    }
  }
}
