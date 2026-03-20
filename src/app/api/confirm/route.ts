import { NextResponse } from "next/server";
import { Resend } from "resend";
import { adminDb } from "@/lib/firebase/admin";
import { rateLimit } from "@/lib/utils/rate-limit";
import { autoReschedule } from "@/lib/services/auto-reschedule";
import { buildConfirmationEmail } from "@/lib/utils/email-templates";

export async function GET(request: Request) {
  const limited = rateLimit(request, { limit: 30, windowMs: 60_000 });
  if (limited) return limited;

  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get("token");

    if (!token) {
      return NextResponse.json({ error: "Missing token" }, { status: 400 });
    }

    const snap = await adminDb
      .collectionGroup("assignments")
      .where("confirmation_token", "==", token)
      .limit(1)
      .get();

    if (snap.empty) {
      return NextResponse.json({ error: "Assignment not found" }, { status: 404 });
    }

    const assignDoc = snap.docs[0];
    const data = assignDoc.data();
    const churchId = data.church_id as string;

    const [volSnap, svcSnap, minSnap, churchSnap] = await Promise.all([
      adminDb.doc(`churches/${churchId}/volunteers/${data.volunteer_id}`).get(),
      adminDb.doc(`churches/${churchId}/services/${data.service_id}`).get(),
      adminDb.doc(`churches/${churchId}/ministries/${data.ministry_id}`).get(),
      adminDb.doc(`churches/${churchId}`).get(),
    ]);

    return NextResponse.json({
      assignment: {
        id: assignDoc.id,
        church_id: churchId,
        status: data.status,
        service_date: data.service_date,
        role_title: data.role_title,
        responded_at: data.responded_at,
      },
      volunteer_name: volSnap.exists ? volSnap.data()?.name : "Volunteer",
      service_name: svcSnap.exists ? svcSnap.data()?.name : "Service",
      ministry_name: minSnap.exists ? minSnap.data()?.name : "Ministry",
      church_name: churchSnap.exists ? churchSnap.data()?.name : "Church",
    });
  } catch (error) {
    console.error("Confirm lookup error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const limited = rateLimit(request, { limit: 10, windowMs: 60_000 });
  if (limited) return limited;

  try {
    const body = await request.json();
    const { token, action } = body;

    if (!token || !action) {
      return NextResponse.json({ error: "Missing token or action" }, { status: 400 });
    }

    if (action !== "confirm" && action !== "decline") {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    const snap = await adminDb
      .collectionGroup("assignments")
      .where("confirmation_token", "==", token)
      .limit(1)
      .get();

    if (snap.empty) {
      return NextResponse.json({ error: "Assignment not found" }, { status: 404 });
    }

    const assignDoc = snap.docs[0];
    const current = assignDoc.data();

    // Don't allow re-responding if already responded
    if (current.responded_at) {
      return NextResponse.json({
        error: "Already responded",
        status: current.status,
      }, { status: 409 });
    }

    const newStatus = action === "confirm" ? "confirmed" : "declined";
    await assignDoc.ref.update({
      status: newStatus,
      responded_at: new Date().toISOString(),
    });

    // Auto-reschedule: find a replacement when a volunteer declines
    let rescheduled = false;
    if (action === "decline" && current.service_id && current.schedule_id) {
      try {
        const result = await autoReschedule({
          churchId: current.church_id,
          scheduleId: current.schedule_id,
          serviceId: current.service_id,
          serviceDate: current.service_date,
          ministryId: current.ministry_id,
          roleId: current.role_id,
          roleTitle: current.role_title,
          declinedVolunteerId: current.volunteer_id,
        });

        if (result.replaced && result.newVolunteerEmail && result.confirmationToken) {
          rescheduled = true;

          // Send confirmation email to the new volunteer (fire-and-forget)
          if (process.env.RESEND_API_KEY) {
            const churchId = current.church_id as string;
            const [svcSnap, minSnap, churchSnap] = await Promise.all([
              adminDb.doc(`churches/${churchId}/services/${current.service_id}`).get(),
              adminDb.doc(`churches/${churchId}/ministries/${current.ministry_id}`).get(),
              adminDb.doc(`churches/${churchId}`).get(),
            ]);

            const churchName = churchSnap.exists ? (churchSnap.data()?.name as string) || "Church" : "Church";
            const origin = request.headers.get("origin")
              || request.headers.get("referer")?.replace(/\/[^/]*$/, "")
              || "https://volunteercal.com";

            const { subject, html, text } = buildConfirmationEmail({
              volunteerName: result.newVolunteerName || "Volunteer",
              churchName,
              serviceName: svcSnap.exists ? (svcSnap.data()?.name as string) || "Service" : "Service",
              ministryName: minSnap.exists ? (minSnap.data()?.name as string) || "Ministry" : "Ministry",
              roleTitle: current.role_title,
              serviceDate: current.service_date,
              startTime: svcSnap.exists ? (svcSnap.data()?.start_time as string) || "" : "",
              confirmUrl: `${origin}/confirm/${result.confirmationToken}`,
            });

            const resend = new Resend(process.env.RESEND_API_KEY);
            resend.emails.send({
              from: `${churchName} via VolunteerCal <noreply@harpelle.com>`,
              replyTo: "info@volunteercal.com",
              to: [result.newVolunteerEmail],
              subject,
              html,
              text,
            }).catch((err) => console.error("Auto-reschedule email failed:", err));
          }
        }
      } catch (err) {
        // Auto-reschedule is best-effort — don't fail the decline
        console.error("Auto-reschedule error:", err);
      }
    }

    return NextResponse.json({ success: true, status: newStatus, rescheduled });
  } catch (error) {
    console.error("Confirm action error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
