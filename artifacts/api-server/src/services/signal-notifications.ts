import { and, eq, getDatabase, lte, notificationDeliveries, signals } from "@workspace/db";
import { config } from "../config";
import { logger } from "../lib/logger";
import type { NotificationProvider } from "./notification-provider";
import { TelegramProvider } from "./telegram-provider";

type Database = ReturnType<typeof getDatabase>;
const MAX_ATTEMPTS = 5;
const CLAIM_TIMEOUT_MS = 60_000;

export type NotificationDispatchSummary = {
  configured: boolean;
  queued: number;
  recoveredClaims: number;
  delivered: number;
  retried: number;
  failed: number;
};

export function configuredNotificationProvider(): NotificationProvider | null {
  if (!config.telegramBotToken || !config.telegramChatId || !config.notificationPublicUrl) return null;
  return new TelegramProvider(config.telegramBotToken, config.telegramChatId);
}

export async function dispatchSignalNotifications(provider: NotificationProvider | null = configuredNotificationProvider(), database: Database = getDatabase(), now = new Date(), publicUrl = config.notificationPublicUrl): Promise<NotificationDispatchSummary> {
  if (!provider || !publicUrl) return { configured: false, queued: 0, recoveredClaims: 0, delivered: 0, retried: 0, failed: 0 };
  const openSignals = await database.select({ id: signals.id }).from(signals).where(eq(signals.status, "OPEN"));
  const queued = openSignals.length
    ? await database.insert(notificationDeliveries).values(openSignals.map(({ id }) => ({ signalId: id, provider: provider.name }))).onConflictDoNothing().returning({ id: notificationDeliveries.id })
    : [];
  if (queued.length) logger.info({ event: "telegram_outbox_queued", count: queued.length, provider: provider.name }, "Signal notifications queued");
  const recovered = await database.update(notificationDeliveries).set({ status: "PENDING", claimedAt: null, nextAttemptAt: now, lastError: "Recovered interrupted delivery claim.", updatedAt: now }).where(and(eq(notificationDeliveries.provider, provider.name), eq(notificationDeliveries.status, "SENDING"), lte(notificationDeliveries.claimedAt, new Date(now.getTime() - CLAIM_TIMEOUT_MS)))).returning({ id: notificationDeliveries.id });
  if (recovered.length) logger.info({ event: "telegram_claim_recovered", count: recovered.length, provider: provider.name }, "Interrupted notification claims recovered");
  const pending = await database.select({ id: notificationDeliveries.id }).from(notificationDeliveries).where(and(eq(notificationDeliveries.provider, provider.name), eq(notificationDeliveries.status, "PENDING"), lte(notificationDeliveries.nextAttemptAt, now)));
  let delivered = 0;
  let retried = 0;
  let failed = 0;
  for (const candidate of pending) {
    const [claimed] = await database.update(notificationDeliveries).set({ status: "SENDING", claimedAt: now, updatedAt: now }).where(and(eq(notificationDeliveries.id, candidate.id), eq(notificationDeliveries.status, "PENDING"))).returning();
    if (!claimed) continue;
    try {
      await provider.sendSignalActive(publicUrl);
      await database.update(notificationDeliveries).set({ status: "DELIVERED", deliveredAt: new Date(), lastError: null, updatedAt: new Date() }).where(eq(notificationDeliveries.id, candidate.id));
      delivered += 1;
      logger.info({ event: "telegram_outbox_delivered", deliveryId: candidate.id, provider: provider.name }, "Signal notification delivered");
    } catch (error) {
      const attempts = claimed.attempts + 1;
      const willRetry = attempts < MAX_ATTEMPTS;
      await database.update(notificationDeliveries).set({ status: willRetry ? "PENDING" : "FAILED", attempts, nextAttemptAt: new Date(now.getTime() + Math.min(30 * 60_000, 30_000 * (2 ** claimed.attempts))), lastError: safeError(error), updatedAt: new Date() }).where(eq(notificationDeliveries.id, candidate.id));
      if (willRetry) retried += 1;
      else failed += 1;
      logger.warn({ event: willRetry ? "telegram_outbox_retry" : "telegram_outbox_failed", deliveryId: candidate.id, attempts, provider: provider.name }, "Signal notification delivery failed");
    }
  }
  return { configured: true, queued: queued.length, recoveredClaims: recovered.length, delivered, retried, failed };
}

function safeError(error: unknown): string {
  return (error instanceof Error ? error.message : "Unknown provider error").replace(/bot\d+:[A-Za-z0-9_-]+/g, "bot[redacted]").slice(0, 255);
}
