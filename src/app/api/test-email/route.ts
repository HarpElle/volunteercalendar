import { NextResponse } from "next/server";
import { Resend } from "resend";
import { adminAuth } from "@/lib/firebase/admin";
import { buildReminderEmail, buildConfirmationEmail } from "@/lib/utils/email-templates";

const resend = new Resend(process.env.RESEND_API_KEY);

/**
 * POST /api/test-email
 *
 * Sends a test email to the authenticated admin so they can preview templates.
 *
 * Body: { type: "reminder" | "confirmation", email: string }
 * Auth: Bearer token (admin only — verified via Firebase Admin SDK)
 */
export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const token = authHeader.split("Bearer ")[1];
    const decoded = await adminAuth.verifyIdToken(token);

    if (!decoded.uid) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    const body = await request.json();
    const { type, email } = body as { type: string; email: string };

    if (!type || !email) {
      return NextResponse.json(
        { error: "Missing required fields: type, email" },
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
      to: [email],
      subject,
      html,
      text,
    });

    return NextResponse.json({
      success: true,
      message: `Test ${type} email sent to ${email}`,
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
