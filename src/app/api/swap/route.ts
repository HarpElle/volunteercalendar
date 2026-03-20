/**
 * Swap Request API — Volunteer shift swap engine.
 *
 * POST — Create a swap request (volunteer can't make it)
 * GET  — List eligible replacements for a swap request
 * PATCH — Accept a swap (replacement volunteer) or approve/reject (admin)
 */

import { NextResponse } from "next/server";
import { adminDb, adminAuth } from "@/lib/firebase/admin";
import type { SwapRequest, Volunteer, Assignment } from "@/lib/types";

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

    // Get volunteer name
    const volSnap = await churchRef.collection("volunteers").doc(assignment.volunteer_id).get();
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

    return NextResponse.json({ success: true, swap_id: ref.id });
  } catch (error) {
    console.error("Swap create error:", error);
    return NextResponse.json({ error: "Failed to create swap request" }, { status: 500 });
  }
}

// GET — List eligible replacements for a swap request
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const churchId = searchParams.get("church_id");
    const swapId = searchParams.get("swap_id");

    if (!churchId || !swapId) {
      return NextResponse.json({ error: "Missing church_id or swap_id" }, { status: 400 });
    }

    const churchRef = adminDb.collection("churches").doc(churchId);

    // Get the swap request
    const swapSnap = await churchRef.collection("swap_requests").doc(swapId).get();
    if (!swapSnap.exists) {
      return NextResponse.json({ error: "Swap request not found" }, { status: 404 });
    }
    const swap = swapSnap.data() as SwapRequest;

    // Get all active volunteers in the same ministry
    const volSnap = await churchRef.collection("volunteers")
      .where("status", "==", "active")
      .get();

    // Get existing assignments for that date to avoid double-booking
    const assignSnap = await churchRef.collection("assignments")
      .where("service_date", "==", swap.service_date)
      .where("status", "in", ["draft", "confirmed"])
      .get();

    const bookedVolunteerIds = new Set(
      assignSnap.docs.map((d) => d.data().volunteer_id),
    );

    // Filter eligible replacements
    const eligible: Array<{ id: string; name: string; email: string }> = [];
    for (const d of volSnap.docs) {
      const v = d.data() as Volunteer;
      // Skip the requester
      if (d.id === swap.requester_volunteer_id) continue;
      // Must be in the right ministry
      if (v.ministry_ids.length > 0 && !v.ministry_ids.includes(swap.ministry_id)) continue;
      // Must be qualified for the role
      if (v.role_ids.length > 0 && !v.role_ids.includes(swap.role_id)) continue;
      // Not already booked on that date
      if (bookedVolunteerIds.has(d.id)) continue;
      // Not blocked out
      if (v.availability.blockout_dates.some((b) => {
        if (b.includes("/")) {
          const [start, end] = b.split("/");
          return swap.service_date >= start && swap.service_date <= end;
        }
        return b === swap.service_date;
      })) continue;

      eligible.push({ id: d.id, name: v.name, email: v.email });
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

      // Transfer the assignment to the replacement volunteer
      await churchRef.collection("assignments").doc(swap.assignment_id).update({
        volunteer_id: volunteer_id,
        status: "confirmed",
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

        // Transfer the assignment
        if (swap.replacement_volunteer_id) {
          await churchRef.collection("assignments").doc(swap.assignment_id).update({
            volunteer_id: swap.replacement_volunteer_id,
            status: "confirmed",
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
