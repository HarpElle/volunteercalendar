/**
 * Swap Request API — Volunteer shift swap engine.
 *
 * POST — Create a swap request (volunteer can't make it)
 * GET  — List eligible replacements for a swap request
 * PATCH — Accept a swap (replacement volunteer) or approve/reject (admin)
 */

import { NextResponse } from "next/server";
import { adminDb, adminAuth } from "@/lib/firebase/admin";
import type { SwapRequest, Person, Assignment } from "@/lib/types";
import { resolveUserId, createUserNotification } from "@/lib/services/user-notifications";
import { audit, userActor } from "@/lib/server/audit";
import { resend } from "@/lib/resend";
import { resolveVolunteerEligibility } from "@/lib/server/notification-eligibility";
import { buildSwapRequestBroadcastEmail } from "@/lib/utils/emails/swap-request-broadcast";
import { getBaseUrl } from "@/lib/utils/base-url";
import { buildSwapTransferUpdate } from "@/lib/server/swap-transfer";
import { isPeerSwapAllowed } from "@/lib/server/peer-swap-policy";
import type { Ministry } from "@/lib/types";

// POST — Create a swap request
// Supports two auth modes:
// 1. Bearer token (from dashboard — authenticated user)
// 2. confirmation_token in body (from public confirm page — volunteer owns the assignment)
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { church_id, assignment_id, confirmation_token, reason } = body;

    if (!church_id || !assignment_id) {
      return NextResponse.json({ error: "Missing church_id or assignment_id" }, { status: 400 });
    }

    // Auth check: either Bearer token or confirmation_token
    const authHeader = request.headers.get("Authorization")?.replace("Bearer ", "");
    if (!authHeader && !confirmation_token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (authHeader) {
      await adminAuth.verifyIdToken(authHeader);
    }

    const churchRef = adminDb.collection("churches").doc(church_id);

    // Fetch the assignment
    const assignSnap = await churchRef.collection("assignments").doc(assignment_id).get();
    if (!assignSnap.exists) {
      return NextResponse.json({ error: "Assignment not found" }, { status: 404 });
    }
    const assignment = assignSnap.data() as Assignment;

    // If using confirmation_token, verify it matches the assignment
    if (confirmation_token && assignment.confirmation_token !== confirmation_token) {
      return NextResponse.json({ error: "Invalid confirmation token" }, { status: 403 });
    }

    // Verify assignment is confirmed (can only swap confirmed assignments)
    if (assignment.status !== "confirmed" && assignment.status !== "draft") {
      return NextResponse.json({ error: "Only confirmed or draft assignments can be swapped" }, { status: 400 });
    }

    // W12-D: per-team peer-swap policy gate. If the admin has
    // disabled peer-swap on this ministry, reject the create.
    // Existing open swaps remain coverable via PATCH ?action=accept
    // so flipping the flag mid-flight doesn't strand a volunteer.
    const ministrySnapForGate = await churchRef
      .collection("ministries")
      .doc(assignment.ministry_id)
      .get();
    const ministryForGate = ministrySnapForGate.exists
      ? ({ id: ministrySnapForGate.id, ...ministrySnapForGate.data() } as Ministry)
      : null;
    if (!isPeerSwapAllowed(ministryForGate)) {
      return NextResponse.json(
        {
          error:
            "Peer-swap is disabled for this team. Contact your scheduler to request time off.",
        },
        { status: 403 },
      );
    }

    // Get volunteer name
    const personId = assignment.person_id as string;
    const volSnap = await churchRef.collection("people").doc(personId).get();
    const requesterName = volSnap.exists ? (volSnap.data()?.name || "Unknown") : "Unknown";

    // Mark assignment as substitute_requested
    await churchRef.collection("assignments").doc(assignment_id).update({
      status: "substitute_requested",
    });

    const now = new Date().toISOString();
    const swapData: Omit<SwapRequest, "id"> = {
      church_id,
      assignment_id,
      schedule_id: assignment.schedule_id,
      service_id: assignment.service_id || "",
      service_date: assignment.service_date,
      role_id: assignment.role_id,
      role_title: assignment.role_title,
      ministry_id: assignment.ministry_id,
      requester_volunteer_id: assignment.volunteer_id,
      requester_name: requesterName,
      replacement_volunteer_id: null,
      replacement_name: null,
      status: "open",
      reason: reason || null,
      reviewed_by: null,
      reviewed_at: null,
      created_at: now,
      updated_at: now,
    };

    const ref = await churchRef.collection("swap_requests").add(swapData);

    // W12-A: broadcast in-app notification + email to ministry
    // teammates (people in the same ministry, excluding the requester).
    // Volunteers don't routinely log in, so EMAIL is the primary
    // discovery channel here — the in-app notification is the
    // secondary surface for people who happen to be on the dashboard.
    // Fire-and-forget — broadcast failure must not block swap creation.
    let teammatesNotified = 0;
    let teammatesEmailed = 0;
    try {
      // Resolve labels needed for the email up front (one read each).
      const [churchSnap, ministrySnap, serviceSnap] = await Promise.all([
        churchRef.get(),
        churchRef.collection("ministries").doc(assignment.ministry_id).get(),
        assignment.service_id
          ? churchRef.collection("services").doc(assignment.service_id).get()
          : Promise.resolve(null),
      ]);
      const churchName =
        (churchSnap.data()?.name as string) || "your church";
      // W11-C: pull the church's logo URL too (already in Storage,
      // public read). Templates render it above the header text when
      // present; null falls through to the existing text-only header.
      const churchLogoUrl =
        (churchSnap.data()?.logo_url as string | null | undefined) ?? null;
      const teamName =
        (ministrySnap.data()?.name as string) || "your team";
      const serviceName =
        (serviceSnap?.data()?.name as string) || "your service";

      // Deep-link recipients straight to the open-swaps section on
      // /dashboard/my-schedule. Sign-in wall preserves the path so
      // they land on the right anchor after auth.
      const ctaUrl = `${getBaseUrl(request)}/dashboard/my-schedule#open-swaps`;

      const teammatesSnap = await churchRef
        .collection("people")
        .where("ministry_ids", "array-contains", assignment.ministry_id)
        .where("person_type", "==", "adult")
        .get();
      const teammates = teammatesSnap.docs
        .map((d) => ({ id: d.id, ...d.data() }) as Person)
        .filter((p) => p.id !== assignment.volunteer_id);

      const dateLabel = assignment.service_date;
      const results = await Promise.all(
        teammates.map(async (t) => {
          const uid = await resolveUserId(church_id, t.id);
          if (!uid) return { notified: false, emailed: false };

          // Look up the auth-side profile for email + display name.
          // Person.email exists on the directory record but the
          // canonical contact email lives on the user profile (parents
          // sometimes share a household email with a teen Person doc).
          const profileSnap = await adminDb.doc(`users/${uid}`).get();
          const profile = profileSnap.exists ? profileSnap.data() : null;
          const recipientEmail = (profile?.email as string) || t.email || "";
          const recipientName =
            (profile?.display_name as string) || t.name || "there";

          // 1. In-app notification (existing behavior).
          let notified = false;
          try {
            await createUserNotification({
              user_id: uid,
              church_id,
              type: "swap_request",
              title: `Sub needed: ${assignment.role_title}`,
              body: `${requesterName} can't make ${dateLabel}. Tap to cover.`,
              metadata: {
                link_href: "/dashboard/my-schedule#open-swaps",
                swap_id: ref.id,
              },
            });
            notified = true;
          } catch {
            // continue — try email regardless
          }

          // 2. Email (new — the primary discovery channel).
          // Phase 2: honor teammate's per-membership opt-out before
          // emailing. In-app notification (above) still fires — that's
          // the always-on inbox they consented to by joining.
          let emailed = false;
          let emailEligible = false;
          if (recipientEmail) {
            const eligibility = await resolveVolunteerEligibility({
              churchId: church_id,
              personId: t.id,
              notificationType: "swap_request_to_teammate",
            });
            emailEligible = eligibility.email;
          }
          if (recipientEmail && emailEligible) {
            try {
              const email = buildSwapRequestBroadcastEmail({
                recipientName,
                requesterName,
                teamName,
                churchName,
                churchLogoUrl,
                serviceName,
                serviceDate: assignment.service_date,
                roleName: assignment.role_title,
                note: reason || null,
                ctaUrl,
              });
              await resend.emails.send({
                from: `${churchName} via VolunteerCal <noreply@harpelle.com>`,
                to: recipientEmail,
                subject: email.subject,
                html: email.html,
                text: email.text,
              });
              emailed = true;
            } catch {
              // continue notifying others
            }
          }

          return { notified, emailed };
        }),
      );
      teammatesNotified = results.filter((r) => r.notified).length;
      teammatesEmailed = results.filter((r) => r.emailed).length;
    } catch (broadcastErr) {
      console.error("Swap broadcast error (non-blocking):", broadcastErr);
    }

    // W12-A: audit emit. Best-effort — never blocks the swap.
    if (authHeader) {
      try {
        const decoded = await adminAuth.verifyIdToken(authHeader);
        void audit({
          church_id,
          actor: userActor(decoded.uid),
          action: "assignment.swap_requested",
          target_type: "swap_request",
          target_id: ref.id,
          metadata: {
            assignment_id,
            ministry_id: assignment.ministry_id,
            teammates_notified: teammatesNotified,
            teammates_emailed: teammatesEmailed,
            reason_provided: !!reason,
          },
          outcome: "ok",
        });
      } catch {
        // Audit failure shouldn't block the swap — already created.
      }
    }

    return NextResponse.json({
      success: true,
      swap_id: ref.id,
      teammates_notified: teammatesNotified,
      teammates_emailed: teammatesEmailed,
    });
  } catch (error) {
    console.error("Swap create error:", error);
    return NextResponse.json({ error: "Failed to create swap request" }, { status: 500 });
  }
}

// GET — Two list modes:
//   1. `swap_id=X` — list eligible replacements for that specific swap
//      (existing admin/scheduler-facing flow; mounted before W12-A).
//   2. `open_for_me=true` (W12-A) — Bearer-auth'd; returns open swaps
//      from any ministry the caller is part of, excluding swaps they
//      created themselves. Powers the "Open swap requests" section on
//      /dashboard/my-schedule for teammates to discover + accept.
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const churchId = searchParams.get("church_id");
    const swapId = searchParams.get("swap_id");
    const openForMe = searchParams.get("open_for_me") === "true";

    if (!churchId) {
      return NextResponse.json({ error: "Missing church_id" }, { status: 400 });
    }
    if (!swapId && !openForMe) {
      return NextResponse.json(
        { error: "Missing swap_id or open_for_me=true" },
        { status: 400 },
      );
    }

    const churchRef = adminDb.collection("churches").doc(churchId);

    // W12-A: open-for-me mode — list swaps the caller could cover.
    if (openForMe) {
      const token = request.headers.get("Authorization")?.replace("Bearer ", "");
      if (!token) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      const decoded = await adminAuth.verifyIdToken(token);

      // Resolve caller's Person doc + ministries.
      const personSnap = await churchRef
        .collection("people")
        .where("user_id", "==", decoded.uid)
        .limit(1)
        .get();
      if (personSnap.empty) {
        return NextResponse.json({ swaps: [] });
      }
      const callerPerson = {
        id: personSnap.docs[0].id,
        ...personSnap.docs[0].data(),
      } as Person;
      const myMinistries = callerPerson.ministry_ids ?? [];
      if (myMinistries.length === 0) {
        return NextResponse.json({ swaps: [] });
      }

      // Pull all open swaps for the church; filter in-memory by
      // ministry overlap + exclude own. Volume is small (open swaps
      // at a single org typically <10 at any time) so in-memory is
      // fine; avoids needing a composite index per ministry.
      const openSnap = await churchRef
        .collection("swap_requests")
        .where("status", "==", "open")
        .get();
      const swaps = openSnap.docs
        .map((d) => ({ id: d.id, ...d.data() }) as SwapRequest)
        .filter((s) => myMinistries.includes(s.ministry_id))
        .filter((s) => s.requester_volunteer_id !== callerPerson.id);
      return NextResponse.json({ swaps });
    }

    // Get the swap request. swapId is guaranteed non-null here:
    // the openForMe branch above returns early when only that flag
    // is set, and the initial guard rejects the case where BOTH
    // swap_id and open_for_me are missing.
    if (!swapId) {
      return NextResponse.json({ error: "Missing swap_id" }, { status: 400 });
    }
    const swapSnap = await churchRef.collection("swap_requests").doc(swapId).get();
    if (!swapSnap.exists) {
      return NextResponse.json({ error: "Swap request not found" }, { status: 404 });
    }
    const swap = swapSnap.data() as SwapRequest;

    // Get all active volunteers (from people collection)
    const volSnap = await churchRef.collection("people")
      .where("is_volunteer", "==", true)
      .where("status", "==", "active")
      .get();

    // Get existing assignments for that date to avoid double-booking
    const assignSnap = await churchRef.collection("assignments")
      .where("service_date", "==", swap.service_date)
      .where("status", "in", ["draft", "confirmed"])
      .get();

    const bookedVolunteerIds = new Set<string>();
    assignSnap.docs.forEach((d) => {
      const ad = d.data();
      if (ad.person_id) bookedVolunteerIds.add(ad.person_id as string);
      if (ad.volunteer_id) bookedVolunteerIds.add(ad.volunteer_id as string);
    });

    // Filter eligible replacements
    const eligible: Array<{ id: string; name: string; email: string }> = [];
    for (const d of volSnap.docs) {
      const v = d.data() as Person;
      const vData = d.data() as Record<string, unknown>;
      // Skip the requester (match by person doc id or old volunteer_id)
      if (d.id === swap.requester_volunteer_id || vData.volunteer_id === swap.requester_volunteer_id) continue;
      // Must be in the right ministry
      if (v.ministry_ids.length > 0 && !v.ministry_ids.includes(swap.ministry_id)) continue;
      // Must be qualified for the role
      if (v.role_ids.length > 0 && !v.role_ids.includes(swap.role_id)) continue;
      // Not already booked on that date
      if (bookedVolunteerIds.has(d.id)) continue;
      // Not blocked out
      const sp = (vData.scheduling_profile as Record<string, unknown>) || {};
      const blockoutDates = (sp.blockout_dates as string[]) || [];
      if (blockoutDates.some((b) => {
        if (b.includes("/")) {
          const [start, end] = b.split("/");
          return swap.service_date >= start && swap.service_date <= end;
        }
        return b === swap.service_date;
      })) continue;

      eligible.push({ id: d.id, name: v.name, email: v.email ?? "" });
    }

    return NextResponse.json({ eligible, swap: { ...swap, id: swapSnap.id } });
  } catch (error) {
    console.error("Swap eligible error:", error);
    return NextResponse.json({ error: "Failed to find eligible replacements" }, { status: 500 });
  }
}

// PATCH — Accept swap (replacement) or approve/reject (admin)
export async function PATCH(request: Request) {
  try {
    const token = request.headers.get("Authorization")?.replace("Bearer ", "");
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const decoded = await adminAuth.verifyIdToken(token);

    const { church_id, swap_id, action, volunteer_id, volunteer_name } = await request.json();
    if (!church_id || !swap_id || !action) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const churchRef = adminDb.collection("churches").doc(church_id);
    const swapRef = churchRef.collection("swap_requests").doc(swap_id);
    const swapSnap = await swapRef.get();
    if (!swapSnap.exists) {
      return NextResponse.json({ error: "Swap request not found" }, { status: 404 });
    }
    const swap = swapSnap.data() as SwapRequest;
    const now = new Date().toISOString();

    if (action === "accept") {
      // A replacement volunteer accepts the swap
      if (swap.status !== "open") {
        return NextResponse.json({ error: "Swap is no longer open" }, { status: 400 });
      }
      if (!volunteer_id || !volunteer_name) {
        return NextResponse.json({ error: "Missing volunteer info" }, { status: 400 });
      }

      // For now, auto-approve (can add admin approval gate later)
      await swapRef.update({
        replacement_volunteer_id: volunteer_id,
        replacement_name: volunteer_name,
        status: "auto_approved",
        updated_at: now,
      });

      // Transfer the assignment to the replacement volunteer.
      // Must update BOTH person_id and volunteer_id — /api/my-schedule
      // queries by person_id (see swap-transfer.ts contract).
      await churchRef
        .collection("assignments")
        .doc(swap.assignment_id)
        .update({ ...buildSwapTransferUpdate(volunteer_id, now) });

      // Fire-and-forget: notify requester and replacement about swap acceptance
      try {
        const requesterUid = await resolveUserId(church_id, swap.requester_volunteer_id);
        if (requesterUid) {
          await createUserNotification({
            user_id: requesterUid,
            church_id,
            type: "swap_resolved",
            title: "Swap approved",
            body: `${volunteer_name} accepted your swap for ${swap.role_title} on ${swap.service_date}.`,
            metadata: { link_href: "/dashboard/my-schedule" },
          });
        }

        const replacementUid = await resolveUserId(church_id, volunteer_id);
        if (replacementUid) {
          await createUserNotification({
            user_id: replacementUid,
            church_id,
            type: "swap_resolved",
            title: "Swap approved",
            body: `You've been assigned ${swap.role_title} on ${swap.service_date}.`,
            metadata: { link_href: "/dashboard/my-schedule" },
          });
        }
      } catch (notifErr) {
        console.error("User notification error (swap accept):", notifErr);
      }

      // W12-A: audit emit
      void audit({
        church_id,
        actor: userActor(decoded.uid),
        action: "assignment.swap_accepted",
        target_type: "swap_request",
        target_id: swap_id,
        metadata: {
          assignment_id: swap.assignment_id,
          ministry_id: swap.ministry_id,
          requester_volunteer_id: swap.requester_volunteer_id,
          replacement_volunteer_id: volunteer_id,
        },
        outcome: "ok",
      });

      return NextResponse.json({ success: true, status: "auto_approved" });
    }

    if (action === "approve" || action === "reject") {
      // Admin approves or rejects a pending swap
      if (swap.status !== "pending_admin") {
        return NextResponse.json({ error: "Swap is not pending admin review" }, { status: 400 });
      }

      if (action === "approve") {
        await swapRef.update({
          status: "approved",
          reviewed_by: decoded.uid,
          reviewed_at: now,
          updated_at: now,
        });

        // Transfer the assignment. Same person_id/volunteer_id
        // lockstep contract as the accept branch — see
        // swap-transfer.ts for the rationale.
        if (swap.replacement_volunteer_id) {
          await churchRef
            .collection("assignments")
            .doc(swap.assignment_id)
            .update({
              ...buildSwapTransferUpdate(swap.replacement_volunteer_id, now),
            });
        }
      } else {
        // Reject — revert assignment to confirmed
        await swapRef.update({
          status: "cancelled",
          reviewed_by: decoded.uid,
          reviewed_at: now,
          updated_at: now,
        });
        await churchRef.collection("assignments").doc(swap.assignment_id).update({
          status: "confirmed",
        });
      }

      // Fire-and-forget: notify requester (and replacement if approved) about admin decision
      try {
        const reqUid = await resolveUserId(church_id, swap.requester_volunteer_id);
        if (reqUid) {
          const isApproved = action === "approve";
          await createUserNotification({
            user_id: reqUid,
            church_id,
            type: "swap_resolved",
            title: isApproved ? "Swap approved" : "Swap rejected",
            body: isApproved
              ? `Your swap for ${swap.role_title} on ${swap.service_date} was approved.`
              : `Your swap for ${swap.role_title} on ${swap.service_date} was rejected.`,
            metadata: { link_href: "/dashboard/my-schedule" },
          });
        }

        if (action === "approve" && swap.replacement_volunteer_id) {
          const repUid = await resolveUserId(church_id, swap.replacement_volunteer_id);
          if (repUid) {
            await createUserNotification({
              user_id: repUid,
              church_id,
              type: "swap_resolved",
              title: "Swap approved",
              body: `You've been assigned ${swap.role_title} on ${swap.service_date}.`,
              metadata: { link_href: "/dashboard/my-schedule" },
            });
          }
        }
      } catch (notifErr) {
        console.error("User notification error (swap admin decision):", notifErr);
      }

      return NextResponse.json({ success: true, status: action === "approve" ? "approved" : "cancelled" });
    }

    if (action === "cancel") {
      // Requester cancels the swap
      if (swap.status !== "open") {
        return NextResponse.json({ error: "Can only cancel open swap requests" }, { status: 400 });
      }
      await swapRef.update({ status: "cancelled", updated_at: now });
      // Revert assignment status
      await churchRef.collection("assignments").doc(swap.assignment_id).update({
        status: "confirmed",
      });

      return NextResponse.json({ success: true, status: "cancelled" });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    console.error("Swap action error:", error);
    return NextResponse.json({ error: "Failed to process swap" }, { status: 500 });
  }
}
