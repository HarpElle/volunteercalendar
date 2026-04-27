import "dotenv/config";
import { adminDb, adminAuth } from "@/lib/firebase/admin";

async function main() {
  console.log("=".repeat(60));
  console.log("VOLUNTEERCAL PRODUCTION DATA AUDIT");
  console.log(`Run at: ${new Date().toISOString()}`);
  console.log("=".repeat(60));

  // 1. Churches overview
  const churches = await adminDb.collection("churches").get();
  console.log(`\n[1] Churches: ${churches.size} total`);
  for (const c of churches.docs) {
    const d = c.data();
    console.log(`    - ${c.id.slice(0, 8)}... "${d.name}" (tier=${d.subscription_tier}, created=${d.created_at?.slice(0, 10)})`);
  }

  // 2. Sensitive collections — total counts (sanity check no anonymous reads)
  const audit_logs_top = await adminDb.collection("audit_logs").count().get();
  const stripe_events = await adminDb.collection("stripe_processed_events").count().get();
  const outbox = await adminDb.collection("notification_outbox").get();
  console.log(`\n[2] Sensitive top-level collections:`);
  console.log(`    audit_logs: ${audit_logs_top.data().count} entries`);
  console.log(`    stripe_processed_events: ${stripe_events.data().count} (idempotency cache)`);
  console.log(`    notification_outbox: ${outbox.size} entries`);

  // 3. Outbox health
  const pending = outbox.docs.filter(d => d.data().status === "pending").length;
  const sent = outbox.docs.filter(d => d.data().status === "sent").length;
  const failed = outbox.docs.filter(d => d.data().status === "failed").length;
  const dead = outbox.docs.filter(d => d.data().status === "dead_letter").length;
  console.log(`\n[3] Outbox status: pending=${pending} sent=${sent} failed=${failed} dead_letter=${dead}`);

  if (pending > 0) {
    console.log(`\n    Stale pending entries:`);
    for (const d of outbox.docs.filter(x => x.data().status === "pending").slice(0, 5)) {
      const data = d.data();
      const age = Date.now() - new Date(data.created_at).getTime();
      console.log(`      - ${d.id.slice(0, 12)}... origin=${data.origin} age=${Math.floor(age / 60000)}min attempts=${data.attempts}`);
    }
  }

  // 4. Recent audit_logs (last 50)
  const recent = await adminDb.collection("audit_logs").orderBy("created_at", "desc").limit(50).get();
  console.log(`\n[4] Recent audit_logs (last ${recent.size}):`);
  const actionCounts = new Map<string, number>();
  for (const d of recent.docs) {
    const a = d.data().action as string;
    actionCounts.set(a, (actionCounts.get(a) ?? 0) + 1);
  }
  for (const [action, count] of [...actionCounts.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`    ${count}x ${action}`);
  }

  // 5. Kiosk infrastructure
  const stations = await adminDb.collection("kiosk_stations").get();
  const tokens = await adminDb.collection("kiosk_tokens").get();
  const activations = await adminDb.collection("kiosk_activations").get();
  console.log(`\n[5] Kiosk infrastructure:`);
  console.log(`    Stations: ${stations.size} (${stations.docs.filter(d => d.data().status === "active").length} active, ${stations.docs.filter(d => d.data().status === "revoked").length} revoked)`);
  console.log(`    Tokens: ${tokens.size} (${tokens.docs.filter(d => !d.data().revoked_at).length} live)`);
  console.log(`    Pending activation codes: ${activations.docs.filter(d => !d.data().consumed_at && new Date(d.data().expires_at) > new Date()).length}`);

  // 6. Per-church sensitive presence (children + sessions)
  console.log(`\n[6] Per-church sensitive data presence:`);
  for (const c of churches.docs) {
    const ref = c.ref;
    const [kids, hh, sessions] = await Promise.all([
      ref.collection("children").count().get(),
      ref.collection("checkin_households").count().get(),
      ref.collection("checkInSessions").count().get(),
    ]);
    if (kids.data().count > 0 || hh.data().count > 0 || sessions.data().count > 0) {
      console.log(`    ${c.id.slice(0, 8)}... children=${kids.data().count} households=${hh.data().count} sessions=${sessions.data().count}`);
    }
  }

  // 7. Stripe-marked-failed payments
  const paymentFailed = churches.docs.filter(d => d.data().payment_failed_at);
  if (paymentFailed.length > 0) {
    console.log(`\n[7] Churches with payment_failed_at set:`);
    for (const c of paymentFailed) {
      const d = c.data();
      console.log(`    ${c.id.slice(0, 8)}... "${d.name}" failed_at=${d.payment_failed_at?.slice(0, 16)} tier=${d.subscription_tier}`);
    }
  } else {
    console.log(`\n[7] No churches in payment-failure state ✓`);
  }

  // 8. Disputes
  const disputes = churches.docs.filter(d => d.data().dispute_pending_at);
  if (disputes.length > 0) {
    console.log(`\n[8] Churches with active disputes:`);
    for (const c of disputes) {
      const d = c.data();
      console.log(`    ${c.id.slice(0, 8)}... reason=${d.dispute_reason} amount=$${(d.dispute_amount_cents ?? 0) / 100}`);
    }
  } else {
    console.log(`\n[8] No active disputes ✓`);
  }

  // 9. Memberships breakdown
  const memberships = await adminDb.collection("memberships").get();
  const byStatus = new Map<string, number>();
  for (const m of memberships.docs) {
    const s = m.data().status as string;
    byStatus.set(s, (byStatus.get(s) ?? 0) + 1);
  }
  console.log(`\n[9] Memberships: ${memberships.size} total`);
  for (const [s, c] of byStatus) console.log(`    ${c}x ${s}`);

  console.log("\n" + "=".repeat(60));
  console.log("Audit complete.");
  console.log("=".repeat(60));
}

main().catch(e => { console.error(e); process.exit(1); });
