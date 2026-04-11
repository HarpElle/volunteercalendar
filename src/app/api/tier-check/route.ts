import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { checkMinistryLimit, checkVolunteerLimit } from "@/lib/utils/tier-enforcement";

async function verifyAuth(req: NextRequest) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  const decoded = await adminAuth.verifyIdToken(authHeader.slice(7));
  return decoded.uid;
}

/**
 * POST /api/tier-check
 * Body: { church_id, resource: "ministries" | "volunteers" }
 * Returns: { allowed, currentCount, limit, tier }
 */
export async function POST(req: NextRequest) {
  try {
    const userId = await verifyAuth(req);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { church_id, resource } = body as {
      church_id?: string;
      resource?: string;
    };

    if (!church_id || !resource) {
      return NextResponse.json(
        { error: "Missing church_id or resource" },
        { status: 400 },
      );
    }

    if (resource !== "ministries" && resource !== "volunteers") {
      return NextResponse.json(
        { error: "Invalid resource. Must be 'ministries' or 'volunteers'" },
        { status: 400 },
      );
    }

    // Verify membership
    const memberSnap = await adminDb
      .doc(`memberships/${userId}_${church_id}`)
      .get();
    if (!memberSnap.exists) {
      return NextResponse.json({ error: "Not a member" }, { status: 403 });
    }

    // Get church tier
    const churchSnap = await adminDb.doc(`churches/${church_id}`).get();
    if (!churchSnap.exists) {
      return NextResponse.json({ error: "Church not found" }, { status: 404 });
    }
    const tier = (churchSnap.data()!.subscription_tier || "free") as string;

    // Count current documents (volunteers live in `people` collection with is_volunteer flag)
    const countSnap = resource === "volunteers"
      ? await adminDb.collection(`churches/${church_id}/people`).where("is_volunteer", "==", true).count().get()
      : await adminDb.collection(`churches/${church_id}/${resource}`).count().get();
    const currentCount = countSnap.data().count;

    const result =
      resource === "ministries"
        ? checkMinistryLimit(tier, currentCount)
        : checkVolunteerLimit(tier, currentCount);

    return NextResponse.json(result);
  } catch (error) {
    console.error("[POST /api/tier-check]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
