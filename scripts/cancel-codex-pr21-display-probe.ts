// One-shot cleanup: cancel the "PR21 Sanctuary Display Probe" reservation
// Codex submitted while testing the wall display. It was confirmed but hidden
// from the room detail by the UTC-today bug PR #22 fixes. Codex will re-book
// fresh against the new TZ-aware path; this just keeps the data tidy.

import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import * as fs from "fs";

const env = fs.readFileSync(".env.local", "utf8");
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

  const snap = await db
    .collection(`churches/${CHURCH_ID}/reservations`)
    .where("title", "==", "PR21 Sanctuary Display Probe")
    .get();

  if (snap.empty) {
    console.log("No matching reservations found. Nothing to do.");
    return;
  }

  for (const doc of snap.docs) {
    const d = doc.data();
    if (d.status !== "confirmed" && d.status !== "pending_approval") {
      console.log(`  ${doc.id}  already ${d.status} (skip)`);
      continue;
    }
    console.log(
      `  ${doc.id}  ${d.date} ${d.start_time}-${d.end_time}  status=${d.status} → cancelled`,
    );
    if (!DRY_RUN) {
      await doc.ref.update({
        status: "cancelled",
        updated_at: new Date().toISOString(),
      });
    }
  }

  console.log(
    `\n${DRY_RUN ? "Would cancel" : "Cancelled"} ${snap.size} reservation(s).`,
  );
  if (DRY_RUN) console.log("Re-run with --apply to write.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
