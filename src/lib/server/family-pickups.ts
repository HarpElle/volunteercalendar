/**
 * Server helpers for Wave 9 P0-2 sub-PR G — parent self-service
 * pickup-list management.
 *
 * Concerns split out of the API routes so the logic can be reused
 * across GET/POST/etc.:
 *   - assertGuardianOfChild(userId, churchId, childId) → true if the
 *     caller is an adult member of any household the child belongs to.
 *     This is the AUTH primitive for the parent self-service routes
 *     (replacing the owner/admin role check used by admin routes).
 *   - listHouseholdAdults(churchId, householdIds) → all adult Person
 *     docs across the given households. Used for email fan-out (the
 *     "notify both primary guardians" requirement) and the GET endpoint
 *     to build a household-aware view.
 *   - notifyHouseholdAdults({...}) → fans out an email to every adult
 *     in the affected household(s) EXCLUDING the initiator. Uses the
 *     existing Resend infrastructure.
 *
 * Cooling-off filter used at read time:
 *   - In src/app/api/checkin/blocked-pickups (kiosk preview): not
 *     relevant — authorized-pickup list isn't displayed there.
 *   - In src/app/api/admin/checkin/household/[householdId] (admin
 *     view): we return the entries WITH their pending_remove_at field
 *     so the admin UI can render the "pending removal" badge.
 *   - In src/app/api/account/family/pickups (parent view): same —
 *     we return everything with pending markers, the UI decides what
 *     to badge.
 *
 * The actual cooling-off effect (entry filtered from reads after
 * pending_remove_at <= now) happens client-side in the renderer for
 * both admin and parent UIs. There is NO kiosk-side gate that uses
 * the authorized-pickup list for release; the security code is the
 * release primitive. So the cooling-off is purely an audit + UX
 * mechanism for guardian peace-of-mind, NOT a kiosk safety gate.
 */

import { adminDb } from "@/lib/firebase/admin";
import { resend } from "@/lib/resend";
import { log } from "@/lib/log";
import { audit, userActor } from "@/lib/server/audit";

interface ChildLookup {
  churchId: string;
  childId: string;
}

interface ChildResolution {
  childId: string;
  householdIds: string[];
  /** Child's display name (preferred / first / fallback). */
  displayName: string;
}

export class FamilyPickupsAuthError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = "FamilyPickupsAuthError";
  }
}

/**
 * Resolve a child Person doc + assert the caller is an adult member
 * of at least one of the child's households (i.e. a guardian).
 *
 * Throws FamilyPickupsAuthError with appropriate status code on
 * failure; the API route maps it to NextResponse.
 */
export async function assertGuardianOfChild({
  userId,
  churchId,
  childId,
}: ChildLookup & { userId: string }): Promise<ChildResolution> {
  // 1. Resolve the child Person doc + verify it lives in this church.
  const childRef = adminDb
    .collection("churches")
    .doc(churchId)
    .collection("people")
    .doc(childId);
  const childSnap = await childRef.get();
  if (!childSnap.exists) {
    throw new FamilyPickupsAuthError("Child not found", 404);
  }
  const child = childSnap.data() ?? {};
  if (child.church_id !== churchId) {
    throw new FamilyPickupsAuthError("Cross-tenant access denied", 403);
  }
  if (child.person_type !== "child") {
    throw new FamilyPickupsAuthError("Target person is not a child", 400);
  }
  const householdIds: string[] = Array.isArray(child.household_ids)
    ? child.household_ids
    : [];
  if (householdIds.length === 0) {
    throw new FamilyPickupsAuthError(
      "Child is not linked to any household",
      403,
    );
  }

  // 2. Verify the caller is an adult member of at least one of the
  // child's households.
  const callerSnap = await adminDb
    .collection("churches")
    .doc(churchId)
    .collection("people")
    .where("user_id", "==", userId)
    .where("person_type", "==", "adult")
    .limit(1)
    .get();
  if (callerSnap.empty) {
    throw new FamilyPickupsAuthError(
      "Caller is not registered as an adult in this church",
      403,
    );
  }
  const callerAdult = callerSnap.docs[0].data();
  const callerHouseholds: string[] = Array.isArray(callerAdult.household_ids)
    ? callerAdult.household_ids
    : [];
  const intersection = householdIds.filter((h) =>
    callerHouseholds.includes(h),
  );
  if (intersection.length === 0) {
    throw new FamilyPickupsAuthError(
      "Caller is not a guardian of this child",
      403,
    );
  }

  return {
    childId,
    householdIds,
    displayName:
      (child.preferred_name as string) ||
      (child.first_name as string) ||
      (child.name as string) ||
      "your child",
  };
}

/**
 * List all adult Person docs across a set of households. Used for
 * email fan-out + the GET endpoint's household-aware view.
 */
export async function listHouseholdAdults(
  churchId: string,
  householdIds: string[],
): Promise<
  { id: string; name: string; email: string | null; user_id: string | null }[]
> {
  if (householdIds.length === 0) return [];
  // Firestore `array-contains-any` is capped at 30 values; well above
  // typical N.
  const snap = await adminDb
    .collection("churches")
    .doc(churchId)
    .collection("people")
    .where("person_type", "==", "adult")
    .where("household_ids", "array-contains-any", householdIds.slice(0, 30))
    .get();
  return snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      name:
        (data.preferred_name as string) ||
        (data.first_name as string) ||
        (data.name as string) ||
        "Guardian",
      email: (data.email as string) || null,
      user_id: (data.user_id as string) || null,
    };
  });
}

/**
 * Email fan-out for parent-initiated pickup-list changes.
 *
 * Sends to every adult guardian in the affected household(s)
 * EXCLUDING the initiator (they don't need an email about an action
 * they just took). Uses the existing Resend integration directly
 * (not the outbox) — these are real-time safety notifications and
 * eventual delivery via the cron is good enough but not necessary
 * for the v1 ship.
 *
 * Each recipient delivery is its own audit row
 * (`pickup.authorized_parent_change_notified`) for traceability.
 */
export async function notifyHouseholdAdults({
  churchId,
  householdIds,
  initiatorUserId,
  subject,
  bodyText,
  actionContext,
}: {
  churchId: string;
  householdIds: string[];
  initiatorUserId: string;
  subject: string;
  bodyText: string;
  /** Free-form metadata included in each audit row (e.g. child_id, pickup_id, action). */
  actionContext: Record<string, unknown>;
}): Promise<{ attempted: number; sent: number; failed: number }> {
  const adults = await listHouseholdAdults(churchId, householdIds);
  const recipients = adults.filter(
    (a) => a.email && a.user_id !== initiatorUserId,
  );

  if (recipients.length === 0) {
    return { attempted: 0, sent: 0, failed: 0 };
  }

  const fromAddress =
    process.env.RESEND_FROM_ADDRESS ?? "VolunteerCal <noreply@harpelle.com>";

  const results = await Promise.allSettled(
    recipients.map(async (r) => {
      try {
        await resend.emails.send({
          from: fromAddress,
          to: r.email!,
          subject,
          text: bodyText,
        });
        void audit({
          church_id: churchId,
          actor: userActor(initiatorUserId),
          action: "pickup.authorized_parent_change_notified",
          target_type: "person",
          target_id: r.id,
          metadata: { ...actionContext, recipient_role: "adult_guardian" },
          outcome: "ok",
        });
        return true;
      } catch (err) {
        log.error("[family-pickups notify] send failed", {
          error: err,
          recipient_id: r.id,
        });
        void audit({
          church_id: churchId,
          actor: userActor(initiatorUserId),
          action: "pickup.authorized_parent_change_notified",
          target_type: "person",
          target_id: r.id,
          metadata: {
            ...actionContext,
            recipient_role: "adult_guardian",
            failure: true,
          },
          outcome: "failed",
        });
        return false;
      }
    }),
  );

  const sent = results.filter((r) => r.status === "fulfilled" && r.value)
    .length;
  return {
    attempted: recipients.length,
    sent,
    failed: recipients.length - sent,
  };
}

/**
 * 24h ahead in ISO; the cooling-off duration is locked in code
 * (not configurable per-org) for v1 to keep the safety primitive
 * predictable. A future enhancement could surface it as a
 * CheckInSettings field.
 */
export function coolingOffEffectiveAt(): string {
  return new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
}
