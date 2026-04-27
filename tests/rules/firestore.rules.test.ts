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
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { setDoc, doc, getDoc } from "firebase/firestore";

const CHURCH_A = "church-a";
const CHURCH_B = "church-b";
const OWNER_A = "owner-a";
const ADMIN_A = "admin-a";
const VOLUNTEER_A = "volunteer-a";
const VOLUNTEER_B = "volunteer-b";

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
    await set(`memberships/${VOLUNTEER_B}_${CHURCH_B}`, {
      user_id: VOLUNTEER_B,
      church_id: CHURCH_B,
      role: "volunteer",
      status: "active",
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
    await set(`churches/${CHURCH_A}/ministries/m1`, { name: "Worship" });
    await set(`churches/${CHURCH_A}/services/s1`, { name: "Sunday" });
    await set(`churches/${CHURCH_A}/assignments/a1`, {
      person_id: VOLUNTEER_A,
      service_id: "s1",
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
