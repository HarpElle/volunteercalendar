/**
 * Classroom-oversight gate for the teacher/classroom surfaces.
 *
 * The four /api/teacher/* routes were built person-anchored: a caller
 * only sees/acts on rooms they're physically checked into as a room
 * volunteer. That's right for teachers and aides, but the people who
 * SET UP the classroom screens (and need to drop into any room) are
 * the check-in administrators — owners, admins, and members carrying
 * the `checkin_manager` permission flag.
 *
 * This helper answers "may this user oversee every classroom?" from
 * the top-level membership doc. Callers use it to bypass the
 * active-RoomVolunteerCheckIn gates; everyone else falls through to
 * the original person-anchored checks.
 */

import { adminDb } from "@/lib/firebase/admin";

export async function hasClassroomOversight(
  churchId: string,
  uid: string,
): Promise<boolean> {
  const memSnap = await adminDb.doc(`memberships/${uid}_${churchId}`).get();
  if (!memSnap.exists) return false;
  const mem = memSnap.data()!;
  if (mem.status !== "active") return false;
  return (
    mem.role === "owner" ||
    mem.role === "admin" ||
    mem.checkin_manager === true
  );
}
