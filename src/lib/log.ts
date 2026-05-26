/**
 * Structured logging wrapper.
 *
 * Single entry point for application logs. Goals:
 *   - Structured JSON in production so Vercel / log shippers can parse it
 *   - Plain, readable output in development so the terminal isn't an
 *     unreadable wall of JSON
 *   - Errors automatically flow to Sentry — no separate captureException call
 *     needed at the call site. If the same call site already passes an Error
 *     to Sentry manually, that's a no-op-level dup at most.
 *   - Works whether or not Sentry is configured. Tests + local dev without a
 *     DSN see nothing extra.
 *
 * Usage:
 *
 *   import { log } from "@/lib/log";
 *
 *   log.info("Order created", { order_id: id, user_id: uid });
 *   log.warn("Stripe webhook signature mismatch", { event_id });
 *   log.error("Failed to send reminder email", { error: err, person_id });
 *
 *   // Bare error shortcut — accepts an Error directly as the second arg
 *   // for ergonomic migration from `console.error("tag", err)`:
 *   log.error("[POST /api/notify]", err);
 *
 * Conventions:
 *   - First arg is a stable human-readable message (no PII, no IDs).
 *   - Fields object carries the variable bits (IDs, counts, etc.). Avoid
 *     putting raw request bodies in there.
 *   - `error` field MUST be an Error instance — that's what unlocks the
 *     stack-trace path in Sentry.
 */

import * as Sentry from "@sentry/nextjs";

export type LogLevel = "debug" | "info" | "warn" | "error";

export type LogFields = Record<string, unknown> & {
  /** Optional Error for stack-trace + Sentry routing. */
  error?: unknown;
};

interface LogPayload {
  level: LogLevel;
  msg: string;
  ts: string;
  [key: string]: unknown;
}

/**
 * Whether to emit production-style JSON. Vercel sets NODE_ENV=production for
 * both preview and production builds, so that's the right gate — local
 * `npm run dev` keeps the readable formatting.
 */
const PROD = process.env.NODE_ENV === "production";

/** Normalize an unknown value into an Error if it looks error-shaped. */
function toError(value: unknown): Error | null {
  if (value instanceof Error) return value;
  if (value && typeof value === "object" && "message" in value) {
    const e = new Error(String((value as { message: unknown }).message));
    return e;
  }
  return null;
}

/**
 * Strip the `error` key out of fields for the structured payload (the Error
 * object itself doesn't serialize cleanly through JSON.stringify; we extract
 * `message` and `stack` instead) and return what should be merged in.
 */
function flattenError(fields: LogFields): Record<string, unknown> {
  const { error, ...rest } = fields;
  if (!error) return rest;
  const err = toError(error);
  if (err) {
    return {
      ...rest,
      error_message: err.message,
      error_name: err.name,
      error_stack: err.stack,
    };
  }
  // Non-Error value passed as `error` — preserve it stringified.
  return { ...rest, error: String(error) };
}

function emit(level: LogLevel, msg: string, fieldsArg?: LogFields | unknown) {
  // Allow callers to pass an Error directly as the second argument for
  // ergonomic migration from `console.error("tag", err)`.
  let fields: LogFields = {};
  if (fieldsArg instanceof Error) {
    fields = { error: fieldsArg };
  } else if (fieldsArg && typeof fieldsArg === "object") {
    fields = fieldsArg as LogFields;
  }

  const ts = new Date().toISOString();
  const flat = flattenError(fields);
  const payload: LogPayload = { level, msg, ts, ...flat };

  // The no-console lint rule is turned off for this file (see eslint.config.mjs)
  // because the log wrapper IS the legitimate place to call console.
  if (PROD) {
    // Vercel collects stdout/stderr; pick the right stream by level.
    const line = JSON.stringify(payload);
    if (level === "error") console.error(line);
    else if (level === "warn") console.warn(line);
    else console.log(line);
  } else {
    const tag = `[${level.toUpperCase()}]`;
    const extras = Object.keys(flat).length > 0 ? flat : undefined;
    if (level === "error") console.error(tag, msg, extras ?? "");
    else if (level === "warn") console.warn(tag, msg, extras ?? "");
    else console.log(tag, msg, extras ?? "");
  }

  // Route errors to Sentry. No-op if Sentry isn't initialized — captureXxx
  // just queues against the default no-op client.
  if (level === "error") {
    const err = toError(fields.error);
    if (err) {
      Sentry.captureException(err, {
        level: "error",
        extra: { msg, ...flat },
      });
    } else {
      Sentry.captureMessage(msg, {
        level: "error",
        extra: flat,
      });
    }
  } else if (level === "warn") {
    // Don't auto-capture warnings — too noisy. Callers who want a warning in
    // Sentry can call Sentry.captureMessage directly.
  }
}

export const log = {
  debug: (msg: string, fields?: LogFields) => emit("debug", msg, fields),
  info: (msg: string, fields?: LogFields) => emit("info", msg, fields),
  warn: (msg: string, fields?: LogFields | unknown) => emit("warn", msg, fields),
  error: (msg: string, fields?: LogFields | unknown) => emit("error", msg, fields),
};
