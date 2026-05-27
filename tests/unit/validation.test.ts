/**
 * Unit tests for Wave 3.2 validation helpers (parseBody, parseQuery).
 *
 * These don't need Firestore — pure request/schema validation. Run via
 * `npm test` (unit suite) rather than the emulator integration runner.
 */

import { describe, it, expect } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { z, parseBody, parseQuery } from "@/lib/server/validation";

function postRequest(body: unknown): NextRequest {
  return new NextRequest("https://test/api/whatever", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function getRequest(query: string): NextRequest {
  return new NextRequest(`https://test/api/whatever?${query}`, { method: "GET" });
}

describe("parseBody", () => {
  const Schema = z.object({
    church_id: z.string().min(1),
    count: z.number().int().nonnegative(),
    optional_tag: z.string().optional(),
  });

  it("returns parsed value on valid input", async () => {
    const req = postRequest({ church_id: "c1", count: 5 });
    const result = await parseBody(req, Schema);
    expect(result).not.toBeInstanceOf(NextResponse);
    if (result instanceof NextResponse) return;
    expect(result.church_id).toBe("c1");
    expect(result.count).toBe(5);
    expect(result.optional_tag).toBeUndefined();
  });

  it("returns 400 NextResponse on malformed JSON", async () => {
    const req = postRequest("{not json");
    const result = await parseBody(req, Schema);
    expect(result).toBeInstanceOf(NextResponse);
    expect((result as NextResponse).status).toBe(400);
    const body = await (result as NextResponse).json();
    expect(body.error).toBe("Request body is not valid JSON");
  });

  it("returns 400 with details array on schema failure (wrong type)", async () => {
    const req = postRequest({ church_id: "c1", count: "five" });
    const result = await parseBody(req, Schema);
    expect(result).toBeInstanceOf(NextResponse);
    expect((result as NextResponse).status).toBe(400);
    const body = await (result as NextResponse).json();
    expect(body.error).toBe("Validation failed");
    expect(Array.isArray(body.details)).toBe(true);
    const countIssue = body.details.find(
      (d: { path: string }) => d.path === "count",
    );
    expect(countIssue).toBeDefined();
  });

  it("returns 400 on missing required field", async () => {
    const req = postRequest({ count: 3 });
    const result = await parseBody(req, Schema);
    expect(result).toBeInstanceOf(NextResponse);
    const body = await (result as NextResponse).json();
    const churchIdIssue = body.details.find(
      (d: { path: string }) => d.path === "church_id",
    );
    expect(churchIdIssue).toBeDefined();
  });
});

describe("parseQuery", () => {
  const Schema = z.object({
    days: z.coerce.number().int().positive().max(30),
    sort: z.enum(["asc", "desc"]).optional().default("desc"),
    tag: z.union([z.string(), z.array(z.string())]).optional(),
  });

  it("parses + coerces single values correctly", () => {
    const req = getRequest("days=7&sort=asc");
    const result = parseQuery(req, Schema);
    expect(result).not.toBeInstanceOf(NextResponse);
    if (result instanceof NextResponse) return;
    expect(result.days).toBe(7); // coerced from string
    expect(result.sort).toBe("asc");
  });

  it("applies schema defaults when param is missing", () => {
    const req = getRequest("days=14");
    const result = parseQuery(req, Schema);
    expect(result).not.toBeInstanceOf(NextResponse);
    if (result instanceof NextResponse) return;
    expect(result.sort).toBe("desc"); // schema default
  });

  it("returns array when a query key repeats (?tag=a&tag=b)", () => {
    const req = getRequest("days=7&tag=a&tag=b");
    const result = parseQuery(req, Schema);
    expect(result).not.toBeInstanceOf(NextResponse);
    if (result instanceof NextResponse) return;
    expect(result.tag).toEqual(["a", "b"]);
  });

  it("returns 400 when coercion fails (days=not-a-number)", () => {
    const req = getRequest("days=banana");
    const result = parseQuery(req, Schema);
    expect(result).toBeInstanceOf(NextResponse);
    expect((result as NextResponse).status).toBe(400);
  });

  it("returns 400 when value is out of range", () => {
    const req = getRequest("days=100");
    const result = parseQuery(req, Schema);
    expect(result).toBeInstanceOf(NextResponse);
    expect((result as NextResponse).status).toBe(400);
  });

  it("returns 400 when enum value doesn't match", () => {
    const req = getRequest("days=7&sort=random");
    const result = parseQuery(req, Schema);
    expect(result).toBeInstanceOf(NextResponse);
    expect((result as NextResponse).status).toBe(400);
  });
});
