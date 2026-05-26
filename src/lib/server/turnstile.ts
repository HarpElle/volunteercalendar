import { NextRequest, NextResponse } from "next/server";
import { log } from "@/lib/log";

/**
 * Cloudflare Turnstile server-side token verification.
 *
 * Env-gated: if TURNSTILE_SECRET_KEY is not set, verification is skipped
 * (returns ok). This lets the same code path work in dev/preview/prod
 * across the rollout window. Jason provisions Turnstile + sets the env
 * vars when ready; CAPTCHA auto-activates on next deploy.
 *
 * Companion to the <TurnstileWidget> client component which collects the
 * token from the user. Public forms (waitlist, event signup) must:
 *   1. Render <TurnstileWidget /> in the form (no-op if site key missing)
 *   2. Include the token in the POST body as `turnstile_token`
 *   3. Call verifyTurnstile(req) at the top of the route handler
 *
 * Returns:
 *   - null when verification passes OR when not configured (env-gated off)
 *   - NextResponse with 403 when token is missing/invalid (config IS on)
 */

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

interface TurnstileResponse {
  success: boolean;
  "error-codes"?: string[];
  challenge_ts?: string;
  hostname?: string;
}

/**
 * Verifies a Turnstile token from the request body. Returns null if
 * verification passes OR if Turnstile is not configured (env-var rollout).
 * Returns a 403 NextResponse if verification fails.
 *
 * The request body is consumed by cloning, so this can run before other
 * body parsing in the handler.
 */
export async function verifyTurnstile(
  req: NextRequest,
): Promise<NextResponse | null> {
  const secretKey = process.env.TURNSTILE_SECRET_KEY;
  if (!secretKey) {
    // Env-gated off — skip verification. The client widget is also a no-op
    // when NEXT_PUBLIC_TURNSTILE_SITE_KEY is missing, so the user never
    // sees a challenge.
    return null;
  }

  let body: Record<string, unknown>;
  try {
    body = await req.clone().json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body — Turnstile token required." },
      { status: 400 },
    );
  }

  const token =
    typeof body.turnstile_token === "string" ? body.turnstile_token : "";
  if (!token) {
    return NextResponse.json(
      { error: "Bot challenge required. Please refresh and try again." },
      { status: 403 },
    );
  }

  // Extract caller IP for Turnstile's optional IP binding (mitigates token replay)
  const remoteIp =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    undefined;

  const params = new URLSearchParams();
  params.append("secret", secretKey);
  params.append("response", token);
  if (remoteIp) params.append("remoteip", remoteIp);

  let result: TurnstileResponse;
  try {
    const res = await fetch(VERIFY_URL, {
      method: "POST",
      body: params,
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
    result = (await res.json()) as TurnstileResponse;
  } catch (err) {
    log.error("turnstile verify network error", { error: err });
    return NextResponse.json(
      { error: "Bot verification temporarily unavailable. Please try again." },
      { status: 503 },
    );
  }

  if (!result.success) {
    log.warn("turnstile verification failed", { error_codes: result["error-codes"] ?? [] });
    return NextResponse.json(
      { error: "Bot challenge failed. Please refresh and try again." },
      { status: 403 },
    );
  }

  return null;
}

/**
 * Returns true when Turnstile is configured. Useful for conditional UI
 * (e.g. only render the widget if site key is set). The server-side env
 * var check is duplicated in the client via NEXT_PUBLIC_TURNSTILE_SITE_KEY.
 */
export function isTurnstileConfigured(): boolean {
  return !!process.env.TURNSTILE_SECRET_KEY;
}
