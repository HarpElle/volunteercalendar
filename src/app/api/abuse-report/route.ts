import { NextRequest, NextResponse } from "next/server";
import { resend } from "@/lib/resend";
import { rateLimitDistributed } from "@/lib/server/rate-limit";
import { verifyTurnstile } from "@/lib/server/turnstile";

/**
 * POST /api/abuse-report
 *
 * Public abuse-reporting endpoint. Plain contact form pattern: anyone
 * with a browser can submit a report describing suspected misuse of the
 * platform. We email info@volunteercal.com so a human can triage.
 *
 * Pass G Phase 5. Per the plan §1 decision #7: single contact form,
 * no queue/admin UI. Build the queue if + when first 50 orgs justify it.
 *
 * Rate-limited via the same distributed limiter Phase 2 uses on public
 * surfaces, plus Turnstile on the client form to prevent automated spam.
 *
 * Body:
 *   { report: string, reporter_email?: string, context?: string,
 *     turnstile_token?: string }
 */
export async function POST(req: NextRequest) {
  const limited = await rateLimitDistributed(req, {
    prefix: "abuse-report",
    limit: 3,
    windowSeconds: 60 * 60,
    requireDistributed: true,
  });
  if (limited) return limited;

  // Cloudflare Turnstile (env-gated; no-op if not configured).
  const captchaFailed = await verifyTurnstile(req);
  if (captchaFailed) return captchaFailed;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 },
    );
  }

  const report = typeof body.report === "string" ? body.report.trim() : "";
  const reporterEmail =
    typeof body.reporter_email === "string"
      ? body.reporter_email.trim()
      : null;
  const context =
    typeof body.context === "string" ? body.context.trim().slice(0, 500) : null;

  if (!report || report.length < 20) {
    return NextResponse.json(
      {
        error:
          "Please describe the issue in at least 20 characters so we can act on it.",
      },
      { status: 400 },
    );
  }
  if (report.length > 4000) {
    return NextResponse.json(
      { error: "Report too long (max 4000 characters)." },
      { status: 400 },
    );
  }

  if (!process.env.RESEND_API_KEY) {
    // No email configured (e.g. local dev). Accept the report but log it.
    console.warn(
      "[abuse-report] RESEND_API_KEY not set; report not emailed:",
      report.slice(0, 200),
    );
    return NextResponse.json({ success: true, channel: "log" });
  }

  // Escape HTML in user-supplied strings (defense in depth — the Resend
  // dashboard renders HTML).
  const escape = (s: string): string =>
    s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  try {
    await resend.emails.send({
      from: "VolunteerCal Abuse Report <noreply@harpelle.com>",
      to: "info@volunteercal.com",
      replyTo: reporterEmail || undefined,
      subject: `Abuse report from ${reporterEmail || "anonymous"}`,
      html: `
        <h2>Abuse report received</h2>
        <p><strong>Reporter:</strong> ${escape(reporterEmail || "anonymous (no email provided)")}</p>
        ${context ? `<p><strong>Context:</strong> ${escape(context)}</p>` : ""}
        <h3>Report</h3>
        <pre style="white-space: pre-wrap; font-family: ui-sans-serif, system-ui; background: #f6f6f6; padding: 12px; border-radius: 6px;">${escape(report)}</pre>
        <p style="color: #888; font-size: 12px; margin-top: 24px;">
          Sent via /api/abuse-report. To reply, use the "Reply" button —
          your reply goes to the reporter's email.
        </p>
      `,
      text:
        `Abuse report from ${reporterEmail || "anonymous"}\n\n` +
        (context ? `Context: ${context}\n\n` : "") +
        `Report:\n${report}`,
    });
  } catch (err) {
    console.error("[abuse-report] resend failed:", err);
    return NextResponse.json(
      {
        error:
          "Failed to send report. Please email info@volunteercal.com directly.",
      },
      { status: 503 },
    );
  }

  return NextResponse.json({ success: true });
}
