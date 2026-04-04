#!/usr/bin/env npx tsx
/**
 * Migration script: Volunteer + CheckInHousehold → Unified Person + Household
 *
 * Reads existing volunteer, checkin_households, children, and scheduling
 * households from Firestore, deduplicates by email/phone, and creates
 * unified Person and UnifiedHousehold documents. Also updates existing
 * Assignment documents to add `person_id` alongside `volunteer_id`.
 *
 * Usage:
 *   npx tsx scripts/migrate-to-unified-people.ts --church-id <CHURCH_ID>
 *
 * Options:
 *   --church-id  (required) The Firestore church document ID
 *   --dry-run    Print what would be done without writing to Firestore
 *
 * Idempotent: Checks if `people` collection already has documents before
 * running. Safe to run multiple times.
 *
 * Prerequisites:
 *   - FIREBASE_ADMIN_KEY or FIREBASE_ADMIN_CLIENT_EMAIL + FIREBASE_ADMIN_PRIVATE_KEY
 *     environment variables must be set (or use Application Default Credentials)
 *   - Run from the project root: npx tsx scripts/migrate-to-unified-people.ts
 */

import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import * as fs from "fs";
import * as path from "path";

// ─── CLI Args ──────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const churchIdIdx = args.indexOf("--church-id");
const churchId = churchIdIdx !== -1 ? args[churchIdIdx + 1] : null;
const dryRun = args.includes("--dry-run");

if (!churchId) {
  console.error("Usage: npx tsx scripts/migrate-to-unified-people.ts --church-id <CHURCH_ID>");
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
      // Application Default Credentials
      initializeApp({ projectId });
    }
  }
  return getFirestore();
}

const db = initFirebase();

// ─── Types (inline to avoid path alias issues in scripts) ──────────────────

interface LegacyVolunteer {
  id: string;
  church_id: string;
  name: string;
  first_name?: string;
  last_name?: string;
  email: string;
  phone: string | null;
  user_id: string | null;
  membership_id: string | null;
  status: string;
  ministry_ids: string[];
  role_ids: string[];
  campus_ids?: string[];
  household_id: string | null;
  photo_url?: string | null;
  availability: {
    blockout_dates: string[];
    recurring_unavailable: string[];
    preferred_frequency: number;
    max_roles_per_month: number;
  };
  stats: {
    times_scheduled_last_90d: number;
    last_served_date: string | null;
    decline_count: number;
    no_show_count: number;
  };
  imported_from: string;
  background_check?: {
    status: string;
    expires_at?: string | null;
    provider?: string | null;
    checked_at?: string | null;
  };
  role_constraints?: {
    conditional_roles?: { role_id: string; requires_any: string[] }[];
    allow_multi_role?: boolean;
  };
  volunteer_journey?: {
    step_id: string;
    ministry_id: string;
    status: string;
    completed_at?: string | null;
    expires_at?: string | null;
    verified_by?: string | null;
    notes?: string | null;
  }[];
  created_at: string;
}

interface LegacyCheckInHousehold {
  id: string;
  church_id: string;
  primary_guardian_name: string;
  primary_guardian_phone: string;
  secondary_guardian_name?: string;
  secondary_guardian_phone?: string;
  qr_token: string;
  photo_url?: string;
  imported_from?: string;
  created_at: string;
  updated_at: string;
}

interface LegacyChild {
  id: string;
  church_id: string;
  household_id: string;
  first_name: string;
  last_name: string;
  preferred_name?: string;
  date_of_birth?: string;
  grade?: string;
  photo_url?: string;
  default_room_id?: string;
  has_alerts: boolean;
  allergies?: string;
  medical_notes?: string;
  imported_from?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface LegacyHousehold {
  id: string;
  church_id: string;
  name: string;
  volunteer_ids: string[];
  constraints: {
    never_same_service: boolean;
    prefer_same_service: boolean;
    never_same_time: boolean;
  };
  notes?: string | null;
  created_at?: string;
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function cleanPhone(phone: string | null | undefined): string {
  return (phone ?? "").replace(/\D/g, "");
}

function normalizeEmail(email: string | null | undefined): string {
  return (email ?? "").trim().toLowerCase();
}

// ─── Main Migration ────────────────────────────────────────────────────────

async function migrate() {
  const prefix = `churches/${churchId}`;
  console.log(`\n🔄 Starting migration for church: ${churchId}`);
  console.log(`   Mode: ${dryRun ? "DRY RUN (no writes)" : "LIVE"}\n`);

  // Idempotency check: if people collection already has docs, abort
  const existingPeople = await db.collection(`${prefix}/people`).limit(1).get();
  if (!existingPeople.empty) {
    console.log("⚠️  People collection already has documents. Migration appears to have been run.");
    console.log("   To re-run, manually delete the people collection first.");
    process.exit(0);
  }

  // ── Step 1: Read all existing data ──────────────────────────────────────

  console.log("📖 Reading existing data...");

  const [volunteersSnap, checkinHHSnap, childrenSnap, householdsSnap, assignmentsSnap] =
    await Promise.all([
      db.collection(`${prefix}/volunteers`).get(),
      db.collection(`${prefix}/checkin_households`).get(),
      db.collection(`${prefix}/children`).get(),
      db.collection(`${prefix}/households`).get(),
      db.collection(`${prefix}/assignments`).get(),
    ]);

  const volunteers: LegacyVolunteer[] = volunteersSnap.docs.map((d) => ({
    ...d.data(),
    id: d.id,
  })) as LegacyVolunteer[];

  const checkinHouseholds: LegacyCheckInHousehold[] = checkinHHSnap.docs.map((d) => ({
    ...d.data(),
    id: d.id,
  })) as LegacyCheckInHousehold[];

  const children: LegacyChild[] = childrenSnap.docs.map((d) => ({
    ...d.data(),
    id: d.id,
  })) as LegacyChild[];

  const legacyHouseholds: LegacyHousehold[] = householdsSnap.docs.map((d) => ({
    ...d.data(),
    id: d.id,
  })) as LegacyHousehold[];

  console.log(`   Volunteers: ${volunteers.length}`);
  console.log(`   Check-in Households: ${checkinHouseholds.length}`);
  console.log(`   Children: ${children.length}`);
  console.log(`   Scheduling Households: ${legacyHouseholds.length}`);
  console.log(`   Assignments: ${assignmentsSnap.size}`);

  // ── Step 2: Build dedup index ───────────────────────────────────────────

  // Map: normalized email/phone → volunteer index
  const emailToVolIdx = new Map<string, number>();
  const phoneToVolIdx = new Map<string, number>();

  volunteers.forEach((v, i) => {
    const email = normalizeEmail(v.email);
    if (email) emailToVolIdx.set(email, i);
    const phone = cleanPhone(v.phone);
    if (phone) phoneToVolIdx.set(phone, i);
  });

  // ── Step 3: Create unified households ───────────────────────────────────

  console.log("\n🏠 Creating unified households...");

  // Track mapping: old household IDs → new household ID
  const oldSchedulingHHToNew = new Map<string, string>();
  const oldCheckinHHToNew = new Map<string, string>();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const newHouseholds: { ref: FirebaseFirestore.DocumentReference; data: any }[] = [];

  // First: create households from scheduling households (they have constraints)
  for (const hh of legacyHouseholds) {
    const ref = db.collection(`${prefix}/households`).doc(); // New doc ID
    // Actually we need a DIFFERENT collection path for unified households
    // But the plan says to use the same `households` path — let's use it
    // since we checked people collection is empty, households should be empty too
    // Wait — the old scheduling households ARE in `households` already.
    // We need to write to a new path or reuse. Let's check the plan...
    // The plan says: Firestore: churches/{churchId}/households/{householdId}
    // This conflicts with existing. Let's use `unified-households` temporarily
    // and rename after migration is verified. Actually, let's just create with
    // new doc IDs in the SAME collection since the old ones will still be there.
    // The new UnifiedHousehold shape is different enough to distinguish.
    // Better approach: write to the same `households` collection with new IDs.
    // The old docs stay and can be cleaned up later.

    const newRef = db.collection(`${prefix}/households`).doc();
    const now = new Date().toISOString();

    const newHH = {
      church_id: churchId,
      name: hh.name,
      primary_guardian_id: null, // Will be set when people are created
      qr_token: null,
      constraints: hh.constraints ?? {
        never_same_service: false,
        prefer_same_service: false,
        never_same_time: false,
      },
      notes: hh.notes ?? null,
      imported_from: "manual" as const,
      created_at: hh.created_at ?? now,
      updated_at: now,
    };

    newHouseholds.push({ ref: newRef, data: newHH });
    oldSchedulingHHToNew.set(hh.id, newRef.id);

    // Map each volunteer in this household to the new household
    console.log(`   Scheduling HH "${hh.name}" (${hh.id}) → ${newRef.id}`);
  }

  // Second: create households from check-in households
  for (const ciHH of checkinHouseholds) {
    // Check if this guardian matches any existing volunteer (by phone)
    const guardianPhone = cleanPhone(ciHH.primary_guardian_phone);
    const matchedVolIdx = guardianPhone ? phoneToVolIdx.get(guardianPhone) : undefined;

    // If the matched volunteer already has a scheduling household, merge into that
    let targetHHId: string | null = null;
    if (matchedVolIdx !== undefined) {
      const matchedVol = volunteers[matchedVolIdx];
      if (matchedVol.household_id && oldSchedulingHHToNew.has(matchedVol.household_id)) {
        targetHHId = oldSchedulingHHToNew.get(matchedVol.household_id)!;
        console.log(`   Check-in HH "${ciHH.primary_guardian_name}" merged with scheduling HH → ${targetHHId}`);
      }
    }

    if (!targetHHId) {
      // Create a new household for this check-in family
      const newRef = db.collection(`${prefix}/households`).doc();
      const now = new Date().toISOString();
      const lastName = ciHH.primary_guardian_name.split(" ").slice(-1)[0] || ciHH.primary_guardian_name;

      const newHH = {
        church_id: churchId,
        name: `The ${lastName} Family`,
        primary_guardian_id: null, // Set later
        qr_token: ciHH.qr_token,
        constraints: {
          never_same_service: false,
          prefer_same_service: false,
          never_same_time: false,
        },
        notes: null,
        imported_from: ciHH.imported_from ?? "manual",
        created_at: ciHH.created_at,
        updated_at: now,
      };

      newHouseholds.push({ ref: newRef, data: newHH });
      targetHHId = newRef.id;
      console.log(`   Check-in HH "${ciHH.primary_guardian_name}" (${ciHH.id}) → ${targetHHId}`);
    }

    oldCheckinHHToNew.set(ciHH.id, targetHHId);
  }

  // ── Step 4: Create Person documents ─────────────────────────────────────

  console.log("\n👤 Creating Person documents...");

  const volIdToPersonId = new Map<string, string>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const newPeople: { ref: FirebaseFirestore.DocumentReference; data: any }[] = [];

  // 4a: Volunteers → Person (adult, is_volunteer: true)
  for (const v of volunteers) {
    const ref = db.collection(`${prefix}/people`).doc();
    const now = new Date().toISOString();
    const phone = cleanPhone(v.phone);
    const firstName = v.first_name ?? v.name.split(" ")[0] ?? "";
    const lastName = v.last_name ?? v.name.split(" ").slice(1).join(" ") ?? "";

    // Resolve household_ids
    const householdIds: string[] = [];
    if (v.household_id && oldSchedulingHHToNew.has(v.household_id)) {
      householdIds.push(oldSchedulingHHToNew.get(v.household_id)!);
    }

    const person = {
      church_id: churchId,
      household_ids: householdIds,
      person_type: "adult",
      first_name: firstName,
      last_name: lastName,
      preferred_name: null,
      name: v.name,
      search_name: v.name.toLowerCase(),
      email: v.email || null,
      phone: v.phone,
      search_phones: phone ? [phone] : [],
      photo_url: v.photo_url ?? null,
      status: v.status === "pending" ? "active" : v.status === "archived" ? "archived" : v.status === "inactive" ? "inactive" : "active",
      user_id: v.user_id,
      membership_id: v.membership_id,
      is_volunteer: true,
      ministry_ids: v.ministry_ids,
      role_ids: v.role_ids,
      campus_ids: v.campus_ids ?? [],
      scheduling_profile: {
        skills: [],
        max_services_per_month: v.availability.max_roles_per_month,
        blockout_dates: v.availability.blockout_dates,
        recurring_unavailable: v.availability.recurring_unavailable,
        preferred_frequency: v.availability.preferred_frequency,
        max_roles_per_month: v.availability.max_roles_per_month,
      },
      child_profile: null,
      stats: v.stats,
      imported_from: v.imported_from ?? null,
      background_check: v.background_check ?? null,
      role_constraints: v.role_constraints
        ? {
            conditional_roles: v.role_constraints.conditional_roles ?? [],
            allow_multi_role: v.role_constraints.allow_multi_role ?? false,
          }
        : null,
      volunteer_journey: v.volunteer_journey ?? null,
      qr_token: null,
      created_at: v.created_at,
      updated_at: now,
    };

    newPeople.push({ ref, data: person });
    volIdToPersonId.set(v.id, ref.id);
    console.log(`   Volunteer "${v.name}" (${v.id}) → Person ${ref.id}`);
  }

  // 4b: Check-in guardians that DON'T match any volunteer → Person (adult, is_volunteer: false)
  for (const ciHH of checkinHouseholds) {
    const guardianPhone = cleanPhone(ciHH.primary_guardian_phone);
    const matchedVolIdx = guardianPhone ? phoneToVolIdx.get(guardianPhone) : undefined;

    if (matchedVolIdx !== undefined) {
      // This guardian matches a volunteer — already created above
      // But we need to add the check-in household to their household_ids
      const matchedVol = volunteers[matchedVolIdx];
      const personId = volIdToPersonId.get(matchedVol.id);
      if (personId) {
        const checkinHHId = oldCheckinHHToNew.get(ciHH.id);
        if (checkinHHId) {
          // Find the person entry and add the household if not already there
          const personEntry = newPeople.find((p) => p.ref.id === personId);
          if (personEntry && !personEntry.data.household_ids.includes(checkinHHId)) {
            personEntry.data.household_ids.push(checkinHHId);
          }
          // Also set qr_token from the check-in household
          if (personEntry && !personEntry.data.qr_token) {
            personEntry.data.qr_token = ciHH.qr_token;
          }
        }
      }
      continue;
    }

    // Guardian is NOT a volunteer — create a new Person
    const ref = db.collection(`${prefix}/people`).doc();
    const now = new Date().toISOString();
    const nameParts = ciHH.primary_guardian_name.split(" ");
    const firstName = nameParts[0] ?? "";
    const lastName = nameParts.slice(1).join(" ") ?? "";

    const householdId = oldCheckinHHToNew.get(ciHH.id);

    const person = {
      church_id: churchId,
      household_ids: householdId ? [householdId] : [],
      person_type: "adult",
      first_name: firstName,
      last_name: lastName,
      preferred_name: null,
      name: ciHH.primary_guardian_name,
      search_name: ciHH.primary_guardian_name.toLowerCase(),
      email: null,
      phone: ciHH.primary_guardian_phone,
      search_phones: guardianPhone ? [guardianPhone] : [],
      photo_url: ciHH.photo_url ?? null,
      status: "active",
      user_id: null,
      membership_id: null,
      is_volunteer: false,
      ministry_ids: [],
      role_ids: [],
      campus_ids: [],
      scheduling_profile: null,
      child_profile: null,
      stats: null,
      imported_from: ciHH.imported_from ?? null,
      background_check: null,
      role_constraints: null,
      volunteer_journey: null,
      qr_token: ciHH.qr_token,
      created_at: ciHH.created_at,
      updated_at: now,
    };

    newPeople.push({ ref, data: person });
    console.log(`   Guardian "${ciHH.primary_guardian_name}" (non-volunteer) → Person ${ref.id}`);

    // Set primary_guardian_id on the household
    const hhEntry = newHouseholds.find((h) => h.ref.id === householdId);
    if (hhEntry && !hhEntry.data.primary_guardian_id) {
      hhEntry.data.primary_guardian_id = ref.id;
    }
  }

  // 4c: Children → Person (child, is_volunteer: false)
  for (const child of children) {
    const ref = db.collection(`${prefix}/people`).doc();
    const now = new Date().toISOString();

    // Map old check-in household_id → new unified household
    const householdId = oldCheckinHHToNew.get(child.household_id);

    const person = {
      church_id: churchId,
      household_ids: householdId ? [householdId] : [],
      person_type: "child",
      first_name: child.first_name,
      last_name: child.last_name,
      preferred_name: child.preferred_name ?? null,
      name: `${child.first_name} ${child.last_name}`,
      search_name: `${child.first_name} ${child.last_name}`.toLowerCase(),
      email: null,
      phone: null,
      search_phones: [],
      photo_url: child.photo_url ?? null,
      status: child.is_active ? "active" : "inactive",
      user_id: null,
      membership_id: null,
      is_volunteer: false,
      ministry_ids: [],
      role_ids: [],
      campus_ids: [],
      scheduling_profile: null,
      child_profile: {
        date_of_birth: child.date_of_birth ?? null,
        grade: child.grade ?? null,
        allergies: child.allergies ?? null,
        medical_notes: child.medical_notes ?? null,
        default_room_id: child.default_room_id ?? null,
        has_alerts: child.has_alerts,
        authorized_pickups: [], // No legacy data for this
        photo_url: child.photo_url ?? null,
      },
      stats: null,
      imported_from: child.imported_from ?? null,
      background_check: null,
      role_constraints: null,
      volunteer_journey: null,
      qr_token: null,
      created_at: child.created_at,
      updated_at: now,
    };

    newPeople.push({ ref, data: person });
    console.log(`   Child "${child.first_name} ${child.last_name}" → Person ${ref.id}`);
  }

  // ── Step 5: Update assignments with person_id ───────────────────────────

  console.log("\n📝 Mapping assignments...");

  const assignmentUpdates: { ref: FirebaseFirestore.DocumentReference; personId: string }[] = [];

  for (const doc of assignmentsSnap.docs) {
    const data = doc.data();
    const volunteerId = data.volunteer_id as string;
    const personId = volIdToPersonId.get(volunteerId);

    if (personId) {
      assignmentUpdates.push({ ref: doc.ref, personId });
    } else {
      console.log(`   ⚠️  Assignment ${doc.id} references unknown volunteer ${volunteerId}`);
    }
  }

  console.log(`   ${assignmentUpdates.length} assignments will be updated with person_id`);

  // ── Step 6: Write migration map ─────────────────────────────────────────

  const migrationMap = {
    generated_at: new Date().toISOString(),
    church_id: churchId,
    volunteer_to_person: Object.fromEntries(volIdToPersonId),
    scheduling_household_to_unified: Object.fromEntries(oldSchedulingHHToNew),
    checkin_household_to_unified: Object.fromEntries(oldCheckinHHToNew),
    stats: {
      people_created: newPeople.length,
      households_created: newHouseholds.length,
      assignments_updated: assignmentUpdates.length,
    },
  };

  const mapPath = path.join(process.cwd(), "migration-map.json");
  fs.writeFileSync(mapPath, JSON.stringify(migrationMap, null, 2));
  console.log(`\n📄 Migration map written to ${mapPath}`);

  // ── Step 7: Write to Firestore ──────────────────────────────────────────

  if (dryRun) {
    console.log("\n🏃 DRY RUN — no data was written to Firestore.");
    console.log(`   Would create ${newPeople.length} people`);
    console.log(`   Would create ${newHouseholds.length} households`);
    console.log(`   Would update ${assignmentUpdates.length} assignments`);
    return;
  }

  console.log("\n✍️  Writing to Firestore (batched, max 500 per batch)...");

  const BATCH_SIZE = 450; // Leave headroom under 500 limit
  let totalOps = 0;

  // Helper: commit operations in batches
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function batchWrite(ops: { type: "set" | "update"; ref: FirebaseFirestore.DocumentReference; data: any }[]) {
    for (let i = 0; i < ops.length; i += BATCH_SIZE) {
      const batch = db.batch();
      const slice = ops.slice(i, i + BATCH_SIZE);
      for (const op of slice) {
        if (op.type === "set") {
          batch.set(op.ref, op.data);
        } else {
          batch.update(op.ref, op.data);
        }
      }
      await batch.commit();
      totalOps += slice.length;
      console.log(`   Committed batch: ${slice.length} operations (total: ${totalOps})`);
    }
  }

  // Write households first (people reference them)
  await batchWrite(
    newHouseholds.map((h) => ({ type: "set" as const, ref: h.ref, data: h.data })),
  );

  // Write people
  await batchWrite(
    newPeople.map((p) => ({ type: "set" as const, ref: p.ref, data: p.data })),
  );

  // Update assignments
  await batchWrite(
    assignmentUpdates.map((a) => ({
      type: "update" as const,
      ref: a.ref,
      data: { person_id: a.personId },
    })),
  );

  console.log(`\n✅ Migration complete!`);
  console.log(`   People created: ${newPeople.length}`);
  console.log(`   Households created/merged: ${newHouseholds.length}`);
  console.log(`   Assignments updated: ${assignmentUpdates.length}`);
  console.log(`   Total Firestore operations: ${totalOps}`);
}

migrate().catch((err) => {
  console.error("❌ Migration failed:", err);
  process.exit(1);
});
