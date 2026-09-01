import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { after, before, test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { accessGrants, auditLogs, consumerRequestEvents, consumerRequests, eq, getDatabase, users } from "@workspace/db";
import { createConsumerRequest, updateConsumerRequest } from "./consumer-requests";

const migrations = resolve(import.meta.dirname, "../../../../lib/db/drizzle");
const adminId = "consumer-admin";
let client: PGlite;
let database: ReturnType<typeof drizzle>;
let serviceDatabase: ReturnType<typeof getDatabase>;

before(async () => {
  client = new PGlite();
  for (const file of (await readdir(migrations)).filter((value) => /^\d+_.+\.sql$/.test(value)).sort()) {
    for (const statement of (await readFile(resolve(migrations, file), "utf8")).split("--> statement-breakpoint")) if (statement.trim()) await client.exec(statement);
  }
  database = drizzle(client, { schema: { accessGrants, auditLogs, consumerRequestEvents, consumerRequests, users } });
  serviceDatabase = database as unknown as ReturnType<typeof getDatabase>;
  await database.insert(users).values({ id: adminId, name: "Admin", email: "consumer-admin@example.test", username: "consumer_admin", displayUsername: "consumer_admin", role: "admin" });
});

after(async () => { await client.close(); });

test("public withdrawal is persisted with an immediate unique code and no automatic grant", async () => {
  const created = await createConsumerRequest({ type: "WITHDRAWAL", email: "buyer@example.test", paymentReference: "txid-123" }, serviceDatabase);
  assert.match(created.code, /^TR-[A-F0-9]{16}$/);
  assert.equal(created.status, "PENDING");
  const [stored] = await database.select().from(consumerRequests).where(eq(consumerRequests.code, created.code));
  assert.equal(stored?.email, "buyer@example.test");
  assert.equal((await database.select().from(consumerRequestEvents).where(eq(consumerRequestEvents.requestId, stored!.id))).length, 1);
  assert.equal((await database.select().from(accessGrants)).length, 0);
});

test("admin lifecycle is audited and rejects invalid transitions", async () => {
  const created = await createConsumerRequest({ type: "SERVICE_CANCELLATION", email: "cancel@example.test" }, serviceDatabase);
  const [stored] = await database.select().from(consumerRequests).where(eq(consumerRequests.code, created.code));
  await updateConsumerRequest({ id: stored!.id, actorUserId: adminId, status: "REVIEWING", notes: "Identity check" }, serviceDatabase);
  await updateConsumerRequest({ id: stored!.id, actorUserId: adminId, status: "APPROVED" }, serviceDatabase);
  const completed = await updateConsumerRequest({ id: stored!.id, actorUserId: adminId, status: "COMPLETED" }, serviceDatabase);
  assert.equal(completed.status, "COMPLETED");
  assert.ok(completed.completedAt);
  await assert.rejects(() => updateConsumerRequest({ id: stored!.id, actorUserId: adminId, status: "REVIEWING" }, serviceDatabase));
  const events = await database.select().from(consumerRequestEvents).where(eq(consumerRequestEvents.requestId, stored!.id));
  assert.deepEqual(events.map((event) => event.status), ["PENDING", "REVIEWING", "APPROVED", "COMPLETED"]);
});
