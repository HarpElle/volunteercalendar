import { NextRequest, NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/server/authz";
import { buildReminderEmail, buildConfirmationEmail } from "@/lib/utils/email-templates";
import { resend } from "@/lib/resend";

/**
 * POST /api/test-email
 *
 * Sends a test email to the authenticated platform admin so they can
 * preview templates. The recipient is ALWAYS the caller's own verified
 * email — the route accepts no other `to` address. Prevents the
 * route from being used as an abuse vector to burn Resend quota or
 * send arbitrary mail.
 *
 * Body: { type: "reminder" | "confirmation" }
 * Auth: platform-admin Bearer token (env-var UID whitelist).
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requirePlatformAdmin(request);
    if (auth instanceof NextResponse) return auth;

    const callerEmail = auth.email;
    if (!callerEmail) {
      return NextResponse.json(
        { error: "Authenticated user has no email; cannot send test" },
        { status: 400 },
      );
    }

    const body = await request.json();
    const { type } = body as { type: string };

    if (!type) {
      return NextResponse.json(
        { error: "Missing required field: type" },
        { status: 400 },
      );
    }

    if (!["reminder", "confirmation"].includes(type)) {
      return NextResponse.json(
        { error: 'type must be "reminder" or "confirmation"' },
        { status: 400 },
      );
    }

    // Build tomorrow's date string (YYYY-MM-DD)
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const serviceDate = tomorrow.toISOString().split("T")[0];

    const sampleData = {
      volunteerName: "Test Volunteer",
      churchName: "Sample Organization",
      serviceName: "Sunday Service",
      ministryName: "Sound Team",
      roleTitle: "Sound Operator",
      serviceDate,
      startTime: "9:00 AM",
      confirmUrl: "https://volunteercal.com/confirm/test-token",
    };

    let subject: string;
    let html: string;
    let text: string;

    if (type === "reminder") {
      const result = buildReminderEmail({ ...sampleData, hoursUntil: 24 });
      subject = result.subject;
      html = result.html;
      text = result.text;
    } else {
      const result = buildConfirmationEmail(sampleData);
      subject = result.subject;
      html = result.html;
      text = result.text;
    }

    // Prefix subject so it's obvious this is a test
    subject = `[TEST] ${subject}`;

    if (!process.env.RESEND_API_KEY) {
      return NextResponse.json(
        { error: "RESEND_API_KEY is not configured" },
        { status: 500 },
      );
    }

    const sendResult = await resend.emails.send({
      from: "VolunteerCal Test <noreply@harpelle.com>",
      replyTo: "info@volunteercal.com",
      to: [callerEmail],
      subject,
      html,
      text,
    });

    return NextResponse.json({
      success: true,
      message: `Test ${type} email sent to ${callerEmail}`,
      result: sendResult,
    });
  } catch (error) {
    console.error("Test email error:", error);
    return NextResponse.json(
      { error: (error as Error).message || "Failed to send test email" },
      { status: 500 },
    );
  }
}
