import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { sendSms } from "@/lib/services/sms";
import { getBaseUrl } from "@/lib/utils/base-url";

/**
 * POST /api/admin/checkin/households/[householdId]/send-qr
 * Sends the household's QR check-in link via SMS to the primary guardian.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ householdId: string }> },
) {
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const decoded = await adminAuth.verifyIdToken(authHeader.slice(7));
    const userId = decoded.uid;

    const { householdId } = await params;
    const body = await req.json();
    const { church_id } = body as { church_id: string };

    if (!church_id || !householdId) {
      return NextResponse.json(
        { error: "Missing church_id or householdId" },
        { status: 400 },
      );
    }

    // Verify membership
    const membershipSnap = await adminDb
      .doc(`memberships/${userId}_${church_id}`)
      .get();
    if (!membershipSnap.exists) {
      return NextResponse.json({ error: "Not a member" }, { status: 403 });
    }

    const churchRef = adminDb.collection("churches").doc(church_id);

    // Load church name
    const churchSnap = await churchRef.get();
    const churchName = churchSnap.exists
      ? (churchSnap.data()!.name as string)
      : "Your church";

    // Load household
    const householdSnap = await churchRef
      .collection("checkin_households")
      .doc(householdId)
      .get();
    if (!householdSnap.exists) {
      return NextResponse.json(
        { error: "Household not found" },
        { status: 404 },
      );
    }

    const household = householdSnap.data()!;
    const phone = household.primary_guardian_phone as string | undefined;
    if (!phone) {
      return NextResponse.json(
        { error: "No phone number on file" },
        { status: 400 },
      );
    }

    const origin = getBaseUrl(req);
    const kioskUrl = `${origin}/checkin?church_id=${church_id}&token=${household.qr_token}`;

    await sendSms({
      to: phone,
      body: `${churchName} Children's Check-In: Open this link on your phone to check in your children quickly. ${kioskUrl}`,
    });

    return NextResponse.json({ sent: true });
  } catch (error) {
    console.error("[POST /api/admin/checkin/households/send-qr]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
