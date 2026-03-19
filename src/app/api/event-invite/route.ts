import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { buildEventInviteEmail } from "@/lib/utils/email-templates";

const resend = new Resend(process.env.RESEND_API_KEY);

/**
 * POST /api/event-invite
 *
 * Sends event invite emails to a list of recipients.
 *
 * Body: {
 *   church_id: string
 *   event_id: string
 *   recipient_emails: string[]   — up to 50 per request
 * }
 *
 * Auth: Bearer token (admin+ role)
 */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const decoded = await adminAuth.verifyIdToken(authHeader.slice(7));
    const userId = decoded.uid;

    const body = await req.json();
    const { church_id, event_id, recipient_emails } = body;

    if (!church_id || !event_id || !Array.isArray(recipient_emails) || recipient_emails.length === 0) {
      return NextResponse.json(
        { error: "Missing required fields: church_id, event_id, recipient_emails" },
        { status: 400 },
      );
    }

    if (recipient_emails.length > 50) {
      return NextResponse.json(
        { error: "Maximum 50 recipients per request" },
        { status: 400 },
      );
    }

    // Verify membership (admin+ only)
    const memSnap = await adminDb.doc(`memberships/${userId}_${church_id}`).get();
    if (!memSnap.exists || !["owner", "admin"].includes(memSnap.data()?.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Load church
    const churchSnap = await adminDb.doc(`churches/${church_id}`).get();
    if (!churchSnap.exists) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }
    const churchName = churchSnap.data()!.name || "your organization";

    // Load event
    const eventSnap = await adminDb.doc(`churches/${church_id}/events/${event_id}`).get();
    if (!eventSnap.exists) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }
    const event = eventSnap.data()!;

    // Load sender name
    const senderSnap = await adminDb.doc(`users/${userId}`).get();
    const senderName = senderSnap.exists
      ? senderSnap.data()!.display_name || "An admin"
      : "An admin";

    // Build signup URL
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://volunteercal.com";
    const signupUrl = `${baseUrl}/events/${church_id}/${event_id}/signup`;

    // Format date and time for the email
    const eventDate = event.date || "TBD";
    const eventTime = formatEventTime(event);

    // Send emails
    const results: { email: string; success: boolean; error?: string }[] = [];

    if (!process.env.RESEND_API_KEY) {
      return NextResponse.json(
        { error: "Email service not configured" },
        { status: 503 },
      );
    }

    for (const email of recipient_emails) {
      try {
        // Try to find the recipient's name
        let recipientName = email;
        try {
          const userRecord = await adminAuth.getUserByEmail(email);
          const userSnap = await adminDb.doc(`users/${userRecord.uid}`).get();
          if (userSnap.exists && userSnap.data()?.display_name) {
            recipientName = userSnap.data()!.display_name;
          }
        } catch {
          // User not found — use email as name
        }

        const emailContent = buildEventInviteEmail({
          recipientName,
          eventName: event.name,
          eventDate,
          eventTime,
          eventDescription: event.description || undefined,
          churchName,
          signupUrl,
          senderName,
        });

        await resend.emails.send({
          from: "VolunteerCal <noreply@harpelle.com>",
          replyTo: "info@volunteercal.com",
          to: [email],
          subject: emailContent.subject,
          html: emailContent.html,
          text: emailContent.text,
        });

        results.push({ email, success: true });
      } catch (err) {
        results.push({
          email,
          success: false,
          error: err instanceof Error ? err.message : "Send failed",
        });
      }
    }

    const sent = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;

    return NextResponse.json({ sent, failed, results });
  } catch (err) {
    console.error("POST /api/event-invite error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

function formatEventTime(event: { all_day?: boolean; start_time?: string; end_time?: string }): string {
  if (event.all_day) return "All day";
  if (!event.start_time) return "TBD";

  const fmt = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    const suffix = h >= 12 ? "PM" : "AM";
    const hour = h % 12 || 12;
    return m === 0 ? `${hour} ${suffix}` : `${hour}:${m.toString().padStart(2, "0")} ${suffix}`;
  };

  return event.end_time
    ? `${fmt(event.start_time)}–${fmt(event.end_time)}`
    : fmt(event.start_time);
}
