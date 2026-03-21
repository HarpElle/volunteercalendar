import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { songselectAdapter } from "@/lib/integrations/songselect";

/**
 * GET /api/songselect/search?church_id=xxx&q=amazing+grace&limit=25
 * Search the SongSelect catalog using the church's stored credentials.
 */
export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const token = authHeader.slice(7);
    const decoded = await adminAuth.verifyIdToken(token);
    const userId = decoded.uid;

    const { searchParams } = req.nextUrl;
    const churchId = searchParams.get("church_id");
    const query = searchParams.get("q");

    if (!churchId || !query) {
      return NextResponse.json(
        { error: "Missing required params: church_id, q" },
        { status: 400 },
      );
    }

    // Verify membership (admin/scheduler)
    const membershipId = `${userId}_${churchId}`;
    const membershipSnap = await adminDb.doc(`memberships/${membershipId}`).get();
    if (!membershipSnap.exists) {
      return NextResponse.json({ error: "Not a member" }, { status: 403 });
    }
    const role = membershipSnap.data()!.role as string;
    if (!["owner", "admin", "scheduler"].includes(role)) {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
    }

    // Get stored credentials
    const churchSnap = await adminDb.doc(`churches/${churchId}`).get();
    const churchData = churchSnap.data();
    const creds = churchData?.songselect_credentials;

    if (!creds?.email || !creds?.encrypted_password) {
      return NextResponse.json(
        { error: "SongSelect is not connected. Connect it in Organization Settings." },
        { status: 422 },
      );
    }

    const password = Buffer.from(creds.encrypted_password, "base64").toString("utf-8");
    const limit = Number(searchParams.get("limit") || "25");

    const results = await songselectAdapter.searchSongs(
      creds.email,
      password,
      query,
      limit,
    );

    // Mark songs already in the library
    const existingSongs = await adminDb
      .collection("churches")
      .doc(churchId)
      .collection("songs")
      .where("songselect_id", "!=", null)
      .get();

    const importedIds = new Set(
      existingSongs.docs.map((d) => d.data().songselect_id as string),
    );

    const enriched = results.map((r) => ({
      ...r,
      already_imported: importedIds.has(r.songselect_id),
    }));

    return NextResponse.json({ results: enriched, total: enriched.length });
  } catch (error) {
    console.error("[GET /api/songselect/search]", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
