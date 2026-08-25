import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
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
    assert.equal(first.rows[0]?.count, 6);

    await migrate(database, { migrationsFolder });
    const second = await client.query<{ count: number }>(
      'select count(*)::int as count from drizzle."__drizzle_migrations"',
    );
    assert.equal(second.rows[0]?.count, first.rows[0]?.count);

    const tables = await client.query<{ table_name: string }>(
      "select table_name from information_schema.tables where table_schema = 'public'",
    );
    const names = new Set(tables.rows.map((row) => row.table_name));
    for (const required of ["user", "account", "session", "access_grants", "payment_requests", "signals", "notification_deliveries", "consumer_requests", "consumer_request_events"]) {
      assert.ok(names.has(required), `missing table after migration: ${required}`);
    }
  } finally {
    await client.close();
  }
});

test("0005 upgrades a populated 0004 database without losing identities, grants, payments, signals, or audit", async () => {
  const client = new PGlite();
  try {
    const files = (await readdir(migrationsFolder)).filter((file) => /^000[0-4]_.+\.sql$/.test(file)).sort();
    for (const file of files) await applySqlFile(client, resolve(migrationsFolder, file));

    await client.exec(`
      INSERT INTO "user" ("id", "name", "email", "username", "display_username") VALUES ('migration-user', 'Migration User', 'migration@example.test', 'migration_user', 'migration_user');
      INSERT INTO "access_grants" ("user_id", "plan", "access_type", "status", "granted_at") VALUES ('migration-user', 'FOUNDERS_LIFETIME', 'PAYMENT', 'active', now());
      INSERT INTO "payments" ("user_id", "provider", "provider_payment_id", "amount", "currency", "status") VALUES ('migration-user', 'manual', 'legacy-payment', 27, 'USD', 'approved');
      INSERT INTO "payment_requests" ("user_id", "method", "amount", "currency", "declared_paid_at", "reference_or_txid", "reference_fingerprint") VALUES ('migration-user', 'USDT_TRC20', 27, 'USDT', now(), '${"a".repeat(64)}', '${"b".repeat(64)}');
      INSERT INTO "signals" ("symbol", "timeframe", "direction", "entry_price", "stop_loss", "take_profit", "risk_reward_ratio", "status", "opened_at", "result", "strategy_version", "indicator_snapshot", "configuration_fingerprint", "expires_at") VALUES ('BTCUSDT', '15m', 'LONG', 100, 90, 115, 1.5, 'OPEN', now(), 'OPEN', 'NEXO_CONFLUENCE_V1', '{}', '${"c".repeat(64)}', now() + interval '4 hours');
      INSERT INTO "audit_logs" ("actor_user_id", "target_user_id", "action", "metadata") VALUES ('migration-user', 'migration-user', 'PAYMENT_REQUESTED', '{"source":"migration-test"}');
    `);

    const beforeSignal = await client.query<{ id: string; configuration_fingerprint: string }>('select id::text, configuration_fingerprint from "signals"');
    await applySqlFile(client, resolve(migrationsFolder, "0005_trenoro_prelaunch.sql"));

    for (const table of ["user", "access_grants", "payments", "payment_requests", "signals", "audit_logs"]) {
      const result = await client.query<{ count: number }>(`select count(*)::int as count from "${table}"`);
      assert.equal(result.rows[0]?.count, 1, `${table} row must survive 0005`);
    }
    const afterSignal = await client.query<{ id: string; strategy_version: string; configuration_fingerprint: string }>('select id::text, strategy_version, configuration_fingerprint from "signals"');
    assert.equal(afterSignal.rows[0]?.id, beforeSignal.rows[0]?.id);
    assert.equal(afterSignal.rows[0]?.strategy_version, "TRENORO_CONFLUENCE_V1");
    assert.equal(afterSignal.rows[0]?.configuration_fingerprint, beforeSignal.rows[0]?.configuration_fingerprint);
    const legalColumns = await client.query<{ terms_version: string | null; privacy_version: string | null }>('select terms_version, privacy_version from "user" where id = \'migration-user\'');
    assert.deepEqual(legalColumns.rows[0], { terms_version: null, privacy_version: null });
    const consumerTables = await client.query<{ table_name: string }>("select table_name from information_schema.tables where table_schema = 'public' and table_name in ('consumer_requests', 'consumer_request_events') order by table_name");
    assert.deepEqual(consumerTables.rows.map((row) => row.table_name), ["consumer_request_events", "consumer_requests"]);
  } finally {
    await client.close();
  }
});

async function applySqlFile(client: PGlite, file: string): Promise<void> {
  const source = await readFile(file, "utf8");
  for (const statement of source.split("--> statement-breakpoint")) {
    if (statement.trim()) await client.exec(statement);
  }
}
