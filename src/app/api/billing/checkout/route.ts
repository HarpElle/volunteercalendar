import { NextRequest, NextResponse } from "next/server";
import { stripe, TIER_TO_PRICE } from "@/lib/stripe";
import { db } from "@/lib/firebase/config";
import { doc, getDoc, updateDoc } from "firebase/firestore";

export async function POST(req: NextRequest) {
  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json(
      { error: "Stripe not configured" },
      { status: 503 }
    );
  }

  try {
    const { church_id, tier } = await req.json();

    if (!church_id || !tier) {
      return NextResponse.json(
        { error: "church_id and tier are required" },
        { status: 400 }
      );
    }

    const priceId = TIER_TO_PRICE[tier];
    if (!priceId) {
      return NextResponse.json(
        { error: `No Stripe price configured for tier: ${tier}` },
        { status: 400 }
      );
    }

    // Get church to check for existing Stripe customer
    const churchRef = doc(db, "churches", church_id);
    const churchSnap = await getDoc(churchRef);
    if (!churchSnap.exists()) {
      return NextResponse.json({ error: "Church not found" }, { status: 404 });
    }

    const churchData = churchSnap.data();
    let customerId = churchData.stripe_customer_id as string | null;

    // Create Stripe customer if needed
    if (!customerId) {
      const customer = await stripe.customers.create({
        metadata: { church_id, church_name: churchData.name as string },
      });
      customerId = customer.id;
      await updateDoc(churchRef, { stripe_customer_id: customerId });
    }

    // Create checkout session
    const origin = req.headers.get("origin") || "http://localhost:3000";
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${origin}/dashboard/billing?success=true`,
      cancel_url: `${origin}/dashboard/billing?canceled=true`,
      metadata: { church_id, tier },
      subscription_data: {
        metadata: { church_id, tier },
      },
      allow_promotion_codes: true,
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("Checkout error:", err);
    return NextResponse.json(
      { error: "Failed to create checkout session" },
      { status: 500 }
    );
  }
}
