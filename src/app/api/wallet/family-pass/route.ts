/**
 * GET /api/wallet/family-pass?c=<church>&h=<household>&exp=<unix>&sig=<hmac>
 *
 * Wave 10 W10-5A. Streams back the signed `.pkpass` binary for a
 * household. The URL must have been minted by
 * `POST /api/wallet/family-pass/url` (see header there for the
 * rationale on the two-step auth flow).
 *
 * Returns:
 *   - 200 with `Content-Type: application/vnd.apple.pkpass` and
 *     `Content-Disposition: attachment; filename="family.pkpass"`
 *     — iOS Safari sees the MIME type and shows the "Add to Apple
 *     Wallet" sheet automatically.
 *   - 401/403 — signed URL missing / expired / tampered.
 *   - 404 — household doesn't exist in this church.
 *   - 500 — pass building or signing failed (almost always means
 *     the APPLE_PASSKIT_* env vars are misconfigured).
 */

import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { rateLimit } from "@/lib/utils/rate-limit";
import {
  buildFamilyPassBuffer,
  type FamilyPassChild,
} from "@/lib/server/wallet-pass/builder";
import { verifyFamilyPassUrl } from "@/lib/server/wallet-pass/sign-url";
import { getBaseUrl } from "@/lib/utils/base-url";
import { audit, SYSTEM_ACTOR } from "@/lib/server/audit";
import { randomBytes } from "crypto";
import { log } from "@/lib/log";
import { extractSurname, formatHouseholdDisplay } from "@/lib/utils/name";

// Age proxy for wallet-pass child ordering. Mirrors the grade
// progression used by the annual grade-rollover cron — 6th-grader is
// rank 9 (oldest), nursery is rank 0 (youngest). Null / unknown
// grades return -1 so they sort to the bottom.
function gradeAgeRank(grade: string | null | undefined): number {
  if (!grade) return -1;
  const order = [
    "nursery",
    "toddler",
    "pre-k",
    "kindergarten",
    "1st",
    "2nd",
    "3rd",
    "4th",
    "5th",
    "6th",
    "7th",
  ];
  const idx = order.indexOf(grade);
  return idx === -1 ? -1 : idx;
}
import type { Person, WalletPass } from "@/lib/types";

// Apple's official MIME type for .pkpass bundles. iOS Safari uses
// this to trigger the "Add to Apple Wallet" sheet.
const PKPASS_MIME = "application/vnd.apple.pkpass";

export async function GET(req: NextRequest) {
  const limited = rateLimit(req, { limit: 30, windowMs: 60_000 });
  if (limited) return limited;

  // Verify signed URL FIRST — no DB / cert work for invalid URLs.
  const verified = verifyFamilyPassUrl(req.nextUrl.searchParams);
  if (!verified) {
    void audit({
      church_id: req.nextUrl.searchParams.get("c") || null,
      actor: SYSTEM_ACTOR,
      action: "wallet.family_pass_generated",
      target_type: "household",
      target_id: req.nextUrl.searchParams.get("h"),
      metadata: { reason: "signed_url_invalid_or_expired" },
      outcome: "denied",
    });
    return NextResponse.json(
      { error: "Signed URL is invalid or expired" },
      { status: 403 },
    );
  }
  const { church_id: churchId, household_id: householdId } = verified;

  try {
    const churchRef = adminDb.collection("churches").doc(churchId);

    // Pull household + church + children + campus data.
    // Campuses fetched in parallel so the location-aware pass
    // surfaces on the parent's iPhone lock screen when they pull
    // into the church parking lot (Apple Wallet uses the
    // `locations` array on the pass — see builder line 78-82).
    const [churchSnap, householdSnap, campusesSnap] = await Promise.all([
      churchRef.get(),
      churchRef.collection("households").doc(householdId).get(),
      churchRef.collection("campuses").get(),
    ]);
    if (!householdSnap.exists) {
      return NextResponse.json({ error: "Household not found" }, { status: 404 });
    }
    const householdData = householdSnap.data() ?? {};
    const churchData = churchSnap.exists ? (churchSnap.data() ?? {}) : {};
    const churchName =
      (churchData.name as string | undefined) || "VolunteerCal";
    // W11 Sub-PR B: church's uploaded logo URL (null when the org
    // hasn't set one yet). Passed through to the builder which
    // substitutes it for the embedded VolunteerCal CheckInBadge.
    const churchLogoUrl =
      (churchData.logo_url as string | null | undefined) ?? null;

    // Family display name resolution (Jason 2026-06-03 V7).
    //
    // Priority order — first hit wins:
    //   1. Primary guardian's `last_name` field on the linked Person
    //      doc. Cleanest: "Pevensie". Works when the household was
    //      created with the guardian's name properly split into
    //      first_name + last_name.
    //   2. Surname extracted from household.name. Many real records
    //      were created with household.name set to the primary
    //      guardian's FULL NAME ("Helen Pevensie") — and the linked
    //      Person doc has no last_name, just a single `name` field.
    //      So we parse: strip leading "The " and trailing " Family",
    //      then take the LAST whitespace-delimited token. This
    //      converts:
    //         "Helen Pevensie"            → "Pevensie"
    //         "The Pevensie Family"       → "Pevensie"
    //         "Pevensie"                  → "Pevensie"
    //         "Smith-Jones"               → "Smith-Jones"
    //      Known limit: "Mary van der Berg" → "Berg" (loses the
    //      surname particle). Rare in the church-name use case;
    //      a future enhancement could match against the linked
    //      Person's `name` field to handle particle-prefixed surnames.
    //   3. Generic fallback "Family".
    //
    // Blended-family slash form (e.g. "Smith/Jones") when guardians'
    // surnames differ is a deliberate follow-up — flagged but not
    // implemented per Jason's earlier "not needed for tonight" call.
    let familyName = "";
    const primaryId = (householdData.primary_guardian_id as string | null) ?? null;
    if (primaryId) {
      const primarySnap = await churchRef
        .collection("people")
        .doc(primaryId)
        .get();
      if (primarySnap.exists) {
        const last = (primarySnap.data() as Person).last_name;
        if (last && last.trim()) familyName = last.trim();
      }
    }
    if (!familyName) {
      const hhName = (householdData.name as string) || "";
      familyName = extractSurname(hhName);
    }
    if (!familyName) familyName = "Family";

    // Long-form FAMILY display for the front of the pass:
    // "Pevensie, Helen & Roger" or "Doe, John & Smith, Jane". Pulls the
    // primary + secondary guardian names from linked Person docs (most
    // reliable source); falls back to legacy denormalized fields on
    // the household doc; falls back to just the surname when neither
    // is available. Matches what /dashboard/checkin/households/[id]
    // and the Family Portal render.
    let primaryGuardianFullName: string | null = null;
    let secondaryGuardianFullName: string | null = null;
    const hhPrimaryId =
      (householdData.primary_guardian_id as string | null) ?? null;
    const hhSecondaryId =
      (householdData.secondary_guardian_id as string | null) ?? null;
    if (hhPrimaryId) {
      try {
        const s = await churchRef.collection("people").doc(hhPrimaryId).get();
        if (s.exists) {
          const p = s.data() as Person;
          primaryGuardianFullName =
            (p.name as string) ||
            [p.first_name, p.last_name].filter(Boolean).join(" ") ||
            null;
        }
      } catch { /* fall through to denormalized fields */ }
    }
    if (hhSecondaryId) {
      try {
        const s = await churchRef.collection("people").doc(hhSecondaryId).get();
        if (s.exists) {
          const p = s.data() as Person;
          secondaryGuardianFullName =
            (p.name as string) ||
            [p.first_name, p.last_name].filter(Boolean).join(" ") ||
            null;
        }
      } catch { /* ignore */ }
    }
    // Legacy denormalized fallback (checkin_households shape).
    if (!primaryGuardianFullName) {
      primaryGuardianFullName =
        (householdData.primary_guardian_name as string | undefined) ?? null;
    }
    if (!secondaryGuardianFullName) {
      secondaryGuardianFullName =
        (householdData.secondary_guardian_name as string | undefined) ?? null;
    }
    const familyDisplayName = formatHouseholdDisplay({
      primary_guardian_name: primaryGuardianFullName,
      secondary_guardian_name: secondaryGuardianFullName,
    });

    // Children: query Person docs of type=child with household_ids
    // containing this household.
    const childrenSnap = await churchRef
      .collection("people")
      .where("person_type", "==", "child")
      .where("household_ids", "array-contains", householdId)
      .get();
    const children: FamilyPassChild[] = childrenSnap.docs
      .map((d) => {
        const data = d.data();
        const cp = (data.child_profile as Record<string, unknown>) ?? {};
        return {
          id: d.id,
          first_name:
            (data.preferred_name as string) ||
            (data.first_name as string) ||
            "Child",
          grade: ((cp.grade as string) ?? null) || null,
        };
      })
      // Oldest first (Jason 2026-06-04). Without DOB we use grade as
      // an age proxy: 6th highest, nursery lowest. Children with no
      // grade set sort last (likely brand-new entries). Alphabetical
      // first_name is the tiebreaker so siblings in the same grade
      // (e.g. twins) get a deterministic order.
      .sort((a, b) => {
        const ra = gradeAgeRank(a.grade);
        const rb = gradeAgeRank(b.grade);
        if (ra !== rb) return rb - ra; // higher rank = older = first
        return a.first_name.localeCompare(b.first_name);
      });

    // Load or create the WalletPass record. Auth token is generated
    // once per household and persists across re-downloads so a
    // future remote-update path can validate it.
    const walletRef = churchRef
      .collection("wallet_passes")
      .doc(householdId);
    const walletSnap = await walletRef.get();
    let authToken: string;
    const nowIso = new Date().toISOString();
    if (walletSnap.exists) {
      const existing = walletSnap.data() as WalletPass;
      authToken = existing.auth_token;
      await walletRef.update({
        last_downloaded_at: nowIso,
        download_count: (existing.download_count ?? 0) + 1,
      });
    } else {
      authToken = randomBytes(24).toString("hex");
      const fresh: WalletPass = {
        id: householdId,
        church_id: churchId,
        household_id: householdId,
        auth_token: authToken,
        created_at: nowIso,
        last_downloaded_at: nowIso,
        download_count: 1,
      };
      await walletRef.set(fresh);
    }

    // Map campus docs → Apple Wallet locations. Each campus with
    // GPS coordinates becomes a relevance trigger; pass auto-appears
    // on the parent's lock screen when they're within ~100m (Apple's
    // default). Apple's hard cap is 10 locations per pass, which
    // covers every realistic multi-campus church.
    //
    // relevant_text is what shows on the lock screen ("Tap to check
    // in at {campus name}") — short copy because Apple truncates.
    const campusLocations = campusesSnap.docs
      .map((d) => {
        const c = d.data() as { name?: string; location?: { lat: number; lng: number } | null };
        if (!c.location || typeof c.location.lat !== "number" || typeof c.location.lng !== "number") {
          return null;
        }
        return {
          latitude: c.location.lat,
          longitude: c.location.lng,
          relevant_text: c.name ? `Check in at ${c.name}` : "Check in at the kiosk",
        };
      })
      .filter((loc): loc is { latitude: number; longitude: number; relevant_text: string } => loc !== null)
      .slice(0, 10); // Apple PassKit hard limit

    // Build + sign the .pkpass.
    const buffer = await buildFamilyPassBuffer({
      household_id: householdId,
      auth_token: authToken,
      family_name: familyName,
      family_display_name: familyDisplayName,
      church_name: churchName,
      children,
      support_url: `${getBaseUrl()}/help`,
      church_logo_url: churchLogoUrl,
      locations: campusLocations.length > 0 ? campusLocations : undefined,
    });

    void audit({
      church_id: churchId,
      actor: SYSTEM_ACTOR,
      action: "wallet.family_pass_generated",
      target_type: "household",
      target_id: householdId,
      metadata: {
        children_count: children.length,
        download_count: walletSnap.exists
          ? (walletSnap.data() as WalletPass).download_count + 1
          : 1,
      },
      outcome: "ok",
    });

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": PKPASS_MIME,
        "Content-Disposition": 'attachment; filename="family.pkpass"',
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    // Capture the actual error message in the audit metadata so a
    // future "Could not build wallet pass" failure can be diagnosed
    // from audit_logs without needing to dig through Sentry. Codex
    // W10-5A retest was blocked by exactly this gap — the public
    // response stays generic for safety but we record what really
    // broke. `outcome: "failed"` is distinct from the "denied"
    // outcome we use for bad signatures.
    const errMsg = error instanceof Error ? error.message : String(error);
    log.error("[GET /api/wallet/family-pass]", error);
    void audit({
      church_id: churchId,
      actor: SYSTEM_ACTOR,
      action: "wallet.family_pass_generated",
      target_type: "household",
      target_id: householdId,
      metadata: {
        error_message: errMsg.slice(0, 500),
        error_name:
          error instanceof Error ? error.constructor.name : "Unknown",
      },
      outcome: "failed",
    });
    return NextResponse.json(
      { error: "Could not build wallet pass" },
      { status: 500 },
    );
  }
}
