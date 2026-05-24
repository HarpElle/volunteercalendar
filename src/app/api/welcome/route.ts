import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase/admin";
import { rateLimitDistributed } from "@/lib/server/rate-limit";
import { buildWelcomeEmail, buildAccountCreatedEmail } from "@/lib/utils/email-templates";
import { resend } from "@/lib/resend";

/**
 * POST /api/welcome
 *
 * Sends a welcome / account-created email to a freshly registered user.
 *
 * Auth: requires a Firebase ID token in `Authorization: Bearer <token>`.
 *       The decoded user's email MUST match the destination `email` field.
 *       This stops the endpoint from being abused as an open Resend relay.
 *
 * NOTE: This endpoint will move into the post-registration server flow in
 * Track D. Until then, the auth gate prevents abuse.
 */
export async function POST(request: NextRequest) {
  // Pass G Phase 2: distributed rate limit (was per-instance in-memory).
  // 5/IP/hour — an account is only welcomed once, so a real user never
  // bumps this. Auth gate below still requires the inviter's ID token.
  const limited = await rateLimitDistributed(request, {
    prefix: "welcome",
    limit: 5,
    windowSeconds: 60 * 60,
    requireDistributed: true,
  });
  if (limited) return limited;

  // Require a freshly-issued Firebase ID token.
  const authz = request.headers.get("authorization");
  if (!authz?.startsWith("Bearer ")) {
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 },
    );
  }

  let decoded;
  try {
    decoded = await adminAuth.verifyIdToken(authz.slice(7));
  } catch {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  try {
    const { name, email, redirect } = await request.json();

    if (!email) {
      return NextResponse.json({ error: "Missing email" }, { status: 400 });
    }

    // Decoded user's email MUST match destination — prevents relay abuse.
    if (
      !decoded.email ||
      decoded.email.toLowerCase() !== String(email).toLowerCase()
    ) {
      return NextResponse.json(
        { error: "Welcome email may only be sent to the authenticated user's address" },
        { status: 403 },
      );
    }

    if (!process.env.RESEND_API_KEY) {
      return NextResponse.json(
        { error: "Email service not configured" },
        { status: 503 },
      );
    }

    // If registering via a join link, skip the admin setup guide.
    // The welcome-to-org email will handle messaging after they join.
    // Send a lightweight "account created" confirmation instead.
    const isJoinFlow = typeof redirect === "string" && redirect.startsWith("/join/");

    const { subject, html, text } = isJoinFlow
      ? buildAccountCreatedEmail({ userName: name || "there" })
      : buildWelcomeEmail({ userName: name || "there" });

    await resend.emails.send({
      from: "VolunteerCal <noreply@harpelle.com>",
      replyTo: "info@volunteercal.com",
      to: [email],
      subject,
      html,
      text,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Welcome email error:", error);
    return NextResponse.json(
      { error: "Failed to send welcome email" },
      { status: 500 },
    );
  }
}
