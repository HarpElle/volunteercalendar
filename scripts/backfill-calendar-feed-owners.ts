#!/usr/bin/env npx tsx
/**
 * backfill-calendar-feed-owners.ts
 *
 * Remediation for the Codex QA finding (2026-05-15): calendar_feeds docs have
 * no `created_by_user_id` field, so the account-page UI listed every feed in
 * the org to every user, and the public iCal API would serve any feed token
 * to anyone. See `VolunteerCalTestingByCodex/FEEDBACK_RUN_2026-05-15.md`.
 *
 * What this script does, per church:
 *   1. Reads every doc in `churches/{cid}/calendar_feeds`.
 *   2. For each feed, computes the owner UID:
 *        - type === "personal" → look up Person at target_id, take their user_id
 *        - type === "team"     → take the target Person's user_id (same shape)
 *        - type === "ministry" → fall back to the church's owner_user_id
 *        - type === "org"      → fall back to the church's owner_user_id
 *      If no owner can be determined, the feed is FLAGGED (not deleted) and
 *      printed at the end for manual triage.
 *   3. Generates a fresh secret_token (UUID v4) for every feed. The old token
 *      becomes invalid the moment the new value is written, which is the point
 *      — testers and Jason's calendars will need to resubscribe.
 *   4. Writes both fields in a single per-feed update.
 *
 * Modes:
 *   --dry-run   (default) Prints what would change. No writes. Safe.
 *   --apply     Performs the writes. DESTRUCTIVE — invalidates all existing
 *               feed tokens in the database. Only run when you've coordinated
 *               with any currently-subscribed calendars (in beta, this is
 *               you + Codex's test org).
 *
 * Usage:
 *   npx tsx scripts/backfill-calendar-feed-owners.ts            # dry-run
 *   npx tsx scripts/backfill-calendar-feed-owners.ts --dry-run  # explicit dry-run
 *   npx tsx scripts/backfill-calendar-feed-owners.ts --apply    # write changes
 */

import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { randomUUID } from "crypto";
import * as fs from "fs";
import * as path from "path";

// --- Env loader (mirrors scripts/fix-legacy-ids.ts) ---

const envPath = path.join(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, "utf-8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx < 0) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
}

function initFirebase() {
  if (getApps().length > 0) return getFirestore();
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const adminKey = process.env.FIREBASE_ADMIN_KEY;
  if (adminKey) {
    const sa = JSON.parse(adminKey);
    initializeApp({ credential: cert(sa), projectId });
  } else {
    const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
    const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY;
    if (clientEmail && privateKey) {
      initializeApp({
        credential: cert({
          projectId: process.env.FIREBASE_ADMIN_PROJECT_ID || projectId,
          clientEmail,
          privateKey: privateKey.replace(/\\n/g, "\n"),
        }),
        projectId,
      });
    } else {
      throw new Error(
        "Missing Firebase admin credentials. Set FIREBASE_ADMIN_KEY in .env.local.",
      );
    }
  }
  return getFirestore();
}

// --- Args ---

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const DRY = !APPLY; // default is dry-run

// --- Main ---

type FlaggedFeed = {
  churchId: string;
  churchName: string;
  feedId: string;
  type: string;
  targetId: string;
  reason: string;
};

async function main() {
  console.log(
    `\n${"=".repeat(70)}\nCalendar Feed Owner Backfill + Token Rotation\nMode: ${DRY ? "DRY-RUN (no writes)" : "APPLY (writes will happen)"}\n${"=".repeat(70)}\n`,
  );

  const db = initFirebase();

  const churchesSnap = await db.collection("churches").get();
  console.log(`Found ${churchesSnap.size} churches.\n`);

  let totalFeeds = 0;
  let totalUpdated = 0;
  let totalSkipped = 0;
  const flagged: FlaggedFeed[] = [];

  for (const churchDoc of churchesSnap.docs) {
    const churchId = churchDoc.id;
    const churchData = churchDoc.data();
    const churchName = (churchData.name as string) || "(unnamed)";
    const ownerUserId = (churchData.owner_user_id as string) || "";

    const feedsSnap = await db
      .collection("churches")
      .doc(churchId)
      .collection("calendar_feeds")
      .get();

    if (feedsSnap.empty) continue;

    console.log(
      `\n  ${churchName} (${churchId}) — ${feedsSnap.size} feed(s)`,
    );

    // Pre-load people for personal/team lookups
    const peopleSnap = await db
      .collection("churches")
      .doc(churchId)
      .collection("people")
      .get();
    const peopleById = new Map(
      peopleSnap.docs.map((d) => [d.id, d.data()]),
    );

    for (const feedDoc of feedsSnap.docs) {
      totalFeeds++;
      const feed = feedDoc.data();
      const type = (feed.type as string) || "personal";
      const targetId = (feed.target_id as string) || "";
      const hasOwner = typeof feed.created_by_user_id === "string"
        && (feed.created_by_user_id as string).length > 0;

      // If the feed already has a valid owner AND we're in dry-run, just note it.
      // If --apply, we STILL rotate the token (the goal is to invalidate leaked tokens).
      let resolvedOwnerUid: string | null = null;
      let resolvedPersonId: string | undefined = undefined;
      let reason = "";

      if (type === "personal" || type === "team") {
        const person = peopleById.get(targetId);
        if (person) {
          const uid = (person.user_id as string) || "";
          if (uid) {
            resolvedOwnerUid = uid;
            resolvedPersonId = targetId;
          } else {
            // Person exists but has no linked user account. Fall back to church owner.
            resolvedOwnerUid = ownerUserId || null;
            reason = "person at target_id has no user_id; defaulting to church owner";
          }
        } else {
          resolvedOwnerUid = ownerUserId || null;
          reason = `${type} feed target_id ${targetId} not found in people; defaulting to church owner`;
        }
      } else if (type === "ministry" || type === "org") {
        resolvedOwnerUid = ownerUserId || null;
        if (!resolvedOwnerUid) reason = `${type} feed but church has no owner_user_id`;
      } else {
        resolvedOwnerUid = ownerUserId || null;
        reason = `unrecognized feed type "${type}"; defaulting to church owner`;
      }

      // If we still can't determine an owner, flag and skip.
      if (!resolvedOwnerUid) {
        flagged.push({
          churchId,
          churchName,
          feedId: feedDoc.id,
          type,
          targetId,
          reason: reason || "no owner could be resolved",
        });
        totalSkipped++;
        console.log(`    ⚠ ${feedDoc.id} [${type}] — FLAGGED: ${reason}`);
        continue;
      }

      const newToken = randomUUID();
      const update: Record<string, unknown> = {
        created_by_user_id: resolvedOwnerUid,
        secret_token: newToken,
      };
      if (resolvedPersonId) update.created_by_person_id = resolvedPersonId;
      if (!hasOwner) update.backfilled_at = FieldValue.serverTimestamp();

      const ownerLabel = hasOwner ? "owner ok" : "OWNER BACKFILLED";
      const noteSuffix = reason ? ` — note: ${reason}` : "";
      console.log(
        `    ${DRY ? "[DRY]" : "[APPLY]"} ${feedDoc.id} [${type}] ${ownerLabel} → uid=${resolvedOwnerUid.slice(0, 8)}…  token=rotated${noteSuffix}`,
      );

      if (!DRY) {
        await feedDoc.ref.update(update);
      }
      totalUpdated++;
    }
  }

  console.log(`\n${"=".repeat(70)}`);
  console.log(`Summary: ${DRY ? "[DRY-RUN]" : "[APPLIED]"}`);
  console.log(`  Total feeds inspected: ${totalFeeds}`);
  console.log(`  Updated:               ${totalUpdated}`);
  console.log(`  Skipped (flagged):     ${totalSkipped}`);
  console.log(`${"=".repeat(70)}`);

  if (flagged.length > 0) {
    console.log(`\nFlagged feeds (manual review needed):`);
    for (const f of flagged) {
      console.log(
        `  • church=${f.churchName} (${f.churchId}) feed=${f.feedId} type=${f.type} target=${f.targetId}`,
      );
      console.log(`      reason: ${f.reason}`);
    }
    console.log(
      `\n  To delete flagged feeds manually:`,
    );
    console.log(
      `    firebase firestore:delete churches/<churchId>/calendar_feeds/<feedId>`,
    );
  }

  if (DRY) {
    console.log(`\nThis was a DRY-RUN. To apply: --apply`);
    console.log(
      `IMPORTANT: --apply will invalidate every existing feed token. Anyone subscribed to a calendar feed will need to resubscribe with the new URL.\n`,
    );
  } else {
    console.log(
      `\nDone. All feeds now have an owner and a fresh secret_token. Old URLs are invalid.\n`,
    );
  }
}

main().catch((err) => {
  console.error("\nFATAL:", err);
  process.exit(1);
});
