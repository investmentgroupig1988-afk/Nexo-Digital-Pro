import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { after, before, test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import {
  getDatabase,
  notificationDeliveries,
  shadowResearchSignals,
  signals,
} from "@workspace/db";
import type { HistoricalCandle } from "./historical";
import {
  calculateShadowResearchMetrics,
  runShadowResearchCycle,
} from "./signal-shadow-research";
import type { FrozenV11Opportunity } from "./signal-strategy-v11";
import {
  V11_CANDIDATE_FINGERPRINT,
  V11_STRATEGY_VERSION,
  type V11ShadowSymbol,
} from "./signal-strategy-v11-snapshot";

let client: PGlite;
let database: ReturnType<typeof drizzle>;
let serviceDatabase: ReturnType<typeof getDatabase>;

before(async () => {
  client = new PGlite();
  const migrations = (await readdir(resolve(import.meta.dirname, "../../../../lib/db/drizzle")))
    .filter((value) => /^\d+_.+\.sql$/.test(value))
    .sort();
  for (const file of migrations) {
    const contents = await readFile(resolve(import.meta.dirname, "../../../../lib/db/drizzle", file), "utf8");
    for (const statement of contents.split("--> statement-breakpoint")) {
      if (statement.trim()) await client.exec(statement);
    }
  }
  database = drizzle(client, { schema: { notificationDeliveries, shadowResearchSignals, signals } });
  serviceDatabase = database as unknown as ReturnType<typeof getDatabase>;
});

after(async () => client.close());

test("feature flag OFF performs no market fetch and no database write", async () => {
  let fetches = 0;
  const result = await runShadowResearchCycle({
    enabled: false,
    database: serviceDatabase,
    fetchCandles: async () => { fetches += 1; return []; },
  });
  assert.deepEqual(result, { enabled: false, inserted: 0, resolved: 0, symbolsProcessed: 0 });
  assert.equal(fetches, 0);
  assert.equal((await database.select().from(shadowResearchSignals)).length, 0);
});

test("shadow cohort is isolated, symbol-separated, deduplicated, restart-safe, and resolves WIN/LOSS/EXPIRED", async () => {
  const firstObservation = new Date("2026-09-02T04:00:00.000Z");
  const sourceBySymbol: Record<V11ShadowSymbol, Date> = {
    BTCUSDT: new Date("2026-09-01T00:00:00.000Z"),
    ETHUSDT: new Date("2026-09-01T00:00:00.000Z"),
    BNBUSDT: new Date("2026-09-01T00:00:00.000Z"),
    SOLUSDT: new Date("2026-09-02T00:00:00.000Z"),
  };
  const detectOpportunity = ({ symbol }: { symbol: V11ShadowSymbol }): FrozenV11Opportunity => opportunity(symbol, sourceBySymbol[symbol]);
  const neutralFetch = async () => neutralCandles(firstObservation);

  const first = await runShadowResearchCycle({ enabled: true, now: firstObservation, database: serviceDatabase, fetchCandles: neutralFetch, detectOpportunity });
  const restart = await runShadowResearchCycle({ enabled: true, now: firstObservation, database: serviceDatabase, fetchCandles: neutralFetch, detectOpportunity });
  assert.deepEqual(first, { enabled: true, inserted: 4, resolved: 0, symbolsProcessed: 4 });
  assert.equal(restart.inserted, 0);
  assert.equal((await database.select().from(shadowResearchSignals)).length, 4);
  assert.deepEqual(new Set((await database.select().from(shadowResearchSignals)).map((row) => row.symbol)), new Set(["BTCUSDT", "ETHUSDT", "BNBUSDT", "SOLUSDT"]));

  const resolutionTime = new Date("2026-09-03T00:00:00.000Z");
  const resolved = await runShadowResearchCycle({
    enabled: true,
    now: resolutionTime,
    database: serviceDatabase,
    detectOpportunity,
    fetchCandles: async (symbol) => resolutionCandles(symbol),
  });
  assert.equal(resolved.resolved, 3);
  assert.equal(resolved.inserted, 0);
  const rows = await database.select().from(shadowResearchSignals);
  assert.equal(rows.find((row) => row.symbol === "BTCUSDT")?.status, "WIN");
  assert.equal(rows.find((row) => row.symbol === "ETHUSDT")?.status, "LOSS");
  assert.equal(rows.find((row) => row.symbol === "BNBUSDT")?.status, "EXPIRED");
  assert.equal(rows.find((row) => row.symbol === "SOLUSDT")?.status, "OPEN");

  const metrics = calculateShadowResearchMetrics(rows);
  assert.equal(metrics.totalShadowSignals, 4);
  assert.equal(metrics.open, 1);
  assert.equal(metrics.win, 1);
  assert.equal(metrics.loss, 1);
  assert.equal(metrics.expired, 1);
  assert.equal((metrics.bySymbol as Record<string, { totalShadowSignals: number }>).BTCUSDT.totalShadowSignals, 1);

  assert.equal((await database.select().from(signals)).length, 0, "commercial history changed");
  assert.equal((await database.select().from(notificationDeliveries)).length, 0, "Telegram outbox changed");
});

test("database rejects a mutated V1 fingerprint instead of silently starting a mixed cohort", async () => {
  await assert.rejects(database.insert(shadowResearchSignals).values({
    id: randomUUID(),
    strategyVersion: V11_STRATEGY_VERSION,
    strategyFingerprint: "0".repeat(64),
    symbol: "BTCUSDT",
    timeframe: "4h",
    detectedAt: new Date("2026-10-01T00:00:00.000Z"),
    sourceCandleCloseAt: new Date("2026-10-01T00:00:00.000Z"),
    hypotheticalEntry: "100",
    hypotheticalStop: "90",
    hypotheticalTarget: "115",
    direction: "LONG",
    costsModel: {},
    expiresAt: new Date("2026-10-03T00:00:00.000Z"),
    technicalSnapshot: {},
  }));
});

test("shadow telemetry route remains behind the global administrator boundary", async () => {
  const source = await readFile(resolve(import.meta.dirname, "../routes/admin.ts"), "utf8");
  const boundary = source.indexOf('router.use("/admin", requireAdminRole())');
  const endpoint = source.indexOf('router.get("/admin/shadow-research"');
  assert.ok(boundary >= 0 && endpoint > boundary);
});

function opportunity(symbol: V11ShadowSymbol, sourceCandleCloseAt: Date): FrozenV11Opportunity {
  return {
    strategyVersion: V11_STRATEGY_VERSION,
    strategyFingerprint: V11_CANDIDATE_FINGERPRINT,
    symbol,
    timeframe: "4h",
    sourceCandleCloseAt,
    hypotheticalEntry: 100,
    hypotheticalStop: 90,
    hypotheticalTarget: 115,
    direction: "LONG",
    expiresAt: new Date(sourceCandleCloseAt.getTime() + 12 * 4 * 60 * 60 * 1_000),
    technicalSnapshot: { fixture: true },
  };
}

function neutralCandles(now: Date): HistoricalCandle[] {
  return [{ timestamp: new Date(now.getTime() - 4 * 60 * 60 * 1_000).toISOString(), closeTime: new Date(now.getTime() - 1).toISOString(), open: 100, high: 105, low: 95, close: 100, volume: 1 }];
}

function resolutionCandles(symbol: V11ShadowSymbol): HistoricalCandle[] {
  const timestamp = "2026-09-01T04:00:00.000Z";
  const common = { timestamp, closeTime: "2026-09-01T07:59:59.999Z", open: 100, close: 100, volume: 1 };
  if (symbol === "BTCUSDT") return [{ ...common, high: 116, low: 99 }];
  if (symbol === "ETHUSDT") return [{ ...common, high: 101, low: 89 }];
  return [{ ...common, high: 105, low: 95 }];
}
