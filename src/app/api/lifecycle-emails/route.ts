import { NextResponse } from "next/server";
import { Resend } from "resend";
import {
  buildPurchaseThankYouEmail,
  buildReEngagementEmail,
  buildUpsellEmail,
} from "@/lib/utils/email-templates";

const resend = new Resend(process.env.RESEND_API_KEY);

/**
 * Lifecycle email API. Called with a type and payload.
 *
 * Types:
 *   purchase-thank-you — sent after Stripe checkout
 *   re-engagement     — sent to inactive free-tier users (cron)
 *   upsell            — sent to active free-tier users nearing limits (cron)
 */
export async function POST(request: Request) {
  try {
    // Verify internal API key for cron/webhook callers
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!process.env.RESEND_API_KEY) {
      return NextResponse.json(
        { error: "Email service not configured" },
        { status: 503 },
      );
    }

    const body = await request.json();
    const { type, payload } = body;

    let subject: string;
    let html: string;
    let text: string;
    let to: string;

    switch (type) {
      case "purchase-thank-you": {
        const result = buildPurchaseThankYouEmail({
          userName: payload.userName,
          planName: payload.planName,
          churchName: payload.churchName,
        });
        subject = result.subject;
        html = result.html;
        text = result.text;
        to = payload.email;
        break;
      }

      case "re-engagement": {
        const result = buildReEngagementEmail({
          userName: payload.userName,
          churchName: payload.churchName,
          daysSinceLastLogin: payload.daysSinceLastLogin,
        });
        subject = result.subject;
        html = result.html;
        text = result.text;
        to = payload.email;
        break;
      }

      case "upsell": {
        const result = buildUpsellEmail({
          userName: payload.userName,
          churchName: payload.churchName,
          volunteerCount: payload.volunteerCount,
          volunteerLimit: payload.volunteerLimit,
          ministryCount: payload.ministryCount,
          ministryLimit: payload.ministryLimit,
        });
        subject = result.subject;
        html = result.html;
        text = result.text;
        to = payload.email;
        break;
      }

      default:
        return NextResponse.json(
          { error: `Unknown email type: ${type}` },
          { status: 400 },
        );
    }

    await resend.emails.send({
      from: "VolunteerCal <noreply@harpelle.com>",
      replyTo: "info@volunteercal.com",
      to: [to],
      subject,
      html,
      text,
    });

    return NextResponse.json({ success: true, type, to });
  } catch (error) {
    console.error("Lifecycle email error:", error);
    return NextResponse.json(
      { error: "Failed to send lifecycle email" },
      { status: 500 },
    );
  }
}
