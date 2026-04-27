import { NextRequest, NextResponse } from "next/server";
import { stripe, PRICE_TO_TIER } from "@/lib/stripe";
import { adminDb } from "@/lib/firebase/admin";
import type Stripe from "stripe";
import { buildPurchaseThankYouEmail } from "@/lib/utils/email-templates";
import { buildDowngradeNotificationEmail } from "@/lib/utils/emails/downgrade-notification";
import { isDowngrade, computeLostFeatures, computeOverLimitItems } from "@/lib/utils/tier-enforcement";
import { audit, SYSTEM_ACTOR } from "@/lib/server/audit";
import { Resend } from "resend";

const VALID_TIERS = ["free", "starter", "growth", "pro", "enterprise"];

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Send a plan-change notification email to the org owner when downgrading. */
async function sendDowngradeEmail(churchId: string, oldTier: string, newTier: string) {
  if (!process.env.RESEND_API_KEY) return;

  try {
    const churchSnap = await adminDb.doc(`churches/${churchId}`).get();
    const churchName = churchSnap.exists
      ? (churchSnap.data()?.name as string) || "Your organization"
      : "Your organization";

    // Find the owner
    const ownerSnap = await adminDb
      .collection("memberships")
      .where("church_id", "==", churchId)
      .where("role", "==", "owner")
      .where("status", "==", "active")
      .limit(1)
      .get();
    if (ownerSnap.empty) return;

    const ownerUserId = ownerSnap.docs[0].data().user_id as string;
    const ownerUserSnap = await adminDb.doc(`users/${ownerUserId}`).get();
    if (!ownerUserSnap.exists) return;

    const ownerEmail = ownerUserSnap.data()?.email as string;
    const ownerName = (ownerUserSnap.data()?.display_name as string) || "there";
    if (!ownerEmail) return;

    // Compute lost features and over-limit items
    const lostFeatures = computeLostFeatures(oldTier, newTier);

    const ministriesCount = (
      await adminDb.collection(`churches/${churchId}/ministries`).count().get()
    ).data().count;
    const volunteersCount = (
      await adminDb.collection(`churches/${churchId}/people`).where("is_volunteer", "==", true).count().get()
    ).data().count;
    const roomsSnap = await adminDb
      .collection(`churches/${churchId}/rooms`)
      .where("is_active", "==", true)
      .count()
      .get();
    const roomsCount = roomsSnap.data().count;

    const overLimitItems = computeOverLimitItems(newTier, {
      ministries: ministriesCount,
      volunteers: volunteersCount,
      rooms: roomsCount,
    });

    const { subject, html, text } = buildDowngradeNotificationEmail({
      userName: ownerName,
      churchName,
      oldPlanName: capitalize(oldTier),
      newPlanName: capitalize(newTier),
      lostFeatures,
      overLimitItems,
    });

    const resend = new Resend(process.env.RESEND_API_KEY);
    await resend.emails.send({
      from: "VolunteerCal <noreply@harpelle.com>",
      replyTo: "info@volunteercal.com",
      to: [ownerEmail],
      subject,
      html,
      text,
    });
  } catch (err) {
    console.error("Downgrade notification email failed:", err);
  }
}

export async function POST(req: NextRequest) {
  if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json(
      { error: "Stripe not configured" },
      { status: 503 }
    );
  }

  const body = await req.text();
  const sig = req.headers.get("stripe-signature") || "";

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error("Webhook signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  // Idempotency: Stripe retries webhook deliveries with the same event.id.
  // Record processed events and short-circuit duplicates so e.g. a tier upgrade
  // never gets applied twice. Doc id = event.id; rules deny client access.
  // We use a transaction-style "create if not exists" to atomically claim the
  // event before doing any side-effect work.
  const dedupeRef = adminDb.doc(`stripe_processed_events/${event.id}`);
  try {
    await dedupeRef.create({
      type: event.type,
      received_at: new Date().toISOString(),
    });
  } catch (err) {
    // Firestore throws ALREADY_EXISTS on duplicate create — that's our signal
    // that we've already processed this event.
    const code = (err as { code?: number | string })?.code;
    if (code === 6 /* ALREADY_EXISTS */ || code === "already-exists") {
      return NextResponse.json({ received: true, duplicate: true });
    }
    // Other errors — log and proceed; we'd rather double-process once than
    // drop an event due to an unrelated Firestore hiccup.
    console.error("Webhook idempotency check failed:", err);
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const churchId = session.metadata?.church_id;
        const tier = session.metadata?.tier;

        if (!churchId || typeof churchId !== "string" || churchId.trim() === "") {
          console.warn("Webhook: missing or invalid church_id in checkout metadata");
          break;
        }
        if (!tier || !VALID_TIERS.includes(tier)) {
          console.warn(`Webhook: invalid tier "${tier}" in checkout metadata`);
          break;
        }

        // Respect manual tier overrides
        const checkoutChurchSnap = await adminDb.doc(`churches/${churchId}`).get();
        if (checkoutChurchSnap.data()?.subscription_source === "manual") {
          console.warn(`Webhook: skipping tier change for ${churchId} — manual override active`);
          break;
        }

        await adminDb.doc(`churches/${churchId}`).update({
          subscription_tier: tier,
          stripe_customer_id: session.customer as string,
        });

        void audit({
          church_id: churchId,
          actor: SYSTEM_ACTOR,
          action: "billing.subscription_created",
          target_type: "stripe_subscription",
          target_id: typeof session.subscription === "string" ? session.subscription : null,
          metadata: { tier, stripe_event_id: event.id },
          outcome: "ok",
        });

        // Send purchase thank-you email (fire-and-forget)
        if (process.env.RESEND_API_KEY && session.customer_email) {
          const resend = new Resend(process.env.RESEND_API_KEY);
          const churchSnap = await adminDb.doc(`churches/${churchId}`).get();
          const churchName = churchSnap.exists ? (churchSnap.data()?.name as string) || "Your church" : "Your church";
          const tierName = tier.charAt(0).toUpperCase() + tier.slice(1);
          const { subject, html, text } = buildPurchaseThankYouEmail({
            userName: session.customer_details?.name || "there",
            planName: tierName,
            churchName,
          });
          resend.emails.send({
            from: "VolunteerCal <noreply@harpelle.com>",
            replyTo: "info@volunteercal.com",
            to: [session.customer_email],
            subject,
            html,
            text,
          }).catch((err: unknown) => console.error("Purchase thank-you email failed:", err));
        }
        break;
      }

      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        const churchId = subscription.metadata?.church_id;
        if (!churchId || typeof churchId !== "string" || churchId.trim() === "") {
          console.warn("Webhook: missing or invalid church_id in subscription.updated metadata");
          break;
        }

        // Respect manual tier overrides
        const updatedChurchSnap = await adminDb.doc(`churches/${churchId}`).get();
        if (updatedChurchSnap.data()?.subscription_source === "manual") {
          console.warn(`Webhook: skipping tier change for ${churchId} — manual override active`);
          break;
        }

        const priceId = subscription.items.data[0]?.price?.id || "";
        const tier = PRICE_TO_TIER[priceId] || "free";
        const isActive =
          subscription.status === "active" ||
          subscription.status === "trialing";
        const newTier = isActive ? tier : "free";
        const currentTier = (updatedChurchSnap.data()?.subscription_tier as string) || "free";

        await adminDb.doc(`churches/${churchId}`).update({
          subscription_tier: newTier,
          ...(isDowngrade(currentTier, newTier)
            ? { previous_tier: currentTier, tier_changed_at: new Date().toISOString() }
            : {}),
        });

        if (currentTier !== newTier) {
          void audit({
            church_id: churchId,
            actor: SYSTEM_ACTOR,
            action: "billing.subscription_updated",
            target_type: "stripe_subscription",
            target_id: subscription.id,
            metadata: {
              from_tier: currentTier,
              to_tier: newTier,
              status: subscription.status,
              stripe_event_id: event.id,
            },
            outcome: "ok",
          });
        }

        // Send downgrade notification email if applicable
        if (isDowngrade(currentTier, newTier)) {
          sendDowngradeEmail(churchId, currentTier, newTier).catch(() => {});
        }
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const churchId = subscription.metadata?.church_id;
        if (!churchId || typeof churchId !== "string" || churchId.trim() === "") {
          console.warn("Webhook: missing or invalid church_id in subscription.deleted metadata");
          break;
        }

        // Respect manual tier overrides
        const deletedChurchSnap = await adminDb.doc(`churches/${churchId}`).get();
        if (deletedChurchSnap.data()?.subscription_source === "manual") {
          console.warn(`Webhook: skipping tier change for ${churchId} — manual override active`);
          break;
        }

        const deletedCurrentTier = (deletedChurchSnap.data()?.subscription_tier as string) || "free";

        await adminDb.doc(`churches/${churchId}`).update({
          subscription_tier: "free",
          ...(deletedCurrentTier !== "free"
            ? { previous_tier: deletedCurrentTier, tier_changed_at: new Date().toISOString() }
            : {}),
        });

        void audit({
          church_id: churchId,
          actor: SYSTEM_ACTOR,
          action: "billing.subscription_canceled",
          target_type: "stripe_subscription",
          target_id: subscription.id,
          metadata: {
            from_tier: deletedCurrentTier,
            stripe_event_id: event.id,
          },
          outcome: "ok",
        });

        // Send downgrade notification if they were on a paid plan
        if (deletedCurrentTier !== "free") {
          sendDowngradeEmail(churchId, deletedCurrentTier, "free").catch(() => {});
        }
        break;
      }

      // ─── Track C.6 — payment failure tracking ────────────────────────────
      // We don't auto-downgrade immediately on a single failed payment.
      // Stripe Smart Retries handles the retries; we just mark the church
      // so admins (and a future dunning cron) can act. Auto-downgrade after
      // a 7-day grace lands as a follow-up.
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        // The relation to the subscription may live on the invoice for older
        // API versions or via the parent.subscription_details link on newer
        // ones. We try both shapes.
        const sub =
          (invoice as unknown as { subscription?: string }).subscription ??
          (invoice as unknown as { parent?: { subscription_details?: { subscription?: string } } })
            .parent?.subscription_details?.subscription ?? null;

        let churchId: string | null = null;
        if (sub && typeof sub === "string") {
          try {
            const subscription = await stripe.subscriptions.retrieve(sub);
            churchId = (subscription.metadata?.church_id as string) ?? null;
          } catch {
            // ignore; fall through with null
          }
        }
        if (!churchId) {
          console.warn(
            "Webhook: invoice.payment_failed without resolvable church_id",
          );
          break;
        }

        const now = new Date().toISOString();
        await adminDb.doc(`churches/${churchId}`).update({
          payment_failed_at: now,
          payment_failed_invoice_id: invoice.id,
          payment_failed_amount_cents: invoice.amount_due ?? null,
        });

        void audit({
          church_id: churchId,
          actor: SYSTEM_ACTOR,
          action: "billing.invoice_failed",
          target_type: "stripe_invoice",
          target_id: invoice.id ?? null,
          metadata: {
            amount_cents: invoice.amount_due ?? null,
            attempt_count: invoice.attempt_count ?? null,
            stripe_event_id: event.id,
          },
          outcome: "failed",
        });
        break;
      }

      case "invoice.payment_succeeded": {
        const invoice = event.data.object as Stripe.Invoice;
        const sub =
          (invoice as unknown as { subscription?: string }).subscription ??
          (invoice as unknown as { parent?: { subscription_details?: { subscription?: string } } })
            .parent?.subscription_details?.subscription ?? null;

        let churchId: string | null = null;
        if (sub && typeof sub === "string") {
          try {
            const subscription = await stripe.subscriptions.retrieve(sub);
            churchId = (subscription.metadata?.church_id as string) ?? null;
          } catch {
            // ignore
          }
        }
        if (!churchId) break;

        // Clear any prior payment_failed flags — a successful payment
        // resolves the dunning state.
        const churchSnap = await adminDb.doc(`churches/${churchId}`).get();
        if (churchSnap.exists && churchSnap.data()?.payment_failed_at) {
          await adminDb.doc(`churches/${churchId}`).update({
            payment_failed_at: null,
            payment_failed_invoice_id: null,
            payment_failed_amount_cents: null,
          });
        }
        void audit({
          church_id: churchId,
          actor: SYSTEM_ACTOR,
          action: "billing.invoice_paid",
          target_type: "stripe_invoice",
          target_id: invoice.id ?? null,
          metadata: {
            amount_cents: invoice.amount_paid ?? null,
            stripe_event_id: event.id,
          },
          outcome: "ok",
        });
        break;
      }

      // ─── Track C.10 — dispute notification ──────────────────────────────
      // We don't auto-cancel anything; humans decide. We mark the church
      // for review, audit-log the dispute, and notify the platform admin.
      case "charge.dispute.created": {
        const dispute = event.data.object as Stripe.Dispute;
        const charge = dispute.charge;
        const chargeId =
          typeof charge === "string" ? charge : charge?.id ?? null;

        let churchId: string | null = null;
        try {
          if (chargeId) {
            const ch = await stripe.charges.retrieve(chargeId, {
              expand: ["customer"],
            });
            const customer = ch.customer as Stripe.Customer | string | null;
            const customerId =
              typeof customer === "string" ? customer : customer?.id ?? null;
            if (customerId) {
              // Look up church by stripe_customer_id
              const churchSnap = await adminDb
                .collection("churches")
                .where("stripe_customer_id", "==", customerId)
                .limit(1)
                .get();
              if (!churchSnap.empty) {
                churchId = churchSnap.docs[0].id;
              }
            }
          }
        } catch (e) {
          console.error("Dispute lookup failed:", e);
        }

        const now = new Date().toISOString();
        if (churchId) {
          await adminDb.doc(`churches/${churchId}`).update({
            dispute_pending_at: now,
            dispute_id: dispute.id,
            dispute_reason: dispute.reason ?? null,
            dispute_amount_cents: dispute.amount ?? null,
          });
        }
        void audit({
          church_id: churchId,
          actor: SYSTEM_ACTOR,
          action: "billing.dispute_created",
          target_type: "stripe_dispute",
          target_id: dispute.id,
          metadata: {
            charge_id: chargeId,
            amount_cents: dispute.amount,
            reason: dispute.reason,
            status: dispute.status,
            stripe_event_id: event.id,
          },
          outcome: "ok",
        });
        break;
      }
    }
  } catch (err) {
    console.error("Webhook handler error:", err);
    return NextResponse.json(
      { error: "Webhook processing failed" },
      { status: 500 }
    );
  }

  return NextResponse.json({ received: true });
}
