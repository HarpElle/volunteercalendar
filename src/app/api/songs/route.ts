import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import type { Song } from "@/lib/types";

/**
 * POST /api/songs
 * Create a new song in the church's song library.
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
    const { church_id, title } = body;

    if (!church_id || !title) {
      return NextResponse.json(
        { error: "Missing required fields: church_id, title" },
        { status: 400 },
      );
    }

    // Verify membership (admin/scheduler)
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

    const songData: Omit<Song, "id"> = {
      church_id,
      title,
      ccli_number: body.ccli_number ?? null,
      ccli_publisher: body.ccli_publisher ?? null,
      default_key: body.default_key ?? null,
      available_keys: body.available_keys ?? [],
      artist_credit: body.artist_credit ?? null,
      writer_credit: body.writer_credit ?? null,
      copyright: body.copyright ?? null,
      tags: body.tags ?? [],
      in_rotation: body.in_rotation ?? false,
      rotation_lists: body.rotation_lists ?? [],
      lyric_source: body.lyric_source ?? null,
      lyrics: body.lyrics ?? null,
      chord_chart_url: body.chord_chart_url ?? null,
      sheet_music_url: body.sheet_music_url ?? null,
      media_file_url: body.media_file_url ?? null,
      songselect_id: body.songselect_id ?? null,
      date_added: now,
      last_used_date: null,
      use_count: 0,
      status: "active",
      tempo: body.tempo ?? null,
      time_signature: body.time_signature ?? null,
      chart_data: body.chart_data ?? null,
      original_file_url: body.original_file_url ?? null,
      original_file_type: body.original_file_type ?? null,
      notes: body.notes ?? null,
      created_at: now,
      updated_by: userId,
    };

    const docRef = await adminDb
      .collection("churches")
      .doc(church_id)
      .collection("songs")
      .add(songData);

    const created: Song = { id: docRef.id, ...songData };

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    console.error("[POST /api/songs]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * GET /api/songs?church_id=xxx&status=active&in_rotation=true&tag=hymn&search=amazing
 * List songs with optional filters.
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
    if (!churchId) {
      return NextResponse.json({ error: "Missing church_id" }, { status: 400 });
    }

    // Verify membership (any active role)
    const membershipId = `${userId}_${churchId}`;
    const membershipSnap = await adminDb.doc(`memberships/${membershipId}`).get();
    if (!membershipSnap.exists) {
      return NextResponse.json({ error: "Not a member" }, { status: 403 });
    }

    const status = searchParams.get("status");
    const inRotation = searchParams.get("in_rotation");
    const tag = searchParams.get("tag");
    const search = searchParams.get("search");

    // Build Firestore query
    let query: FirebaseFirestore.Query = adminDb
      .collection("churches")
      .doc(churchId)
      .collection("songs")
      .orderBy("title", "asc");

    if (status) {
      query = query.where("status", "==", status);
    }

    if (inRotation === "true") {
      query = query.where("in_rotation", "==", true);
    }

    if (tag) {
      query = query.where("tags", "array-contains", tag);
    }

    const snap = await query.get();
    let songs: Song[] = snap.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as Song[];

    // Client-side search filter (Firestore has no full-text search)
    if (search) {
      const term = search.toLowerCase();
      songs = songs.filter((s) => s.title.toLowerCase().includes(term));
    }

    return NextResponse.json({ songs, total: songs.length });
  } catch (error) {
    console.error("[GET /api/songs]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
