import { and, eq, getDatabase, lte, notificationDeliveries, signals } from "@workspace/db";
import { config } from "../config";
import { logger } from "../lib/logger";
import type { NotificationProvider } from "./notification-provider";
import { TelegramProvider } from "./telegram-provider";

type Database = ReturnType<typeof getDatabase>;
const MAX_ATTEMPTS = 5;
const CLAIM_TIMEOUT_MS = 60_000;

export function configuredNotificationProvider(): NotificationProvider | null {
  if (!config.telegramBotToken || !config.telegramChatId || !config.notificationPublicUrl) return null;
  return new TelegramProvider(config.telegramBotToken, config.telegramChatId);
}

export async function dispatchSignalNotifications(provider: NotificationProvider | null = configuredNotificationProvider(), database: Database = getDatabase(), now = new Date(), publicUrl = config.notificationPublicUrl): Promise<void> {
  if (!provider || !publicUrl) return;
  const openSignals = await database.select({ id: signals.id }).from(signals).where(eq(signals.status, "OPEN"));
  if (openSignals.length) await database.insert(notificationDeliveries).values(openSignals.map(({ id }) => ({ signalId: id, provider: provider.name }))).onConflictDoNothing();
  await database.update(notificationDeliveries).set({ status: "PENDING", claimedAt: null, nextAttemptAt: now, lastError: "Recovered interrupted delivery claim.", updatedAt: now }).where(and(eq(notificationDeliveries.provider, provider.name), eq(notificationDeliveries.status, "SENDING"), lte(notificationDeliveries.claimedAt, new Date(now.getTime() - CLAIM_TIMEOUT_MS))));
  const pending = await database.select({ id: notificationDeliveries.id }).from(notificationDeliveries).where(and(eq(notificationDeliveries.provider, provider.name), eq(notificationDeliveries.status, "PENDING"), lte(notificationDeliveries.nextAttemptAt, now)));
  for (const candidate of pending) {
    const [claimed] = await database.update(notificationDeliveries).set({ status: "SENDING", claimedAt: now, updatedAt: now }).where(and(eq(notificationDeliveries.id, candidate.id), eq(notificationDeliveries.status, "PENDING"))).returning();
    if (!claimed) continue;
    try {
      await provider.sendSignalActive(publicUrl);
      await database.update(notificationDeliveries).set({ status: "DELIVERED", deliveredAt: new Date(), lastError: null, updatedAt: new Date() }).where(eq(notificationDeliveries.id, candidate.id));
    } catch (error) {
      const attempts = claimed.attempts + 1;
      await database.update(notificationDeliveries).set({ status: attempts < MAX_ATTEMPTS ? "PENDING" : "FAILED", attempts, nextAttemptAt: new Date(now.getTime() + Math.min(30 * 60_000, 30_000 * (2 ** claimed.attempts))), lastError: safeError(error), updatedAt: new Date() }).where(eq(notificationDeliveries.id, candidate.id));
      logger.warn({ deliveryId: candidate.id, attempts }, "Signal notification delivery failed");
    }
  }
}

function safeError(error: unknown): string {
  return (error instanceof Error ? error.message : "Unknown provider error").replace(/bot\d+:[A-Za-z0-9_-]+/g, "bot[redacted]").slice(0, 255);
}
