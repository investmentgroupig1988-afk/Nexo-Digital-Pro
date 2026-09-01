import type { NextFunction, Request, Response } from "express";
import cors from "cors";
import { config } from "../config";

type RateLimitBucket = { count: number; resetAt: number };

const buckets = new Map<string, RateLimitBucket>();

function pruneExpiredBuckets(bucketMap: Map<string, RateLimitBucket>, now: number): void {
  if (bucketMap.size < 1_000) return;
  for (const [key, bucket] of bucketMap) {
    if (bucket.resetAt <= now) bucketMap.delete(key);
  }
}

export const corsMiddleware = cors({
  credentials: true,
  origin(origin, callback) {
    // Requests without Origin are non-browser, same-origin, or health probes.
    if (!origin || config.corsOrigins.has(origin)) {
      callback(null, true);
      return;
    }

    // Return no CORS headers rather than throwing an Express error. The browser
    // blocks the response while API clients still receive the normal response.
    callback(null, false);
  },
  methods: ["GET", "HEAD", "OPTIONS", "POST", "PATCH", "PUT", "DELETE"],
  maxAge: 600,
});

export function securityHeaders(
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Permissions-Policy", "geolocation=(), microphone=(), camera=()");
  if (config.nodeEnv === "production") {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  next();
}

export function publicApiRateLimit(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const now = Date.now();
  const key = req.ip || "unknown";
  const existing = buckets.get(key);
  const bucket =
    existing && existing.resetAt > now
      ? existing
      : { count: 0, resetAt: now + config.rateLimitWindowMs };

  bucket.count += 1;
  buckets.set(key, bucket);
  pruneExpiredBuckets(buckets, now);

  const remaining = Math.max(0, config.rateLimitMax - bucket.count);
  res.setHeader("RateLimit-Limit", String(config.rateLimitMax));
  res.setHeader("RateLimit-Remaining", String(remaining));
  res.setHeader("RateLimit-Reset", String(Math.ceil(bucket.resetAt / 1_000)));

  if (bucket.count > config.rateLimitMax) {
    res.setHeader("Retry-After", String(Math.ceil((bucket.resetAt - now) / 1_000)));
    res.status(429).json({ error: "Too many requests. Please retry later." });
    return;
  }

  next();
}

const authBuckets = new Map<string, RateLimitBucket>();

export function authRateLimit(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const now = Date.now();
  const key = req.ip || "unknown";
  const existing = authBuckets.get(key);
  const bucket = existing && existing.resetAt > now
    ? existing
    : { count: 0, resetAt: now + config.authRateLimitWindowMs };

  bucket.count += 1;
  authBuckets.set(key, bucket);
  pruneExpiredBuckets(authBuckets, now);

  if (bucket.count > config.authRateLimitMax) {
    res.setHeader("Retry-After", String(Math.ceil((bucket.resetAt - now) / 1_000)));
    res.status(429).json({ error: "Too many authentication attempts. Please retry later." });
    return;
  }

  next();
}

/**
 * State-changing cookie requests must originate from this API or an explicitly
 * configured browser origin. Better Auth performs its own origin validation;
 * this also protects TRENORO's custom account/admin endpoints.
 */
export function trustedMutationOrigin(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    next();
    return;
  }

  const origin = req.get("origin");
  if (!origin) {
    next();
    return;
  }

  const requestOrigin = `${req.protocol}://${req.get("host")}`;
  if (origin === requestOrigin || config.corsOrigins.has(origin)) {
    next();
    return;
  }

  res.status(403).json({ error: "Untrusted request origin." });
}
