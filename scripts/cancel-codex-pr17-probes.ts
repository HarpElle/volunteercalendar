// One-shot cleanup: cancel the three "PR17 Fellowship..." probe reservations
// Codex submitted during the PR #17 retest. They sit at status=pending_approval
// but have no corresponding reservation_requests docs (because of the bug PR
// #18 fixes). Easier to cancel and let Codex re-book fresh than to backfill
// the queue docs — keeps the retest end-to-end against the new POST path.

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

const CHURCH_ID = "NQUd09eP1fOD3MWrdpIbHYUXm0z2";
const DRY_RUN = !process.argv.includes("--apply");

async function main() {
  console.log(`Mode: ${DRY_RUN ? "DRY RUN" : "APPLY"}`);

  // Title-prefix match catches all three PR17 Fellowship probes regardless of
  // exact suffix. Idempotent: only flips docs still pending.
  const snap = await db
    .collection(`churches/${CHURCH_ID}/reservations`)
    .get();

  const targets = snap.docs.filter((d) => {
    const t = (d.data().title as string) || "";
    return t.startsWith("PR17 Fellowship");
  });

  if (targets.length === 0) {
    console.log("No matching reservations found. Nothing to do.");
    return;
  }

  let cancelled = 0;
  for (const doc of targets) {
    const d = doc.data();
    if (d.status !== "pending_approval" && d.status !== "confirmed") {
      console.log(
        `  ${doc.id}  ${d.date} ${d.title}  already ${d.status} (skip)`,
      );
      continue;
    }
    console.log(
      `  ${doc.id}  ${d.date} ${d.start_time}-${d.end_time}  ${d.title}  status=${d.status} → cancelled`,
    );
    if (!DRY_RUN) {
      await doc.ref.update({
        status: "cancelled",
        updated_at: new Date().toISOString(),
      });
    }
    cancelled++;
  }

  console.log(
    `\n${DRY_RUN ? "Would cancel" : "Cancelled"} ${cancelled} reservation(s).`,
  );
  if (DRY_RUN) console.log("Re-run with --apply to write.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
