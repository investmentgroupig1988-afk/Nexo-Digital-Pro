import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { after, before, test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { createEmailVerificationToken } from "better-auth/api";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { accounts, sessions, users, verifications } from "@workspace/db";
import { createAuthForDatabase } from "./auth";
import type { AuthEmailInput } from "../services/email";

const migrationFolder = resolve(import.meta.dirname, "../../../../lib/db/drizzle");
const origin = "http://127.0.0.1";
const testPassword = "correct-password-for-isolated-postgres-test";
const authSecret = "isolated-auth-test-secret-that-is-at-least-thirty-two-characters";

let pglite: PGlite;
let database: ReturnType<typeof drizzle>;
let auth: ReturnType<typeof createAuthForDatabase>;
const sentAuthEmails: AuthEmailInput[] = [];

before(async () => {
  pglite = new PGlite();
  await applyMigrations(pglite, migrationFolder);
  database = drizzle(pglite, { schema: { accounts, sessions, users, verifications } });
  auth = createAuthForDatabase(database, {
    // This value exists only to satisfy Better Auth's configuration contract;
    // PGlite is in-memory and never contacts a network database.
    databaseUrl: "postgresql://isolated-auth-test",
    betterAuthUrl: origin,
    betterAuthSecret: authSecret,
    corsOrigins: new Set([origin]),
    nodeEnv: "test",
    authCookieSameSite: "lax",
    authCookieDomain: undefined,
  }, {
    send: async (input) => { sentAuthEmails.push(input); },
    sendVerificationOnSignUp: false,
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
  const setCookie = loginResponse.headers.get("set-cookie") ?? "";
  assert.match(setCookie, /HttpOnly/i);
  assert.match(setCookie, /SameSite=Lax/i, "same-site staging must keep the session cookie first-party compatible");
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

test("password reset is expiring, single-use, revokes sessions, and does not enumerate unknown email", async () => {
  sentAuthEmails.length = 0;
  const suffix = randomUUID();
  const email = `reset-${suffix}@example.test`;
  const username = `reset_${suffix.replaceAll("-", "").slice(0, 20)}`;
  const newPassword = "replacement-password-for-isolated-postgres-test";
  const signup = await auth.api.signUpEmail({
    body: { email, password: testPassword, username, displayUsername: username, name: "Reset Test" },
    headers: new Headers({ origin }),
  });

  await auth.api.requestPasswordReset({
    body: { email, redirectTo: `${origin}/restablecer-contrasena` },
    headers: new Headers({ origin }),
  });
  const delivery = sentAuthEmails.at(-1);
  assert.ok(delivery);
  assert.equal(delivery.kind, "password-reset");
  assert.equal(delivery.to, email);
  assert.ok(delivery.token.length >= 16);

  const [storedToken] = await database.select().from(verifications);
  assert.ok(storedToken?.expiresAt.getTime() > Date.now());
  assert.ok(storedToken.expiresAt.getTime() <= Date.now() + 60 * 60 * 1_000 + 5_000);

  await database.update(verifications).set({ expiresAt: new Date(Date.now() - 1_000) }).where(eq(verifications.id, storedToken.id));
  const expired = await auth.api.resetPassword({
    body: { token: delivery.token, newPassword },
    headers: new Headers({ origin }),
    asResponse: true,
  });
  assert.ok(expired.status >= 400, "an expired reset token must be rejected");

  await auth.api.requestPasswordReset({
    body: { email, redirectTo: `${origin}/restablecer-contrasena` },
    headers: new Headers({ origin }),
  });
  const validDelivery = sentAuthEmails.at(-1);
  assert.ok(validDelivery);
  assert.notEqual(validDelivery.token, delivery.token);

  const reset = await auth.api.resetPassword({
    body: { token: validDelivery.token, newPassword },
    headers: new Headers({ origin }),
    asResponse: true,
  });
  assert.equal(reset.status, 200);
  assert.equal((await database.select().from(sessions).where(eq(sessions.userId, signup.user.id))).length, 0);

  const replay = await auth.api.resetPassword({
    body: { token: validDelivery.token, newPassword: "another-replacement-password-for-test" },
    headers: new Headers({ origin }),
    asResponse: true,
  });
  assert.ok(replay.status >= 400, "the reset token must be single-use");

  const oldLogin = await auth.api.signInEmail({ body: { email, password: testPassword }, headers: new Headers({ origin }), asResponse: true });
  const newLogin = await auth.api.signInEmail({ body: { email, password: newPassword }, headers: new Headers({ origin }), asResponse: true });
  assert.ok(oldLogin.status >= 400);
  assert.equal(newLogin.status, 200);

  const deliveriesBeforeUnknown = sentAuthEmails.length;
  await auth.api.requestPasswordReset({
    body: { email: `unknown-${suffix}@example.test`, redirectTo: `${origin}/restablecer-contrasena` },
    headers: new Headers({ origin }),
  });
  assert.equal(sentAuthEmails.length, deliveriesBeforeUnknown, "unknown accounts must not trigger delivery or reveal existence");
});

test("email verification uses a signed one-hour token and is idempotent after its first effect", async () => {
  sentAuthEmails.length = 0;
  const suffix = randomUUID();
  const email = `verify-${suffix}@example.test`;
  const username = `verify_${suffix.replaceAll("-", "").slice(0, 19)}`;
  const signup = await auth.api.signUpEmail({
    body: { email, password: testPassword, username, displayUsername: username, name: "Verification Test" },
    headers: new Headers({ origin }),
  });
  assert.equal(signup.user.emailVerified, false);

  const expiredToken = await createEmailVerificationToken(authSecret, email, undefined, -1);
  const expired = await auth.api.verifyEmail({ query: { token: expiredToken }, headers: new Headers({ origin }), asResponse: true });
  assert.ok(expired.status >= 400, "an expired email verification token must be rejected");

  await auth.api.sendVerificationEmail({
    body: { email, callbackURL: `${origin}/verificar-email` },
    headers: new Headers({ origin }),
  });
  const delivery = sentAuthEmails.at(-1);
  assert.ok(delivery);
  assert.equal(delivery.kind, "email-verification");
  assert.equal(delivery.to, email);
  const tokenParts = delivery.token.split(".");
  assert.equal(tokenParts.length, 3, "Better Auth email verification must use a signed JWT");
  const tokenPayload = JSON.parse(Buffer.from(tokenParts[1]!, "base64url").toString("utf8")) as { exp: number; iat: number };
  assert.equal(tokenPayload.exp - tokenPayload.iat, 60 * 60);
  assert.equal((await database.select().from(verifications)).length, 0, "the signed token must not be stored in plaintext");

  const signature = tokenParts[2]!;
  const tamperedToken = [tokenParts[0], tokenParts[1], `${signature[0] === "a" ? "b" : "a"}${signature.slice(1)}`].join(".");
  const tampered = await auth.api.verifyEmail({ query: { token: tamperedToken }, headers: new Headers({ origin }), asResponse: true });
  assert.ok(tampered.status >= 400, "a token with a modified signature must be rejected");

  const verified = await auth.api.verifyEmail({ query: { token: delivery.token }, headers: new Headers({ origin }), asResponse: true });
  assert.equal(verified.status, 200);
  const [storedUser] = await database.select().from(users).where(eq(users.id, signup.user.id));
  assert.equal(storedUser.emailVerified, true);

  const replay = await auth.api.verifyEmail({ query: { token: delivery.token }, headers: new Headers({ origin }), asResponse: true });
  assert.equal(replay.status, 200, "Better Auth treats a replay for an already verified account as an idempotent success");
  const [userAfterReplay] = await database.select().from(users).where(eq(users.id, signup.user.id));
  assert.equal(userAfterReplay.emailVerified, true);
  assert.equal((await database.select().from(verifications)).length, 0, "a replay must not create reusable verification state");
});

test("production auth emits a Secure, SameSite=Lax, host-only session cookie", async () => {
  const apiOrigin = "https://api-staging.trenoro.com";
  const frontendOrigin = "https://staging.trenoro.com";
  const productionAuth = createAuthForDatabase(database, {
    databaseUrl: "postgresql://isolated-production-cookie-test",
    betterAuthUrl: apiOrigin,
    betterAuthSecret: "isolated-production-cookie-secret-over-thirty-two-characters",
    corsOrigins: new Set([frontendOrigin]),
    nodeEnv: "production",
    authCookieSameSite: "lax",
    authCookieDomain: undefined,
  });
  const suffix = randomUUID();
  const response = await productionAuth.api.signUpEmail({
    body: {
      email: `secure-cookie-${suffix}@example.test`,
      password: testPassword,
      username: `secure_${suffix.replaceAll("-", "").slice(0, 20)}`,
      displayUsername: `secure_${suffix.replaceAll("-", "").slice(0, 20)}`,
      name: "Secure Cookie Test",
    },
    headers: new Headers({ origin: frontendOrigin }),
    asResponse: true,
  });
  assert.equal(response.status, 200);
  const setCookie = response.headers.get("set-cookie") ?? "";
  assert.match(setCookie, /HttpOnly/i);
  assert.match(setCookie, /Secure/i);
  assert.match(setCookie, /SameSite=Lax/i);
  assert.doesNotMatch(setCookie, /(?:^|;)\s*Domain=/i);
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
