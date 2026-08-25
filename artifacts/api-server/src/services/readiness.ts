import { getDatabase, sql } from "@workspace/db";
import { missingLegalConfig } from "@workspace/product";
import { config } from "../config";
import { isEmailDeliveryConfigured } from "./email";
import { getSignalEngineHealth } from "./signal-refresh";

type CheckStatus = "OK" | "ERROR" | "INCOMPLETE" | "STARTING" | "STALE";

export async function getAdminReadiness() {
  let database: "OK" | "ERROR" = "OK";
  try {
    await getDatabase().execute(sql`select 1 as ok`);
  } catch {
    database = "ERROR";
  }

  const engine = getSignalEngineHealth();
  const missingLegal = missingLegalConfig(config.legalIdentity);
  const authConfigured = Boolean(
    config.databaseUrl
    && config.betterAuthUrl
    && config.betterAuthSecret
    && config.betterAuthSecret.length >= 32,
  );
  const emailConfigured = isEmailDeliveryConfigured();
  const telegramConfigured = Boolean(config.telegramBotToken && config.telegramChatId && config.notificationPublicUrl);
  const scheduler = schedulerStatus(engine, new Date());
  const marketProvider = marketStatus(engine);
  const topology = topologyStatus();
  const blockers = [
    database !== "OK" ? "DATABASE" : null,
    !authConfigured ? "AUTH" : null,
    !emailConfigured ? "EMAIL" : null,
    !telegramConfigured ? "TELEGRAM" : null,
    scheduler !== "OK" ? "SIGNAL_SCHEDULER" : null,
    marketProvider !== "OK" ? "MARKET_PROVIDER" : null,
    missingLegal.length ? "LEGAL_CONFIG" : null,
    topology.status === "ERROR" ? "ENVIRONMENT_TOPOLOGY" : null,
  ].filter((value): value is string => Boolean(value));

  return {
    checkedAt: new Date().toISOString(),
    releaseReady: blockers.length === 0,
    blockers,
    database: { status: database },
    auth: { status: authConfigured ? "OK" : "INCOMPLETE" },
    email: { configured: emailConfigured },
    telegram: { configured: telegramConfigured, lastDispatchAt: engine.notifications.lastDispatchAt, lastErrorAt: engine.notifications.lastErrorAt },
    signalScheduler: { status: scheduler, ...engine.scheduler },
    marketProvider: {
      status: marketProvider,
      provider: engine.provider,
      symbol: engine.symbol,
      lastFetchAt: latest(engine.timeframes.map((state) => state.lastFetchAt)),
      lastCandleAt: latest(engine.timeframes.map((state) => state.lastCandleAt)),
      lastScanAt: latest(engine.timeframes.map((state) => state.lastScanAt)),
    },
    legal: { status: missingLegal.length ? "INCOMPLETE" : "OK", missing: missingLegal },
    featureGates: { argentinaPayments: config.argentinaPaymentsEnabled ? "ENABLED" : "DISABLED", xauusd: "DISABLED", oneMinute: "DISABLED" },
    topology,
  };
}

function schedulerStatus(engine: ReturnType<typeof getSignalEngineHealth>, now: Date): CheckStatus {
  if (!engine.scheduler.running) return "ERROR";
  const lastScanAt = latest(engine.timeframes.map((state) => state.lastScanAt));
  if (!lastScanAt) {
    const startedAt = parseTime(engine.scheduler.startedAt);
    return startedAt !== null && now.getTime() - startedAt <= engine.scheduler.intervalMs * 3 ? "STARTING" : "STALE";
  }
  return now.getTime() - new Date(lastScanAt).getTime() <= engine.scheduler.intervalMs * 3 ? "OK" : "STALE";
}

function marketStatus(engine: ReturnType<typeof getSignalEngineHealth>): CheckStatus {
  if (engine.timeframes.some((state) => {
    const errorAt = parseTime(state.lastErrorAt);
    const fetchAt = parseTime(state.lastFetchAt);
    return errorAt !== null && (fetchAt === null || errorAt > fetchAt);
  })) return "ERROR";
  return engine.timeframes.every((state) => state.lastFetchAt) ? "OK" : "STARTING";
}

function topologyStatus() {
  const apiHost = config.betterAuthUrl ? new URL(config.betterAuthUrl).hostname : null;
  const frontendHosts = [...config.corsOrigins].map((origin) => new URL(origin).hostname);
  const appHost = config.appPublicUrl ? new URL(config.appPublicUrl).hostname : null;
  const notificationHost = config.notificationPublicUrl ? new URL(config.notificationPublicUrl).hostname : null;
  if (apiHost === "api-staging.trenoro.com") {
    const isolated = frontendHosts.length === 1
      && frontendHosts[0] === "staging.trenoro.com"
      && appHost === "staging.trenoro.com"
      && notificationHost === "staging.trenoro.com";
    return { environment: "STAGING", status: isolated ? "OK" : "ERROR", isolated } as const;
  }
  if (apiHost === "api.trenoro.com") {
    const canonical = frontendHosts.length === 1
      && frontendHosts[0] === "www.trenoro.com"
      && appHost === "www.trenoro.com"
      && notificationHost === "www.trenoro.com";
    return { environment: "PRODUCTION", status: canonical ? "OK" : "ERROR", isolated: canonical } as const;
  }
  return { environment: "LOCAL_OR_CUSTOM", status: "INCOMPLETE", isolated: false } as const;
}

function latest(values: Array<string | null>): string | null {
  const valid = values.filter((value): value is string => Boolean(value) && !Number.isNaN(new Date(value!).getTime()));
  return valid.sort((left, right) => new Date(right).getTime() - new Date(left).getTime())[0] ?? null;
}

function parseTime(value: string | null): number | null {
  if (!value) return null;
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? null : parsed;
}
