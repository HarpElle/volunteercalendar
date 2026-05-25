import { NextRequest, NextResponse } from "next/server";
import type { DocumentData, DocumentReference } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { generateICalFeed } from "@/lib/utils/ical";
import { rateLimitDistributed } from "@/lib/server/rate-limit";
import { touchFeedLastAccessed } from "@/lib/server/calendar-feed";

export async function GET(request: NextRequest) {
  try {
    // Pass G Phase 3: distributed rate-limit. Not requireDistributed:true
    // because iCal subscribers fetch on long intervals; an Upstash blip
    // shouldn't break subscriptions.
    const limited = await rateLimitDistributed(request, {
      prefix: "calendar-feed",
      limit: 60,
      windowSeconds: 60,
    });
    if (limited) return limited;

    const { searchParams } = new URL(request.url);
    const token = searchParams.get("token");

    if (!token) {
      return new NextResponse("Missing token", { status: 400 });
    }

    // Look up calendar feed by secret token — iterate over churches to avoid
    // needing a collection group index (automatic single-field indexes cover this)
    const churchesSnap = await adminDb.collection("churches").get();
    let feed: DocumentData | null = null;
    let feedRef: DocumentReference | null = null;
    let churchId = "";

    for (const churchDoc of churchesSnap.docs) {
      const feedSnap = await adminDb
        .collection("churches")
        .doc(churchDoc.id)
        .collection("calendar_feeds")
        .where("secret_token", "==", token)
        .limit(1)
        .get();
      if (!feedSnap.empty) {
        feed = feedSnap.docs[0].data();
        feedRef = feedSnap.docs[0].ref;
        churchId = churchDoc.id;
        break;
      }
    }

    if (!feed || !feedRef) {
      return new NextResponse("Feed not found", { status: 404 });
    }

    // Pass G Phase 3: revoked feeds return 404 to the iCal client.
    // Revocation is irreversible by design (user must create a new feed).
    if (feed.revoked_at) {
      return new NextResponse("Feed not found", { status: 404 });
    }

    const feedType = (feed.type as string) || "personal";
    const targetId = feed.target_id as string;

    // SECURITY (Codex QA 2026-05-15): personal/team feeds must resolve to a
    // real target. Refuse if target_id is missing — guards against corrupted
    // or partially-deleted feeds serving stale assignments.
    if ((feedType === "personal" || feedType === "team") && !targetId) {
      return new NextResponse("Feed not found", { status: 404 });
    }

    // Pass G Phase 3: fire-and-forget write-on-read so the user can see
    // when this feed was last consumed (lets them detect unexpected use).
    touchFeedLastAccessed(feedRef);

    // Fetch church for timezone + name
    const churchSnap = await adminDb.doc(`churches/${churchId}`).get();
    const church = churchSnap.exists ? churchSnap.data() : null;
    const timezone = (church?.timezone as string) || "America/New_York";
    const churchName = (church?.name as string) || "Church";

    // Fetch assignments, supporting data, schedules, AND events +
    // event_signups in parallel. Schedules are required to filter out
    // non-published assignments. Events + event_signups (Pass H Phase 4
    // retest Sev 2) are required for personal feeds to include the
    // volunteer's public-event signups, not just their service
    // assignments. event_signups lives at the church root (not under
    // /churches), unlike the other collections.
    const [
      assignSnap,
      servicesSnap,
      ministriesSnap,
      peopleSnap,
      schedulesSnap,
      eventsSnap,
      eventSignupsSnap,
    ] = await Promise.all([
      adminDb
        .collection("churches")
        .doc(churchId)
        .collection("assignments")
        .get(),
      adminDb
        .collection("churches")
        .doc(churchId)
        .collection("services")
        .get(),
      adminDb
        .collection("churches")
        .doc(churchId)
        .collection("ministries")
        .get(),
      adminDb
        .collection("churches")
        .doc(churchId)
        .collection("people")
        .get(),
      adminDb
        .collection("churches")
        .doc(churchId)
        .collection("schedules")
        .get(),
      adminDb
        .collection("churches")
        .doc(churchId)
        .collection("events")
        .get(),
      // event_signups live in a top-level collection, scoped by church_id field.
      adminDb
        .collection("event_signups")
        .where("church_id", "==", churchId)
        .get(),
    ]);

    const serviceMap = new Map(
      servicesSnap.docs.map((d) => [d.id, d.data()]),
    );
    const ministryMap = new Map(
      ministriesSnap.docs.map((d) => [d.id, d.data()]),
    );
    const volunteerMap = new Map(
      peopleSnap.docs.map((d) => [d.id, d.data()]),
    );
    // Pass H Phase 4 retest Sev 2: needed by the personal-feed path
    // below to resolve signup → event for both name/time AND the
    // campus filter.
    const eventMap = new Map(
      eventsSnap.docs.map((d) => [d.id, d.data()]),
    );
    const eventSignups = eventSignupsSnap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    })) as Record<string, unknown>[];

    // SECURITY (Codex QA 2026-05-15): collect IDs of published schedules.
    // Drafts, in_review, and approved schedules must NEVER bleed into iCal
    // for team/ministry/org feeds — those are the "official lineup" view.
    //
    // SELF-SIGNUP CARVE-OUT (PR #37, Phase 6 follow-up retest):
    // for a PERSONAL feed (the volunteer's own .ics), include the
    // volunteer's own self-signup claims even when the parent schedule
    // is still draft/in_review. They explicitly clicked "Sign Up"; the
    // assignment is part of their plan from that moment on. Team / org
    // feeds keep the published-only rule.
    const publishedScheduleIds = new Set(
      schedulesSnap.docs
        .filter((d) => (d.data().status as string) === "published")
        .map((d) => d.id),
    );

    let assignments = (assignSnap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    })) as Record<string, unknown>[])
      .filter((a) => {
        if (publishedScheduleIds.has(a.schedule_id as string)) return true;
        if (
          feedType === "personal" &&
          a.signup_type === "self_signup" &&
          a.person_id === targetId
        ) {
          return true;
        }
        return false;
      });

    // Filter assignments and build calendar name based on feed type
    let calendarName = `${churchName} - Volunteer Schedule`;

    if (feedType === "personal") {
      assignments = assignments.filter((a) => a.person_id === targetId);
      const vol = volunteerMap.get(targetId);
      calendarName = `${(vol?.name as string) || "My"} Schedule - ${churchName}`;
    } else if (feedType === "ministry") {
      assignments = assignments.filter((a) => a.ministry_id === targetId);
      const min = ministryMap.get(targetId);
      calendarName = `${(min?.name as string) || "Ministry"} Schedule - ${churchName}`;
    } else if (feedType === "team") {
      const vol = volunteerMap.get(targetId);
      const volMinistries = (vol?.ministry_ids as string[]) || [];
      assignments = assignments.filter((a) =>
        volMinistries.includes(a.ministry_id as string),
      );
      calendarName = `Team Schedule - ${(vol?.name as string) || "Volunteer"} - ${churchName}`;
    }
    // "org" type returns all assignments — no filter needed

    // Pass H Phase 4: per-feed campus scope. When the feed has a
    // campus_id set, drop any assignment whose service.campus_id doesn't
    // match. Org-wide services (campus_id null) pass — they cover every
    // campus by design. This lets a multi-campus volunteer subscribe to
    // a per-campus feed from a separate calendar app.
    const feedCampusId = (feed.campus_id as string | null | undefined) ?? null;
    if (feedCampusId) {
      assignments = assignments.filter((a) => {
        const svc = serviceMap.get(a.service_id as string);
        if (!svc) return true; // unknown service → keep, don't drop
        const svcCampus = (svc.campus_id as string | null | undefined) ?? null;
        if (!svcCampus) return true; // org-wide service
        return svcCampus === feedCampusId;
      });
      // Append a campus tag to the calendar name so iCal clients show
      // distinct entries when a volunteer subscribes to multiple per-
      // campus feeds. We pull the campus name lazily from the
      // churches/{churchId}/campuses subcollection.
      try {
        const campusDoc = await adminDb
          .doc(`churches/${churchId}/campuses/${feedCampusId}`)
          .get();
        const cname = campusDoc.exists ? (campusDoc.data()?.name as string) : null;
        if (cname) {
          calendarName = `${calendarName} (${cname})`;
        }
      } catch {
        // Campus name lookup is cosmetic; ignore failures.
      }
    }

    // Build iCal events
    let events;

    if (feedType === "personal") {
      const assignmentEvents = assignments.map((a) => {
        const service = serviceMap.get(a.service_id as string);
        const ministry = ministryMap.get(a.ministry_id as string);
        return {
          uid: a.id as string,
          summary: `${a.role_title} - ${(service?.name as string) || "Service"}`,
          description: [
            `Ministry: ${(ministry?.name as string) || "Unknown"}`,
            `Role: ${a.role_title}`,
          ].join("\n"),
          dtstart: a.service_date as string,
          startTime: (service?.start_time as string) || "09:00",
          durationMinutes: (service?.duration_minutes as number) || 90,
        };
      });

      // Pass H Phase 4 retest Sev 2 (2026-05-25): personal feeds were
      // missing event signups entirely — only service assignments
      // landed in the .ics. Now we also include public-event signups
      // where the volunteer is the feed's target.
      //
      // Filters applied:
      //   1. volunteer_id matches the feed's target_id (just like
      //      assignments use person_id === targetId)
      //   2. status !== "cancelled" (Service Day uses the same rule)
      //   3. parent event exists in eventMap (drops orphans)
      //   4. campus filter — when feed.campus_id is set, drop signups
      //      whose event.campus_id doesn't match (org-wide events
      //      with campus_id null pass every filter, same semantic as
      //      the assignment side above)
      const mySignups = eventSignups.filter((s) => {
        if (s.volunteer_id !== targetId) return false;
        if (s.status === "cancelled") return false;
        const evt = eventMap.get(s.event_id as string);
        if (!evt) return false; // orphaned signup → skip
        if (feedCampusId) {
          const evtCampus = (evt.campus_id as string | null | undefined) ?? null;
          // Universal events (campus_id null) pass every campus filter;
          // specific events only pass when they match exactly.
          if (evtCampus && evtCampus !== feedCampusId) return false;
        }
        return true;
      });

      const signupEvents = mySignups.map((s) => {
        const evt = eventMap.get(s.event_id as string)!;
        const evtName = (evt.name as string) || "Event";
        const roleTitle = (s.role_title as string) || "Volunteer";
        const isAllDay = Boolean(evt.all_day);
        // Mirror the assignment shape so generateICalFeed can treat
        // both uniformly. duration_minutes is computed from start/end
        // when present; falls back to a 60-minute default — events
        // don't carry a duration_minutes field like services do.
        const startTime = (evt.start_time as string | null) || "09:00";
        const endTime = (evt.end_time as string | null) || null;
        let durationMinutes = 60;
        if (!isAllDay && startTime && endTime) {
          const [sh, sm] = startTime.split(":").map(Number);
          const [eh, em] = endTime.split(":").map(Number);
          const mins = eh * 60 + em - (sh * 60 + sm);
          if (mins > 0) durationMinutes = mins;
        }
        return {
          uid: `signup_${s.id}`,
          summary: `${roleTitle} - ${evtName}`,
          description: [
            `Event: ${evtName}`,
            `Role: ${roleTitle}`,
          ].join("\n"),
          dtstart: evt.date as string,
          startTime,
          durationMinutes,
        };
      });

      events = [...assignmentEvents, ...signupEvents];
    } else {
      // Team / ministry / org feeds: aggregate by service + date
      const grouped = new Map<string, typeof assignments>();
      for (const a of assignments) {
        const key = `${a.service_id}|${a.service_date}`;
        if (!grouped.has(key)) grouped.set(key, []);
        grouped.get(key)!.push(a);
      }

      events = [...grouped.entries()].map(([key, groupAssignments]) => {
        const [serviceId, serviceDate] = key.split("|");
        const service = serviceMap.get(serviceId);

        const roleMap = new Map<string, string[]>();
        for (const a of groupAssignments) {
          const roleTitle = (a.role_title as string) || "Unknown Role";
          const volName =
            (volunteerMap.get(a.person_id as string)?.name as string) ||
            "Unknown";
          if (!roleMap.has(roleTitle)) roleMap.set(roleTitle, []);
          roleMap.get(roleTitle)!.push(volName);
        }

        const descLines = [...roleMap.entries()]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([role, names]) => `${role}: ${names.sort().join(", ")}`);

        return {
          uid: `${serviceId}_${serviceDate}`,
          summary: (service?.name as string) || "Service",
          description: descLines.join("\n"),
          dtstart: serviceDate,
          startTime: (service?.start_time as string) || "09:00",
          durationMinutes: (service?.duration_minutes as number) || 90,
        };
      });
    }

    const ical = generateICalFeed(calendarName, events, timezone);

    return new NextResponse(ical, {
      status: 200,
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": `inline; filename="${calendarName.replace(/[^a-zA-Z0-9]/g, "_")}.ics"`,
        "Cache-Control": "no-cache, no-store, must-revalidate",
      },
    });
  } catch (error) {
    console.error("Calendar feed error:", error);
    return new NextResponse("Server error", { status: 500 });
  }
}
