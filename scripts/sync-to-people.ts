#!/usr/bin/env npx tsx
/**
 * sync-to-people.ts
 *
 * Permanently merges the `volunteers` collection into the unified `people`
 * collection. Safe to run on a church that already has a partially-populated
 * `people` collection.
 *
 * What it does:
 *   1. Reads existing Person docs (people collection) → builds email→personId map
 *   2. Reads Volunteer docs → for any volunteer whose email is NOT yet in people,
 *      creates a new Person doc (via legacyVolunteerToPerson shape)
 *   3. Builds volunteerId → personId mapping (matching by email)
 *   4. Updates every assignment that is missing `person_id`
 *   5. Updates every membership whose `volunteer_id` still points to an old
 *      volunteer doc ID, replacing it with the correct person doc ID
 *
 * Usage:
 *   npx tsx scripts/sync-to-people.ts --church-id <CHURCH_ID>
 *   npx tsx scripts/sync-to-people.ts --church-id <CHURCH_ID> --dry-run
 */

import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import * as fs from "fs";
import * as path from "path";

// ─── CLI Args ──────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const churchIdIdx = args.indexOf("--church-id");
const churchId = churchIdIdx !== -1 ? args[churchIdIdx + 1] : null;
const dryRun = args.includes("--dry-run");

if (!churchId) {
  console.error("Usage: npx tsx scripts/sync-to-people.ts --church-id <CHURCH_ID> [--dry-run]");
  process.exit(1);
}

// ─── Firebase Init ─────────────────────────────────────────────────────────

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

// ─── Main ──────────────────────────────────────────────────────────────────

async function run() {
  const prefix = `churches/${churchId}`;
  console.log(`\n🔄 sync-to-people for church: ${churchId}`);
  console.log(`   Mode: ${dryRun ? "DRY RUN (no writes)" : "LIVE"}\n`);

  const churchRef = db.collection("churches").doc(churchId!);

  // 1. Load existing Person docs
  const peopleSnap = await churchRef.collection("people").get();
  // email (lowercase) → person doc ID
  const emailToPersonId = new Map<string, string>();
  for (const d of peopleSnap.docs) {
    const email = ((d.data().email as string) || "").trim().toLowerCase();
    if (email) emailToPersonId.set(email, d.id);
  }
  console.log(`📋 People collection: ${peopleSnap.size} docs`);

  // 2. Load Volunteer docs
  const volSnap = await churchRef.collection("volunteers").get();
  console.log(`📋 Volunteers collection: ${volSnap.size} docs`);

  // volunteerId → personId mapping (all volunteers, including ones already in people)
  const volIdToPersonId = new Map<string, string>();

  let newPersonCount = 0;
  const now = new Date().toISOString();

  for (const volDoc of volSnap.docs) {
    const v = volDoc.data();
    const email = ((v.email as string) || "").trim().toLowerCase();

    // Check if a person already exists for this email
    if (email && emailToPersonId.has(email)) {
      // Already migrated — just record the mapping
      volIdToPersonId.set(volDoc.id, emailToPersonId.get(email)!);
      continue;
    }

    // No matching person — create one from the volunteer doc
    const firstName = (v.first_name as string) ?? (v.name as string)?.split(" ")[0] ?? "";
    const lastName = (v.last_name as string) ?? (v.name as string)?.split(" ").slice(1).join(" ") ?? "";
    const cleanPhone = ((v.phone as string) || "").replace(/\D/g, "");

    const personData = {
      church_id: churchId,
      household_ids: v.household_id ? [v.household_id] : [],
      person_type: "adult",
      first_name: firstName,
      last_name: lastName,
      preferred_name: null,
      name: v.name || "",
      search_name: ((v.name as string) || "").toLowerCase(),
      email: v.email || null,
      phone: v.phone || null,
      search_phones: cleanPhone ? [cleanPhone] : [],
      photo_url: v.photo_url ?? null,
      status: v.status === "pending" ? "active" : (v.status || "active"),
      user_id: v.user_id || null,
      membership_id: v.membership_id || null,
      is_volunteer: true,
      ministry_ids: v.ministry_ids || [],
      role_ids: v.role_ids || [],
      campus_ids: v.campus_ids || [],
      scheduling_profile: {
        skills: [],
        blockout_dates: v.availability?.blockout_dates ?? [],
        recurring_unavailable: v.availability?.recurring_unavailable ?? [],
        preferred_frequency: v.availability?.preferred_frequency ?? 4,
        max_roles_per_month: v.availability?.max_roles_per_month ?? 4,
        max_services_per_month: v.availability?.max_roles_per_month ?? 4,
      },
      child_profile: null,
      stats: v.stats || {
        times_scheduled_last_90d: 0,
        last_served_date: null,
        decline_count: 0,
        no_show_count: 0,
      },
      imported_from: v.imported_from || "manual",
      background_check: v.background_check || null,
      role_constraints: v.role_constraints || null,
      volunteer_journey: v.volunteer_journey || null,
      qr_token: null,
      created_at: v.created_at || now,
      updated_at: now,
    };

    if (!dryRun) {
      const personRef = await churchRef.collection("people").add(personData);
      volIdToPersonId.set(volDoc.id, personRef.id);
      if (email) emailToPersonId.set(email, personRef.id);
      newPersonCount++;
    } else {
      // In dry-run: generate a placeholder ID for mapping display
      const placeholderId = `[new-${volDoc.id}]`;
      volIdToPersonId.set(volDoc.id, placeholderId);
      if (email) emailToPersonId.set(email, placeholderId);
      newPersonCount++;
    }
  }

  console.log(`✅ New Person docs created: ${newPersonCount}`);
  console.log(`📊 Volunteer→Person mapping size: ${volIdToPersonId.size}`);

  // 3. Update assignments missing person_id
  const assignSnap = await churchRef.collection("assignments").get();
  let assignUpdated = 0;
  let assignSkipped = 0;

  const assignBatches: ReturnType<typeof db.batch>[] = [];
  let currentBatch = db.batch();
  let batchOps = 0;

  for (const assignDoc of assignSnap.docs) {
    const data = assignDoc.data();
    if (data.person_id) {
      assignSkipped++;
      continue;
    }

    const volunteerId = data.volunteer_id as string;
    if (!volunteerId) {
      assignSkipped++;
      continue;
    }

    // Try direct mapping first
    let personId = volIdToPersonId.get(volunteerId);

    // Fallback: look up by volunteer's email via the people collection
    if (!personId) {
      const volDoc = volSnap.docs.find((d) => d.id === volunteerId);
      if (volDoc) {
        const email = ((volDoc.data().email as string) || "").trim().toLowerCase();
        if (email) personId = emailToPersonId.get(email);
      }
    }

    if (!personId) {
      console.warn(`  ⚠️  No person found for volunteer_id: ${volunteerId} (assignment: ${assignDoc.id})`);
      assignSkipped++;
      continue;
    }

    if (!dryRun) {
      currentBatch.update(assignDoc.ref, { person_id: personId });
      batchOps++;
      assignUpdated++;

      if (batchOps >= 450) {
        assignBatches.push(currentBatch);
        currentBatch = db.batch();
        batchOps = 0;
      }
    } else {
      console.log(`  [dry] assignment ${assignDoc.id}: volunteer_id=${volunteerId} → person_id=${personId}`);
      assignUpdated++;
    }
  }

  if (!dryRun && batchOps > 0) {
    assignBatches.push(currentBatch);
    for (const batch of assignBatches) {
      await batch.commit();
    }
  }

  console.log(`✅ Assignments updated: ${assignUpdated}, skipped: ${assignSkipped}`);

  // 4. Update memberships: volunteer_id → person_id
  const membershipsSnap = await db
    .collection("memberships")
    .where("church_id", "==", churchId)
    .get();

  let membershipUpdated = 0;
  let membershipSkipped = 0;
  const memberBatch = db.batch();

  for (const mDoc of membershipsSnap.docs) {
    const mData = mDoc.data();
    const currentVolId = mData.volunteer_id as string | null;
    if (!currentVolId) {
      membershipSkipped++;
      continue;
    }

    // Already a person ID? Skip.
    const personSnap = await churchRef.collection("people").doc(currentVolId).get();
    if (personSnap.exists) {
      membershipSkipped++;
      continue;
    }

    // Map old volunteer ID to person ID
    const personId = volIdToPersonId.get(currentVolId);
    if (!personId || personId.startsWith("[new-")) {
      membershipSkipped++;
      continue;
    }

    if (!dryRun) {
      memberBatch.update(mDoc.ref, { volunteer_id: personId });
      membershipUpdated++;
    } else {
      console.log(`  [dry] membership ${mDoc.id}: volunteer_id=${currentVolId} → ${personId}`);
      membershipUpdated++;
    }
  }

  if (!dryRun && membershipUpdated > 0) {
    await memberBatch.commit();
  }

  console.log(`✅ Memberships updated: ${membershipUpdated}, skipped: ${membershipSkipped}`);

  // 5. Write mapping file for reference
  const mapping = Object.fromEntries(volIdToPersonId);
  const outPath = path.join(process.cwd(), "scripts", "sync-map.json");
  if (!dryRun) {
    fs.writeFileSync(outPath, JSON.stringify(mapping, null, 2));
    console.log(`\n📄 Mapping saved to: ${outPath}`);
  }

  console.log("\n✅ Done.");
  console.log(`   New person docs:         ${newPersonCount}`);
  console.log(`   Assignments with person_id: ${assignUpdated} updated`);
  console.log(`   Memberships updated:     ${membershipUpdated}`);
  if (dryRun) console.log("\n   (DRY RUN — no changes written)");
}

run().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
