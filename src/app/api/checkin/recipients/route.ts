/**
 * POST /api/checkin/recipients
 *
 * Wave 10 W10-1. Returns the available pickup recipients for a
 * household + child set. Used by the kiosk recipient-selection
 * screen between allergy confirmation and final check-in submit.
 *
 * Body: { church_id, household_id, child_ids: string[] }
 *
 * Returns:
 *   {
 *     recipients: Array<{
 *       id, name, phone, source, ref_id?
 *     }>,
 *     primary_guardian: { name, phone_masked } | null
 *   }
 *
 * The list combines:
 *   - Household adults (from Person docs with person_type=adult linked
 *     to the household) — typically Mom, Dad, older sibling
 *   - Authorized pickups (from each child's ChildProfile.authorized_pickups)
 *     across the selected children, deduped by phone so siblings sharing
 *     a contact list don't surface duplicates
 *
 * Primary guardian is returned separately so the kiosk UI can render
 * it as a "always notified" badge (per Jason 2026-06-01 decision:
 * primary + selected, deduped by phone).
 *
 * Auth: kiosk token with "checkin" scope.
 *
 * Path-pattern note: flat (no dynamic segments) per the Next.js 16
 * bundler-bug workaround established in P0-2.
 */

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { rateLimit } from "@/lib/utils/rate-limit";
import {
  assertKioskChurchMatch,
  requireKioskToken,
} from "@/lib/server/authz";
import { requireModuleTier } from "@/lib/server/require-module-tier";
import { log } from "@/lib/log";
import { getChildPrivateMedical } from "@/lib/server/child-medical";
import type { PersonAuthorizedPickup } from "@/lib/types";

interface PostBody {
  church_id?: unknown;
  household_id?: unknown;
  child_ids?: unknown;
}

interface RecipientOption {
  id: string;
  name: string;
  phone: string | null;
  source: "household_adult" | "authorized_pickup";
  ref_id: string;
  /** For authorized_pickup: the child this entry belongs to, OR null
   *  when the pickup is household-scope (applies to every child). The
   *  UI can show "Grandma (Sarah's contact)" for per-child entries and
   *  "Grandma (household-wide)" for the null case. */
  child_id?: string | null;
  /** For authorized_pickup: photo if uploaded (visual confirmation). */
  photo_url?: string | null;
}

/**
 * Normalize a phone for dedup. Strips formatting + keeps E.164-ish
 * digits. Two recipients with the same normalized phone collapse
 * into one (the FIRST entry wins; subsequent duplicates are dropped).
 */
function normalizePhoneForDedup(phone: string | null | undefined): string {
  if (!phone) return "";
  return phone.replace(/[^0-9+]/g, "");
}

export async function POST(req: NextRequest) {
  const kiosk = await requireKioskToken(req, "checkin");
  if (kiosk instanceof NextResponse) return kiosk;

  const limited = rateLimit(req, { limit: 30, windowMs: 60_000 });
  if (limited) return limited;

  try {
    const gate = await requireModuleTier(req, "checkin", {
      churchIdFrom: "body",
      allowAnonymous: true,
    });
    if (!gate.ok) return gate.response;
    const { churchId } = gate.ctx;

    const body = (await req.json()) as PostBody;
    const churchIdFromBody =
      typeof body.church_id === "string" ? body.church_id.trim() : "";
    const householdId =
      typeof body.household_id === "string" ? body.household_id.trim() : "";
    const childIds: string[] = Array.isArray(body.child_ids)
      ? body.child_ids.filter((id): id is string => typeof id === "string")
      : [];

    if (!churchIdFromBody || !householdId) {
      return NextResponse.json(
        { error: "Missing church_id or household_id" },
        { status: 400 },
      );
    }

    const churchMismatch = assertKioskChurchMatch(kiosk, churchIdFromBody);
    if (churchMismatch) return churchMismatch;

    const churchRef = adminDb.collection("churches").doc(churchId);

    // 1. Find adult Person docs in this household (Pro-tier unified
    //    households). Falls through to empty array for legacy-shape
    //    households — those rely on the legacy "primary guardian" SMS.
    const adultsSnap = await churchRef
      .collection("people")
      .where("person_type", "==", "adult")
      .where("household_ids", "array-contains", householdId)
      .get();

    // Codex W10-1 Sev 3: resolve primary guardian FIRST (from
    // household.primary_guardian_id), then exclude their entry from
    // the toggleable recipient list. Prior implementation pushed
    // them in via first-write-wins, which surfaced them both in the
    // sage "✓ Auto" card AND as a toggleable card below — the same
    // person rendered twice in the kiosk picker.
    let primaryRefId: string | null = null;
    if (childIds.length > 0) {
      const hhSnap = await churchRef
        .collection("households")
        .doc(householdId)
        .get();
      primaryRefId = hhSnap.exists
        ? ((hhSnap.data()?.primary_guardian_id as string | null) ?? null)
        : null;
    }

    let primaryGuardianName: string | null = null;
    let primaryGuardianPhoneMasked: string | null = null;
    const recipients: RecipientOption[] = [];
    const phoneSeen = new Set<string>();

    for (const doc of adultsSnap.docs) {
      const data = doc.data() ?? {};
      const name =
        (data.preferred_name as string) ||
        (data.first_name as string) ||
        (data.name as string) ||
        "Adult";
      const phone = (data.phone as string) || null;

      // Primary guardian: surface in the dedicated "always-notified"
      // card and DO NOT include in the toggleable recipients list.
      // Also reserve their normalized phone in the dedup set so a
      // sibling-pickup entry with the same number can't surface as a
      // separate toggleable.
      if (primaryRefId && doc.id === primaryRefId) {
        primaryGuardianName = name;
        primaryGuardianPhoneMasked = phone ? `***${phone.slice(-4)}` : null;
        const normalized = normalizePhoneForDedup(phone);
        if (normalized) phoneSeen.add(normalized);
        continue;
      }

      const normalized = normalizePhoneForDedup(phone);
      if (normalized && phoneSeen.has(normalized)) continue;
      if (normalized) phoneSeen.add(normalized);

      // Fallback primary identification when the household doc has no
      // primary_guardian_id (legacy / partially-migrated households).
      // First-adult-wins matches the existing checkin/lookup behavior.
      // In this branch the adult IS added to the recipients list — the
      // operator can still tap them; but we mark them as the
      // always-notified primary so the UI renders the badge.
      if (!primaryRefId && !primaryGuardianName) {
        primaryGuardianName = name;
        primaryGuardianPhoneMasked = phone
          ? `***${phone.slice(-4)}`
          : null;
      }

      recipients.push({
        id: `adult:${doc.id}`,
        name,
        phone,
        source: "household_adult",
        ref_id: doc.id,
      });
    }

    // 2. Household-wide authorized pickups (2026-06-03). Surfaced
    //    BEFORE per-child pickups so dedup keeps the household-scope
    //    entry as the canonical one. The household scope was added so
    //    admins don't have to re-add the same authorized adult to
    //    every child.
    if (householdId) {
      const hhSnap2 = await churchRef
        .collection("households")
        .doc(householdId)
        .get();
      if (hhSnap2.exists) {
        const hhData2 = hhSnap2.data() ?? {};
        if (hhData2.church_id === churchId) {
          const hhPickups: PersonAuthorizedPickup[] = Array.isArray(
            hhData2.authorized_pickups,
          )
            ? (hhData2.authorized_pickups as PersonAuthorizedPickup[])
            : [];
          const now = Date.now();
          for (const p of hhPickups) {
            if (p.pending_remove_at) {
              const t = Date.parse(p.pending_remove_at);
              if (!Number.isNaN(t) && t <= now) continue;
            }
            const normalized = normalizePhoneForDedup(p.phone);
            if (normalized && phoneSeen.has(normalized)) continue;
            if (normalized) phoneSeen.add(normalized);

            recipients.push({
              id: `pickup:household:${householdId}:${
                p.id ?? `${p.name}-${p.phone}`
              }`,
              name: p.name,
              phone: p.phone ?? null,
              source: "authorized_pickup",
              ref_id: p.id ?? "",
              // child_id null = household-scope (applies to every child).
              child_id: null,
              photo_url: p.photo_url ?? null,
            });
          }
        }
      }
    }

    // 3. For each child, surface their authorized_pickups (filtered for
    //    elapsed pending-removal entries — same filter as the parent
    //    self-service page). Deduped against adults + household pickups
    //    already added.
    for (const childId of childIds) {
      const childSnap = await churchRef
        .collection("people")
        .doc(childId)
        .get();
      if (!childSnap.exists) continue;
      const childData = childSnap.data() ?? {};
      if (childData.church_id !== churchId) continue;
      // Phase 3: authorized_pickups lives in the private medical subdoc.
      const medical = await getChildPrivateMedical(churchRef, childId);
      const pickups = medical.authorized_pickups;
      const now = Date.now();
      for (const p of pickups) {
        // Same elapsed-pending filter as the parent surface (P0-2 G).
        if (p.pending_remove_at) {
          const t = Date.parse(p.pending_remove_at);
          if (!Number.isNaN(t) && t <= now) continue;
        }
        const normalized = normalizePhoneForDedup(p.phone);
        if (normalized && phoneSeen.has(normalized)) continue;
        if (normalized) phoneSeen.add(normalized);

        recipients.push({
          id: `pickup:${childId}:${p.id ?? `${p.name}-${p.phone}`}`,
          name: p.name,
          phone: p.phone ?? null,
          source: "authorized_pickup",
          ref_id: p.id ?? "",
          child_id: childId,
          photo_url: p.photo_url ?? null,
        });
      }
    }

    return NextResponse.json({
      primary_guardian:
        primaryGuardianName !== null
          ? {
              name: primaryGuardianName,
              phone_masked: primaryGuardianPhoneMasked,
            }
          : null,
      recipients,
    });
  } catch (error) {
    log.error("[POST /api/checkin/recipients]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
