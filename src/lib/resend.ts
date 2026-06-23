import { Resend } from "resend";

/**
 * Lazy Resend SDK instantiation. Same pattern as src/lib/stripe.ts.
 *
 * Codex Run 2 follow-up (2026-05-17): the Resend SDK throws synchronously
 * if no API key is provided. 29+ API route modules were calling
 * `new Resend(process.env.RESEND_API_KEY)` at module-load, which crashed
 * Vercel builds for any environment without RESEND_API_KEY set. After
 * fixing Stripe with the same lazy pattern, the build progressed past
 * Stripe and crashed on Resend instead. This module is the centralized
 * fix; the 29 routes now import `resend` from here.
 *
 * The Proxy defers SDK construction until the first property access. A
 * route that's never called doesn't pay the construction cost or the
 * missing-key error. A route that IS called when the key is missing
 * throws a clear, actionable error at the call site.
 */

let _resendInstance: Resend | null = null;

function getResendInstance(): Resend {
  if (_resendInstance) return _resendInstance;
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    throw new Error(
      "RESEND_API_KEY is not set in this environment. Email send operations are unavailable. Set the env var to enable transactional email.",
    );
  }
  _resendInstance = new Resend(key);
  return _resendInstance;
}

/**
 * Dry-run egress (Phase 4b / Antigravity I-001): when RESEND_DRY_RUN is
 * truthy, OR no RESEND_API_KEY is set outside production, `resend.emails.send`
 * logs the payload and returns a mock success instead of calling Resend.
 * Lets heavy test runs (publishing test schedules) exercise the full send
 * path without burning Resend's daily quota or needing a key locally.
 */
function isDryRun(): boolean {
  if (process.env.RESEND_DRY_RUN === "true" || process.env.RESEND_DRY_RUN === "1") {
    return true;
  }
  return process.env.NODE_ENV !== "production" && !process.env.RESEND_API_KEY;
}

const dryRunEmails = {
  async send(payload: unknown) {
    const p = (payload ?? {}) as { to?: unknown; subject?: unknown };
    console.info(
      `[resend:dry-run] suppressed send → to=${JSON.stringify(p.to)} subject=${JSON.stringify(p.subject)}`,
    );
    return { data: { id: "dry-run" }, error: null };
  },
};

export const resend = new Proxy({} as Resend, {
  get(_target, prop) {
    // Intercept `.emails` in dry-run BEFORE constructing the SDK, so a
    // missing key in dev/test doesn't throw — the stub handles the send.
    if (prop === "emails" && isDryRun()) {
      return dryRunEmails;
    }
    const instance = getResendInstance();
    const value = (instance as unknown as Record<string | symbol, unknown>)[
      prop as string | symbol
    ];
    if (typeof value === "function") {
      return (value as (...args: unknown[]) => unknown).bind(instance);
    }
    return value;
  },
});
