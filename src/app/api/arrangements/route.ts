import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import type { SongArrangement, ArrangementFormatting, Song } from "@/lib/types";

/**
 * GET /api/arrangements?church_id=xxx&song_id=xxx
 * List arrangements for a song.
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
    const songId = searchParams.get("song_id");

    if (!churchId || !songId) {
      return NextResponse.json({ error: "Missing church_id or song_id" }, { status: 400 });
    }

    // Verify membership
    const membershipId = `${userId}_${churchId}`;
    const membershipSnap = await adminDb.doc(`memberships/${membershipId}`).get();
    if (!membershipSnap.exists) {
      return NextResponse.json({ error: "Not a member" }, { status: 403 });
    }

    const snap = await adminDb
      .collection("churches")
      .doc(churchId)
      .collection("arrangements")
      .where("song_id", "==", songId)
      .orderBy("created_at", "asc")
      .get();

    const arrangements: SongArrangement[] = snap.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as SongArrangement[];

    return NextResponse.json({ arrangements });
  } catch (error) {
    console.error("[GET /api/arrangements]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * POST /api/arrangements
 * Create a new arrangement (blank or cloned from an existing one).
 *
 * Body: { church_id, song_id, name, clone_from?: string }
 */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const token = authHeader.slice(7);
    const decoded = await adminAuth.verifyIdToken(token);
    const userId = decoded.uid;

    const body = await req.json();
    const { church_id, song_id, name, clone_from } = body;

    if (!church_id || !song_id || !name) {
      return NextResponse.json(
        { error: "Missing required fields: church_id, song_id, name" },
        { status: 400 },
      );
    }

    // Verify admin/scheduler role
    const membershipId = `${userId}_${church_id}`;
    const membershipSnap = await adminDb.doc(`memberships/${membershipId}`).get();
    if (!membershipSnap.exists) {
      return NextResponse.json({ error: "Not a member" }, { status: 403 });
    }
    const role = membershipSnap.data()!.role as string;
    if (!["owner", "admin", "scheduler"].includes(role)) {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
    }

    const now = new Date().toISOString();
    const defaultFormatting: ArrangementFormatting = {
      columns: 1,
      font_scale: 1.0,
      heading_bold: true,
      chord_highlight: true,
      fit_pages: null,
    };

    let arrangementData: Omit<SongArrangement, "id">;

    if (clone_from) {
      // Clone from existing arrangement
      const sourceSnap = await adminDb
        .collection("churches")
        .doc(church_id)
        .collection("arrangements")
        .doc(clone_from)
        .get();

      if (!sourceSnap.exists) {
        return NextResponse.json({ error: "Source arrangement not found" }, { status: 404 });
      }

      const source = sourceSnap.data() as Omit<SongArrangement, "id">;
      arrangementData = {
        ...source,
        name,
        is_default: false,
        created_at: now,
        updated_by: userId,
      };
    } else {
      // Create from song's chart data
      const songSnap = await adminDb
        .collection("churches")
        .doc(church_id)
        .collection("songs")
        .doc(song_id)
        .get();

      if (!songSnap.exists) {
        return NextResponse.json({ error: "Song not found" }, { status: 404 });
      }

      const song = songSnap.data() as Omit<Song, "id">;

      arrangementData = {
        song_id,
        church_id,
        name,
        key: song.default_key || "C",
        chart_type: "standard",
        chart_data: song.chart_data || { metadata: { title: song.title, artist: null, writers: null, original_key: null, tempo: null, time_signature: null, ccli_number: null, copyright: null }, sections: [] },
        formatting: defaultFormatting,
        notes: null,
        is_default: false,
        created_at: now,
        updated_by: userId,
      };
    }

    const docRef = await adminDb
      .collection("churches")
      .doc(church_id)
      .collection("arrangements")
      .add(arrangementData);

    const arrangement: SongArrangement = { id: docRef.id, ...arrangementData };
    return NextResponse.json(arrangement, { status: 201 });
  } catch (error) {
    console.error("[POST /api/arrangements]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
