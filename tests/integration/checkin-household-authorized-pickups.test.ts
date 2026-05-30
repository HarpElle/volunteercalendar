/**
 * Wave 9 P0-2 sub-PR D — household detail GET now surfaces each child's
 * `authorized_pickups` in the API response so the admin UI can render
 * the per-child panel from one fetch.
 *
 * This file locks the contract in. The household GET is the
 * data-source for the AuthorizedPickupPanel mounted in
 * /dashboard/checkin/households/[id].
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

import { NextRequest } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { GET as HOUSEHOLD_GET } from "@/app/api/admin/checkin/household/[householdId]/route";
import { GET as CHILDREN_GET } from "@/app/api/admin/checkin/children/route";
import { resetFirestore, seedChurchAndMemberships, T } from "./_seed";

const HOUSEHOLD_ID = "h-pickups";
const CHILD_A = "child-a";
const CHILD_B_NO_PICKUPS = "child-b";

beforeEach(async () => {
  await resetFirestore(adminDb);
  await seedChurchAndMemberships(adminDb);

  // Household.
  await adminDb
    .collection(`churches/${T.churchId}/households`)
    .doc(HOUSEHOLD_ID)
    .set({
      id: HOUSEHOLD_ID,
      church_id: T.churchId,
      name: "The Test Family",
      primary_guardian_id: null,
      qr_token: null,
      constraints: {
        never_same_service: false,
        prefer_same_service: false,
        never_same_time: false,
      },
      notes: null,
      imported_from: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

  // Child A with two existing authorized-pickup contacts (one legacy
  // record without an `id` — exercising the back-compat code path).
  await adminDb
    .collection(`churches/${T.churchId}/people`)
    .doc(CHILD_A)
    .set({
      id: CHILD_A,
      church_id: T.churchId,
      household_ids: [HOUSEHOLD_ID],
      person_type: "child",
      first_name: "Aaron",
      last_name: "Test",
      preferred_name: null,
      name: "Aaron Test",
      status: "active",
      child_profile: {
        date_of_birth: null,
        grade: null,
        allergies: null,
        medical_notes: null,
        default_room_id: null,
        has_alerts: false,
        photo_url: null,
        authorized_pickups: [
          {
            id: "p-legacy-noid",
            name: "Grandma Sue",
            phone: "+15555550100",
            relationship: "grandmother",
            photo_url: null,
            added_at: new Date().toISOString(),
            added_by_user_id: T.adminUid,
          },
          {
            name: "Neighbor John", // truly legacy — no id, no extended fields
            phone: null,
            relationship: "neighbor",
          },
        ],
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

  // Child B with NO authorized pickups (must surface as []).
  await adminDb
    .collection(`churches/${T.churchId}/people`)
    .doc(CHILD_B_NO_PICKUPS)
    .set({
      id: CHILD_B_NO_PICKUPS,
      church_id: T.churchId,
      household_ids: [HOUSEHOLD_ID],
      person_type: "child",
      first_name: "Bree",
      last_name: "Test",
      preferred_name: null,
      name: "Bree Test",
      status: "active",
      child_profile: {
        date_of_birth: null,
        grade: null,
        allergies: null,
        medical_notes: null,
        default_room_id: null,
        has_alerts: false,
        photo_url: null,
        // authorized_pickups intentionally omitted — must surface as [].
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
});

function authedReq(url: string, token: string): NextRequest {
  return new NextRequest(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
  });
}

describe("GET /api/admin/checkin/household/[householdId] surfaces authorized_pickups", () => {
  it("returns authorized_pickups array on each child", async () => {
    const res = await HOUSEHOLD_GET(
      authedReq(
        `https://test/api/admin/checkin/household/${HOUSEHOLD_ID}?church_id=${T.churchId}`,
        T.adminUid,
      ),
      { params: Promise.resolve({ householdId: HOUSEHOLD_ID }) },
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    const childA = json.children.find(
      (c: { id: string }) => c.id === CHILD_A,
    );
    const childB = json.children.find(
      (c: { id: string }) => c.id === CHILD_B_NO_PICKUPS,
    );
    expect(childA.authorized_pickups).toHaveLength(2);
    expect(childA.authorized_pickups[0].name).toBe("Grandma Sue");
    expect(childA.authorized_pickups[1].name).toBe("Neighbor John");
    // Missing authorized_pickups on the underlying doc surfaces as [].
    expect(childB.authorized_pickups).toEqual([]);
  });
});

describe("GET /api/admin/checkin/children surfaces authorized_pickups", () => {
  it("returns authorized_pickups for the unified people collection", async () => {
    const res = await CHILDREN_GET(
      authedReq(
        `https://test/api/admin/checkin/children?church_id=${T.churchId}&household_id=${HOUSEHOLD_ID}`,
        T.adminUid,
      ),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    const childA = json.children.find(
      (c: { id: string }) => c.id === CHILD_A,
    );
    expect(childA.authorized_pickups).toHaveLength(2);
  });
});
