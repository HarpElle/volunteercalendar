/**
 * Self-Check-In API (Time-Based / Proximity-Based)
 *
 * POST — Volunteer checks in without a QR code, validated by time window.
 *
 * Body: { church_id, assignment_id, method: "self" | "proximity" }
 * Auth: Bearer token (Firebase ID token from the volunteer)
 */

import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import type { ChurchSettings } from "@/lib/types";

const DEFAULT_WINDOW_BEFORE = 60; // minutes
const DEFAULT_WINDOW_AFTER = 30;

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const decoded = await adminAuth.verifyIdToken(authHeader.slice(7));
    const userId = decoded.uid;

    const { church_id, assignment_id, method } = await req.json();
    if (!church_id || !assignment_id) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const validMethods = ["self", "proximity"];
    const checkInMethod = validMethods.includes(method) ? method : "self";

    // Load church doc for settings and timezone
    const churchSnap = await adminDb.collection("churches").doc(church_id).get();
    if (!churchSnap.exists) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }
    const churchData = churchSnap.data()!;
    const settings = (churchData.settings || {}) as ChurchSettings;
    const timezone = churchData.timezone || "America/New_York";

    // Check if self-check-in is enabled (default true)
    if (settings.self_check_in_enabled === false) {
      return NextResponse.json({ error: "Self-check-in is not enabled for this organization" }, { status: 403 });
    }

    // If proximity method, also check proximity setting
    if (checkInMethod === "proximity" && settings.proximity_check_in_enabled === false) {
      return NextResponse.json({ error: "Proximity check-in is not enabled" }, { status: 403 });
    }

    // Find volunteer record
    const volQuery = await adminDb
      .collection("churches")
      .doc(church_id)
      .collection("volunteers")
      .where("user_id", "==", userId)
      .where("status", "==", "active")
      .limit(1)
      .get();

    if (volQuery.empty) {
      return NextResponse.json({ error: "No active volunteer record found" }, { status: 404 });
    }
    const volunteerId = volQuery.docs[0].id;
    const volunteerName = volQuery.docs[0].data().name;

    // Load assignment
    const assignSnap = await adminDb
      .collection("churches")
      .doc(church_id)
      .collection("assignments")
      .doc(assignment_id)
      .get();

    if (!assignSnap.exists) {
      return NextResponse.json({ error: "Assignment not found" }, { status: 404 });
    }
    const assignment = assignSnap.data()!;

    // Verify assignment belongs to this volunteer
    if (assignment.volunteer_id !== volunteerId) {
      return NextResponse.json({ error: "Assignment does not belong to this volunteer" }, { status: 403 });
    }

    // Check if already attended
    if (assignment.attended === true || assignment.attended === "present") {
      return NextResponse.json({ error: "Already checked in" }, { status: 409 });
    }

    // Load service to get start_time
    if (!assignment.service_id) {
      return NextResponse.json({ error: "Event-only assignments cannot use self-check-in" }, { status: 400 });
    }

    const serviceSnap = await adminDb
      .collection("churches")
      .doc(church_id)
      .collection("services")
      .doc(assignment.service_id)
      .get();

    if (!serviceSnap.exists) {
      return NextResponse.json({ error: "Service not found" }, { status: 404 });
    }
    const service = serviceSnap.data()!;

    // Validate time window
    const windowBefore = settings.check_in_window_before ?? DEFAULT_WINDOW_BEFORE;
    const windowAfter = settings.check_in_window_after ?? DEFAULT_WINDOW_AFTER;

    const serviceDateTime = new Date(
      new Date(`${assignment.service_date}T${service.start_time || "09:00"}`).toLocaleString("en-US", { timeZone: timezone })
    );
    // Use a more reliable timezone approach
    const now = new Date();
    const nowInTz = new Date(now.toLocaleString("en-US", { timeZone: timezone }));
    const serviceInTz = new Date(
      new Date(`${assignment.service_date}T${service.start_time || "09:00"}`).toLocaleString("en-US", { timeZone: timezone })
    );

    const diffMinutes = (nowInTz.getTime() - serviceInTz.getTime()) / 60000;

    if (diffMinutes < -windowBefore) {
      return NextResponse.json(
        { error: `Check-in window opens ${windowBefore} minutes before service` },
        { status: 403 },
      );
    }
    if (diffMinutes > windowAfter) {
      return NextResponse.json(
        { error: "Check-in window has closed" },
        { status: 403 },
      );
    }

    // Mark attendance
    const checkedInAt = new Date().toISOString();
    await assignSnap.ref.update({
      attended: "present",
      attended_at: checkedInAt,
      check_in_method: checkInMethod,
    });

    return NextResponse.json({
      success: true,
      volunteer_name: volunteerName,
      service_date: assignment.service_date,
      checked_in_at: checkedInAt,
    });
  } catch (error) {
    console.error("Self-check-in error:", error);
    return NextResponse.json({ error: "Check-in failed" }, { status: 500 });
  }
}
