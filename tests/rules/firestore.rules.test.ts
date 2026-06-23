/**
 * Firestore Security Rules — emulator tests.
 *
 * Asserts the rule rewrite from §0.2 + Track B Phase 1 + later Sentinel
 * additions. Critical guarantees this suite enforces:
 *
 *   1. Volunteers cannot read children, households, attendance, billing,
 *      audit_logs, or kiosk_tokens (cross-tenant + within-tenant denial).
 *   2. Admins can read assignments, people, ministries, etc.
 *   3. Owners can read billing.
 *   4. The catch-all wildcard from the original rules is GONE — accessing
 *      a not-explicitly-listed subcollection denies.
 *   5. kiosk_stations / kiosk_activations / kiosk_tokens deny ALL client
 *      access (Admin SDK only).
 *   6. waitlist denies all client access (server-routed via /api/waitlist).
 *
 * Run with: `npm run test:rules` (starts Firestore emulator first).
 */

import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { afterAll, beforeAll, beforeEach, describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { setDoc, doc, getDoc, getDocs, collection, query, where, updateDoc } from "firebase/firestore";

const CHURCH_A = "church-a";
const CHURCH_B = "church-b";
const OWNER_A = "owner-a";
const ADMIN_A = "admin-a";
const VOLUNTEER_A = "volunteer-a";
const VOLUNTEER_B = "volunteer-b";
const SCHEDULER_A = "scheduler-a";
// Phase 3: check-in-role members for private-medical read tests.
const CHECKIN_VOL_A = "checkin-vol-a";
const CHECKIN_MGR_A = "checkin-mgr-a";

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: "demo-test",
    firestore: {
      rules: readFileSync(resolve(__dirname, "../../firestore.rules"), "utf8"),
      host: "127.0.0.1",
      port: 8080,
    },
  });
});

afterAll(async () => {
  await testEnv?.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  // Seed memberships using bypass-rules context so we can test reads later.
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    const set = (path: string, data: object) =>
      setDoc(doc(db, path), data);

    await set(`memberships/${OWNER_A}_${CHURCH_A}`, {
      user_id: OWNER_A,
      church_id: CHURCH_A,
      role: "owner",
      status: "active",
    });
    await set(`memberships/${ADMIN_A}_${CHURCH_A}`, {
      user_id: ADMIN_A,
      church_id: CHURCH_A,
      role: "admin",
      status: "active",
    });
    await set(`memberships/${VOLUNTEER_A}_${CHURCH_A}`, {
      user_id: VOLUNTEER_A,
      church_id: CHURCH_A,
      role: "volunteer",
      status: "active",
    });
    await set(`memberships/${SCHEDULER_A}_${CHURCH_A}`, {
      user_id: SCHEDULER_A,
      church_id: CHURCH_A,
      role: "scheduler",
      status: "active",
    });
    await set(`memberships/${VOLUNTEER_B}_${CHURCH_B}`, {
      user_id: VOLUNTEER_B,
      church_id: CHURCH_B,
      role: "volunteer",
      status: "active",
    });
    // Phase 3: a volunteer with the check-in role, and a check-in manager.
    await set(`memberships/${CHECKIN_VOL_A}_${CHURCH_A}`, {
      user_id: CHECKIN_VOL_A,
      church_id: CHURCH_A,
      role: "volunteer",
      status: "active",
      checkin_volunteer: true,
    });
    await set(`memberships/${CHECKIN_MGR_A}_${CHURCH_A}`, {
      user_id: CHECKIN_MGR_A,
      church_id: CHURCH_A,
      role: "volunteer",
      status: "active",
      checkin_manager: true,
    });

    // Seed church docs
    await set(`churches/${CHURCH_A}`, {
      name: "Church A",
      created_by: OWNER_A,
    });
    await set(`churches/${CHURCH_B}`, {
      name: "Church B",
      created_by: "owner-b",
    });

    // Seed sample data in subcollections
    await set(`churches/${CHURCH_A}/people/p1`, { name: "Alice" });
    // Phase 3: a child Person with ONLY safe summary fields on the parent
    // doc + the sensitive medical data in the private subdoc.
    await set(`churches/${CHURCH_A}/people/child1`, {
      person_type: "child",
      first_name: "Test",
      last_name: "Child",
      child_profile: {
        grade: "pre-k",
        default_room_id: "room1",
        has_alerts: true,
        photo_url: null,
      },
    });
    await set(`churches/${CHURCH_A}/people/child1/private/medical`, {
      date_of_birth: "2020-01-02",
      allergies: "Peanuts",
      medical_notes: "Asthma rescue inhaler in bag",
      medications: "Albuterol",
      authorized_pickups: [
        { id: "pickup1", name: "Aunt Jane", relationship: "Aunt", phone: "555-0100" },
      ],
    });
    await set(`churches/${CHURCH_A}/ministries/m1`, { name: "Worship" });
    await set(`churches/${CHURCH_A}/services/s1`, { name: "Sunday" });

    // Wave 2.2b (2026-05-28) — the assignment read rule now keys off the
    // DENORMALIZED `schedule_status` field stamped onto each assignment (not a
    // cross-doc get on the parent schedule). Seed the parent schedules for
    // realism, but the rule only ever reads assignment.schedule_status.
    await set(`churches/${CHURCH_A}/schedules/sched_published`, {
      church_id: CHURCH_A,
      status: "published",
    });
    await set(`churches/${CHURCH_A}/schedules/sched_draft`, {
      church_id: CHURCH_A,
      status: "draft",
    });
    // a1, a2 — published (volunteer-readable)
    await set(`churches/${CHURCH_A}/assignments/a1`, {
      person_id: VOLUNTEER_A,
      service_id: "s1",
      service_date: "2026-06-01",
      schedule_id: "sched_published",
      schedule_status: "published",
    });
    await set(`churches/${CHURCH_A}/assignments/a2`, {
      person_id: VOLUNTEER_A,
      service_id: "s1",
      service_date: "2026-06-08",
      schedule_id: "sched_published",
      schedule_status: "published",
    });
    // a_draft — non-published scheduler-pushed work (volunteer must NOT read)
    await set(`churches/${CHURCH_A}/assignments/a_draft`, {
      person_id: VOLUNTEER_A,
      service_id: "s1",
      service_date: "2026-06-15",
      schedule_id: "sched_draft",
      schedule_status: "draft",
    });
    // a_archived — archived schedules stay readable (historical view)
    await set(`churches/${CHURCH_A}/assignments/a_archived`, {
      person_id: VOLUNTEER_A,
      service_id: "s1",
      service_date: "2026-05-01",
      schedule_id: "sched_published",
      schedule_status: "archived",
    });
    // a_legacy — pre-backfill orphan with NO schedule_status field. The
    // defaulted accessor resource.data.get('schedule_status','') treats this
    // as non-published → denied to volunteers (the safe default).
    await set(`churches/${CHURCH_A}/assignments/a_legacy`, {
      person_id: VOLUNTEER_A,
      service_id: "s1",
      service_date: "2026-06-22",
      schedule_id: "sched_published",
    });

    // Codex QA 2026-05-15 — calendar_feeds are now owner-scoped (read/write).
    // Seed feeds owned by OWNER_A and (cross-test) by ADMIN_A.
    await set(`churches/${CHURCH_A}/calendar_feeds/feed_owner`, {
      church_id: CHURCH_A,
      type: "personal",
      target_id: "p1",
      secret_token: "tok-owner",
      created_at: "2026-01-01T00:00:00Z",
      created_by_user_id: OWNER_A,
    });
    await set(`churches/${CHURCH_A}/calendar_feeds/feed_admin`, {
      church_id: CHURCH_A,
      type: "personal",
      target_id: "p1",
      secret_token: "tok-admin",
      created_at: "2026-01-01T00:00:00Z",
      created_by_user_id: ADMIN_A,
    });
    await set(`churches/${CHURCH_A}/children/c1`, {
      first_name: "Sam",
      allergies: "Peanuts",
    });
    await set(`churches/${CHURCH_A}/households/h1`, { name: "Smith family" });
    await set(`churches/${CHURCH_A}/checkInSessions/se1`, {
      child_id: "c1",
      checked_in_at: "2026-01-01T00:00:00Z",
    });
    await set(`churches/${CHURCH_A}/audit_logs/log1`, {
      action: "test",
      church_id: CHURCH_A,
      created_at: "2026-01-01T00:00:00Z",
    });
    await set(`churches/${CHURCH_A}/billing/sub1`, { tier: "growth" });
    await set(`churches/${CHURCH_A}/feedback/f1`, { text: "..." });
    await set(`churches/${CHURCH_A}/sent_notifications/n1`, { sent_to: "x" });

    // Top-level collections
    await set(`kiosk_stations/stn1`, {
      church_id: CHURCH_A,
      name: "Lobby",
      status: "active",
    });
    await set(`kiosk_activations/CODE1234`, {
      station_id: "stn1",
      church_id: CHURCH_A,
    });
    await set(`kiosk_tokens/kt_abc`, {
      station_id: "stn1",
      church_id: CHURCH_A,
    });
    await set(`waitlist/w1`, { email: "x@x.com" });
    await set(`audit_logs/log_top`, {
      action: "schedule.publish",
      church_id: CHURCH_A,
      created_at: "2026-01-01T00:00:00Z",
    });
  });
});

describe("Firestore rules — volunteer access", () => {
  it("CAN read people in their own church", async () => {
    const ctx = testEnv.authenticatedContext(VOLUNTEER_A);
    await assertSucceeds(getDoc(doc(ctx.firestore(), `churches/${CHURCH_A}/people/p1`)));
  });

  it("CAN read ministries in their own church", async () => {
    const ctx = testEnv.authenticatedContext(VOLUNTEER_A);
    await assertSucceeds(getDoc(doc(ctx.firestore(), `churches/${CHURCH_A}/ministries/m1`)));
  });

  it("CAN read assignments in their own church", async () => {
    const ctx = testEnv.authenticatedContext(VOLUNTEER_A);
    await assertSucceeds(getDoc(doc(ctx.firestore(), `churches/${CHURCH_A}/assignments/a1`)));
  });

  it("CANNOT read children — Admin SDK only", async () => {
    const ctx = testEnv.authenticatedContext(VOLUNTEER_A);
    await assertFails(getDoc(doc(ctx.firestore(), `churches/${CHURCH_A}/children/c1`)));
  });

  it("CANNOT read households — Admin SDK only", async () => {
    const ctx = testEnv.authenticatedContext(VOLUNTEER_A);
    await assertFails(getDoc(doc(ctx.firestore(), `churches/${CHURCH_A}/households/h1`)));
  });

  it("CANNOT read checkInSessions — Admin SDK only", async () => {
    const ctx = testEnv.authenticatedContext(VOLUNTEER_A);
    await assertFails(getDoc(doc(ctx.firestore(), `churches/${CHURCH_A}/checkInSessions/se1`)));
  });

  it("CANNOT read other church's people (cross-tenant denial)", async () => {
    const ctx = testEnv.authenticatedContext(VOLUNTEER_A);
    await assertFails(
      getDoc(doc(ctx.firestore(), `churches/${CHURCH_B}/people/should-not-read`)),
    );
  });

  it("CANNOT read audit_logs (subcollection or top-level)", async () => {
    const ctx = testEnv.authenticatedContext(VOLUNTEER_A);
    await assertFails(getDoc(doc(ctx.firestore(), `churches/${CHURCH_A}/audit_logs/log1`)));
    await assertFails(getDoc(doc(ctx.firestore(), `audit_logs/log_top`)));
  });

  it("CANNOT read billing", async () => {
    const ctx = testEnv.authenticatedContext(VOLUNTEER_A);
    await assertFails(getDoc(doc(ctx.firestore(), `churches/${CHURCH_A}/billing/sub1`)));
  });

  it("CANNOT read feedback (admin-only collection)", async () => {
    const ctx = testEnv.authenticatedContext(VOLUNTEER_A);
    await assertFails(getDoc(doc(ctx.firestore(), `churches/${CHURCH_A}/feedback/f1`)));
  });
});

describe("Firestore rules — admin access", () => {
  it("CAN read audit_logs (admin only)", async () => {
    const ctx = testEnv.authenticatedContext(ADMIN_A);
    await assertSucceeds(getDoc(doc(ctx.firestore(), `churches/${CHURCH_A}/audit_logs/log1`)));
  });

  it("CAN read feedback", async () => {
    const ctx = testEnv.authenticatedContext(ADMIN_A);
    await assertSucceeds(getDoc(doc(ctx.firestore(), `churches/${CHURCH_A}/feedback/f1`)));
  });

  it("STILL CANNOT read children (Admin SDK only)", async () => {
    const ctx = testEnv.authenticatedContext(ADMIN_A);
    await assertFails(getDoc(doc(ctx.firestore(), `churches/${CHURCH_A}/children/c1`)));
  });

  it("CANNOT read other church's data", async () => {
    const ctx = testEnv.authenticatedContext(ADMIN_A);
    await assertFails(getDoc(doc(ctx.firestore(), `churches/${CHURCH_B}/people/x`)));
  });
});

describe("Firestore rules — owner access", () => {
  it("CAN read billing (owner only)", async () => {
    const ctx = testEnv.authenticatedContext(OWNER_A);
    await assertSucceeds(getDoc(doc(ctx.firestore(), `churches/${CHURCH_A}/billing/sub1`)));
  });

  it("Admin CANNOT read billing (owner-only)", async () => {
    const ctx = testEnv.authenticatedContext(ADMIN_A);
    await assertFails(getDoc(doc(ctx.firestore(), `churches/${CHURCH_A}/billing/sub1`)));
  });
});

describe("Firestore rules — kiosk + sensitive top-level collections", () => {
  it("CANNOT read kiosk_stations (Admin SDK only)", async () => {
    const ctx = testEnv.authenticatedContext(ADMIN_A);
    await assertFails(getDoc(doc(ctx.firestore(), `kiosk_stations/stn1`)));
  });

  it("CANNOT read kiosk_activations", async () => {
    const ctx = testEnv.authenticatedContext(ADMIN_A);
    await assertFails(getDoc(doc(ctx.firestore(), `kiosk_activations/CODE1234`)));
  });

  it("CANNOT read kiosk_tokens", async () => {
    const ctx = testEnv.authenticatedContext(ADMIN_A);
    await assertFails(getDoc(doc(ctx.firestore(), `kiosk_tokens/kt_abc`)));
  });

  it("CANNOT read waitlist (server-only via /api/waitlist)", async () => {
    const ctx = testEnv.authenticatedContext(VOLUNTEER_A);
    await assertFails(getDoc(doc(ctx.firestore(), `waitlist/w1`)));
  });

  it("Unauthenticated CANNOT read kiosk_stations", async () => {
    const ctx = testEnv.unauthenticatedContext();
    await assertFails(getDoc(doc(ctx.firestore(), `kiosk_stations/stn1`)));
  });
});

describe("Firestore rules — catch-all wildcard removed", () => {
  it("CANNOT read a not-explicitly-allowed subcollection (default-deny)", async () => {
    // This collection is NOT in the rules — pre-rewrite the wildcard would
    // have allowed it; post-rewrite it should deny.
    const ctx = testEnv.authenticatedContext(ADMIN_A);
    await testEnv.withSecurityRulesDisabled(async (bypassCtx) => {
      await setDoc(
        doc(bypassCtx.firestore(), `churches/${CHURCH_A}/some_new_collection/x`),
        { foo: "bar" },
      );
    });
    await assertFails(
      getDoc(doc(ctx.firestore(), `churches/${CHURCH_A}/some_new_collection/x`)),
    );
  });
});

describe("Firestore rules — unauthenticated access", () => {
  it("CANNOT read churches", async () => {
    const ctx = testEnv.unauthenticatedContext();
    await assertFails(getDoc(doc(ctx.firestore(), `churches/${CHURCH_A}`)));
  });

  it("CANNOT read memberships", async () => {
    const ctx = testEnv.unauthenticatedContext();
    await assertFails(
      getDoc(doc(ctx.firestore(), `memberships/${OWNER_A}_${CHURCH_A}`)),
    );
  });

  it("Stage sync live IS publicly readable (capability URL pattern)", async () => {
    await testEnv.withSecurityRulesDisabled(async (bypassCtx) => {
      await setDoc(doc(bypassCtx.firestore(), "stage_sync_live/random-token"), {
        current_song: "Public lyrics here",
      });
    });
    const ctx = testEnv.unauthenticatedContext();
    await assertSucceeds(
      getDoc(doc(ctx.firestore(), "stage_sync_live/random-token")),
    );
  });
});

/**
 * Codex QA 2026-05-15 — Calendar feed permission leak fix.
 *
 * The bug: account page listed every feed in the church to every member, and
 * iCal API served any feed token to anyone. Rules now require
 * `created_by_user_id == request.auth.uid` for read/write.
 */
describe("Firestore rules — calendar_feeds owner scoping (Codex QA Layer 1)", () => {
  it("Owner CAN read their own calendar feed", async () => {
    const ctx = testEnv.authenticatedContext(OWNER_A);
    await assertSucceeds(
      getDoc(doc(ctx.firestore(), `churches/${CHURCH_A}/calendar_feeds/feed_owner`)),
    );
  });

  it("Admin CAN read their own calendar feed", async () => {
    const ctx = testEnv.authenticatedContext(ADMIN_A);
    await assertSucceeds(
      getDoc(doc(ctx.firestore(), `churches/${CHURCH_A}/calendar_feeds/feed_admin`)),
    );
  });

  it("Volunteer CANNOT read another user's feed (the leaked-feed bug)", async () => {
    const ctx = testEnv.authenticatedContext(VOLUNTEER_A);
    await assertFails(
      getDoc(doc(ctx.firestore(), `churches/${CHURCH_A}/calendar_feeds/feed_owner`)),
    );
  });

  it("Admin CANNOT read the owner's feed (admin/scheduler is NOT a backdoor)", async () => {
    const ctx = testEnv.authenticatedContext(ADMIN_A);
    await assertFails(
      getDoc(doc(ctx.firestore(), `churches/${CHURCH_A}/calendar_feeds/feed_owner`)),
    );
  });

  it("Non-member CANNOT read any feed", async () => {
    const ctx = testEnv.authenticatedContext(VOLUNTEER_B);
    await assertFails(
      getDoc(doc(ctx.firestore(), `churches/${CHURCH_A}/calendar_feeds/feed_owner`)),
    );
  });

  it("Unauthenticated CANNOT read any feed", async () => {
    const ctx = testEnv.unauthenticatedContext();
    await assertFails(
      getDoc(doc(ctx.firestore(), `churches/${CHURCH_A}/calendar_feeds/feed_owner`)),
    );
  });
});

/**
 * Wave 2.2b (2026-05-28) — Assignment read lockdown at the RULE layer.
 *
 * History:
 *   Round 1 (05-15) tried cross-doc get() on the parent schedule → broke
 *   volunteer list queries (Run 2 blocker).
 *   Round 2 (05-16) reverted to "any active member reads all assignments" and
 *   hid drafts only at the app layer (a stopgap, not real enforcement).
 *   Wave 2.2b reads a DENORMALIZED `schedule_status` field off each assignment
 *   via resource.data.get('schedule_status',''), which is list-query-safe.
 *
 * The rule:
 *   allow read: if isActiveMember(churchId) && (
 *     isSchedulerOrAbove(churchId) ||
 *     resource.data.get('schedule_status','') in ['published','archived']
 *   );
 *
 * Volunteers:  may client-read only published/archived assignments. Their own
 *   draft/self_signup claims surface through the Admin SDK endpoint
 *   /api/my-schedule, NOT raw client queries. The one surviving volunteer
 *   client query (SmartCheckInBanner) constrains itself with
 *   where('schedule_status','==','published') to stay rule-legal.
 * Scheduler+: keep full read access via the isSchedulerOrAbove branch (admin
 *   pages: Service Day, Schedules, People analytics).
 */
describe("Firestore rules — assignment read lockdown (Wave 2.2b)", () => {
  // ── Case 1: volunteer list queries ──────────────────────────────────────
  it("Volunteer published-filtered LIST query succeeds (the SmartCheckInBanner pattern)", async () => {
    // A list query is allowed only when its constraints guarantee every
    // matched doc passes the rule. Filtering on schedule_status==published
    // excludes the draft/legacy docs, so the query is rule-legal.
    const ctx = testEnv.authenticatedContext(VOLUNTEER_A);
    const assignmentsRef = collection(
      ctx.firestore(),
      `churches/${CHURCH_A}/assignments`,
    );
    const q = query(
      assignmentsRef,
      where("person_id", "==", VOLUNTEER_A),
      where("schedule_status", "==", "published"),
    );
    await assertSucceeds(getDocs(q));
  });

  it("Volunteer UNFILTERED LIST query fails (would expose draft/legacy docs)", async () => {
    // Without the schedule_status constraint the query could return a_draft
    // and a_legacy, which the volunteer cannot read → whole query denied.
    // This is the core lockdown: it fails the moment someone removes the
    // client-side schedule_status filter from a volunteer-facing read.
    const ctx = testEnv.authenticatedContext(VOLUNTEER_A);
    const assignmentsRef = collection(
      ctx.firestore(),
      `churches/${CHURCH_A}/assignments`,
    );
    await assertFails(
      getDocs(query(assignmentsRef, where("person_id", "==", VOLUNTEER_A))),
    );
  });

  // ── Cases 2-3: volunteer single-get on readable statuses ─────────────────
  it("Volunteer CAN read a published assignment (single get)", async () => {
    const ctx = testEnv.authenticatedContext(VOLUNTEER_A);
    await assertSucceeds(
      getDoc(doc(ctx.firestore(), `churches/${CHURCH_A}/assignments/a1`)),
    );
  });

  it("Volunteer CAN read an archived assignment (single get)", async () => {
    const ctx = testEnv.authenticatedContext(VOLUNTEER_A);
    await assertSucceeds(
      getDoc(doc(ctx.firestore(), `churches/${CHURCH_A}/assignments/a_archived`)),
    );
  });

  // ── Cases 4-5: volunteer single-get on hidden docs ───────────────────────
  it("Volunteer CANNOT read a draft assignment (the leak this rule closes)", async () => {
    const ctx = testEnv.authenticatedContext(VOLUNTEER_A);
    await assertFails(
      getDoc(doc(ctx.firestore(), `churches/${CHURCH_A}/assignments/a_draft`)),
    );
  });

  it("Volunteer CANNOT read a legacy orphan missing schedule_status (safe default)", async () => {
    const ctx = testEnv.authenticatedContext(VOLUNTEER_A);
    await assertFails(
      getDoc(doc(ctx.firestore(), `churches/${CHURCH_A}/assignments/a_legacy`)),
    );
  });

  // ── Case 6: cross-tenant ─────────────────────────────────────────────────
  it("Volunteer in another church CANNOT read assignments (cross-tenant)", async () => {
    const ctx = testEnv.authenticatedContext(VOLUNTEER_B);
    await assertFails(
      getDoc(doc(ctx.firestore(), `churches/${CHURCH_A}/assignments/a1`)),
    );
  });

  // ── Cases 7-8: scheduler+ bypass branch ──────────────────────────────────
  it("Scheduler CAN read a draft assignment (single get — bypass branch)", async () => {
    const ctx = testEnv.authenticatedContext(SCHEDULER_A);
    await assertSucceeds(
      getDoc(doc(ctx.firestore(), `churches/${CHURCH_A}/assignments/a_draft`)),
    );
  });

  it("Admin CAN read a draft assignment (single get — bypass branch)", async () => {
    const ctx = testEnv.authenticatedContext(ADMIN_A);
    await assertSucceeds(
      getDoc(doc(ctx.firestore(), `churches/${CHURCH_A}/assignments/a_draft`)),
    );
  });

  it("Scheduler CAN read ALL assignments via unfiltered list query (bypass branch)", async () => {
    const ctx = testEnv.authenticatedContext(SCHEDULER_A);
    const assignmentsRef = collection(
      ctx.firestore(),
      `churches/${CHURCH_A}/assignments`,
    );
    await assertSucceeds(getDocs(assignmentsRef));
  });

  it("Admin CAN read ALL assignments via unfiltered list query (bypass branch)", async () => {
    const ctx = testEnv.authenticatedContext(ADMIN_A);
    const assignmentsRef = collection(
      ctx.firestore(),
      `churches/${CHURCH_A}/assignments`,
    );
    await assertSucceeds(getDocs(assignmentsRef));
  });
});

describe("Firestore rules — membership self-update (Phase 1.2 fix)", () => {
  it("scheduler CAN self-update scheduler_notification_preferences (regression: was silently rejected before the rule fix)", async () => {
    const ctx = testEnv.authenticatedContext(SCHEDULER_A);
    const ref = doc(ctx.firestore(), `memberships/${SCHEDULER_A}_${CHURCH_A}`);
    await assertSucceeds(
      updateDoc(ref, {
        scheduler_notification_preferences: {
          enabled_types: ["absence_alert"],
          channels: { standard: ["email"], urgent: ["email", "sms"] },
          ministry_scope: [],
        },
        updated_at: new Date(2026, 5, 23).toISOString(),
      }),
    );
  });

  it("scheduler CAN self-update reminder_preferences (regression coverage)", async () => {
    const ctx = testEnv.authenticatedContext(SCHEDULER_A);
    const ref = doc(ctx.firestore(), `memberships/${SCHEDULER_A}_${CHURCH_A}`);
    await assertSucceeds(
      updateDoc(ref, {
        reminder_preferences: { channels: ["none"] },
        updated_at: new Date(2026, 5, 23).toISOString(),
      }),
    );
  });

  it("scheduler CANNOT self-update role via the self-update path", async () => {
    const ctx = testEnv.authenticatedContext(SCHEDULER_A);
    const ref = doc(ctx.firestore(), `memberships/${SCHEDULER_A}_${CHURCH_A}`);
    await assertFails(
      updateDoc(ref, {
        role: "admin",
        updated_at: new Date(2026, 5, 23).toISOString(),
      }),
    );
  });

  it("different user CANNOT update someone else's scheduler_notification_preferences", async () => {
    const ctx = testEnv.authenticatedContext(VOLUNTEER_A);
    const ref = doc(ctx.firestore(), `memberships/${SCHEDULER_A}_${CHURCH_A}`);
    await assertFails(
      updateDoc(ref, {
        scheduler_notification_preferences: {
          enabled_types: [],
          channels: { standard: ["none"], urgent: ["none"] },
          ministry_scope: [],
        },
        updated_at: new Date(2026, 5, 23).toISOString(),
      }),
    );
  });
});


describe("Firestore rules — Phase 3 child private-medical isolation", () => {
  // ── Parent people doc stays volunteer-readable + free of medical data ──
  it("active volunteer CAN read a child's parent people doc", async () => {
    const ctx = testEnv.authenticatedContext(VOLUNTEER_A);
    await assertSucceeds(
      getDoc(doc(ctx.firestore(), `churches/${CHURCH_A}/people/child1`)),
    );
  });

  it("parent child doc fixture carries NO private medical keys (data hygiene)", async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const snap = await getDoc(
        doc(ctx.firestore(), `churches/${CHURCH_A}/people/child1`),
      );
      const cp = (snap.data()?.child_profile ?? {}) as Record<string, unknown>;
      expect("date_of_birth" in cp).toBe(false);
      expect("allergies" in cp).toBe(false);
      expect("medical_notes" in cp).toBe(false);
      expect("medications" in cp).toBe(false);
      expect("authorized_pickups" in cp).toBe(false);
      // Safe summary fields remain.
      expect(cp.grade).toBe("pre-k");
      expect(cp.has_alerts).toBe(true);
    });
  });

  // ── private/medical read gate ──
  it("active ordinary volunteer CANNOT read private/medical", async () => {
    const ctx = testEnv.authenticatedContext(VOLUNTEER_A);
    await assertFails(
      getDoc(
        doc(ctx.firestore(), `churches/${CHURCH_A}/people/child1/private/medical`),
      ),
    );
  });

  it("plain scheduler (no check-in role) CANNOT read private/medical", async () => {
    const ctx = testEnv.authenticatedContext(SCHEDULER_A);
    await assertFails(
      getDoc(
        doc(ctx.firestore(), `churches/${CHURCH_A}/people/child1/private/medical`),
      ),
    );
  });

  it("owner CAN read private/medical", async () => {
    const ctx = testEnv.authenticatedContext(OWNER_A);
    await assertSucceeds(
      getDoc(
        doc(ctx.firestore(), `churches/${CHURCH_A}/people/child1/private/medical`),
      ),
    );
  });

  it("admin CAN read private/medical", async () => {
    const ctx = testEnv.authenticatedContext(ADMIN_A);
    await assertSucceeds(
      getDoc(
        doc(ctx.firestore(), `churches/${CHURCH_A}/people/child1/private/medical`),
      ),
    );
  });

  it("checkin_volunteer CAN read private/medical", async () => {
    const ctx = testEnv.authenticatedContext(CHECKIN_VOL_A);
    await assertSucceeds(
      getDoc(
        doc(ctx.firestore(), `churches/${CHURCH_A}/people/child1/private/medical`),
      ),
    );
  });

  it("checkin_manager CAN read private/medical", async () => {
    const ctx = testEnv.authenticatedContext(CHECKIN_MGR_A);
    await assertSucceeds(
      getDoc(
        doc(ctx.firestore(), `churches/${CHURCH_A}/people/child1/private/medical`),
      ),
    );
  });

  it("cross-church active member CANNOT read another church's private/medical", async () => {
    const ctx = testEnv.authenticatedContext(VOLUNTEER_B);
    await assertFails(
      getDoc(
        doc(ctx.firestore(), `churches/${CHURCH_A}/people/child1/private/medical`),
      ),
    );
  });

  // ── private/medical is Admin-SDK-write-only ──
  it("even an admin CANNOT client-write private/medical (Admin-SDK only)", async () => {
    const ctx = testEnv.authenticatedContext(ADMIN_A);
    await assertFails(
      setDoc(
        doc(ctx.firestore(), `churches/${CHURCH_A}/people/child1/private/medical`),
        { allergies: "tampered" },
      ),
    );
  });

  // ── parent-write validation: no medical keys back into child_profile ──
  it("scheduler CANNOT write child_profile.medical_notes onto the parent people doc", async () => {
    const ctx = testEnv.authenticatedContext(SCHEDULER_A);
    await assertFails(
      setDoc(doc(ctx.firestore(), `churches/${CHURCH_A}/people/child2`), {
        person_type: "child",
        first_name: "Re",
        last_name: "Introduced",
        child_profile: { grade: "1st", medical_notes: "should be rejected" },
      }),
    );
  });

  it("scheduler CANNOT write child_profile.authorized_pickups onto the parent people doc", async () => {
    const ctx = testEnv.authenticatedContext(SCHEDULER_A);
    await assertFails(
      setDoc(doc(ctx.firestore(), `churches/${CHURCH_A}/people/child3`), {
        person_type: "child",
        child_profile: {
          grade: "2nd",
          authorized_pickups: [{ name: "X", phone: null, relationship: null }],
        },
      }),
    );
  });

  it("scheduler CAN write a child parent doc with only SAFE child_profile fields", async () => {
    const ctx = testEnv.authenticatedContext(SCHEDULER_A);
    await assertSucceeds(
      setDoc(doc(ctx.firestore(), `churches/${CHURCH_A}/people/child4`), {
        person_type: "child",
        first_name: "Safe",
        last_name: "Only",
        child_profile: {
          grade: "3rd",
          default_room_id: "room1",
          has_alerts: false,
          photo_url: null,
        },
      }),
    );
  });

  it("scheduler CAN write a non-child people doc with no child_profile", async () => {
    const ctx = testEnv.authenticatedContext(SCHEDULER_A);
    await assertSucceeds(
      setDoc(doc(ctx.firestore(), `churches/${CHURCH_A}/people/adult1`), {
        person_type: "adult",
        first_name: "Grown",
        last_name: "Up",
      }),
    );
  });
});
