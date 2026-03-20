import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { buildInviteEmail } from "@/lib/utils/email-templates";

const resend = new Resend(process.env.RESEND_API_KEY);

/**
 * POST /api/invite/batch
 *
 * Process approved invite queue items: create volunteer records,
 * create pending memberships, and send invite emails.
 *
 * Body: { church_id: string, queue_item_ids: string[] }
 */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const decoded = await adminAuth.verifyIdToken(authHeader.slice(7));
    const inviterUid = decoded.uid;

    const { church_id, queue_item_ids } = await req.json();
    if (!church_id || !queue_item_ids?.length) {
      return NextResponse.json({ error: "Missing church_id or queue_item_ids" }, { status: 400 });
    }

    // Verify inviter is admin+
    const membershipId = `${inviterUid}_${church_id}`;
    const memberSnap = await adminDb.doc(`memberships/${membershipId}`).get();
    if (!memberSnap.exists || !["admin", "owner"].includes(memberSnap.data()?.role)) {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    // Load church info
    const churchSnap = await adminDb.doc(`churches/${church_id}`).get();
    const churchName = churchSnap.data()?.name || "your organization";

    // Load inviter profile
    const inviterSnap = await adminDb.doc(`users/${inviterUid}`).get();
    const inviterName = inviterSnap.data()?.display_name || "An admin";

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://volunteercal.com";
    let sent = 0;
    let failed = 0;
    const errors: string[] = [];

    // Batch-fetch all queue items in a single round-trip
    const queueRefs = queue_item_ids.map((id: string) =>
      adminDb.doc(`churches/${church_id}/invite_queue/${id}`),
    );
    const queueSnapshots = await adminDb.getAll(...queueRefs);
    const queueMap = new Map(
      queueSnapshots
        .filter((s) => s.exists)
        .map((s) => [s.id, { ref: s.ref, data: s.data()! }]),
    );

    for (const queueId of queue_item_ids) {
      try {
        const queueEntry = queueMap.get(queueId);
        if (!queueEntry) continue;

        const queueRef = queueEntry.ref;
        const item = queueEntry.data;
        if (item.status !== "approved") continue;

        const { email, name, role, ministry_ids } = item;
        if (!email) {
          await queueRef.update({ status: "failed", error_message: "No email address" });
          failed++;
          continue;
        }

        // Check if volunteer with this email already exists in the roster
        const existingVolSnap = await adminDb
          .collection(`churches/${church_id}/volunteers`)
          .where("email", "==", email)
          .limit(1)
          .get();

        let volunteerId: string;
        if (existingVolSnap.empty) {
          // Create volunteer record
          const volRef = adminDb.collection(`churches/${church_id}/volunteers`).doc();
          await volRef.set({
            church_id,
            name: name || email,
            email,
            phone: item.phone || null,
            user_id: null,
            membership_id: null,
            status: "active",
            ministry_ids: ministry_ids || [],
            role_ids: [],
            household_id: null,
            availability: {
              blockout_dates: [],
              recurring_unavailable: [],
              preferred_frequency: 2,
              max_roles_per_month: 8,
            },
            reminder_preferences: { channels: ["email"] },
            stats: {
              times_scheduled_last_90d: 0,
              last_served_date: null,
              decline_count: 0,
              no_show_count: 0,
            },
            imported_from: item.source_provider || item.source || null,
            created_at: new Date().toISOString(),
          });
          volunteerId = volRef.id;
        } else {
          volunteerId = existingVolSnap.docs[0].id;
        }

        // Check if user already exists in Firebase Auth
        let inviteeUid: string | null = null;
        try {
          const userRecord = await adminAuth.getUserByEmail(email);
          inviteeUid = userRecord.uid;
        } catch {
          // Not registered yet
        }

        const now = new Date().toISOString();
        let acceptUrl: string;

        if (inviteeUid) {
          // Check for existing membership
          const existingMemId = `${inviteeUid}_${church_id}`;
          const existingMemSnap = await adminDb.doc(`memberships/${existingMemId}`).get();

          if (existingMemSnap.exists) {
            const existingStatus = existingMemSnap.data()?.status;
            if (existingStatus === "active") {
              await queueRef.update({ status: "sent", sent_at: now, volunteer_id: volunteerId });
              sent++;
              continue; // Already a member
            }
            if (existingStatus === "pending_org_approval") {
              // Approve them
              await adminDb.doc(`memberships/${existingMemId}`).update({
                status: "active",
                role: role || "volunteer",
                ministry_scope: [],
                invited_by: inviterUid,
                volunteer_id: volunteerId,
                updated_at: now,
              });
              await queueRef.update({ status: "sent", sent_at: now, volunteer_id: volunteerId });
              sent++;
              continue;
            }
          }

          // Create membership
          await adminDb.doc(`memberships/${existingMemId}`).set({
            user_id: inviteeUid,
            church_id,
            role: role || "volunteer",
            ministry_scope: [],
            status: "pending_volunteer_approval",
            invited_by: inviterUid,
            volunteer_id: volunteerId,
            reminder_preferences: { channels: ["email"] },
            created_at: now,
            updated_at: now,
          });

          acceptUrl = `${baseUrl}/invites/${existingMemId}`;
        } else {
          // Store pre-invite for when they register
          const placeholderDocId = `invite_${Buffer.from(email).toString("base64url")}_${church_id}`;
          await adminDb.doc(`pending_invites/${placeholderDocId}`).set({
            email,
            name: name || "",
            church_id,
            role: role || "volunteer",
            ministry_scope: [],
            invited_by: inviterUid,
            created_at: now,
          });

          acceptUrl = `${baseUrl}/register?redirect=/join/${church_id}&email=${encodeURIComponent(email)}`;
        }

        // Send invite email
        if (process.env.RESEND_API_KEY) {
          const emailContent = buildInviteEmail({
            inviteeName: name || email,
            churchName,
            inviterName,
            role: role || "volunteer",
            acceptUrl,
          });

          await resend.emails.send({
            from: `${churchName} via VolunteerCal <noreply@harpelle.com>`,
            to: email,
            subject: emailContent.subject,
            html: emailContent.html,
            text: emailContent.text,
          });
        }

        await queueRef.update({ status: "sent", sent_at: now, volunteer_id: volunteerId });
        sent++;
      } catch (err) {
        failed++;
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(msg);

        // Mark queue item as failed
        try {
          await adminDb
            .doc(`churches/${church_id}/invite_queue/${queueId}`)
            .update({ status: "failed", error_message: msg });
        } catch {
          // best-effort
        }
      }
    }

    return NextResponse.json({ sent, failed, errors: errors.slice(0, 10) });
  } catch (err) {
    console.error("POST /api/invite/batch error:", err);
    return NextResponse.json({ error: "Batch invite failed" }, { status: 500 });
  }
}
