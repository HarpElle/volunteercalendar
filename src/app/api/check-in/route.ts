/**
 * QR Code Self-Check-In API
 *
 * POST — Volunteer scans QR code → checks in (marks attendance).
 * GET  — Generate a new check-in code for a service date.
 *
 * Check-in codes are stored in: churches/{churchId}/check_in_codes/{code}
 * Format: { church_id, service_id, service_date, schedule_id, created_at, expires_at }
 */

import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";

// ---------------------------------------------------------------------------
// POST — Self-check-in (public, requires volunteer auth)
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const decoded = await adminAuth.verifyIdToken(authHeader.slice(7));
    const userId = decoded.uid;

    const { code } = await req.json();
    if (!code) {
      return NextResponse.json({ error: "Missing check-in code" }, { status: 400 });
    }

    // Look up the check-in code across all churches
    const codeQuery = await adminDb
      .collectionGroup("check_in_codes")
      .where("code", "==", code)
      .limit(1)
      .get();

    if (codeQuery.empty) {
      return NextResponse.json({ error: "Invalid or expired check-in code" }, { status: 404 });
    }

    const codeDoc = codeQuery.docs[0];
    const codeData = codeDoc.data();
    const { church_id, service_id, service_date, schedule_id } = codeData;

    // Check expiry
    if (codeData.expires_at && new Date(codeData.expires_at) < new Date()) {
      return NextResponse.json({ error: "This check-in code has expired" }, { status: 410 });
    }

    // Find the volunteer record for this user
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

    // Find an assignment for this volunteer on this service date
    const assignQuery = await adminDb
      .collection("churches")
      .doc(church_id)
      .collection("assignments")
      .where("volunteer_id", "==", volunteerId)
      .where("service_id", "==", service_id)
      .where("service_date", "==", service_date)
      .limit(1)
      .get();

    if (assignQuery.empty) {
      return NextResponse.json(
        { error: "No assignment found for this service date" },
        { status: 404 },
      );
    }

    const assignDoc = assignQuery.docs[0];
    const now = new Date().toISOString();

    // Mark attendance
    await assignDoc.ref.update({
      attended: "present",
      attended_at: now,
      check_in_method: "qr",
    });

    return NextResponse.json({
      success: true,
      volunteer_name: volQuery.docs[0].data().name,
      service_date,
      checked_in_at: now,
    });
  } catch (error) {
    console.error("Check-in error:", error);
    return NextResponse.json({ error: "Check-in failed" }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// GET — Generate check-in code (admin only)
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    await adminAuth.verifyIdToken(authHeader.slice(7));

    const { searchParams } = new URL(req.url);
    const churchId = searchParams.get("church_id");
    const serviceId = searchParams.get("service_id");
    const serviceDate = searchParams.get("service_date");
    const scheduleId = searchParams.get("schedule_id");

    if (!churchId || !serviceId || !serviceDate) {
      return NextResponse.json({ error: "Missing required params" }, { status: 400 });
    }

    // Check if a code already exists for this service date
    const existingQuery = await adminDb
      .collection("churches")
      .doc(churchId)
      .collection("check_in_codes")
      .where("service_id", "==", serviceId)
      .where("service_date", "==", serviceDate)
      .limit(1)
      .get();

    if (!existingQuery.empty) {
      const existing = existingQuery.docs[0].data();
      return NextResponse.json({ code: existing.code, exists: true });
    }

    // Generate a short, scannable code (8 chars)
    const code = crypto.randomUUID().replace(/-/g, "").substring(0, 8).toUpperCase();

    // Expires at end of service date + 1 day buffer
    const expiresAt = new Date(serviceDate + "T23:59:59");
    expiresAt.setDate(expiresAt.getDate() + 1);

    await adminDb
      .collection("churches")
      .doc(churchId)
      .collection("check_in_codes")
      .add({
        code,
        church_id: churchId,
        service_id: serviceId,
        service_date: serviceDate,
        schedule_id: scheduleId || null,
        created_at: new Date().toISOString(),
        expires_at: expiresAt.toISOString(),
      });

    return NextResponse.json({ code, exists: false });
  } catch (error) {
    console.error("Generate check-in code error:", error);
    return NextResponse.json({ error: "Failed to generate code" }, { status: 500 });
  }
}
