/**
 * Data access layer for the unified `people` collection.
 *
 * All functions read from `churches/{churchId}/people` using the
 * Firebase v9 modular SDK. Used by the scheduling page, check-in kiosk,
 * admin views, and calendar feeds.
 */

import {
  collection,
  query,
  where,
  getDocs,
  getDoc,
  doc,
  orderBy,
  limit,
  startAt,
  endAt,
} from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import type { Person, UnifiedHousehold } from "@/lib/types";

// ─── Scheduling Queries ────────────────────────────────────────────────────

/** Get all active volunteers in a specific ministry. */
export async function getVolunteersForMinistry(
  churchId: string,
  ministryId: string,
): Promise<Person[]> {
  const q = query(
    collection(db, "churches", churchId, "people"),
    where("is_volunteer", "==", true),
    where("status", "==", "active"),
    where("ministry_ids", "array-contains", ministryId),
  );
  return (await getDocs(q)).docs.map((d) => ({ ...d.data(), id: d.id }) as Person);
}

/** Get all active volunteers (no ministry filter). */
export async function getAllActiveVolunteers(churchId: string): Promise<Person[]> {
  const q = query(
    collection(db, "churches", churchId, "people"),
    where("is_volunteer", "==", true),
    where("status", "==", "active"),
  );
  return (await getDocs(q)).docs.map((d) => ({ ...d.data(), id: d.id }) as Person);
}

// ─── Check-In Kiosk Queries ───────────────────────────────────────────────

/**
 * Find a family by phone number (digits-only search).
 * Returns the matched household and all family members.
 */
export async function getFamilyByPhone(
  churchId: string,
  rawPhone: string,
): Promise<{ household: UnifiedHousehold | null; people: Person[] }> {
  const searchPhone = rawPhone.replace(/\D/g, "");
  if (!searchPhone) return { household: null, people: [] };

  const pQ = query(
    collection(db, "churches", churchId, "people"),
    where("search_phones", "array-contains", searchPhone),
    limit(1),
  );
  const pSnap = await getDocs(pQ);
  if (pSnap.empty) return { household: null, people: [] };

  const foundPerson = { ...pSnap.docs[0].data(), id: pSnap.docs[0].id } as Person;
  const householdId = foundPerson.household_ids[0];
  if (!householdId) return { household: null, people: [foundPerson] };

  // Parallel fetch: all family members + household doc
  const [peopleSnap, hhSnap] = await Promise.all([
    getDocs(
      query(
        collection(db, "churches", churchId, "people"),
        where("household_ids", "array-contains", householdId),
      ),
    ),
    getDoc(doc(db, "churches", churchId, "households", householdId)),
  ]);

  return {
    household: hhSnap.exists()
      ? ({ ...hhSnap.data(), id: hhSnap.id } as UnifiedHousehold)
      : null,
    people: peopleSnap.docs.map((d) => ({ ...d.data(), id: d.id }) as Person),
  };
}

/**
 * Find a family by QR token.
 * Searches people collection for a matching qr_token, then expands to household.
 */
export async function getFamilyByQrToken(
  churchId: string,
  qrToken: string,
): Promise<{ household: UnifiedHousehold | null; people: Person[] }> {
  // First try: person-level QR token
  const pQ = query(
    collection(db, "churches", churchId, "people"),
    where("qr_token", "==", qrToken),
    limit(1),
  );
  const pSnap = await getDocs(pQ);

  if (pSnap.empty) {
    // Fallback: household-level QR token
    const hhQ = query(
      collection(db, "churches", churchId, "households"),
      where("qr_token", "==", qrToken),
      limit(1),
    );
    const hhSnap = await getDocs(hhQ);
    if (hhSnap.empty) return { household: null, people: [] };

    const household = { ...hhSnap.docs[0].data(), id: hhSnap.docs[0].id } as UnifiedHousehold;
    const familySnap = await getDocs(
      query(
        collection(db, "churches", churchId, "people"),
        where("household_ids", "array-contains", household.id),
      ),
    );
    return {
      household,
      people: familySnap.docs.map((d) => ({ ...d.data(), id: d.id }) as Person),
    };
  }

  const foundPerson = { ...pSnap.docs[0].data(), id: pSnap.docs[0].id } as Person;
  const householdId = foundPerson.household_ids[0];
  if (!householdId) return { household: null, people: [foundPerson] };

  const [familySnap, hhSnap] = await Promise.all([
    getDocs(
      query(
        collection(db, "churches", churchId, "people"),
        where("household_ids", "array-contains", householdId),
      ),
    ),
    getDoc(doc(db, "churches", churchId, "households", householdId)),
  ]);

  return {
    household: hhSnap.exists()
      ? ({ ...hhSnap.data(), id: hhSnap.id } as UnifiedHousehold)
      : null,
    people: familySnap.docs.map((d) => ({ ...d.data(), id: d.id }) as Person),
  };
}

/**
 * Search for families by name prefix.
 * Returns adult matches + their household members (children).
 */
export async function getFamilyByName(
  churchId: string,
  searchInput: string,
): Promise<Person[]> {
  const qStr = searchInput.toLowerCase().trim();
  if (!qStr) return [];

  const nameQ = query(
    collection(db, "churches", churchId, "people"),
    where("person_type", "==", "adult"),
    orderBy("search_name"),
    startAt(qStr),
    endAt(qStr + "\uf8ff"),
    limit(10),
  );
  const nameSnap = await getDocs(nameQ);
  if (nameSnap.empty) return [];

  const adults = nameSnap.docs.map((d) => ({ ...d.data(), id: d.id }) as Person);
  const householdIds = [
    ...new Set(adults.flatMap((a) => a.household_ids)),
  ];

  if (householdIds.length === 0) return adults;

  // Firestore array-contains-any limit is 30 — safe since we limit to 10 adults
  const familyQ = query(
    collection(db, "churches", churchId, "people"),
    where("household_ids", "array-contains-any", householdIds.slice(0, 10)),
  );
  return (await getDocs(familyQ)).docs.map((d) => ({ ...d.data(), id: d.id }) as Person);
}

// ─── Admin Queries ─────────────────────────────────────────────────────────

/** Get all people with optional filters. */
export async function getAllPeople(
  churchId: string,
  filters?: {
    type?: "adult" | "child";
    volunteersOnly?: boolean;
    status?: string;
  },
): Promise<Person[]> {
  const constraints = [];

  if (filters?.type) {
    constraints.push(where("person_type", "==", filters.type));
  }
  if (filters?.volunteersOnly) {
    constraints.push(where("is_volunteer", "==", true));
  }
  if (filters?.status) {
    constraints.push(where("status", "==", filters.status));
  }

  const q = query(collection(db, "churches", churchId, "people"), ...constraints);
  return (await getDocs(q)).docs.map((d) => ({ ...d.data(), id: d.id }) as Person);
}

/** Get a single person by ID. */
export async function getPersonById(
  churchId: string,
  personId: string,
): Promise<Person | null> {
  const snap = await getDoc(doc(db, "churches", churchId, "people", personId));
  return snap.exists() ? ({ ...snap.data(), id: snap.id } as Person) : null;
}

// ─── Assignment Queries ────────────────────────────────────────────────────

/**
 * Get assignments for a person by person_id.
 */
export async function getAssignmentsForPerson(
  churchId: string,
  personId: string,
) {
  // Query by person_id (new)
  let q = query(
    collection(db, "churches", churchId, "assignments"),
    where("person_id", "==", personId),
  );
  let snap = await getDocs(q);

  // Fallback: query by volunteer_id (legacy)
  if (snap.empty) {
    q = query(
      collection(db, "churches", churchId, "assignments"),
      where("volunteer_id", "==", personId),
    );
    snap = await getDocs(q);
  }

  return snap.docs.map((d) => ({ ...d.data(), id: d.id }));
}

// ─── Household Queries ─────────────────────────────────────────────────────

/** Get a single unified household by ID. */
export async function getHouseholdById(
  churchId: string,
  householdId: string,
): Promise<UnifiedHousehold | null> {
  const snap = await getDoc(doc(db, "churches", churchId, "households", householdId));
  return snap.exists() ? ({ ...snap.data(), id: snap.id } as UnifiedHousehold) : null;
}

/** Get all unified households for a church. */
export async function getAllHouseholds(
  churchId: string,
): Promise<UnifiedHousehold[]> {
  const snap = await getDocs(collection(db, "churches", churchId, "households"));
  return snap.docs.map((d) => ({ ...d.data(), id: d.id }) as UnifiedHousehold);
}
