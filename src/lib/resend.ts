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

export const resend = new Proxy({} as Resend, {
  get(_target, prop) {
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
