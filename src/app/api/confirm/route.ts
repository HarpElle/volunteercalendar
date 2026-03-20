import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { rateLimit } from "@/lib/utils/rate-limit";

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

    return NextResponse.json({ success: true, status: newStatus });
  } catch (error) {
    console.error("Confirm action error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
