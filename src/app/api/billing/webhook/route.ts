import { NextRequest, NextResponse } from "next/server";
import { stripe, PRICE_TO_TIER } from "@/lib/stripe";
import { adminDb } from "@/lib/firebase/admin";
import type Stripe from "stripe";
import { buildPurchaseThankYouEmail } from "@/lib/utils/email-templates";
import { Resend } from "resend";

const VALID_TIERS = ["free", "starter", "growth", "pro", "enterprise"];

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
        await adminDb.doc(`churches/${churchId}`).update({
          subscription_tier: isActive ? tier : "free",
        });
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

        await adminDb.doc(`churches/${churchId}`).update({
          subscription_tier: "free",
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
