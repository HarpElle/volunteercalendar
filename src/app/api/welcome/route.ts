import { NextResponse } from "next/server";
import { Resend } from "resend";
import { buildWelcomeEmail, buildAccountCreatedEmail } from "@/lib/utils/email-templates";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(request: Request) {
  try {
    const { name, email, redirect } = await request.json();

    if (!email) {
      return NextResponse.json({ error: "Missing email" }, { status: 400 });
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
