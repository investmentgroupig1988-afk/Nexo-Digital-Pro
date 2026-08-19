import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createServer, type Server } from "node:http";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const integrationEnabled = process.env.RUN_DB_INTEGRATION_TESTS === "true";

if (!testDatabaseUrl || !integrationEnabled) {
  test.skip("auth integration requires TEST_DATABASE_URL and RUN_DB_INTEGRATION_TESTS=true", () => {});
} else {
  const databaseName = decodeURIComponent(new URL(testDatabaseUrl).pathname).replace(/^\//, "");
  if (!databaseName.endsWith("_test")) {
    throw new Error("TEST_DATABASE_URL must target a dedicated database whose name ends with _test.");
  }
  process.env.DATABASE_URL = testDatabaseUrl;
  process.env.BETTER_AUTH_SECRET ??= "test-only-better-auth-secret-that-is-at-least-thirty-two-characters";
  process.env.BETTER_AUTH_URL ??= "http://127.0.0.1";
  process.env.CORS_ALLOWED_ORIGINS ??= "http://localhost:5173";
  process.env.NODE_ENV = "test";

  const [{ closeDatabase, getDatabase, migrateDatabase, users, eq }, { default: app }] = await Promise.all([
    import("@workspace/db"),
    import("../app"),
  ]);

  let server: Server;
  let baseUrl = "";
  const suffix = `${Date.now().toString().slice(-8)}${randomUUID().slice(0, 8)}`;
  const admin = { email: `admin-${suffix}@example.test`, username: `admin_${suffix}`, password: "A correct test password 123" };
  const member = { email: `member-${suffix}@example.test`, username: `member_${suffix}`, password: "A correct test password 123" };
  let adminCookie = "";
  let memberCookie = "";
  let memberId = "";

  before(async () => {
    await migrateDatabase(resolve(import.meta.dirname, "../../../../lib/db/drizzle"));
    server = createServer(app);
    await new Promise<void>((accept) => server.listen(0, "127.0.0.1", accept));
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  after(async () => {
    await new Promise<void>((accept, reject) => server.close((error) => error ? reject(error) : accept()));
    await closeDatabase();
  });

  test("registration validates unique email and username, then establishes a session", async () => {
    const first = await request("/api/auth/register", { method: "POST", body: JSON.stringify(member) });
    assert.equal(first.status, 200);
    memberCookie = cookie(first);
    assert.ok(memberCookie);

    const duplicateEmail = await request("/api/auth/register", { method: "POST", body: JSON.stringify({ ...member, username: `${member.username}_other` }) });
    assert.equal(duplicateEmail.status, 409);
    const duplicateUsername = await request("/api/auth/register", { method: "POST", body: JSON.stringify({ ...member, email: `other-${suffix}@example.test` }) });
    assert.equal(duplicateUsername.status, 409);

    const account = await request("/api/me", { headers: { cookie: memberCookie } });
    assert.equal(account.status, 200);
    const body = await account.json() as { user: { id: string; username: string }; access: { hasAccess: boolean } };
    memberId = body.user.id;
    assert.equal(body.user.username, member.username.toLowerCase());
    assert.equal(body.access.hasAccess, false);
  });

  test("incorrect credentials fail and a user without entitlement cannot use the private API", async () => {
    const badLogin = await request("/api/auth/login", { method: "POST", body: JSON.stringify({ email: member.email, password: "incorrect password" }) });
    assert.equal(badLogin.status, 401);
    const privateRoute = await request("/api/market?symbol=BTCUSDT", { headers: { cookie: memberCookie } });
    assert.equal(privateRoute.status, 403);
  });

  test("administrator permissions grant, revoke, restore, and block access server-side", async () => {
    const response = await request("/api/auth/register", { method: "POST", body: JSON.stringify(admin) });
    assert.equal(response.status, 200);
    adminCookie = cookie(response);
    const adminAccount = await request("/api/me", { headers: { cookie: adminCookie } });
    const { user } = await adminAccount.json() as { user: { id: string } };
    await getDatabase().update(users).set({ role: "admin" }).where(eq(users.id, user.id));

    const grant = await request(`/api/admin/users/${memberId}/grant-access`, { method: "POST", headers: { cookie: adminCookie }, body: JSON.stringify({ reason: "integration test" }) });
    assert.equal(grant.status, 201);
    const grantedAccess = await request("/api/access/me", { headers: { cookie: memberCookie } });
    assert.equal((await grantedAccess.json() as { access: { hasAccess: boolean } }).access.hasAccess, true);

    const revoke = await request(`/api/admin/users/${memberId}/revoke-access`, { method: "POST", headers: { cookie: adminCookie }, body: JSON.stringify({ reason: "integration test" }) });
    assert.equal(revoke.status, 200);
    const revokedAccess = await request("/api/access/me", { headers: { cookie: memberCookie } });
    assert.equal((await revokedAccess.json() as { access: { hasAccess: boolean } }).access.hasAccess, false);

    const restored = await request(`/api/admin/users/${memberId}/restore-access`, { method: "POST", headers: { cookie: adminCookie }, body: JSON.stringify({ reason: "integration test" }) });
    assert.equal(restored.status, 200);
    const restoredAccess = await request("/api/access/me", { headers: { cookie: memberCookie } });
    assert.equal((await restoredAccess.json() as { access: { hasAccess: boolean } }).access.hasAccess, true);

    const revokedAgain = await request(`/api/admin/users/${memberId}/revoke-access`, { method: "POST", headers: { cookie: adminCookie }, body: JSON.stringify({ reason: "integration test" }) });
    assert.equal(revokedAgain.status, 200);

    const deniedBeforeBlocking = await request("/api/admin/users", { headers: { cookie: memberCookie } });
    assert.equal(deniedBeforeBlocking.status, 403);

    const blocked = await request(`/api/admin/users/${memberId}/block`, { method: "POST", headers: { cookie: adminCookie }, body: JSON.stringify({ reason: "integration test" }) });
    assert.equal(blocked.status, 200);
    const blockedAccount = await request("/api/me", { headers: { cookie: memberCookie } });
    assert.equal(blockedAccount.status, 401);
  });

  test("logout invalidates the administrator session", async () => {
    const logout = await request("/api/auth/logout", { method: "POST", headers: { cookie: adminCookie } });
    assert.equal(logout.status, 200);
    const accountAfterLogout = await request("/api/me", { headers: { cookie: adminCookie } });
    assert.equal(accountAfterLogout.status, 401);
  });

  function request(path: string, init: RequestInit = {}): Promise<Response> {
    const headers = new Headers(init.headers);
    if (init.body && !headers.has("content-type")) headers.set("content-type", "application/json");
    return fetch(`${baseUrl}${path}`, { ...init, headers });
  }

  function cookie(response: Response): string {
    const values = response.headers.getSetCookie();
    return values.map((value) => value.split(";", 1)[0]).join("; ");
  }
}
