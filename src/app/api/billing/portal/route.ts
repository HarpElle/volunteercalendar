import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { adminAuth, adminDb } from "@/lib/firebase/admin";

export async function POST(req: NextRequest) {
  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json(
      { error: "Stripe not configured" },
      { status: 503 },
    );
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const decoded = await adminAuth.verifyIdToken(authHeader.slice(7));
  const userId = decoded.uid;

  try {
    const { church_id } = await req.json();

    if (!church_id) {
      return NextResponse.json(
        { error: "church_id is required" },
        { status: 400 },
      );
    }

    // Verify owner/admin role
    const membershipId = `${userId}_${church_id}`;
    const membership = await adminDb.doc(`memberships/${membershipId}`).get();
    if (
      !membership.exists ||
      !["owner", "admin"].includes(membership.data()?.role)
    ) {
      return NextResponse.json(
        { error: "Insufficient permissions" },
        { status: 403 },
      );
    }

    const churchRef = adminDb.doc(`churches/${church_id}`);
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
    console.error("Portal error:", err);
    return NextResponse.json(
      { error: "Failed to create portal session" },
      { status: 500 }
    );
  }
}
