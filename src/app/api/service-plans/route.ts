import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { requireModuleTier } from "@/lib/server/require-module-tier";
import type { ServicePlan } from "@/lib/types";

/**
 * POST /api/service-plans
 *
 * Create a new service plan (order of service) for a specific service date.
 * Requires admin or scheduler role.
 */
export async function POST(req: NextRequest) {
  try {
    const gate = await requireModuleTier(req, "worship", {
      churchIdFrom: "body",
    });
    if (!gate.ok) return gate.response;
    const { userId, churchId, role } = gate.ctx;

    if (!["owner", "admin", "scheduler"].includes(role)) {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
    }

    const body = await req.json();
    const {
      service_id,
      service_date,
      theme,
      speaker,
      scripture_references,
      notes,
    } = body as {
      church_id: string;
      service_id: string;
      service_date: string;
      theme?: string;
      speaker?: string;
      scripture_references?: string[];
      notes?: string;
    };

    if (!service_id || !service_date) {
      return NextResponse.json(
        { error: "Missing required fields: church_id, service_id, service_date" },
        { status: 400 },
      );
    }

    const churchRef = adminDb.collection("churches").doc(churchId);

    const planData: Omit<ServicePlan, "id"> = {
      church_id: churchId,
      service_id,
      service_date,
      theme: theme || null,
      speaker: speaker || null,
      scripture_references: scripture_references || [],
      notes: notes || null,
      items: [],
      published: false,
      published_at: null,
      stage_sync: null,
      created_at: new Date().toISOString(),
      updated_by: userId,
    };

    const docRef = await churchRef.collection("service_plans").add(planData);

    return NextResponse.json(
      { id: docRef.id, ...planData },
      { status: 201 },
    );
  } catch (error) {
    console.error("[POST /api/service-plans]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

/**
 * GET /api/service-plans
 *
 * List service plans for a church with optional filters.
 * Requires any active membership role.
 *
 * Query params:
 *   church_id (required)
 *   service_id (optional)
 *   service_date (optional)
 *   published (optional — "true" or "false")
 */
export async function GET(req: NextRequest) {
  try {
    const gate = await requireModuleTier(req, "worship");
    if (!gate.ok) return gate.response;
    const { userId, churchId } = gate.ctx;

    const serviceId = req.nextUrl.searchParams.get("service_id");
    const serviceDate = req.nextUrl.searchParams.get("service_date");
    const publishedParam = req.nextUrl.searchParams.get("published");

    // Preserve membership status === "active" check (helper only verifies existence).
    const membershipSnap = await adminDb.doc(`memberships/${userId}_${churchId}`).get();
    if (membershipSnap.data()?.status !== "active") {
      return NextResponse.json({ error: "Membership not active" }, { status: 403 });
    }

    const churchRef = adminDb.collection("churches").doc(churchId);
    let query: FirebaseFirestore.Query = churchRef.collection("service_plans");

    if (serviceId) {
      query = query.where("service_id", "==", serviceId);
    }
    if (serviceDate) {
      query = query.where("service_date", "==", serviceDate);
    }
    if (publishedParam !== null && publishedParam !== undefined) {
      query = query.where("published", "==", publishedParam === "true");
    }

    query = query.orderBy("service_date", "desc");

    const snapshot = await query.get();

    const plans: ServicePlan[] = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as ServicePlan[];

    return NextResponse.json({ plans, total: plans.length });
  } catch (error) {
    console.error("[GET /api/service-plans]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
