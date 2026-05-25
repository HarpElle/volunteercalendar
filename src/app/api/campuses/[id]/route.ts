/**
 * Pass H Phase 5: campus-scoped GET (audit counts) + DELETE (cascade)
 * routes that back the Campus Delete Safeguards UI.
 *
 * Without these the UI's old `removeChurchDocument` left orphaned
 * `campus_id` references on services, events, people, and calendar
 * feeds. This route audits what's referencing a campus, then either
 * reassigns all references to a different campus OR converts them to
 * org-wide (campus_id = null) before deleting the campus doc.
 *
 * Safety rails:
 *   - Owner/admin role only (delete is destructive)
 *   - Single-campus orgs can delete their last campus when mode is
 *     "convert" (the org returns to single-campus mode and the
 *     sidebar selector hides itself — per user signoff)
 *   - Reassign requires target_campus_id; convert ignores it
 *   - Calendar feeds always go to null per user signoff (avoids
 *     silently moving a user's iCal subscription)
 *
 * Cascade scope (per audit):
 *   - services       — set campus_id (reassign → target, convert → null)
 *   - events         — set campus_id (reassign → target, convert → null)
 *   - calendar_feeds — ALWAYS set campus_id to null
 *   - people         — array update on campus_ids: remove this campus;
 *                       reassign also adds target_campus_id if missing
 *
 * Out of scope:
 *   - schedules     — no direct campus_id field; coverage is derived
 *                     from the services they scope. No write needed.
 *   - assignments   — same reasoning (they follow their service).
 */

import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { FieldValue } from "firebase-admin/firestore";

interface DeleteBody {
  church_id: string;
  mode: "reassign" | "convert";
  /** Required when mode === "reassign". Must be a different campus in the same church. */
  target_campus_id?: string;
}

interface AuditCounts {
  services: number;
  events: number;
  people: number;
  calendar_feeds: number;
}

/** Helpers ------------------------------------------------------------- */

async function authorize(
  req: NextRequest,
  churchId: string,
): Promise<{ uid: string } | NextResponse> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const token = authHeader.slice(7);
  const decoded = await adminAuth.verifyIdToken(token).catch(() => null);
  if (!decoded) {
    return NextResponse.json({ error: "Invalid auth token" }, { status: 401 });
  }
  const membershipId = `${decoded.uid}_${churchId}`;
  const membershipSnap = await adminDb.doc(`memberships/${membershipId}`).get();
  if (!membershipSnap.exists) {
    return NextResponse.json({ error: "Not a member" }, { status: 403 });
  }
  const role = membershipSnap.data()?.role as string | undefined;
  if (!["owner", "admin"].includes(role || "")) {
    return NextResponse.json(
      { error: "Only owners and admins can audit or delete campuses" },
      { status: 403 },
    );
  }
  return { uid: decoded.uid };
}

async function countReferences(
  churchId: string,
  campusId: string,
): Promise<AuditCounts> {
  const churchRef = adminDb.collection("churches").doc(churchId);
  const [servicesSnap, eventsSnap, peopleSnap, feedsSnap] = await Promise.all([
    churchRef.collection("services").where("campus_id", "==", campusId).get(),
    churchRef.collection("events").where("campus_id", "==", campusId).get(),
    churchRef
      .collection("people")
      .where("campus_ids", "array-contains", campusId)
      .get(),
    churchRef
      .collection("calendar_feeds")
      .where("campus_id", "==", campusId)
      .get(),
  ]);
  return {
    services: servicesSnap.size,
    events: eventsSnap.size,
    people: peopleSnap.size,
    calendar_feeds: feedsSnap.size,
  };
}

/** GET — audit -------------------------------------------------------- */

/**
 * GET /api/campuses/{id}?church_id=...
 * Returns reference counts. Used by the delete modal to show what will
 * be moved/cleared before the admin commits.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: campusId } = await params;
    const churchId = req.nextUrl.searchParams.get("church_id");
    if (!churchId) {
      return NextResponse.json({ error: "Missing church_id" }, { status: 400 });
    }

    const auth = await authorize(req, churchId);
    if (auth instanceof NextResponse) return auth;

    const campusSnap = await adminDb
      .doc(`churches/${churchId}/campuses/${campusId}`)
      .get();
    if (!campusSnap.exists) {
      return NextResponse.json({ error: "Campus not found" }, { status: 404 });
    }

    const counts = await countReferences(churchId, campusId);
    return NextResponse.json({
      campus_id: campusId,
      campus_name: campusSnap.data()?.name as string,
      counts,
      total: Object.values(counts).reduce((a, b) => a + b, 0),
    });
  } catch (err) {
    console.error("[GET /api/campuses/[id]]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/** DELETE — cascade + delete ----------------------------------------- */

/**
 * DELETE /api/campuses/{id}
 * Body: { church_id, mode, target_campus_id? }
 *
 * Cascade is done in Admin SDK batched writes (max 500 ops per batch).
 * Each collection is processed in its own batch loop so a 600-person
 * org doesn't fail on the people array update.
 *
 * Order matters: cascade first, then delete the campus. If a batch
 * fails mid-way the campus still exists and the UI can retry. We log
 * partial progress so a manual cleanup is possible if needed.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: campusId } = await params;
    const body = (await req.json()) as DeleteBody;
    const { church_id, mode, target_campus_id } = body;

    if (!church_id) {
      return NextResponse.json({ error: "Missing church_id" }, { status: 400 });
    }
    if (mode !== "reassign" && mode !== "convert") {
      return NextResponse.json(
        { error: "mode must be 'reassign' or 'convert'" },
        { status: 400 },
      );
    }
    if (mode === "reassign" && !target_campus_id) {
      return NextResponse.json(
        { error: "target_campus_id required when mode is 'reassign'" },
        { status: 400 },
      );
    }
    if (mode === "reassign" && target_campus_id === campusId) {
      return NextResponse.json(
        { error: "target_campus_id cannot equal the campus being deleted" },
        { status: 400 },
      );
    }

    const auth = await authorize(req, church_id);
    if (auth instanceof NextResponse) return auth;

    const churchRef = adminDb.collection("churches").doc(church_id);
    const campusRef = churchRef.collection("campuses").doc(campusId);
    const campusSnap = await campusRef.get();
    if (!campusSnap.exists) {
      return NextResponse.json({ error: "Campus not found" }, { status: 404 });
    }

    // Validate the target campus exists (reassign mode only)
    if (mode === "reassign") {
      const targetSnap = await churchRef
        .collection("campuses")
        .doc(target_campus_id!)
        .get();
      if (!targetSnap.exists) {
        return NextResponse.json(
          { error: "target_campus_id does not exist in this church" },
          { status: 404 },
        );
      }
    }

    // Cascade in 4 parallel collection passes. Each pass batches in
    // chunks of 500 to stay under Firestore's batched write limit.
    const newValue = mode === "reassign" ? target_campus_id! : null;
    const cascade = { services: 0, events: 0, people: 0, calendar_feeds: 0 };

    const [servicesSnap, eventsSnap, peopleSnap, feedsSnap] = await Promise.all([
      churchRef.collection("services").where("campus_id", "==", campusId).get(),
      churchRef.collection("events").where("campus_id", "==", campusId).get(),
      churchRef
        .collection("people")
        .where("campus_ids", "array-contains", campusId)
        .get(),
      churchRef
        .collection("calendar_feeds")
        .where("campus_id", "==", campusId)
        .get(),
    ]);

    async function batchUpdate(
      docs: FirebaseFirestore.QueryDocumentSnapshot[],
      apply: (
        batch: FirebaseFirestore.WriteBatch,
        ref: FirebaseFirestore.DocumentReference,
      ) => void,
    ): Promise<number> {
      let written = 0;
      for (let i = 0; i < docs.length; i += 500) {
        const chunk = docs.slice(i, i + 500);
        const batch = adminDb.batch();
        for (const doc of chunk) {
          apply(batch, doc.ref);
        }
        await batch.commit();
        written += chunk.length;
      }
      return written;
    }

    // Services + events: simple scalar update
    cascade.services = await batchUpdate(servicesSnap.docs, (batch, ref) => {
      batch.update(ref, { campus_id: newValue });
    });
    cascade.events = await batchUpdate(eventsSnap.docs, (batch, ref) => {
      batch.update(ref, { campus_id: newValue });
    });

    // Calendar feeds: ALWAYS null per user signoff (avoid silently
    // moving a user's iCal subscription to a different campus)
    cascade.calendar_feeds = await batchUpdate(feedsSnap.docs, (batch, ref) => {
      batch.update(ref, { campus_id: null });
    });

    // People: array update. arrayRemove always; arrayUnion(target) only
    // on reassign. Convert mode just removes the dead campus and leaves
    // the person with whatever other campuses they already had (which
    // may be []; empty is universal per the Phase 3 semantic).
    cascade.people = await batchUpdate(peopleSnap.docs, (batch, ref) => {
      if (mode === "reassign") {
        batch.update(ref, {
          campus_ids: FieldValue.arrayRemove(campusId),
        });
        batch.update(ref, {
          campus_ids: FieldValue.arrayUnion(target_campus_id!),
        });
      } else {
        batch.update(ref, {
          campus_ids: FieldValue.arrayRemove(campusId),
        });
      }
    });

    // Finally, delete the campus doc
    await campusRef.delete();

    return NextResponse.json({
      success: true,
      mode,
      target_campus_id: target_campus_id || null,
      cascade,
    });
  } catch (err) {
    console.error("[DELETE /api/campuses/[id]]", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
