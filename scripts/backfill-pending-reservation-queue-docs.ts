// Backfill: create reservation_requests queue docs for any reservation
// stuck at status=pending_approval without a corresponding queue doc.
//
// Why this exists: PR #18 fixed the POST path to write a queue doc on
// pending_approval, but a handful of reservations were submitted in the
// window between PR #18's merge and Vercel finishing the deploy and never
// got their queue doc. This script is idempotent — only touches
// pending_approval reservations that have NO existing request doc, and
// records the same fields the live POST path now writes.

import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import * as fs from "fs";
import * as path from "path";

const envPath = path.resolve(process.cwd(), ".env.local");
const env = fs.readFileSync(envPath, "utf8");
const get = (k: string) =>
  env
    .split("\n")
    .find((l) => l.startsWith(`${k}=`))
    ?.slice(k.length + 1)
    .replace(/^"|"$/g, "")
    .replace(/\\n/g, "\n");

if (getApps().length === 0) {
  initializeApp({
    credential: cert({
      projectId: get("FIREBASE_ADMIN_PROJECT_ID"),
      clientEmail: get("FIREBASE_ADMIN_CLIENT_EMAIL"),
      privateKey: get("FIREBASE_ADMIN_PRIVATE_KEY"),
    }),
  });
}
const db = getFirestore();

const DRY_RUN = !process.argv.includes("--apply");

async function main() {
  console.log(`Mode: ${DRY_RUN ? "DRY RUN" : "APPLY"}`);

  const churchSnap = await db.collection("churches").get();
  let created = 0;
  let skipped = 0;

  for (const churchDoc of churchSnap.docs) {
    const churchId = churchDoc.id;
    const resvSnap = await churchDoc.ref
      .collection("reservations")
      .where("status", "==", "pending_approval")
      .get();
    if (resvSnap.empty) continue;

    // Map every existing request doc by its new_reservation_id so we can
    // tell which reservations already have one. Recurring requests point to
    // one occurrence in the group, so also build a group-id set.
    const requestSnap = await churchDoc.ref
      .collection("reservation_requests")
      .get();
    const reservationsWithRequest = new Set<string>();
    const groupsWithRequest = new Set<string>();
    for (const r of requestSnap.docs) {
      const d = r.data();
      if (d.new_reservation_id) {
        reservationsWithRequest.add(d.new_reservation_id as string);
      }
      if (d.recurrence_group_id) {
        groupsWithRequest.add(d.recurrence_group_id as string);
      }
    }

    const seenGroupsThisRun = new Set<string>();

    for (const resv of resvSnap.docs) {
      const data = resv.data();
      const groupId = data.recurrence_group_id as string | undefined;

      // For recurring: only enqueue once per group.
      if (groupId) {
        if (groupsWithRequest.has(groupId) || seenGroupsThisRun.has(groupId)) {
          skipped++;
          continue;
        }
      } else {
        if (reservationsWithRequest.has(resv.id)) {
          skipped++;
          continue;
        }
      }

      const conflicting = (data.conflict_with_ids as string[]) || [];
      const reason = conflicting.length > 0 ? "conflict" : "approval_required";

      console.log(
        `  ${churchId}/reservations/${resv.id}  ${data.date} ${data.start_time}-${data.end_time}  "${data.title}"  reason=${reason}${groupId ? `  group=${groupId}` : ""}`,
      );

      if (!DRY_RUN) {
        const newRef = churchDoc.ref.collection("reservation_requests").doc();
        await newRef.set({
          id: newRef.id,
          church_id: churchId,
          new_reservation_id: resv.id,
          reason,
          conflicting_reservation_ids: conflicting,
          status: "pending",
          created_at: data.created_at || new Date().toISOString(),
          ...(groupId ? { recurrence_group_id: groupId } : {}),
        });
      }
      if (groupId) seenGroupsThisRun.add(groupId);
      created++;
    }
  }

  console.log(
    `\n${DRY_RUN ? "Would create" : "Created"} ${created} request doc(s); skipped ${skipped} (already had one).`,
  );
  if (DRY_RUN) console.log("Re-run with --apply to write.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
