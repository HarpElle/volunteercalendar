import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { isPlatformAdmin } from "@/lib/utils/platform-admin";
import { sendEmail } from "@/lib/services/email";
import type { FeedbackItem } from "@/lib/types";

// ─── GET ──────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const decoded = await adminAuth.verifyIdToken(authHeader.slice(7));
    if (!isPlatformAdmin(decoded.uid)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const platformOnly = req.nextUrl.searchParams.get("platform_only") !== "false";
    const categoryFilter = req.nextUrl.searchParams.get("category") || "";
    const statusFilter = req.nextUrl.searchParams.get("status") || "";

    // Build church name cache
    const churchesSnap = await adminDb.collection("churches").get();
    const churchNameMap = new Map<string, string>();
    for (const doc of churchesSnap.docs) {
      churchNameMap.set(doc.id, (doc.data().name as string) || "Unknown Org");
    }

    // Query all feedback across churches
    const feedbackSnap = await adminDb.collectionGroup("feedback").get();

    let items: (FeedbackItem & { org_name: string })[] = feedbackSnap.docs.map(
      (doc) => {
        const data = doc.data() as FeedbackItem;
        const churchId = (data.church_id as string) || "";
        return {
          ...data,
          id: doc.id,
          org_name: churchNameMap.get(churchId) || "Unknown Org",
        };
      },
    );

    // Platform-only filter
    if (platformOnly) {
      items = items.filter(
        (item) =>
          item.platform_feedback === true ||
          (item as unknown as Record<string, unknown>).escalated_to_platform === true,
      );
    }

    // Category filter
    if (categoryFilter) {
      items = items.filter((item) => item.category === categoryFilter);
    }

    // Status filter
    if (statusFilter) {
      items = items.filter((item) => item.status === statusFilter);
    }

    // Sort by created_at descending
    items.sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));

    // Limit to 200
    items = items.slice(0, 200);

    return NextResponse.json({ items });
  } catch (error) {
    console.error("[GET /api/platform/feedback]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

// ─── PATCH ────────────────────────────────────────────────────────────────────

export async function PATCH(req: NextRequest) {
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const decoded = await adminAuth.verifyIdToken(authHeader.slice(7));
    if (!isPlatformAdmin(decoded.uid)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const {
      church_id,
      feedback_id,
      platform_status,
      platform_response,
      platform_priority,
      platform_internal_notes,
      platform_tags,
      disposition,
    } = body;

    if (!church_id || !feedback_id) {
      return NextResponse.json(
        { error: "Missing church_id or feedback_id" },
        { status: 400 },
      );
    }

    const feedbackRef = adminDb
      .collection("churches")
      .doc(church_id)
      .collection("feedback")
      .doc(feedback_id);

    const existing = await feedbackRef.get();
    if (!existing.exists) {
      return NextResponse.json({ error: "Feedback not found" }, { status: 404 });
    }

    const existingData = existing.data()!;
    const now = new Date().toISOString();

    // Get actor name for activity log
    const userDoc = await adminDb.collection("users").doc(decoded.uid).get();
    const actorName = userDoc.exists
      ? (userDoc.data()!.display_name as string) || ""
      : "";

    // Build update payload with only platform_* fields
    const updateData: Record<string, unknown> = { updated_at: now };
    const activities: Record<string, unknown>[] = [];

    const platformFields: { key: string; value: unknown }[] = [
      { key: "platform_status", value: platform_status },
      { key: "platform_response", value: platform_response },
      { key: "platform_priority", value: platform_priority },
      { key: "platform_internal_notes", value: platform_internal_notes },
      { key: "platform_tags", value: platform_tags },
      { key: "disposition", value: disposition },
    ];

    for (const { key, value } of platformFields) {
      if (value !== undefined && value !== existingData[key]) {
        updateData[key] = value;

        activities.push({
          feedback_id,
          type: `${key}_change`,
          actor_user_id: decoded.uid,
          actor_name: actorName,
          previous_value:
            typeof existingData[key] === "object"
              ? JSON.stringify(existingData[key])
              : String(existingData[key] ?? ""),
          new_value:
            typeof value === "object" ? JSON.stringify(value) : String(value ?? ""),
          comment: null,
          created_at: now,
        });
      }
    }

    // Set response metadata if platform_response is being set
    if (platform_response !== undefined && platform_response !== existingData.platform_response) {
      updateData.platform_response_at = now;
      updateData.platform_response_by = decoded.uid;
    }

    // Batch: update feedback + add activities
    const batch = adminDb.batch();
    batch.update(feedbackRef, updateData);

    for (const activity of activities) {
      const actRef = feedbackRef.collection("activity").doc();
      batch.set(actRef, activity);
    }

    await batch.commit();

    // Fire-and-forget: email org admins if platform_response was set
    if (platform_response !== undefined && platform_response !== existingData.platform_response) {
      const title = (existingData.title as string) || "Feedback";

      adminDb
        .collection("memberships")
        .where("church_id", "==", church_id)
        .where("status", "==", "active")
        .where("role", "in", ["admin", "owner"])
        .get()
        .then(async (adminSnap) => {
          const adminUserIds = adminSnap.docs.map(
            (d) => d.data().user_id as string,
          );
          for (const uid of adminUserIds) {
            try {
              const uDoc = await adminDb.collection("users").doc(uid).get();
              const email = uDoc.data()?.email as string | undefined;
              if (email) {
                await sendEmail({
                  to: email,
                  subject: `[Product Team] Response: "${title}"`,
                  html: `
                    <h2>Product Team Response</h2>
                    <p>Regarding your feedback: <strong>${title}</strong></p>
                    <blockquote style="border-left:3px solid #ccc;padding-left:12px;margin:12px 0;">
                      ${platform_response}
                    </blockquote>
                    <p><a href="${process.env.NEXT_PUBLIC_BASE_URL || "https://volunteercal.com"}/dashboard/admin/feedback">View in Dashboard</a></p>
                  `,
                  text: `Product Team Response\n\nRegarding: ${title}\n\n${platform_response}`,
                });
              }
            } catch {
              /* silent */
            }
          }
        })
        .catch(() => {});
    }

    return NextResponse.json({ id: feedback_id, ...updateData });
  } catch (error) {
    console.error("[PATCH /api/platform/feedback]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
