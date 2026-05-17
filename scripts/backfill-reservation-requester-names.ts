// Backfill: replace requested_by_name="Unknown" on existing reservations with
// the actual user's display_name from users/{uid}. Caused by an earlier bug
// where the booking endpoint read membership.display_name (which doesn't
// exist on the membership doc) and fell through to "Unknown".
//
// Idempotent: only touches reservations where requested_by_name is missing,
// empty, or literally "Unknown".

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
  let fixed = 0;
  let skipped = 0;
  const nameCache = new Map<string, string>();

  async function resolveName(uid: string): Promise<string | null> {
    if (nameCache.has(uid)) return nameCache.get(uid)!;
    const userSnap = await db.doc(`users/${uid}`).get();
    if (!userSnap.exists) return null;
    const u = userSnap.data()!;
    const name =
      (u.display_name as string) ||
      (u.name as string) ||
      (u.email as string) ||
      null;
    if (name) nameCache.set(uid, name);
    return name;
  }

  for (const churchDoc of churchSnap.docs) {
    const churchId = churchDoc.id;
    const resvSnap = await churchDoc.ref.collection("reservations").get();
    for (const r of resvSnap.docs) {
      const data = r.data();
      const name = (data.requested_by_name as string) || "";
      if (name && name !== "Unknown") {
        skipped++;
        continue;
      }
      const uid = data.requested_by as string | undefined;
      if (!uid) {
        skipped++;
        continue;
      }
      const resolved = await resolveName(uid);
      if (!resolved) {
        skipped++;
        continue;
      }
      console.log(
        `  ${churchId}/reservations/${r.id}  ${data.date} ${data.title}  ${name || "(empty)"} → ${resolved}`,
      );
      if (!DRY_RUN) {
        await r.ref.update({
          requested_by_name: resolved,
          updated_at: new Date().toISOString(),
        });
      }
      fixed++;
    }
  }

  console.log(
    `\n${DRY_RUN ? "Would fix" : "Fixed"} ${fixed} reservation(s); skipped ${skipped}`,
  );
  if (DRY_RUN) console.log(`\nRe-run with --apply to write the changes.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
