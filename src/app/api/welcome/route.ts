import { NextResponse } from "next/server";
import { Resend } from "resend";
import { buildWelcomeEmail } from "@/lib/utils/email-templates";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(request: Request) {
  try {
    const { name, email } = await request.json();

    if (!email) {
      return NextResponse.json({ error: "Missing email" }, { status: 400 });
    }

    if (!process.env.RESEND_API_KEY) {
      return NextResponse.json(
        { error: "Email service not configured" },
        { status: 503 },
      );
    }

    const { subject, html, text } = buildWelcomeEmail({
      userName: name || "there",
    });

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
