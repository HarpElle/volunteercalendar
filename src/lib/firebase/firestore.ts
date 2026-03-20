import {
  collection,
  doc,
  addDoc,
  setDoc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  type DocumentData,
  type QueryConstraint,
} from "firebase/firestore";
import { db } from "./config";

/** Get a reference to a top-level collection */
export function getCollection(path: string) {
  return collection(db, path);
}

/** Get a reference to a church subcollection: churches/{churchId}/{subcollection} */
export function getChurchCollection(churchId: string, subcollection: string) {
  return collection(db, "churches", churchId, subcollection);
}

/** Add a document to a collection */
export async function addDocument(collectionPath: string, data: DocumentData) {
  const ref = collection(db, collectionPath);
  return addDoc(ref, data);
}

/** Add a document to a church subcollection */
export async function addChurchDocument(
  churchId: string,
  subcollection: string,
  data: DocumentData,
) {
  const ref = collection(db, "churches", churchId, subcollection);
  return addDoc(ref, data);
}

/** Set a document with a specific ID (create or overwrite) */
export async function setDocument(collectionPath: string, docId: string, data: DocumentData) {
  return setDoc(doc(db, collectionPath, docId), data);
}

/** Get a single document by path */
export async function getDocument(path: string, docId: string) {
  const snap = await getDoc(doc(db, path, docId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}

/** Get all documents in a church subcollection */
export async function getChurchDocuments(
  churchId: string,
  subcollection: string,
  ...constraints: QueryConstraint[]
) {
  const ref = collection(db, "churches", churchId, subcollection);
  const q = constraints.length > 0 ? query(ref, ...constraints) : query(ref);
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/** Update a church subcollection document */
export async function updateChurchDocument(
  churchId: string,
  subcollection: string,
  docId: string,
  data: Partial<DocumentData>,
) {
  return updateDoc(doc(db, "churches", churchId, subcollection, docId), data);
}

/** Delete a church subcollection document */
export async function removeChurchDocument(
  churchId: string,
  subcollection: string,
  docId: string,
) {
  return deleteDoc(doc(db, "churches", churchId, subcollection, docId));
}

/** Query documents with constraints */
export async function queryDocuments(
  collectionPath: string,
  ...constraints: QueryConstraint[]
) {
  const q = query(collection(db, collectionPath), ...constraints);
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/** Update a document */
export async function updateDocument(
  path: string,
  docId: string,
  data: Partial<DocumentData>,
) {
  return updateDoc(doc(db, path, docId), data);
}

/** Delete a document */
export async function removeDocument(path: string, docId: string) {
  return deleteDoc(doc(db, path, docId));
}

// --- Membership helpers (top-level "memberships" collection) ---

import type { Membership, OrgRole, MembershipStatus, ReminderChannel, EventSignup } from "@/lib/types";

const MEMBERSHIPS = "memberships";

/**
 * Deterministic membership doc ID: `{userId}_{churchId}`.
 * This allows Firestore security rules to `get()` a membership without querying.
 */
export function membershipDocId(userId: string, churchId: string): string {
  return `${userId}_${churchId}`;
}

/** Create a new membership document with deterministic ID. Returns the doc ID. */
export async function createMembership(data: Omit<Membership, "id">): Promise<string> {
  const docId = membershipDocId(data.user_id, data.church_id);
  await setDoc(doc(db, MEMBERSHIPS, docId), data);
  return docId;
}

/** Get a single membership by ID. */
export async function getMembership(membershipId: string): Promise<Membership | null> {
  const snap = await getDoc(doc(db, MEMBERSHIPS, membershipId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as Membership;
}

/** Get all memberships for a given user. */
export async function getUserMemberships(userId: string): Promise<Membership[]> {
  const q = query(collection(db, MEMBERSHIPS), where("user_id", "==", userId));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Membership);
}

/** Get all memberships for a given church (for admin member management). */
export async function getChurchMemberships(churchId: string): Promise<Membership[]> {
  const q = query(collection(db, MEMBERSHIPS), where("church_id", "==", churchId));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Membership);
}

/** Update a membership's status (e.g., accept invite, approve volunteer). */
export async function updateMembershipStatus(
  membershipId: string,
  status: MembershipStatus,
): Promise<void> {
  await updateDoc(doc(db, MEMBERSHIPS, membershipId), {
    status,
    updated_at: new Date().toISOString(),
  });
}

/** Update a membership's role. */
export async function updateMembershipRole(
  membershipId: string,
  role: OrgRole,
  ministryScope?: string[],
): Promise<void> {
  const data: Record<string, unknown> = {
    role,
    updated_at: new Date().toISOString(),
  };
  if (ministryScope !== undefined) {
    data.ministry_scope = ministryScope;
  }
  await updateDoc(doc(db, MEMBERSHIPS, membershipId), data);
}

/** Update a membership's reminder preferences. */
export async function updateMembershipReminders(
  membershipId: string,
  channels: ReminderChannel[],
): Promise<void> {
  await updateDoc(doc(db, MEMBERSHIPS, membershipId), {
    reminder_preferences: { channels },
    updated_at: new Date().toISOString(),
  });
}

/** Link a membership to a volunteer record. */
export async function linkMembershipToVolunteer(
  membershipId: string,
  volunteerId: string,
): Promise<void> {
  await updateDoc(doc(db, MEMBERSHIPS, membershipId), {
    volunteer_id: volunteerId,
    updated_at: new Date().toISOString(),
  });
}

/** Delete a membership (remove member from org). */
export async function deleteMembership(membershipId: string): Promise<void> {
  await deleteDoc(doc(db, MEMBERSHIPS, membershipId));
}

// --- Event Signup helpers (top-level "event_signups" collection) ---

const EVENT_SIGNUPS = "event_signups";

/** Create an event signup. Returns the doc ID. */
export async function createEventSignup(data: Omit<EventSignup, "id">): Promise<string> {
  const ref = await addDoc(collection(db, EVENT_SIGNUPS), data);
  return ref.id;
}

/** Get all signups for a specific event. churchId is required for Firestore security rules. */
export async function getEventSignups(eventId: string, churchId: string): Promise<EventSignup[]> {
  const q = query(
    collection(db, EVENT_SIGNUPS),
    where("event_id", "==", eventId),
    where("church_id", "==", churchId),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as EventSignup);
}

/** Get signups by a specific user across all events. */
export async function getUserEventSignups(userId: string): Promise<EventSignup[]> {
  const q = query(collection(db, EVENT_SIGNUPS), where("user_id", "==", userId));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as EventSignup);
}

/** Cancel an event signup. */
export async function cancelEventSignup(signupId: string): Promise<void> {
  await updateDoc(doc(db, EVENT_SIGNUPS, signupId), {
    status: "cancelled",
  });
}

/** Delete an event signup (admin removal). */
export async function deleteEventSignup(signupId: string): Promise<void> {
  await deleteDoc(doc(db, EVENT_SIGNUPS, signupId));
}

/** Mark attendance for an event signup. */
export async function updateSignupAttendance(
  signupId: string,
  attended: boolean,
): Promise<void> {
  await updateDoc(doc(db, EVENT_SIGNUPS, signupId), {
    attended,
    attended_at: new Date().toISOString(),
  });
}

/** Mark attendance for a service assignment. */
export async function updateAssignmentAttendance(
  churchId: string,
  assignmentId: string,
  attended: boolean,
): Promise<void> {
  await updateDoc(
    doc(db, "churches", churchId, "assignments", assignmentId),
    {
      attended,
      attended_at: new Date().toISOString(),
    },
  );
}

/** Get assignments for a specific service on a specific date. */
export async function getServiceAssignments(
  churchId: string,
  serviceId: string,
  serviceDate: string,
): Promise<import("@/lib/types").Assignment[]> {
  const q = query(
    collection(db, "churches", churchId, "assignments"),
    where("service_id", "==", serviceId),
    where("service_date", "==", serviceDate),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as import("@/lib/types").Assignment);
}

export { where, orderBy, limit };
