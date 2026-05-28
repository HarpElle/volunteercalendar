/**
 * GET /api/my-schedule
 *
 * Wave 5 Batch E phase 3 — the authorized server-side read path for the
 * volunteer's My Schedule page. This is the PREREQUISITE for the Wave
 * 2.2b assignment-rule lockdown: once the page reads assignments through
 * this endpoint (Admin SDK, rule-bypassing) instead of client queries,
 * we can tighten `match /assignments` to deny volunteer client reads of
 * non-published assignments without breaking the volunteer's own view.
 *
 * The page previously did FIVE client-side assignment reads that all
 * cross the new rule boundary:
 *   1. own assignments (person_id == me, last 30d)
 *   2. all-church assignments for the team view
 *   3. open-slot fill computation (reads draft self-service assignments)
 *   4. claim refetch — all-church
 *   5. claim refetch — own
 * This endpoint returns the data for (1)-(4) in one shaped response; the
 * page keeps its open-slot ELIGIBILITY computation but feeds it from
 * `teamAssignments` here rather than re-reading.
 *
 * Auth: requireUser (multi-church — the volunteer may belong to several
 * orgs). The church list is derived from the caller's OWN active
 * memberships read via Admin SDK, so there's no cross-tenant exposure
 * even though the endpoint takes no church_id param.
 *
 * Self-signup carve-out (preserved from the page, lines 234-258):
 * a volunteer's OWN self_signup claims are always visible to them, even
 * on draft schedules. Scheduler-pushed assignments only surface once the
 * parent schedule is published.
 *
 * NOT cached (unlike dashboard-summary): the payload is per-user, and
 * volunteers expect their just-claimed slots to appear immediately.
 */

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { assertBearerToken, requireUser } from "@/lib/server/authz";
import { normalizeWorkflowMode } from "@/lib/services/scheduler";
import { log } from "@/lib/log";
import type {
  Assignment,
  Service,
  Ministry,
  Event,
  Person,
  Schedule,
  OnboardingStep,
} from "@/lib/types";

export interface MyScheduleResponse {
  /** Visible assignments across all the caller's churches (self-signup
   * carve-out applied: own self_signup claims + published scheduler work). */
  assignments: Assignment[];
  /** All assignments (last 30d) across the caller's churches — feeds the
   * team-view + open-slot fill computation on the client. */
  teamAssignments: Assignment[];
  /** Supporting lookups, aggregated across churches. */
  services: Service[];
  ministries: Ministry[];
  events: Event[];
  /** Self-service schedules still in draft/in_review (for Open Slots). */
  selfServiceSchedules: Schedule[];
  /** Volunteers across churches (for name resolution in the team view). */
  volunteers: Person[];
  /** org_prerequisites keyed by church_id. */
  orgPrereqsByChurch: Record<string, OnboardingStep[]>;
  /** The caller's Person doc per church (for eligibility checks). */
  myPersonByChurch: Record<string, Person>;
  /** Union of the caller's ministry_ids across churches. */
  myMinistryIds: string[];
  /** The caller's primary volunteer/person id (last church wins, matches
   * the legacy page behavior). */
  myVolunteerId: string | null;
}

export async function GET(req: NextRequest) {
  const noAuth = assertBearerToken(req);
  if (noAuth) return noAuth;

  const user = await requireUser(req);
  if (user instanceof NextResponse) return user;
  // Capture the narrowed uid so the nested loadForChurch closure doesn't
  // re-widen `user` back to the AuthedUser | NextResponse union.
  const uid = user.uid;

  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const cutoffDate = thirtyDaysAgo.toISOString().split("T")[0];

    // Derive the church list from the caller's OWN active memberships.
    // No church_id param → no cross-tenant exposure surface.
    const memSnap = await adminDb
      .collection("memberships")
      .where("user_id", "==", uid)
      .where("status", "==", "active")
      .get();

    const activeMembers = memSnap.docs.map((d) => ({
      church_id: d.data().church_id as string,
      volunteer_id: (d.data().volunteer_id as string | null) ?? null,
    }));

    // Aggregators (mirror the page's loadAll maps, flattened to arrays)
    const assignments: Assignment[] = [];
    const teamAssignments: Assignment[] = [];
    const servicesById = new Map<string, Service>();
    const ministriesById = new Map<string, Ministry>();
    const eventsById = new Map<string, Event>();
    const volunteersById = new Map<string, Person>();
    const selfServiceSchedules: Schedule[] = [];
    const orgPrereqsByChurch: Record<string, OnboardingStep[]> = {};
    const myPersonByChurch: Record<string, Person> = {};
    const ministryIdSet = new Set<string>();
    let myVolunteerId: string | null = null;

    async function loadForChurch(
      churchId: string,
      memberVolunteerId: string | null,
    ): Promise<void> {
      const churchRef = adminDb.collection("churches").doc(churchId);

      // Phase 1: people (to resolve this user's person id + name map)
      const peopleSnap = await churchRef
        .collection("people")
        .where("is_volunteer", "==", true)
        .where("status", "==", "active")
        .get();
      const people = peopleSnap.docs.map(
        (d) => ({ id: d.id, ...d.data() }) as unknown as Person,
      );
      for (const p of people) volunteersById.set(p.id, p);

      let myPersonId: string | null = memberVolunteerId;
      if (!myPersonId || !volunteersById.has(myPersonId)) {
        const myPerson = people.find((p) => p.user_id === uid);
        if (myPerson) myPersonId = myPerson.id;
      }

      // Phase 2: own assignments + supporting data + schedules + church doc
      const [
        myAssignSnap,
        svcsSnap,
        minsSnap,
        evtsSnap,
        schedulesSnap,
        churchSnap,
        teamAssignSnap,
      ] = await Promise.all([
        myPersonId
          ? churchRef
              .collection("assignments")
              .where("person_id", "==", myPersonId)
              .where("service_date", ">=", cutoffDate)
              .get()
          : Promise.resolve(null),
        churchRef.collection("services").get(),
        churchRef.collection("ministries").get(),
        churchRef.collection("events").get(),
        churchRef.collection("schedules").get(),
        churchRef.get(),
        churchRef
          .collection("assignments")
          .where("service_date", ">=", cutoffDate)
          .get(),
      ]);

      const schedules = schedulesSnap.docs.map(
        (d) => ({ id: d.id, ...d.data() }) as unknown as Schedule,
      );

      if (myPersonId && myAssignSnap) {
        // Self-signup carve-out (preserved verbatim from the page):
        // volunteers see their own self_signup claims always, but
        // scheduler-pushed assignments only once the schedule is published.
        const publishedScheduleIds = new Set(
          schedules.filter((s) => s.status === "published").map((s) => s.id),
        );
        const myAssigns = myAssignSnap.docs.map(
          (d) => ({ id: d.id, ...d.data() }) as unknown as Assignment,
        );
        const visibleAssigns = myAssigns.filter((a) => {
          if (a.signup_type === "self_signup") return true;
          return publishedScheduleIds.has(a.schedule_id);
        });
        assignments.push(...visibleAssigns);

        const myVol = volunteersById.get(myPersonId);
        if (myVol) {
          for (const mid of myVol.ministry_ids || []) ministryIdSet.add(mid);
          myVolunteerId = myVol.id;
          myPersonByChurch[churchId] = myVol;
        }
      }

      // Team-view assignments (all church assignments, last 30d)
      teamAssignments.push(
        ...teamAssignSnap.docs.map(
          (d) => ({ id: d.id, ...d.data() }) as unknown as Assignment,
        ),
      );

      // Self-service schedules in draft/in_review for Open Slots
      for (const s of schedules) {
        if (
          normalizeWorkflowMode(s.workflow_mode) === "self-service" &&
          (s.status === "draft" || s.status === "in_review")
        ) {
          selfServiceSchedules.push(s);
        }
      }

      orgPrereqsByChurch[churchId] =
        (churchSnap.data()?.org_prerequisites as OnboardingStep[] | undefined) ??
        [];

      for (const d of svcsSnap.docs) {
        servicesById.set(d.id, { id: d.id, ...d.data() } as unknown as Service);
      }
      for (const d of minsSnap.docs) {
        ministriesById.set(d.id, { id: d.id, ...d.data() } as unknown as Ministry);
      }
      for (const d of evtsSnap.docs) {
        eventsById.set(d.id, { id: d.id, ...d.data() } as unknown as Event);
      }
    }

    // Load each active church; skip any that fail rather than failing
    // the whole response (mirrors the page's per-church try/catch).
    for (const m of activeMembers) {
      try {
        await loadForChurch(m.church_id, m.volunteer_id);
      } catch (err) {
        log.warn("[my-schedule] church load failed", {
          error: err,
          church_id: m.church_id,
        });
      }
    }

    const body: MyScheduleResponse = {
      assignments,
      teamAssignments,
      services: Array.from(servicesById.values()),
      ministries: Array.from(ministriesById.values()),
      events: Array.from(eventsById.values()),
      selfServiceSchedules,
      volunteers: Array.from(volunteersById.values()),
      orgPrereqsByChurch,
      myPersonByChurch,
      myMinistryIds: Array.from(ministryIdSet),
      myVolunteerId,
    };

    // Per-user, mutation-sensitive (claims must appear immediately) →
    // no caching.
    return NextResponse.json(body, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (err) {
    log.error("[GET /api/my-schedule]", { error: err, uid });
    return NextResponse.json(
      { error: "Failed to load schedule" },
      { status: 500 },
    );
  }
}
