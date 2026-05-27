import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { adminDb } from "@/lib/firebase/admin";
import { requireMembership } from "@/lib/server/authz";
import { parseBody, z } from "@/lib/server/validation";
import { log } from "@/lib/log";

const BodySchema = z.object({
  church_id: z.string().min(1),
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

  const auth = await requireMembership(req, body.church_id, "admin");
  if (auth instanceof NextResponse) return auth;
  void auth;

  try {
    const churchRef = adminDb.doc(`churches/${body.church_id}`);
    const churchSnap = await churchRef.get();
    if (!churchSnap.exists) {
      return NextResponse.json({ error: "Church not found" }, { status: 404 });
    }

    const customerId = churchSnap.data()!.stripe_customer_id as string | null;
    if (!customerId) {
      return NextResponse.json(
        { error: "No billing account found — subscribe to a plan first" },
        { status: 400 }
      );
    }

    const origin = req.headers.get("origin") || "http://localhost:3000";
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${origin}/dashboard/billing`,
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    log.error("POST /api/billing/portal failed", { error: err, church_id: body.church_id });
    return NextResponse.json(
      { error: "Failed to create portal session" },
      { status: 500 }
    );
  }
}
