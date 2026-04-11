#!/usr/bin/env npx tsx
/**
 * fix-legacy-ids.ts
 *
 * Final remediation for the Volunteer → Person migration. Ensures all
 * Firestore data references Person doc IDs consistently, then removes
 * the legacy `volunteers` collection.
 *
 * What it does:
 *   1. Fixes membership docs where `volunteer_id` is null — sets it to
 *      the Person doc whose `user_id` matches the membership's `user_id`.
 *   2. Normalizes assignment docs where `person_id !== volunteer_id` — sets
 *      `volunteer_id = person_id` so both point to the Person doc.
 *   3. Deletes all docs in the legacy `volunteers` subcollection.
 *
 * Usage:
 *   npx tsx scripts/fix-legacy-ids.ts
 *   npx tsx scripts/fix-legacy-ids.ts --dry-run
 */

import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import * as fs from "fs";
import * as path from "path";

// Load .env.local
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
      initializeApp({ projectId });
    }
  }
  return getFirestore();
}

const db = initFirebase();
const dryRun = process.argv.includes("--dry-run");

async function main() {
  if (dryRun) console.log("=== DRY RUN — no writes ===\n");

  // Discover all churches
  const churchSnap = await db.collection("churches").get();
  const churchIds = churchSnap.docs.map((d) => d.id);
  console.log(`Found ${churchIds.length} church(es): ${churchIds.join(", ")}\n`);

  let totalMembershipFixes = 0;
  let totalAssignmentFixes = 0;
  let totalVolunteerDeletes = 0;

  for (const churchId of churchIds) {
    const churchData = churchSnap.docs.find((d) => d.id === churchId)?.data();
    const churchName = (churchData?.name as string) || churchId;
    console.log(`\n--- ${churchName} (${churchId}) ---`);

    // Load all people for this church (build user_id → person_id map)
    const peopleSnap = await db.collection(`churches/${churchId}/people`).get();
    const userIdToPersonId = new Map<string, string>();
    for (const doc of peopleSnap.docs) {
      const userId = doc.data().user_id as string | null;
      if (userId) userIdToPersonId.set(userId, doc.id);
    }
    console.log(`  People: ${peopleSnap.size} docs, ${userIdToPersonId.size} linked to accounts`);

    // --- 1. Fix memberships ---
    const memSnap = await db
      .collection("memberships")
      .where("church_id", "==", churchId)
      .get();

    let membershipFixes = 0;
    for (const memDoc of memSnap.docs) {
      const data = memDoc.data();
      if (data.volunteer_id) continue; // already set

      const userId = data.user_id as string;
      const personId = userIdToPersonId.get(userId);
      if (!personId) {
        console.log(`  ⚠ Membership ${memDoc.id}: user_id=${userId} has no person record — skipping`);
        continue;
      }

      console.log(`  ✓ Membership ${memDoc.id}: set volunteer_id → ${personId}`);
      if (!dryRun) {
        await memDoc.ref.update({ volunteer_id: personId });
      }
      membershipFixes++;
    }
    totalMembershipFixes += membershipFixes;

    // --- 2. Normalize assignments ---
    const assignSnap = await db.collection(`churches/${churchId}/assignments`).get();
    let assignmentFixes = 0;
    for (const doc of assignSnap.docs) {
      const data = doc.data();
      const personId = data.person_id as string | undefined;
      const volunteerId = data.volunteer_id as string | undefined;

      if (!personId) {
        console.log(`  ⚠ Assignment ${doc.id}: missing person_id — skipping`);
        continue;
      }
      if (personId === volunteerId) continue; // already normalized

      console.log(`  ✓ Assignment ${doc.id}: volunteer_id ${volunteerId} → ${personId}`);
      if (!dryRun) {
        await doc.ref.update({ volunteer_id: personId });
      }
      assignmentFixes++;
    }
    totalAssignmentFixes += assignmentFixes;

    // --- 3. Delete legacy volunteers collection ---
    const volSnap = await db.collection(`churches/${churchId}/volunteers`).get();
    if (volSnap.size > 0) {
      console.log(`  Deleting ${volSnap.size} legacy volunteer doc(s)`);
      if (!dryRun) {
        const batch = db.batch();
        for (const doc of volSnap.docs) {
          batch.delete(doc.ref);
        }
        await batch.commit();
      }
      totalVolunteerDeletes += volSnap.size;
    } else {
      console.log(`  No legacy volunteers to delete`);
    }

    console.log(`  Summary: ${membershipFixes} memberships fixed, ${assignmentFixes} assignments normalized, ${volSnap.size} legacy docs deleted`);
  }

  console.log(`\n=== TOTAL ===`);
  console.log(`  Memberships fixed:     ${totalMembershipFixes}`);
  console.log(`  Assignments normalized: ${totalAssignmentFixes}`);
  console.log(`  Legacy docs deleted:    ${totalVolunteerDeletes}`);
  if (dryRun) console.log("\n(dry run — no changes written)");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
