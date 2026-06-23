import "dotenv/config";
import { adminDb } from "@/lib/firebase/admin";
import { FieldValue } from "firebase-admin/firestore";
import { PRIVATE_MEDICAL_FIELDS } from "@/lib/server/child-medical";

/**
 * Phase 3 migration: move the five sensitive child_profile fields off the
 * volunteer-readable parent people doc into the private subcollection
 * `churches/{churchId}/people/{personId}/private/medical`, then DELETE them
 * from the parent doc.
 *
 * Privacy is only fixed once the parent fields are physically removed —
 * duplicating is not enough (Codex design review). This script does both:
 * copy → private, delete → parent, in one batched write per child.
 *
 * Idempotent: a child whose parent doc already has none of the five fields
 * is skipped. Safe to re-run.
 *
 * Usage:
 *   npx -y dotenv-cli -e .env.local -- npx tsx scripts/migrate-child-private-medical.ts            # all eligible orgs, DRY RUN
 *   npx -y dotenv-cli -e .env.local -- npx tsx scripts/migrate-child-private-medical.ts --apply    # all eligible orgs, WRITE
 *   ... --church <churchId>                                                                        # single org
 *
 * Anchor Falls (production, not yet on child check-in) is ALWAYS skipped.
 */

const ANCHOR_FALLS = "7ccbd7e6-f0f5-4f48-861f-15fb87ac2ccc";

function hasPrivateKeys(cp: Record<string, unknown>): boolean {
  return PRIVATE_MEDICAL_FIELDS.some((k) => k in cp);
}

async function migrateChurch(
  churchId: string,
  churchName: string,
  apply: boolean,
): Promise<{ scanned: number; migrated: number; clean: number }> {
  const churchRef = adminDb.collection("churches").doc(churchId);
  const childrenSnap = await churchRef
    .collection("people")
    .where("person_type", "==", "child")
    .get();

  let migrated = 0;
  let clean = 0;

  for (const doc of childrenSnap.docs) {
    const data = doc.data();
    const cp = (data.child_profile as Record<string, unknown> | undefined) ?? {};

    if (!hasPrivateKeys(cp)) {
      clean++;
      continue;
    }

    const medical = {
      date_of_birth: cp.date_of_birth ?? null,
      allergies: cp.allergies ?? null,
      medical_notes: cp.medical_notes ?? null,
      medications: cp.medications ?? null,
      authorized_pickups: cp.authorized_pickups ?? [],
      updated_at: new Date().toISOString(),
      migrated_at: new Date().toISOString(),
    };

    if (apply) {
      const batch = adminDb.batch();
      // 1. Write the five fields into the private subdoc.
      batch.set(
        doc.ref.collection("private").doc("medical"),
        medical,
        { merge: true },
      );
      // 2. Delete the five keys from the parent child_profile (nested
      //    field deletes leave the safe summary fields untouched).
      const deletes: Record<string, FieldValue> = {};
      for (const k of PRIVATE_MEDICAL_FIELDS) {
        deletes[`child_profile.${k}`] = FieldValue.delete();
      }
      batch.update(doc.ref, deletes);
      await batch.commit();
    }
    migrated++;
    console.log(
      `    ${apply ? "✓" : "[dry] would migrate"} ${doc.id} (${(data.first_name as string) ?? "?"} ${(data.last_name as string) ?? ""})`,
    );
  }

  return { scanned: childrenSnap.size, migrated, clean };
}

async function main() {
  const apply = process.argv.includes("--apply");
  // Anchor Falls (production) is skipped by default. Migrating it is a
  // deliberate act requiring BOTH this flag and --church <anchorFallsId>,
  // authorized by Jason 2026-06-23 ahead of going live on child check-in.
  const includeAnchorFalls = process.argv.includes("--include-anchor-falls");
  const churchArgIdx = process.argv.indexOf("--church");
  const singleChurch = churchArgIdx >= 0 ? process.argv[churchArgIdx + 1] : null;

  console.log("─".repeat(64));
  console.log(
    `Phase 3 child-medical migration — ${apply ? "APPLY (writing)" : "DRY RUN (no writes)"}`,
  );
  console.log("─".repeat(64));

  let churches;
  if (singleChurch) {
    const snap = await adminDb.collection("churches").doc(singleChurch).get();
    if (!snap.exists) {
      console.error(`Church ${singleChurch} not found.`);
      process.exit(1);
    }
    churches = [snap];
  } else {
    churches = (await adminDb.collection("churches").get()).docs;
  }

  let totalScanned = 0;
  let totalMigrated = 0;
  let totalClean = 0;

  for (const c of churches) {
    if (c.id === ANCHOR_FALLS && !includeAnchorFalls) {
      console.log(`\n  ⏭  SKIP Anchor Falls (${c.id}) — off limits (pass --include-anchor-falls to override)`);
      continue;
    }
    if (c.id === ANCHOR_FALLS) {
      console.log(`\n  ⚠️  INCLUDING Anchor Falls (${c.id}) — explicit override`);
    }
    const name = (c.data()?.name as string) || c.id;
    console.log(`\n  Church: ${name} (${c.id.slice(0, 8)}…)`);
    const r = await migrateChurch(c.id, name, apply);
    console.log(
      `    scanned=${r.scanned} migrated=${r.migrated} already-clean=${r.clean}`,
    );
    totalScanned += r.scanned;
    totalMigrated += r.migrated;
    totalClean += r.clean;
  }

  console.log("\n" + "─".repeat(64));
  console.log(
    `TOTAL: scanned=${totalScanned} migrated=${totalMigrated} already-clean=${totalClean}`,
  );
  if (!apply) {
    console.log("DRY RUN — no data written. Re-run with --apply to migrate.");
  }
  console.log("─".repeat(64));
  process.exit(0);
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
