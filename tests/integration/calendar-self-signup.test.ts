/**
 * Integration smoke for the self-signup carve-out in /api/calendar
 * (PR #37, Phase 6 follow-up retest).
 *
 * Before this fix the iCal feed filtered every assignment by
 * `schedule.status === "published"`. PR #35 (Self-Service open-slot
 * claim) writes assignments with `signup_type: "self_signup"` while the
 * parent schedule is still in `draft` / `in_review` — those assignments
 * are explicitly opted into by the volunteer and need to land in their
 * personal calendar immediately. PR #37 carves out:
 *
 *   include if (parent.status === "published")
 *       OR (feedType === "personal" AND signup_type === "self_signup"
 *           AND person_id === targetId)
 *
 * Critically, the carve-out is PERSONAL-ONLY — team / ministry / org
 * feeds keep the published-only rule so the "official lineup" view
 * doesn't accidentally leak draft work.
 */

import { beforeEach, describe, it, expect, vi } from "vitest";

vi.mock("@/lib/firebase/admin", async () => {
  process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
  const { initializeApp, getApps } = await import("firebase-admin/app");
  const { getFirestore } = await import("firebase-admin/firestore");
  const app = getApps()[0] ?? initializeApp({ projectId: "demo-test" });
  return {
    adminDb: getFirestore(app),
    adminAuth: {
      verifyIdToken: vi.fn(async (token: string) => ({ uid: token })),
    },
    adminStorage: {},
  };
});

import { adminDb } from "@/lib/firebase/admin";
import { GET } from "@/app/api/calendar/route";
import { resetFirestore, seedChurchAndMemberships, T } from "./_seed";

const PERSONAL_TOKEN = "personal-feed-token";
const TEAM_TOKEN = "team-feed-token";
const PERSON_ID = "p-alex";
const SCHEDULE_DRAFT = "sched-draft";
const SCHEDULE_PUBLISHED = "sched-pub";
const SERVICE_ID = "svc1";

async function seedCalendarFixture() {
  await resetFirestore(adminDb);
  await seedChurchAndMemberships(adminDb);
  const churchRef = adminDb.collection("churches").doc(T.churchId);

  // Person record + service + ministry boilerplate
  await churchRef.collection("people").doc(PERSON_ID).set({
    name: "Alex Kim",
    email: "alex@example.com",
    user_id: T.volunteerUid,
    is_volunteer: true,
    status: "active",
    ministry_ids: ["worship"],
    role_ids: [],
    campus_ids: [],
    household_ids: [],
    volunteer_journey: [],
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  });
  await churchRef.collection("services").doc(SERVICE_ID).set({
    church_id: T.churchId,
    name: "Sunday Worship",
    ministry_id: "worship",
    day_of_week: 0,
    start_time: "10:00",
    end_time: "11:30",
    recurrence: "weekly",
    roles: [{ role_id: "vocals", title: "Vocalist", count: 1 }],
    is_active: true,
  });
  await churchRef.collection("ministries").doc("worship").set({
    church_id: T.churchId,
    name: "Worship",
    color: "#abc",
    description: "",
    lead_user_id: T.adminUid,
    lead_email: "lead@example.com",
    requires_background_check: false,
    prerequisites: [],
  });

  // Two schedules: one draft, one published.
  await churchRef.collection("schedules").doc(SCHEDULE_DRAFT).set({
    church_id: T.churchId,
    date_range_start: "2026-09-01",
    date_range_end: "2026-09-30",
    status: "draft",
    workflow_mode: "self-service",
    ministry_ids: [],
  });
  await churchRef.collection("schedules").doc(SCHEDULE_PUBLISHED).set({
    church_id: T.churchId,
    date_range_start: "2026-10-01",
    date_range_end: "2026-10-31",
    status: "published",
    workflow_mode: "centralized",
    ministry_ids: [],
  });

  // Assignments:
  //   1. Self-signup on DRAFT schedule for Alex — should appear in her
  //      personal feed via the carve-out; should NOT appear in team feed.
  //   2. Self-signup on DRAFT schedule for a DIFFERENT person — should
  //      NOT appear in Alex's personal feed (target_id guard).
  //   3. Scheduler-pushed on DRAFT schedule for Alex — should NOT appear
  //      in her personal feed (the original PR #27 security rule).
  //   4. Scheduler-pushed on PUBLISHED schedule for Alex — should appear
  //      in BOTH personal and team feeds (the long-standing happy path).
  const mkAssign = (
    id: string,
    scheduleId: string,
    personId: string,
    signupType: "self_signup" | "scheduled",
    date: string,
  ) => ({
    schedule_id: scheduleId,
    church_id: T.churchId,
    service_id: SERVICE_ID,
    event_id: null,
    service_date: date,
    volunteer_id: personId,
    person_id: personId,
    role_id: "vocals",
    role_title: "Vocalist",
    ministry_id: "worship",
    status: "confirmed",
    signup_type: signupType,
    assignment_type: "regular",
    confirmation_token: `tok-${id}`,
    responded_at: new Date().toISOString(),
    reminder_sent_at: [],
    attended: null,
    attended_at: null,
  });
  await churchRef.collection("assignments").doc("a1-self-draft-alex").set(
    mkAssign("a1", SCHEDULE_DRAFT, PERSON_ID, "self_signup", "2026-09-06"),
  );
  await churchRef.collection("assignments").doc("a2-self-draft-other").set(
    mkAssign("a2", SCHEDULE_DRAFT, "other-person", "self_signup", "2026-09-13"),
  );
  await churchRef.collection("assignments").doc("a3-sched-draft-alex").set(
    mkAssign("a3", SCHEDULE_DRAFT, PERSON_ID, "scheduled", "2026-09-20"),
  );
  await churchRef.collection("assignments").doc("a4-sched-pub-alex").set(
    mkAssign("a4", SCHEDULE_PUBLISHED, PERSON_ID, "scheduled", "2026-10-04"),
  );

  // Calendar feeds.
  await churchRef.collection("calendar_feeds").doc("feed-personal").set({
    church_id: T.churchId,
    type: "personal",
    target_id: PERSON_ID,
    secret_token: PERSONAL_TOKEN,
    created_by_user_id: T.volunteerUid,
  });
  await churchRef.collection("calendar_feeds").doc("feed-team").set({
    church_id: T.churchId,
    type: "team",
    target_id: PERSON_ID,
    secret_token: TEAM_TOKEN,
    created_by_user_id: T.volunteerUid,
  });
}

async function fetchIcal(token: string): Promise<string> {
  const res = await GET(
    new Request(`https://test/api/calendar?token=${encodeURIComponent(token)}`),
  );
  expect(res.status).toBe(200);
  return await res.text();
}

beforeEach(async () => {
  await seedCalendarFixture();
});

describe("GET /api/calendar — self-signup carve-out (PR #37)", () => {
  it("personal feed INCLUDES the volunteer's own self-signup on a draft schedule", async () => {
    const ics = await fetchIcal(PERSONAL_TOKEN);
    expect(ics).toContain("a1-self-draft-alex");
    // And on a published scheduled one, which always worked.
    expect(ics).toContain("a4-sched-pub-alex");
  });

  it("personal feed EXCLUDES scheduler-pushed assignments on a draft schedule", async () => {
    // The whole point of the PR #27 security rule — admins' draft plans
    // shouldn't leak into volunteer calendars before publish.
    const ics = await fetchIcal(PERSONAL_TOKEN);
    expect(ics).not.toContain("a3-sched-draft-alex");
  });

  it("personal feed EXCLUDES another person's self-signup (target_id guard)", async () => {
    const ics = await fetchIcal(PERSONAL_TOKEN);
    expect(ics).not.toContain("a2-self-draft-other");
  });

  it("team feed EXCLUDES draft self-signup assignments (carve-out is personal-only)", async () => {
    // Team / ministry / org feeds remain "official lineup" — only what
    // the org has approved + published. A volunteer's claim on a draft
    // shouldn't surface to the rest of the team via the team .ics.
    //
    // Team feeds bundle by service+date so the per-assignment uid isn't
    // in the output — assert the dates instead.
    const ics = await fetchIcal(TEAM_TOKEN);
    // Draft self-signup was on 2026-09-06 → NOT in team feed
    expect(ics).not.toContain("20260906");
    // Published scheduled was on 2026-10-04 → IS in team feed
    expect(ics).toContain("20261004");
  });
});
