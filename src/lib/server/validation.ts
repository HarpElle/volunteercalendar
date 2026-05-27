/**
 * Request validation helpers (Wave 3.2).
 *
 * Thin wrappers around zod that produce the same discriminated-union return
 * shape as the authz helpers (T | NextResponse). The route handler does:
 *
 *   const body = await parseBody(req, MySchema);
 *   if (body instanceof NextResponse) return body;
 *   // ... use body.foo, body.bar with full TypeScript inference
 *
 * Why thin: zod alone gets you 90% there but routes still need to:
 *   - Get + parse JSON body (which can throw on malformed input)
 *   - Format zod errors into the project's standard `{ error, details }` shape
 *   - Decide on 400 vs 422 (we use 400 across the board — matches existing routes)
 *
 * Schemas live alongside the consuming route, OR under src/lib/schemas/*.ts
 * for shared shapes (e.g., schedule edit body reused by multiple routes).
 * Convention: schema name matches the request type, e.g.
 * `PublishScheduleBody` for the body of POST /api/schedules/{id}/publish.
 */

import { NextRequest, NextResponse } from "next/server";
import { z, ZodError, type ZodTypeAny, type input, type output } from "zod";
import { log } from "@/lib/log";

export { z, ZodError };

/**
 * Standard 400 error response shape for validation failures. The route
 * caller gets back a NextResponse with `{ error: "Validation failed",
 * details: [...zodIssues] }` body — callers can rely on this shape for
 * structured error rendering in clients (today most error display is
 * generic; refactor target for Wave 5 UX work).
 */
function validationErrorResponse(err: ZodError): NextResponse {
  return NextResponse.json(
    {
      error: "Validation failed",
      details: err.issues.map((i) => ({
        path: i.path.join("."),
        code: i.code,
        message: i.message,
      })),
    },
    { status: 400 },
  );
}

/**
 * Parse + validate a JSON request body against a zod schema.
 *
 * Returns the validated value on success, or a 400 NextResponse on:
 *   - malformed JSON (body isn't parseable)
 *   - schema validation failure (issues array in response body)
 *
 * Body is read via `req.json()` which consumes the request stream. Don't
 * call this on a request that's already been read (e.g. by
 * requireStripeWebhook, which needs the raw text).
 */
export async function parseBody<S extends ZodTypeAny>(
  req: NextRequest,
  schema: S,
): Promise<output<S> | NextResponse> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch (err) {
    log.warn("parseBody JSON parse failed", { error: err });
    return NextResponse.json(
      { error: "Request body is not valid JSON" },
      { status: 400 },
    );
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    return validationErrorResponse(result.error);
  }
  return result.data as output<S>;
}

/**
 * Parse + validate URL search params (?key=val&key2=val2) against a zod
 * schema. Coerces each value to a string before validation — use
 * `z.coerce.number()` etc. in the schema if you need typed parsing.
 *
 * Returns the validated value on success, or a 400 NextResponse on
 * validation failure.
 *
 * Multi-value params (`?tag=a&tag=b`) are passed to zod as an array.
 * Single-value params arrive as strings.
 */
export function parseQuery<S extends ZodTypeAny>(
  req: NextRequest,
  schema: S,
): output<S> | NextResponse {
  const params = req.nextUrl.searchParams;
  const obj: Record<string, string | string[]> = {};
  for (const key of new Set(params.keys())) {
    const all = params.getAll(key);
    obj[key] = all.length > 1 ? all : all[0];
  }
  const result = schema.safeParse(obj);
  if (!result.success) {
    return validationErrorResponse(result.error);
  }
  return result.data as output<S>;
}

/** Re-export for callers that prefer Input type (pre-transform) over Output. */
export type ParsedInput<S extends ZodTypeAny> = input<S>;
export type ParsedOutput<S extends ZodTypeAny> = output<S>;
