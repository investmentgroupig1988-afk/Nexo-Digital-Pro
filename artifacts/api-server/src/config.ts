import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

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
} as const;
