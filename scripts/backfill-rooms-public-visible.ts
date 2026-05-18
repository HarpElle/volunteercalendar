// Backfill: flip `public_visible: false` rooms to `true` so the public
// calendar + iCal feed actually shows something. The previous POST default
// was `false`, so every room created before PR #24 is hidden from the
// public calendar even when the org-wide flag is on.
//
// Idempotent: only touches rooms where `public_visible !== true`. Admins
// who explicitly want a room hidden can flip the per-room toggle off in
// the room edit form.

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

const DRY_RUN = !process.argv.includes("--apply");

async function main() {
  console.log(`Mode: ${DRY_RUN ? "DRY RUN" : "APPLY"}`);

  const churchSnap = await db.collection("churches").get();
  let flipped = 0;
  let skipped = 0;

  for (const churchDoc of churchSnap.docs) {
    const churchId = churchDoc.id;
    const roomsSnap = await churchDoc.ref.collection("rooms").get();
    for (const roomDoc of roomsSnap.docs) {
      const d = roomDoc.data();
      if (d.public_visible === true) {
        skipped++;
        continue;
      }
      console.log(
        `  ${churchId}/rooms/${roomDoc.id}  ${d.name}  public_visible=${d.public_visible} → true`,
      );
      if (!DRY_RUN) {
        await roomDoc.ref.update({
          public_visible: true,
          updated_at: new Date().toISOString(),
        });
      }
      flipped++;
    }
  }

  console.log(
    `\n${DRY_RUN ? "Would flip" : "Flipped"} ${flipped} room(s); skipped ${skipped} already-public.`,
  );
  if (DRY_RUN) console.log("Re-run with --apply to write.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
