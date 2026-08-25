import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createLegalIdentity } from "@workspace/product";

const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));

// Both source and bundled output live three levels below the repository root.
dotenv.config({ path: path.resolve(moduleDirectory, "../../../.env") });

function parsePositiveInteger(name: string, fallback: number): number {
  const value = process.env[name];
  if (!value) return fallback;

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }

  return parsed;
}

function parseNonNegativeInteger(name: string, fallback: number): number {
  const value = process.env[name];
  if (!value) return fallback;

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${name} must be a non-negative integer.`);
  }

  return parsed;
}

function normalizeOrigin(value: string, variableName: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${variableName} contains an invalid origin: "${value}".`);
  }

  if (
    (parsed.protocol !== "http:" && parsed.protocol !== "https:") ||
    parsed.username ||
    parsed.password ||
    parsed.pathname !== "/" ||
    parsed.search ||
    parsed.hash
  ) {
    throw new Error(
      `${variableName} entries must be absolute http(s) origins without paths or credentials.`,
    );
  }

  return parsed.origin;
}

function parseOrigins(): ReadonlySet<string> {
  const variableName = process.env.CORS_ALLOWED_ORIGINS !== undefined
    ? "CORS_ALLOWED_ORIGINS"
    : "CORS_ORIGINS";
  const configured = process.env.CORS_ALLOWED_ORIGINS ?? process.env.CORS_ORIGINS;
  if (configured === undefined) {
    return process.env.NODE_ENV === "production"
      ? new Set()
      : new Set(["http://localhost:5173", "http://localhost:3000"]);
  }

  return new Set(
    configured
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean)
      .map((origin) => normalizeOrigin(origin, variableName)),
  );
}

function parseCookieSameSite(): "lax" | "strict" | "none" {
  const value = process.env.AUTH_COOKIE_SAME_SITE?.trim().toLowerCase() ?? "lax";
  if (value === "lax" || value === "strict" || value === "none") return value;
  throw new Error("AUTH_COOKIE_SAME_SITE must be lax, strict, or none.");
}

function parseOptionalUrl(name: string): string | undefined {
  const value = process.env[name]?.trim();
  if (!value) return undefined;
  return normalizeOrigin(value, name);
}

function parseBoolean(name: string, fallback: boolean): boolean {
  const value = process.env[name]?.trim().toLowerCase();
  if (!value) return fallback;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error(`${name} must be true or false.`);
}

function parseOptionalHttpUrl(name: string): string | undefined {
  const value = process.env[name]?.trim();
  if (!value) return undefined;
  let parsed: URL;
  try { parsed = new URL(value); } catch { throw new Error(`${name} must be an absolute http(s) URL.`); }
  if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password) {
    throw new Error(`${name} must be an absolute http(s) URL without credentials.`);
  }
  return parsed.toString();
}

export const config = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: parsePositiveInteger("PORT", 5000),
  logLevel: process.env.LOG_LEVEL ?? "info",
  corsOrigins: parseOrigins(),
  // Railway terminates TLS at its proxy. One trusted hop preserves the real
  // client IP for rate limiting without trusting arbitrary forwarded chains.
  trustProxyHops: parseNonNegativeInteger(
    "TRUST_PROXY_HOPS",
    process.env.NODE_ENV === "production" ? 1 : 0,
  ),
  rateLimitMax: parsePositiveInteger("RATE_LIMIT_MAX", 120),
  rateLimitWindowMs: 60_000,
  databaseUrl: process.env.DATABASE_URL?.trim() || undefined,
  betterAuthSecret: process.env.BETTER_AUTH_SECRET?.trim() || undefined,
  betterAuthUrl: parseOptionalUrl("BETTER_AUTH_URL"),
  authCookieDomain: process.env.AUTH_COOKIE_DOMAIN?.trim() || undefined,
  authCookieSameSite: parseCookieSameSite(),
  authRateLimitMax: parsePositiveInteger("AUTH_RATE_LIMIT_MAX", 10),
  authRateLimitWindowMs: 15 * 60_000,
  argentinaPaymentsEnabled: parseBoolean("ARGENTINA_PAYMENTS_ENABLED", false),
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN?.trim() || undefined,
  telegramChatId: process.env.TELEGRAM_CHAT_ID?.trim() || undefined,
  notificationPublicUrl: parseOptionalHttpUrl("NOTIFICATION_PUBLIC_URL"),
  resendApiKey: process.env.RESEND_API_KEY?.trim() || undefined,
  authEmailFrom: process.env.AUTH_EMAIL_FROM?.trim() || undefined,
  appPublicUrl: parseOptionalUrl("APP_PUBLIC_URL"),
  supportWhatsappNumber: process.env.SUPPORT_WHATSAPP_NUMBER?.trim() || undefined,
  legalIdentity: createLegalIdentity({
    operatorName: process.env.LEGAL_OPERATOR_NAME,
    taxId: process.env.LEGAL_TAX_ID,
    address: process.env.LEGAL_ADDRESS,
    supportEmail: process.env.SUPPORT_EMAIL,
    legalEmail: process.env.LEGAL_EMAIL,
  }),
} as const;
