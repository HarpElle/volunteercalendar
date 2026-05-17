// One-shot cleanup: cancel the "Overlap Conflict Probe" reservation that
// PR #16 erroneously let persist (silent pending_approval). PR #17 makes the
// server fail closed; this cleans up the stale doc so Codex can retest the
// conflict modal cleanly.

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

  const snap = await db
    .collection(`churches/${CHURCH_ID}/reservations`)
    .where("title", "==", "Overlap Conflict Probe")
    .get();

  if (snap.empty) {
    console.log("No matching reservations found. Nothing to do.");
    return;
  }

  for (const doc of snap.docs) {
    const d = doc.data();
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
