import assert from "node:assert/strict";
import { resolve } from "node:path";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";

const migrationsFolder = resolve(import.meta.dirname, "../../../lib/db/drizzle");

test("the production migration set applies from empty PostgreSQL and is idempotent", async () => {
  const client = new PGlite();
  try {
    const database = drizzle(client);
    await migrate(database, { migrationsFolder });
    const first = await client.query<{ count: number }>(
      'select count(*)::int as count from drizzle."__drizzle_migrations"',
    );
    assert.equal(first.rows[0]?.count, 5);

    await migrate(database, { migrationsFolder });
    const second = await client.query<{ count: number }>(
      'select count(*)::int as count from drizzle."__drizzle_migrations"',
    );
    assert.equal(second.rows[0]?.count, first.rows[0]?.count);

    const tables = await client.query<{ table_name: string }>(
      "select table_name from information_schema.tables where table_schema = 'public'",
    );
    const names = new Set(tables.rows.map((row) => row.table_name));
    for (const required of ["user", "account", "session", "access_grants", "payment_requests", "signals", "notification_deliveries"]) {
      assert.ok(names.has(required), `missing table after migration: ${required}`);
    }
  } finally {
    await client.close();
  }
});
