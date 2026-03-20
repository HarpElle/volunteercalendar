import { NextResponse } from "next/server";

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

// Clean up expired entries periodically to prevent memory leaks
const CLEANUP_INTERVAL = 60_000;
let lastCleanup = Date.now();

function cleanup() {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL) return;
  lastCleanup = now;
  for (const [key, entry] of store) {
    if (now > entry.resetAt) store.delete(key);
  }
}

/**
 * In-memory rate limiter for serverless. Map persists across warm invocations on Vercel.
 * Returns null if within limit, or a 429 NextResponse if exceeded.
 */
export function rateLimit(
  request: Request,
  { limit, windowMs }: { limit: number; windowMs: number },
): NextResponse | null {
  cleanup();

  const forwarded = request.headers.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() || "unknown";
  const key = `${ip}:${new URL(request.url).pathname}`;
  const now = Date.now();

  const entry = store.get(key);
  if (!entry || now > entry.resetAt) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return null;
  }

  entry.count++;
  if (entry.count > limit) {
    return NextResponse.json(
      { error: "Too many requests" },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.ceil((entry.resetAt - now) / 1000)),
        },
      },
    );
  }

  return null;
}
