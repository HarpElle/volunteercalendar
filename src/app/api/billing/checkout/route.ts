import { NextRequest, NextResponse } from "next/server";
import { stripe, TIER_TO_PRICE } from "@/lib/stripe";
import { adminDb } from "@/lib/firebase/admin";
import { requireMembership } from "@/lib/server/authz";
import { parseBody, z } from "@/lib/server/validation";
import { log } from "@/lib/log";

const BodySchema = z.object({
  church_id: z.string().min(1),
  tier: z.string().min(1),
});

export async function POST(req: NextRequest) {
  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json(
      { error: "Stripe not configured" },
      { status: 503 },
    );
  }

  const body = await parseBody(req, BodySchema);
  if (body instanceof NextResponse) return body;

  // Require admin+ membership on the church we're billing
  const auth = await requireMembership(req, body.church_id, "admin");
  if (auth instanceof NextResponse) return auth;

  try {
    const { church_id, tier } = body;
    const priceId = TIER_TO_PRICE[tier];
    if (!priceId) {
      return NextResponse.json(
        { error: `No Stripe price configured for tier: ${tier}` },
        { status: 400 },
      );
    }

    // Get church to check for existing Stripe customer
    const churchRef = adminDb.doc(`churches/${church_id}`);
    const churchSnap = await churchRef.get();
    if (!churchSnap.exists) {
      return NextResponse.json({ error: "Church not found" }, { status: 404 });
    }

    const churchData = churchSnap.data()!;
    let customerId = churchData.stripe_customer_id as string | null;

    // Create Stripe customer if needed.
    // Pre-populate email + name so receipts go to the right person and the
    // Stripe dashboard shows the church's name on the Customer record.
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: auth.email ?? undefined,
        name: (churchData.name as string) || undefined,
        metadata: {
          church_id,
          church_name: (churchData.name as string) ?? "",
          user_id: auth.uid,
          user_email: auth.email ?? "",
        },
      });
      customerId = customer.id;
      await churchRef.update({ stripe_customer_id: customerId });
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
    log.error("POST /api/billing/checkout failed", { error: err, church_id: body.church_id, tier: body.tier });
    return NextResponse.json(
      { error: "Failed to create checkout session" },
      { status: 500 }
    );
  }
}
