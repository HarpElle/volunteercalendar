import "dotenv/config";
import { adminDb } from "@/lib/firebase/admin";

/**
 * One-shot migration to set demo orgs' notification_mode to
 * "in_app_only" so Codex / reviewer accounts can poke through
 * workflows without burning Resend quota or texting test phones.
 *
 * Run via: `npx tsx scripts/set-org-notification-mode.ts`
 *
 * Idempotent: re-running on an already-migrated org is a no-op.
 */

const DEMO_ORGS: Array<{ id: string; name: string }> = [
  { id: "MkkPAIXB8PVR1Q8Utv36QP2z2Mw1", name: "Abbott Loop Church" },
  { id: "lntWCgZuU6an05SCWjlbGQga9Q42", name: "Anchorage Bread Basket" },
];

async function main() {
  console.log("─".repeat(60));
  console.log("Set notification_mode = 'in_app_only' on demo orgs");
  console.log("─".repeat(60));

  for (const org of DEMO_ORGS) {
    const ref = adminDb.doc(`churches/${org.id}`);
    const snap = await ref.get();
    if (!snap.exists) {
      console.log(`  ✗ ${org.name} (${org.id}) — doc not found, skipped`);
      continue;
    }
    const data = snap.data() ?? {};
    const settings = (data.settings as Record<string, unknown> | undefined) ?? {};
    const current = settings.notification_mode as string | undefined;
    if (current === "in_app_only") {
      console.log(`  ✓ ${org.name} — already in_app_only, no change`);
      continue;
    }
    await ref.update({
      "settings.notification_mode": "in_app_only",
    });
    console.log(
      `  ✓ ${org.name} — updated (was: ${current ?? "unset"} → in_app_only)`,
    );
  }

  console.log("\nDone.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
