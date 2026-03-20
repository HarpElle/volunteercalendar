/**
 * Auto-Reschedule — finds a replacement volunteer when someone declines.
 *
 * Runs server-side (Admin SDK) inside the confirm API route.
 * Reuses the same scoring/constraint logic from the main scheduler.
 */

import { adminDb } from "@/lib/firebase/admin";
import { findBestVolunteer } from "@/lib/services/scheduler";
import type {
  Volunteer,
  Service,
  ServiceRole,
  Household,
  Assignment,
  Ministry,
} from "@/lib/types";
import { getServiceMinistries } from "@/lib/utils/service-helpers";
import type { VolunteerAssignmentCount, DraftAssignment } from "@/lib/services/scheduler";

interface DeclinedSlot {
  churchId: string;
  scheduleId: string;
  serviceId: string;
  serviceDate: string;
  ministryId: string;
  roleId: string;
  roleTitle: string;
  declinedVolunteerId: string;
}

export interface RescheduleResult {
  replaced: boolean;
  newVolunteerId?: string;
  newVolunteerName?: string;
  newVolunteerEmail?: string;
  newAssignmentId?: string;
  confirmationToken?: string;
}

/**
 * Attempt to fill a slot vacated by a declined volunteer.
 * Returns info about the replacement volunteer, or { replaced: false } if none found.
 */
export async function autoReschedule(slot: DeclinedSlot): Promise<RescheduleResult> {
  const { churchId, scheduleId, serviceId, serviceDate, ministryId, roleId, roleTitle, declinedVolunteerId } = slot;
  const churchRef = adminDb.collection("churches").doc(churchId);

  // Fetch service, all active volunteers, households, ministries, and existing assignments in parallel
  const [serviceSnap, volSnap, householdSnap, ministrySnap, assignSnap] = await Promise.all([
    churchRef.collection("services").doc(serviceId).get(),
    churchRef.collection("volunteers").where("status", "==", "active").get(),
    churchRef.collection("households").get(),
    churchRef.collection("ministries").get(),
    churchRef.collection("assignments")
      .where("schedule_id", "==", scheduleId)
      .where("status", "in", ["draft", "confirmed"])
      .get(),
  ]);

  if (!serviceSnap.exists) return { replaced: false };

  const service = { id: serviceSnap.id, ...serviceSnap.data()! } as Service;
  const volunteers: Volunteer[] = volSnap.docs
    .map((d) => ({ id: d.id, ...d.data() } as Volunteer))
    .filter((v) => v.id !== declinedVolunteerId);
  const households: Household[] = householdSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Household));
  const ministries: Ministry[] = ministrySnap.docs.map((d) => ({ id: d.id, ...d.data() } as Ministry));

  // Build existing assignment list for constraint checking
  const existingAssignments: DraftAssignment[] = assignSnap.docs.map((d) => {
    const data = d.data();
    return {
      schedule_id: data.schedule_id,
      church_id: data.church_id,
      service_id: data.service_id,
      event_id: data.event_id,
      service_date: data.service_date,
      volunteer_id: data.volunteer_id,
      role_id: data.role_id,
      role_title: data.role_title,
      ministry_id: data.ministry_id,
      status: data.status,
      signup_type: data.signup_type,
      attended: data.attended ?? null,
      attended_at: data.attended_at ?? null,
    } as DraftAssignment;
  });

  // Build assignment counts for fairness scoring
  const counts: VolunteerAssignmentCount = {};
  for (const v of volunteers) {
    counts[v.id] = { total: 0, byDate: {}, byMonth: {} };
  }
  for (const a of existingAssignments) {
    if (!counts[a.volunteer_id]) continue;
    const c = counts[a.volunteer_id];
    c.total++;
    c.byDate[a.service_date] = (c.byDate[a.service_date] || 0) + 1;
    const monthKey = a.service_date.substring(0, 7);
    c.byMonth[monthKey] = (c.byMonth[monthKey] || 0) + 1;
  }

  // Find the actual role definition (preserves pinned_volunteer_id if set)
  let role: ServiceRole = { role_id: roleId, title: roleTitle, count: 1 };
  const svcMinistries = getServiceMinistries(service);
  for (const sm of svcMinistries) {
    const found = sm.roles.find((r) => r.role_id === roleId);
    if (found) { role = found; break; }
  }

  const bestVolunteer = findBestVolunteer(
    service,
    ministryId,
    role,
    serviceDate,
    volunteers,
    households,
    existingAssignments,
    counts,
    ministries,
  );

  if (!bestVolunteer) return { replaced: false };

  // Create new assignment for the replacement volunteer
  const token = crypto.randomUUID();
  const newAssignmentData = {
    schedule_id: scheduleId,
    church_id: churchId,
    service_id: serviceId,
    event_id: null,
    service_date: serviceDate,
    volunteer_id: bestVolunteer.id,
    role_id: roleId,
    role_title: roleTitle,
    ministry_id: ministryId,
    status: "draft",
    signup_type: "scheduled",
    confirmation_token: token,
    responded_at: null,
    reminder_sent_at: [],
    attended: null,
    attended_at: null,
    auto_rescheduled: true,
    replaced_volunteer_id: declinedVolunteerId,
  };

  const ref = await churchRef.collection("assignments").add(newAssignmentData);

  return {
    replaced: true,
    newVolunteerId: bestVolunteer.id,
    newVolunteerName: bestVolunteer.name,
    newVolunteerEmail: bestVolunteer.email,
    newAssignmentId: ref.id,
    confirmationToken: token,
  };
}
