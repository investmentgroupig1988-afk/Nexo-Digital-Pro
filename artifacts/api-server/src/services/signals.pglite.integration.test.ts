import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { after, before, test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { accessGrants, getDatabase, notificationDeliveries, signals, users } from "@workspace/db";
import { getEffectiveAccess } from "./access";
import { buildSignalDashboard } from "./signals";
import type { TechnicalAnalysisResult } from "./technical";
import { dispatchSignalNotifications } from "./signal-notifications";
import type { NotificationProvider } from "./notification-provider";

let client: PGlite; let database: ReturnType<typeof drizzle>; let serviceDatabase: ReturnType<typeof getDatabase>;
const userId = randomUUID(); const adminId = randomUUID(); const founderId = randomUUID(); const testerId = randomUUID(); const complimentaryId = randomUUID();

before(async () => { client = new PGlite(); for (const file of (await readdir(resolve(import.meta.dirname, "../../../../lib/db/drizzle"))).filter((value) => /^\d+_.+\.sql$/.test(value)).sort()) { for (const statement of (await readFile(resolve(import.meta.dirname, "../../../../lib/db/drizzle", file), "utf8")).split("--> statement-breakpoint")) if (statement.trim()) await client.exec(statement); } database = drizzle(client, { schema: { accessGrants, notificationDeliveries, signals, users } }); serviceDatabase = database as unknown as ReturnType<typeof getDatabase>; await database.insert(users).values([{ id: userId, name: "User", email: "signal-user@example.test", username: "signal_user", displayUsername: "signal_user", role: "user" }, { id: adminId, name: "Admin", email: "signal-admin@example.test", username: "signal_admin", displayUsername: "signal_admin", role: "admin" }, { id: founderId, name: "Founder", email: "signal-founder@example.test", username: "signal_founder", displayUsername: "signal_founder", role: "user" }, { id: testerId, name: "Tester", email: "signal-tester@example.test", username: "signal_tester", displayUsername: "signal_tester", role: "user" }, { id: complimentaryId, name: "Courtesy", email: "signal-courtesy@example.test", username: "signal_courtesy", displayUsername: "signal_courtesy", role: "user" }]); });
after(async () => client.close());

test("commercial access follows the complete role and grant matrix", async () => {
  assert.equal((await getEffectiveAccess(userId, serviceDatabase)).hasAccess, false);
  assert.equal((await getEffectiveAccess(adminId, serviceDatabase)).hasAccess, false);
  await database.insert(accessGrants).values({ userId, plan: "PARTNER", accessType: "PROMOTION", status: "active", grantedAt: new Date() });
  assert.equal((await getEffectiveAccess(userId, serviceDatabase)).hasAccess, true);
  await database.insert(accessGrants).values([{ userId: founderId, plan: "FOUNDERS_LIFETIME", accessType: "PAYMENT", status: "active", grantedAt: new Date() }, { userId: testerId, plan: "TESTER", accessType: "PROMOTION", status: "active", grantedAt: new Date() }, { userId: complimentaryId, plan: "COMPLIMENTARY", accessType: "PROMOTION", status: "active", grantedAt: new Date() }, { userId: adminId, plan: "PARTNER", accessType: "PROMOTION", status: "active", grantedAt: new Date() }]);
  assert.equal((await getEffectiveAccess(founderId, serviceDatabase)).hasAccess, true);
  assert.equal((await getEffectiveAccess(testerId, serviceDatabase)).hasAccess, true);
  assert.equal((await getEffectiveAccess(complimentaryId, serviceDatabase)).hasAccess, true);
  assert.equal((await getEffectiveAccess(adminId, serviceDatabase)).hasAccess, true);
  const storedAdmin = (await database.select().from(users)).find((user) => user.id === adminId);
  assert.equal(storedAdmin?.role, "admin");
});

test("signal persistence remains idempotent across repeated evaluations and simulated restarts", async () => {
  const now = new Date("2026-01-01T03:20:00.000Z");
  const weak = await buildSignalDashboard({ symbol: "BTCUSDT", timeframe: "1h", candles: candles(), technical: technical("sideways"), now }, serviceDatabase);
  assert.deepEqual(weak.metrics, { total: 0, wins: 0, losses: 0, winRate: null, lossRate: null, accumulatedReturnPct: null });
  await buildSignalDashboard({ symbol: "BTCUSDT", timeframe: "15m", candles: candles(), technical: technical("bullish"), now }, serviceDatabase);
  await buildSignalDashboard({ symbol: "BTCUSDT", timeframe: "15m", candles: candles(), technical: technical("bullish"), now }, serviceDatabase);
  assert.equal((await database.select().from(signals)).filter((value) => value.status === "OPEN").length, 1);
  await buildSignalDashboard({ symbol: "BTCUSDT", timeframe: "15m", candles: candles(), technical: technical("sideways"), now: new Date("2026-01-01T07:00:00.000Z") }, serviceDatabase);
  const matching = (await database.select().from(signals)).filter((value) => value.timeframe === "15m");
  assert.equal(matching.length, 1);
  assert.equal(matching[0].status, "EXPIRED");
  assert.ok(matching[0].closedAt);
});

test("performance metrics are calculated only from real settled rows", async () => {
  const now = new Date(); const common = { symbol: "BTCUSDT", timeframe: "4h", direction: "LONG", entryPrice: "100", stopLoss: "90", takeProfit: "115", riskRewardRatio: "1.5", openedAt: now, closedAt: now, expiresAt: now, strategyVersion: "TEST", indicatorSnapshot: {}, createdAt: now } as const;
  await database.insert(signals).values([{ ...common, status: "WIN", result: "WIN", returnPct: "15", configurationFingerprint: "w".repeat(64) }, { ...common, status: "LOSS", result: "LOSS", returnPct: "-10", configurationFingerprint: "l".repeat(64) }]);
  const result = await buildSignalDashboard({ symbol: "BTCUSDT", timeframe: "4h", candles: candles(), technical: technical("sideways"), now }, serviceDatabase);
  assert.deepEqual(result.metrics, { total: 2, wins: 1, losses: 1, winRate: 50, lossRate: 50, accumulatedReturnPct: 5 });
  const filtered = await buildSignalDashboard({ symbol: "BTCUSDT", timeframe: "4h", candles: candles(), technical: technical("sideways"), historyTimeframe: "15m", now }, serviceDatabase);
  assert.deepEqual(filtered.metrics, { total: 0, wins: 0, losses: 0, winRate: null, lossRate: null, accumulatedReturnPct: null });
});

test("notification outbox deduplicates repeated and concurrent dispatches", async () => {
  const now = new Date();
  await database.insert(signals).values({ symbol: "BTCUSDT", timeframe: "5m", direction: "LONG", entryPrice: "100", stopLoss: "90", takeProfit: "115", riskRewardRatio: "1.5", status: "OPEN", openedAt: now, expiresAt: new Date(now.getTime() + 3_600_000), result: "OPEN", strategyVersion: "NOTIFICATION_TEST", configurationFingerprint: "n".repeat(64), indicatorSnapshot: {} });
  let sends = 0;
  const provider: NotificationProvider = { name: "telegram", async sendSignalActive() { sends += 1; } };
  const concurrent = await Promise.all([dispatchSignalNotifications(provider, serviceDatabase, new Date(), "https://staging.trenoro.com/"), dispatchSignalNotifications(provider, serviceDatabase, new Date(), "https://staging.trenoro.com/")]);
  const repeated = await dispatchSignalNotifications(provider, serviceDatabase, new Date(), "https://staging.trenoro.com/");
  assert.equal(sends, 1);
  assert.equal(concurrent.reduce((sum, result) => sum + result.queued, 0), 1);
  assert.equal(concurrent.reduce((sum, result) => sum + result.delivered, 0) + repeated.delivered, 1);
  const deliveries = await database.select().from(notificationDeliveries);
  assert.equal(deliveries.length, 1);
  assert.equal(deliveries[0].status, "DELIVERED");
});

test("notification outbox recovers a stale claim after an interrupted deploy", async () => {
  const now = new Date();
  const [signal] = await database.insert(signals).values({ symbol: "BTCUSDT", timeframe: "1h", direction: "SHORT", entryPrice: "100", stopLoss: "110", takeProfit: "85", riskRewardRatio: "1.5", status: "OPEN", openedAt: now, expiresAt: new Date(now.getTime() + 3_600_000), result: "OPEN", strategyVersion: "NOTIFICATION_RECOVERY_TEST", configurationFingerprint: "r".repeat(64), indicatorSnapshot: {} }).returning();
  await database.insert(notificationDeliveries).values({ signalId: signal.id, provider: "telegram", status: "SENDING", claimedAt: new Date(now.getTime() - 120_000) });
  let sends = 0;
  const provider: NotificationProvider = { name: "telegram", async sendSignalActive() { sends += 1; } };

  const result = await dispatchSignalNotifications(provider, serviceDatabase, now, "https://staging.trenoro.com/");

  const delivery = (await database.select().from(notificationDeliveries)).find((value) => value.signalId === signal.id);
  assert.equal(sends, 1);
  assert.equal(result.recoveredClaims, 1);
  assert.equal(result.delivered, 1);
  assert.equal(delivery?.status, "DELIVERED");
  assert.ok(delivery?.deliveredAt);
});

function candles() { return Array.from({ length: 200 }, (_, index) => ({ timestamp: new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString(), open: 99, high: 101, low: 98, close: index === 199 ? 100 : 99, volume: 120 })); }
function technical(trend: "bullish" | "sideways"): TechnicalAnalysisResult { return { status: "OK", message: null, indicators: { ema20: 98, ema50: 96, ema200: 90, sma20: 97, rsi14: 60, atr14: 2, volume: 120, averageVolume: 100, volumeRatio: 1.2, periodHigh: 105, periodLow: 80 }, fibonacci: { swingHigh: 105, swingLow: 80, direction: "uptrend", levels: { "0.236": 99, "0.382": 95, "0.5": 92, "0.618": 89, "0.786": 85 } }, marketStructure: { trend, structure: trend === "bullish" ? "higher_high_and_higher_low" : "mixed", higherHigh: true, higherLow: true, lowerHigh: false, lowerLow: false, support: 95, resistance: 105 }, dataQuality: { sufficient: true, candleCount: 200, volumeAvailable: true, provider: "binance", reason: null } }; }
