import { NextRequest, NextResponse } from "next/server";
import { stripe, PRICE_TO_TIER } from "@/lib/stripe";
import { db } from "@/lib/firebase/config";
import { doc, updateDoc } from "firebase/firestore";
import type Stripe from "stripe";

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
        if (churchId && tier) {
          await updateDoc(doc(db, "churches", churchId), {
            subscription_tier: tier,
            stripe_customer_id: session.customer as string,
          });
        }
        break;
      }

      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        const churchId = subscription.metadata?.church_id;
        if (churchId) {
          const priceId = subscription.items.data[0]?.price?.id || "";
          const tier = PRICE_TO_TIER[priceId] || "free";
          const isActive =
            subscription.status === "active" ||
            subscription.status === "trialing";
          await updateDoc(doc(db, "churches", churchId), {
            subscription_tier: isActive ? tier : "free",
          });
        }
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const churchId = subscription.metadata?.church_id;
        if (churchId) {
          await updateDoc(doc(db, "churches", churchId), {
            subscription_tier: "free",
          });
        }
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
