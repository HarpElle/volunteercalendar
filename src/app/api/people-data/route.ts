import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";

/**
 * GET /api/people-data?church_id=xxx
 * Fetch all data needed by the People page using Admin SDK.
 * Bypasses Firestore security rules (which can fail on client-side
 * collection queries that depend on get()/exists() helpers).
 * Auth: Bearer token from an active admin/owner/scheduler.
 */
export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const decoded = await adminAuth.verifyIdToken(authHeader.slice(7));
    const uid = decoded.uid;

    const churchId = req.nextUrl.searchParams.get("church_id");
    if (!churchId) {
      return NextResponse.json({ error: "church_id is required" }, { status: 400 });
    }

    // Verify caller is an active member with sufficient role
    const callerSnap = await adminDb
      .collection("memberships")
      .where("user_id", "==", uid)
      .where("church_id", "==", churchId)
      .where("status", "==", "active")
      .limit(1)
      .get();

    if (callerSnap.empty) {
      return NextResponse.json({ error: "Not a member of this organization" }, { status: 403 });
    }
    const callerRole = callerSnap.docs[0].data().role;
    if (!["scheduler", "admin", "owner"].includes(callerRole)) {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
    }

    const churchRef = adminDb.collection("churches").doc(churchId);

    // Fetch all data in parallel
    const [
      peopleSnap,
      minsSnap,
      memsSnap,
      svcsSnap,
      hhSnap,
      churchDoc,
      queueSnap,
    ] = await Promise.all([
      churchRef.collection("people").get(),
      churchRef.collection("ministries").get(),
      adminDb.collection("memberships").where("church_id", "==", churchId).get(),
      churchRef.collection("services").get(),
      churchRef.collection("households").get(),
      churchRef.get(),
      churchRef.collection("invite_queue").get(),
    ]);

    type Doc = Record<string, unknown> & { id: string };
    const toDoc = (d: FirebaseFirestore.QueryDocumentSnapshot): Doc => ({ id: d.id, ...d.data() });

    const volunteers: Doc[] = peopleSnap.docs
      .map(toDoc)
      .filter((d) => d.is_volunteer === true)
      .map((d) => ({
        // Map Person fields to legacy Volunteer shape expected by the People page
        ...d,
        email: d.email ?? "",
        household_id: Array.isArray(d.household_ids) ? (d.household_ids as string[])[0] ?? null : null,
        availability: d.scheduling_profile ?? {
          blockout_dates: [],
          recurring_unavailable: [],
          preferred_frequency: 4,
          max_roles_per_month: 4,
        },
        reminder_preferences: { channels: ["email"] },
        stats: d.stats ?? {
          times_scheduled_last_90d: 0,
          last_served_date: null,
          decline_count: 0,
          no_show_count: 0,
        },
        imported_from: d.imported_from ?? "manual",
      }));
    const ministries: Doc[] = minsSnap.docs.map(toDoc);
    const memberships: Doc[] = memsSnap.docs.map(toDoc);
    const services: Doc[] = svcsSnap.docs.map(toDoc);
    const households: Doc[] = hhSnap.docs.map(toDoc);
    const queueItems: Doc[] = queueSnap.docs.map(toDoc);

    // Enrich memberships with user display data (Admin SDK bypasses self-read-only rule)
    const uniqueUserIds = [...new Set(
      memberships.map((m) => m.user_id as string).filter(Boolean),
    )];
    const userDocs = await Promise.all(
      uniqueUserIds.map((uid) => adminDb.collection("users").doc(uid).get()),
    );
    const userMap = new Map<string, { display_name: string; email: string }>();
    for (const udoc of userDocs) {
      if (udoc.exists) {
        const d = udoc.data()!;
        userMap.set(udoc.id, {
          display_name: (d.display_name as string) || "",
          email: (d.email as string) || "",
        });
      }
    }
    for (const mem of memberships) {
      const userData = userMap.get(mem.user_id as string);
      if (userData) {
        mem._user_display_name = userData.display_name;
        mem._user_email = userData.email;
      }
    }

    const church = churchDoc.exists
      ? {
          name: churchDoc.data()!.name || "",
          subscription_tier: churchDoc.data()!.subscription_tier || "free",
          org_type: churchDoc.data()!.org_type,
          org_prerequisites: churchDoc.data()!.org_prerequisites || [],
        }
      : null;

    // Auto-sync: create volunteer records for active members missing from roster
    const volsByUserId = new Set(volunteers.map((v: Record<string, unknown>) => v.user_id).filter(Boolean));
    const volsByEmail = new Set(volunteers.map((v: Record<string, unknown>) => (v.email as string)?.toLowerCase()).filter(Boolean));
    const activeMembers = memberships.filter(
      (m: Record<string, unknown>) => m.status === "active" && m.user_id && !volsByUserId.has(m.user_id as string),
    );

    const created: Record<string, unknown>[] = [];
    for (const mem of activeMembers) {
      const userDoc = await adminDb.collection("users").doc(mem.user_id as string).get();
      const userData = userDoc.data() || {};
      const memEmail = (userData.email as string)?.toLowerCase() || "";
      if (volsByEmail.has(memEmail)) continue;

      const now = new Date().toISOString();
      const displayName = (userData.display_name as string) || memEmail || "Member";
      const nameParts = displayName.split(" ");
      const firstName = nameParts[0] || "";
      const lastName = nameParts.slice(1).join(" ") || "";

      const volData: Record<string, unknown> = {
        church_id: churchId,
        person_type: "adult",
        first_name: firstName,
        last_name: lastName,
        preferred_name: null,
        name: displayName,
        search_name: displayName.toLowerCase(),
        email: userData.email || null,
        phone: userData.phone || null,
        search_phones: userData.phone ? [(userData.phone as string).replace(/\D/g, "")] : [],
        photo_url: null,
        user_id: mem.user_id,
        membership_id: mem.id,
        status: "active",
        is_volunteer: true,
        ministry_ids: [],
        role_ids: [],
        campus_ids: [],
        household_ids: [],
        scheduling_profile: {
          skills: [],
          max_services_per_month: 8,
          blockout_dates: [],
          recurring_unavailable: [],
          preferred_frequency: 2,
          max_roles_per_month: 8,
        },
        child_profile: null,
        stats: {
          times_scheduled_last_90d: 0,
          last_served_date: null,
          decline_count: 0,
          no_show_count: 0,
        },
        imported_from: null,
        background_check: null,
        role_constraints: null,
        volunteer_journey: null,
        qr_token: null,
        created_at: now,
        updated_at: now,
      };
      const newRef = await churchRef.collection("people").add(volData);
      created.push({ ...volData, id: newRef.id });
      volsByEmail.add(memEmail);
      volsByUserId.add(mem.user_id as string);
    }

    return NextResponse.json({
      volunteers: [...volunteers, ...created],
      ministries,
      memberships,
      services,
      households,
      church,
      queueItems,
    });
  } catch (err) {
    console.error("[API /people-data] Error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
