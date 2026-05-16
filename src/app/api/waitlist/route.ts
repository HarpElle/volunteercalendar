import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { rateLimit } from "@/lib/utils/rate-limit";

/**
 * POST /api/waitlist
 *
 * Public endpoint — accepts contact/waitlist form submissions from the
 * landing page. Stored in the top-level `waitlist` collection.
 *
 * Codex QA 2026-05-15: this route previously used the CLIENT Firebase SDK,
 * which respects Firestore security rules. The rule
 *   match /waitlist/{docId} { allow read, write: if false; }
 * was therefore blocking every submission, returning "Failed to save
 * submission" to the user. Server routes must use the Admin SDK to
 * bypass rules. See plan i-want-you-to-iterative-spring.md Layer 5.
 */
export async function POST(request: Request) {
  const limited = rateLimit(request, { limit: 5, windowMs: 60_000 });
  if (limited) return limited;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 },
    );
  }

  const {
    name,
    email,
    church_name,
    team_size,
    current_tool,
    workflow_preference,
    phone,
  } = body as {
    name?: string;
    email?: string;
    church_name?: string;
    team_size?: number | string;
    current_tool?: string;
    workflow_preference?: string;
    phone?: string;
  };

  // Validate required fields
  if (
    !name
    || !email
    || !church_name
    || !current_tool
    || !workflow_preference
  ) {
    return NextResponse.json(
      { error: "Missing required fields" },
      { status: 400 },
    );
  }

  // Validate email format
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json(
      { error: "Invalid email address" },
      { status: 400 },
    );
  }

  try {
    await adminDb.collection("waitlist").add({
      name,
      email,
      church_name,
      team_size: team_size || 0,
      current_tool,
      workflow_preference,
      phone: phone || null,
      created_at: new Date().toISOString(),
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    // Specific logging so future Sentry signals are actionable.
    console.error("[POST /api/waitlist] Firestore write failed:", error);
    return NextResponse.json(
      {
        error:
          "We couldn't save your submission. Please email info@volunteercal.com and we'll follow up.",
      },
      { status: 500 },
    );
  }
}
