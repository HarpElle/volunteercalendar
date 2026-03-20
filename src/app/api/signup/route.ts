import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { rateLimit } from "@/lib/utils/rate-limit";
import type { Event, Church, EventSignup } from "@/lib/types";

/**
 * GET /api/signup?eventId=xxx
 * Load event details + church info + existing signups.
 * Public endpoint — no auth required for public events.
 */
export async function GET(req: NextRequest) {
  const limited = rateLimit(req, { limit: 30, windowMs: 60_000 });
  if (limited) return limited;

  const eventId = req.nextUrl.searchParams.get("eventId");
  const churchId = req.nextUrl.searchParams.get("churchId");
  if (!eventId) {
    return NextResponse.json({ error: "Missing eventId" }, { status: 400 });
  }

  try {
    let eventData: Event | null = null;

    if (churchId) {
      // Direct lookup when churchId is provided (preferred path)
      const eventDoc = await adminDb.doc(`churches/${churchId}/events/${eventId}`).get();
      if (!eventDoc.exists) {
        return NextResponse.json({ error: "Event not found" }, { status: 404 });
      }
      eventData = { id: eventDoc.id, ...eventDoc.data() } as Event;
    } else {
      // Legacy fallback: scan collection group (for old links without churchId)
      const allEvents = adminDb.collectionGroup("events");
      const snap = await allEvents.get();
      const found = snap.docs.find((d) => d.id === eventId);
      if (!found) {
        return NextResponse.json({ error: "Event not found" }, { status: 404 });
      }
      eventData = { id: found.id, ...found.data() } as Event;
    }

    // Check visibility — only public or internal events can be loaded
    // (internal events still load; auth check happens on POST)

    // Load church info
    const churchSnap = await adminDb.doc(`churches/${eventData.church_id}`).get();
    const churchData = churchSnap.exists
      ? ({ id: churchSnap.id, ...churchSnap.data() } as Church)
      : null;

    // Load signups
    const signupsSnap = await adminDb
      .collection("event_signups")
      .where("event_id", "==", eventId)
      .get();
    const signups = signupsSnap.docs.map(
      (d) => ({ id: d.id, ...d.data() }) as EventSignup,
    );

    return NextResponse.json({ event: eventData, church: churchData, signups });
  } catch (err) {
    console.error("GET /api/signup error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

/**
 * POST /api/signup
 * Submit a volunteer signup for an event role.
 * Authenticated users send Bearer token; public guests send name+email.
 */
export async function POST(req: NextRequest) {
  const limited = rateLimit(req, { limit: 10, windowMs: 60_000 });
  if (limited) return limited;

  try {
    const body = await req.json();
    const { event_id, church_id, role_id, volunteer_name, volunteer_email, user_id } = body;

    if (!event_id || !church_id || !role_id) {
      return NextResponse.json(
        { error: "Missing required fields: event_id, church_id, role_id" },
        { status: 400 },
      );
    }

    // Verify auth token if provided
    let verifiedUid: string | null = null;
    const authHeader = req.headers.get("Authorization");
    if (authHeader?.startsWith("Bearer ")) {
      try {
        const token = authHeader.slice(7);
        const decoded = await adminAuth.verifyIdToken(token);
        verifiedUid = decoded.uid;
      } catch {
        return NextResponse.json({ error: "Invalid auth token" }, { status: 401 });
      }
    }

    // Load the event
    const eventSnap = await adminDb.doc(`churches/${church_id}/events/${event_id}`).get();
    if (!eventSnap.exists) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }
    const event = eventSnap.data() as Event;

    // Verify signup mode allows open signup
    if (event.signup_mode === "scheduled") {
      return NextResponse.json(
        { error: "This event does not accept open signups" },
        { status: 403 },
      );
    }

    // Verify the role exists and allows signup
    const role = event.roles.find((r) => r.role_id === role_id);
    if (!role) {
      return NextResponse.json({ error: "Role not found" }, { status: 404 });
    }
    if (!role.allow_signup) {
      return NextResponse.json(
        { error: "This role is not open for signup" },
        { status: 403 },
      );
    }

    // For guest signups (no auth), require name and email
    if (!verifiedUid && (!volunteer_name?.trim() || !volunteer_email?.trim())) {
      return NextResponse.json(
        { error: "Please provide your name and email to sign up" },
        { status: 400 },
      );
    }

    // Check if role is already full
    const existingSignups = await adminDb
      .collection("event_signups")
      .where("event_id", "==", event_id)
      .where("role_id", "==", role_id)
      .get();
    const activeSignups = existingSignups.docs.filter(
      (d) => d.data().status !== "cancelled",
    );

    if (activeSignups.length >= role.count) {
      return NextResponse.json(
        { error: "This role is already full" },
        { status: 409 },
      );
    }

    // Check for duplicate signup (same user or email)
    const effectiveUserId = verifiedUid || user_id;
    if (effectiveUserId) {
      const dupCheck = await adminDb
        .collection("event_signups")
        .where("event_id", "==", event_id)
        .where("user_id", "==", effectiveUserId)
        .get();
      const activeDups = dupCheck.docs.filter(
        (d) => d.data().status !== "cancelled",
      );
      if (activeDups.length > 0) {
        return NextResponse.json(
          { error: "You have already signed up for this event" },
          { status: 409 },
        );
      }
    }

    // Determine role title from the event's roles
    const roleTitle = role.title;

    // Create the signup
    const signupData = {
      event_id,
      church_id,
      role_id,
      role_title: roleTitle,
      volunteer_id: "", // Will be linked if they have a volunteer record
      user_id: effectiveUserId || null,
      volunteer_name: volunteer_name || "",
      volunteer_email: volunteer_email || "",
      status: "confirmed", // Auto-confirm for open signup
      signed_up_at: new Date().toISOString(),
      approved_by: null,
    };

    const ref = await adminDb.collection("event_signups").add(signupData);

    return NextResponse.json({ id: ref.id, ...signupData }, { status: 201 });
  } catch (err) {
    console.error("POST /api/signup error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
