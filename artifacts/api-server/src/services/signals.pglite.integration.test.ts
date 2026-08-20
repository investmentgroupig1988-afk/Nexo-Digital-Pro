import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { after, before, test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { accessGrants, getDatabase, signals, users } from "@workspace/db";
import { getEffectiveAccess } from "./access";
import { buildSignalDashboard } from "./signals";
import type { TechnicalAnalysisResult } from "./technical";

let client: PGlite; let database: ReturnType<typeof drizzle>; let serviceDatabase: ReturnType<typeof getDatabase>;
const userId = randomUUID(); const adminId = randomUUID();

before(async () => { client = new PGlite(); for (const file of (await readdir(resolve(import.meta.dirname, "../../../../lib/db/drizzle"))).filter((value) => /^\d+_.+\.sql$/.test(value)).sort()) { for (const statement of (await readFile(resolve(import.meta.dirname, "../../../../lib/db/drizzle", file), "utf8")).split("--> statement-breakpoint")) if (statement.trim()) await client.exec(statement); } database = drizzle(client, { schema: { accessGrants, signals, users } }); serviceDatabase = database as unknown as ReturnType<typeof getDatabase>; await database.insert(users).values([{ id: userId, name: "User", email: "signal-user@example.test", username: "signal_user", displayUsername: "signal_user", role: "user" }, { id: adminId, name: "Admin", email: "signal-admin@example.test", username: "signal_admin", displayUsername: "signal_admin", role: "admin" }]); });
after(async () => client.close());

test("product access requires an active grant and admin role alone does not grant it", async () => {
  assert.equal((await getEffectiveAccess(userId, serviceDatabase)).hasAccess, false);
  assert.equal((await getEffectiveAccess(adminId, serviceDatabase)).hasAccess, false);
  await database.insert(accessGrants).values({ userId, plan: "PARTNER", accessType: "PROMOTION", status: "active", grantedAt: new Date() });
  assert.equal((await getEffectiveAccess(userId, serviceDatabase)).hasAccess, true);
});

test("signal persistence is idempotent and empty history never invents metrics", async () => {
  const now = new Date("2026-01-01T03:20:00.000Z");
  const weak = await buildSignalDashboard({ symbol: "BTCUSDT", timeframe: "1h", candles: candles(), technical: technical("sideways"), now }, serviceDatabase);
  assert.deepEqual(weak.metrics, { total: 0, wins: 0, losses: 0, winRate: null, lossRate: null, accumulatedReturnPct: null });
  await buildSignalDashboard({ symbol: "BTCUSDT", timeframe: "15m", candles: candles(), technical: technical("bullish"), now }, serviceDatabase);
  await buildSignalDashboard({ symbol: "BTCUSDT", timeframe: "15m", candles: candles(), technical: technical("bullish"), now }, serviceDatabase);
  assert.equal((await database.select().from(signals)).filter((value) => value.status === "OPEN").length, 1);
});

test("performance metrics are calculated only from real settled rows", async () => {
  const now = new Date(); const common = { symbol: "BTCUSDT", timeframe: "4h", direction: "LONG", entryPrice: "100", stopLoss: "90", takeProfit: "115", riskRewardRatio: "1.5", openedAt: now, closedAt: now, expiresAt: now, strategyVersion: "TEST", indicatorSnapshot: {}, createdAt: now } as const;
  await database.insert(signals).values([{ ...common, status: "WIN", result: "WIN", returnPct: "15", configurationFingerprint: "w".repeat(64) }, { ...common, status: "LOSS", result: "LOSS", returnPct: "-10", configurationFingerprint: "l".repeat(64) }]);
  const result = await buildSignalDashboard({ symbol: "BTCUSDT", timeframe: "4h", candles: candles(), technical: technical("sideways"), now }, serviceDatabase);
  assert.deepEqual(result.metrics, { total: 2, wins: 1, losses: 1, winRate: 50, lossRate: 50, accumulatedReturnPct: 5 });
});

function candles() { return Array.from({ length: 200 }, (_, index) => ({ timestamp: new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString(), open: 99, high: 101, low: 98, close: index === 199 ? 100 : 99, volume: 120 })); }
function technical(trend: "bullish" | "sideways"): TechnicalAnalysisResult { return { status: "OK", message: null, indicators: { ema20: 98, ema50: 96, ema200: 90, sma20: 97, rsi14: 60, atr14: 2, volume: 120, averageVolume: 100, volumeRatio: 1.2, periodHigh: 105, periodLow: 80 }, fibonacci: { swingHigh: 105, swingLow: 80, direction: "uptrend", levels: { "0.236": 99, "0.382": 95, "0.5": 92, "0.618": 89, "0.786": 85 } }, marketStructure: { trend, structure: trend === "bullish" ? "higher_high_and_higher_low" : "mixed", higherHigh: true, higherLow: true, lowerHigh: false, lowerLow: false, support: 95, resistance: 105 }, dataQuality: { sufficient: true, candleCount: 200, volumeAvailable: true, provider: "binance", reason: null } }; }
