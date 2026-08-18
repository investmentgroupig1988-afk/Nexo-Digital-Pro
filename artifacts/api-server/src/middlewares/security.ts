import type { NextFunction, Request, Response } from "express";
import cors from "cors";
import { config } from "../config";

type RateLimitBucket = { count: number; resetAt: number };

const buckets = new Map<string, RateLimitBucket>();

function pruneExpiredBuckets(now: number): void {
  if (buckets.size < 1_000) return;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

export const corsMiddleware = cors({
  credentials: false,
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
  methods: ["GET", "HEAD", "OPTIONS"],
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
  pruneExpiredBuckets(now);

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
