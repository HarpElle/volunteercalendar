/**
 * Distributed rate limiting (Track D.5).
 *
 * Replaces the in-memory `src/lib/utils/rate-limit.ts` for sensitive routes.
 * The old limiter stored counters in a per-instance Map, which is meaningless
 * across Vercel's serverless cold starts and parallel function instances —
 * an attacker can defeat it by simply hitting different geographic regions.
 *
 * This module uses Upstash Redis (free tier covers our traffic) when the
 * UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN env vars are set. If
 * they're unset (e.g. local dev, preview deploys), it falls back to the
 * existing in-memory limiter so nothing breaks. Routes that *require*
 * distributed limiting can use `requireDistributed: true` to fail closed
 * instead of falling back.
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { rateLimit as inMemoryRateLimit } from "@/lib/utils/rate-limit";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

let redis: Redis | null = null;
function getRedis(): Redis | null {
  if (redis) return redis;
  if (
    !process.env.UPSTASH_REDIS_REST_URL ||
    !process.env.UPSTASH_REDIS_REST_TOKEN
  ) {
    return null;
  }
  redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
  });
  return redis;
}

/**
 * Pre-built rate-limit buckets. Configure once; call from anywhere.
 *
 * Keep prefix names stable — they're part of the Redis key — so changing
 * them resets all in-flight buckets (intentional; useful when iterating).
 */
const limiters: Record<string, Ratelimit | null> = {};

function getLimiter(
  prefix: string,
  limit: number,
  windowSeconds: number,
): Ratelimit | null {
  const key = `${prefix}:${limit}:${windowSeconds}`;
  if (limiters[key] !== undefined) return limiters[key];
  const r = getRedis();
  if (!r) {
    limiters[key] = null;
    return null;
  }
  limiters[key] = new Ratelimit({
    redis: r,
    limiter: Ratelimit.slidingWindow(limit, `${windowSeconds} s`),
    prefix,
    analytics: false,
  });
  return limiters[key];
}

function clientIdentifier(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || "unknown";
}

interface RateLimitOpts {
  /** Bucket name; appears in Redis as `${prefix}:${identifier}`. */
  prefix: string;
  /** Allowed requests in the window. */
  limit: number;
  /** Sliding window in seconds. */
  windowSeconds: number;
  /**
   * Optional extra identifier to mix into the bucket key (e.g. user_id,
   * kiosk_id, target email). Composite keys make it harder for one
   * attacker on one IP to spread their volume across users.
   */
  extraKey?: string;
  /**
   * If true, returning 503 when Upstash is unconfigured rather than falling
   * back to the in-memory limiter. Set this for endpoints where the
   * rate-limit is the only abuse defense (e.g. anonymous public endpoints).
   */
  requireDistributed?: boolean;
}

/**
 * Apply a rate limit. Returns null if within limit, or a 429 response.
 *
 * Usage:
 *   const limited = await rateLimitDistributed(req, {
 *     prefix: "kiosk-lookup",
 *     limit: 10,
 *     windowSeconds: 60,
 *     extraKey: kiosk.station_id,
 *   });
 *   if (limited) return limited;
 */
export async function rateLimitDistributed(
  req: NextRequest,
  opts: RateLimitOpts,
): Promise<NextResponse | null> {
  const limiter = getLimiter(opts.prefix, opts.limit, opts.windowSeconds);

  // Fallback path — Upstash not configured.
  if (!limiter) {
    if (opts.requireDistributed) {
      return NextResponse.json(
        { error: "Rate limiter unavailable" },
        { status: 503 },
      );
    }
    return inMemoryRateLimit(req, {
      limit: opts.limit,
      windowMs: opts.windowSeconds * 1000,
    });
  }

  const ip = clientIdentifier(req);
  const identifier = opts.extraKey ? `${ip}:${opts.extraKey}` : ip;

  const result = await limiter.limit(identifier);
  if (result.success) return null;

  const retryAfter = Math.max(
    1,
    Math.ceil((result.reset - Date.now()) / 1000),
  );
  return NextResponse.json(
    {
      error: "Too many requests",
      retry_after_seconds: retryAfter,
    },
    {
      status: 429,
      headers: {
        "Retry-After": String(retryAfter),
        "X-RateLimit-Limit": String(opts.limit),
        "X-RateLimit-Remaining": String(result.remaining),
      },
    },
  );
}
