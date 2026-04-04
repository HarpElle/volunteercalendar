import { NextRequest, NextResponse } from "next/server";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { sendEmail, orgFrom } from "@/lib/services/email";
import type { FeedbackItem, FeedbackStatus, FeedbackPriority, FeedbackDisposition } from "@/lib/types";

/**
 * GET /api/feedback?church_id=...&scope=mine|all&status=...&category=...
 * List feedback items. `scope=mine` returns only the caller's items.
 * `scope=all` requires admin/owner role.
 *
 * POST /api/feedback
 * Submit new feedback.
 *
 * PATCH /api/feedback
 * Update feedback item (admin triage: status, priority, disposition, response).
 */

async function getCallerInfo(req: NextRequest) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  try {
    const decoded = await adminAuth.verifyIdToken(authHeader.slice(7));
    return decoded;
  } catch {
    return null;
  }
}

// ─── GET ──────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const caller = await getCallerInfo(req);
  if (!caller) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const churchId = req.nextUrl.searchParams.get("church_id");
  if (!churchId) {
    return NextResponse.json({ error: "Missing church_id" }, { status: 400 });
  }

  const scope = req.nextUrl.searchParams.get("scope") || "mine";
  const statusFilter = req.nextUrl.searchParams.get("status");
  const categoryFilter = req.nextUrl.searchParams.get("category");

  const feedbackRef = adminDb.collection("churches").doc(churchId).collection("feedback");

  let query: FirebaseFirestore.Query = feedbackRef.orderBy("created_at", "desc");

  if (scope === "mine") {
    query = query.where("submitted_by_user_id", "==", caller.uid);
  } else {
    // Verify admin/owner for "all" scope
    const memSnap = await adminDb
      .collection("memberships")
      .where("user_id", "==", caller.uid)
      .where("church_id", "==", churchId)
      .where("status", "==", "active")
      .limit(1)
      .get();
    if (memSnap.empty) {
      return NextResponse.json({ error: "Not a member" }, { status: 403 });
    }
    const role = memSnap.docs[0].data().role;
    if (!["admin", "owner"].includes(role)) {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
    }
  }

  const snap = await query.limit(200).get();
  let items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

  // Client-side filters (Firestore doesn't allow multiple inequality/orderBy combos easily)
  if (statusFilter) {
    items = items.filter((i) => (i as Record<string, unknown>).status === statusFilter);
  }
  if (categoryFilter) {
    items = items.filter((i) => (i as Record<string, unknown>).category === categoryFilter);
  }

  return NextResponse.json({ items });
}

// ─── POST ─────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const caller = await getCallerInfo(req);
  if (!caller) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const {
      church_id,
      category,
      title,
      description,
      steps_to_reproduce,
      expected_behavior,
      page_url,
      user_agent,
      is_sunday_incident,
      priority_suggestion,
    } = body;

    if (!church_id || !category || !title || !description) {
      return NextResponse.json(
        { error: "Missing required fields: church_id, category, title, description" },
        { status: 400 },
      );
    }

    // Get caller's membership info
    const memSnap = await adminDb
      .collection("memberships")
      .where("user_id", "==", caller.uid)
      .where("church_id", "==", church_id)
      .where("status", "==", "active")
      .limit(1)
      .get();

    const callerRole = memSnap.empty ? "volunteer" : memSnap.docs[0].data().role;

    // Get user info
    const userDoc = await adminDb.collection("users").doc(caller.uid).get();
    const userData = userDoc.exists ? userDoc.data()! : {};

    const now = new Date().toISOString();
    const feedbackRef = adminDb
      .collection("churches")
      .doc(church_id)
      .collection("feedback");

    const feedbackData: Omit<FeedbackItem, "id"> = {
      church_id,
      submitted_by_user_id: caller.uid,
      submitted_by_name: (userData.display_name as string) || caller.email || "Unknown",
      submitted_by_email: caller.email || "",
      submitted_by_role: callerRole,
      category,
      title,
      description,
      steps_to_reproduce: steps_to_reproduce || null,
      expected_behavior: expected_behavior || null,
      screenshot_urls: [],
      page_url: page_url || "",
      user_agent: user_agent || "",
      app_version: null,
      priority: is_sunday_incident ? "critical" : (priority_suggestion || "unset"),
      status: "submitted",
      disposition: null,
      assigned_to: null,
      tags: is_sunday_incident
        ? ["sunday-morning", new Date().toISOString().split("T")[0]]
        : [],
      resolution_notes: null,
      related_feedback_ids: [],
      duplicate_of_id: null,
      acknowledged_at: null,
      triaged_at: null,
      resolved_at: null,
      admin_response: null,
      admin_response_at: null,
      internal_notes: null,
      created_at: now,
      updated_at: now,
      is_sunday_incident: is_sunday_incident || false,
      platform_feedback: ["bug", "feature_request"].includes(category),
    };

    const newDoc = await feedbackRef.add(feedbackData);

    // Fire-and-forget: notify admins via email
    const isCritical = feedbackData.priority === "critical";
    const subjectPrefix = is_sunday_incident ? "SUNDAY INCIDENT" : isCritical ? "CRITICAL" : "New";
    const adminNotifSubject = `[Feedback] ${subjectPrefix}: ${title}`;

    // Find admin emails for this church
    adminDb
      .collection("memberships")
      .where("church_id", "==", church_id)
      .where("status", "==", "active")
      .where("role", "in", ["admin", "owner"])
      .get()
      .then(async (adminSnap) => {
        const adminUserIds = adminSnap.docs.map((d) => d.data().user_id as string);
        for (const uid of adminUserIds) {
          try {
            const uDoc = await adminDb.collection("users").doc(uid).get();
            const email = uDoc.data()?.email as string | undefined;
            if (email) {
              await sendEmail({
                to: email,
                subject: adminNotifSubject,
                html: `
                  <h2>${title}</h2>
                  <p><strong>Category:</strong> ${category} | <strong>Priority:</strong> ${feedbackData.priority}</p>
                  <p><strong>From:</strong> ${feedbackData.submitted_by_name} (${feedbackData.submitted_by_role})</p>
                  <p>${description.slice(0, 500)}${description.length > 500 ? "..." : ""}</p>
                  <p><a href="${process.env.NEXT_PUBLIC_BASE_URL || "https://volunteercal.com"}/dashboard/admin/feedback">Open Triage Dashboard</a></p>
                `,
                text: `${title}\nCategory: ${category} | Priority: ${feedbackData.priority}\nFrom: ${feedbackData.submitted_by_name}\n\n${description.slice(0, 500)}`,
              });
            }
          } catch { /* silent */ }
        }
      })
      .catch(() => {});

    // Fire-and-forget: forward bugs & feature requests to the platform team
    if (feedbackData.platform_feedback) {
      (async () => {
        try {
          const churchDoc = await adminDb.collection("churches").doc(church_id).get();
          const churchName = churchDoc.exists ? (churchDoc.data()!.name as string) || "Unknown Org" : "Unknown Org";
          await sendEmail({
            to: "info@volunteercal.com",
            subject: `[Platform ${category === "bug" ? "Bug" : "Feature Request"}] ${title}`,
            html: `
              <h2>${title}</h2>
              <p><strong>Org:</strong> ${churchName} (${church_id})</p>
              <p><strong>Category:</strong> ${category} | <strong>Priority:</strong> ${feedbackData.priority}</p>
              <p><strong>From:</strong> ${feedbackData.submitted_by_name} (${feedbackData.submitted_by_role})</p>
              <p>${description.slice(0, 1000)}${description.length > 1000 ? "..." : ""}</p>
              ${steps_to_reproduce ? `<p><strong>Steps to reproduce:</strong> ${steps_to_reproduce}</p>` : ""}
              ${expected_behavior ? `<p><strong>Expected:</strong> ${expected_behavior}</p>` : ""}
              <p><strong>Page:</strong> ${page_url || "N/A"}</p>
            `,
            text: `${title}\nOrg: ${churchName} (${church_id})\nCategory: ${category} | Priority: ${feedbackData.priority}\nFrom: ${feedbackData.submitted_by_name}\n\n${description.slice(0, 1000)}`,
          });
        } catch { /* silent */ }
      })();
    }

    return NextResponse.json({ id: newDoc.id, ...feedbackData }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/feedback]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ─── PATCH ────────────────────────────────────────────────────────────────────

export async function PATCH(req: NextRequest) {
  const caller = await getCallerInfo(req);
  if (!caller) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { church_id, feedback_id, ...updates } = body;

    if (!church_id || !feedback_id) {
      return NextResponse.json(
        { error: "Missing church_id or feedback_id" },
        { status: 400 },
      );
    }

    // Verify admin/owner
    const memSnap = await adminDb
      .collection("memberships")
      .where("user_id", "==", caller.uid)
      .where("church_id", "==", church_id)
      .where("status", "==", "active")
      .limit(1)
      .get();

    if (memSnap.empty) {
      return NextResponse.json({ error: "Not a member" }, { status: 403 });
    }
    const role = memSnap.docs[0].data().role;
    if (!["admin", "owner"].includes(role)) {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
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
    const userDoc = await adminDb.collection("users").doc(caller.uid).get();
    const actorName = userDoc.exists ? (userDoc.data()!.display_name as string) || "" : "";

    const updateData: Record<string, unknown> = { updated_at: now };
    const activities: Record<string, unknown>[] = [];

    // Track changes for activity log
    const allowedFields: (keyof FeedbackItem)[] = [
      "status", "priority", "disposition", "category",
      "assigned_to", "tags", "admin_response", "resolution_notes",
      "duplicate_of_id", "internal_notes",
    ];

    for (const field of allowedFields) {
      if (updates[field] !== undefined && updates[field] !== existingData[field]) {
        updateData[field] = updates[field];

        // Set timestamps for status transitions
        if (field === "status") {
          const newStatus = updates[field] as FeedbackStatus;
          if (newStatus === "acknowledged") updateData.acknowledged_at = now;
          if (newStatus === "triaged") updateData.triaged_at = now;
          if (newStatus === "resolved" || newStatus === "wont_do" || newStatus === "duplicate") {
            updateData.resolved_at = now;
          }
        }
        if (field === "admin_response") {
          updateData.admin_response_at = now;
        }

        const activityType = field === "admin_response" ? "admin_response"
          : field === "tags" ? "tag_change"
          : field === "duplicate_of_id" ? "duplicate_linked"
          : field === "assigned_to" ? "assignment_change"
          : `${field}_change`;

        activities.push({
          feedback_id,
          type: activityType,
          actor_user_id: caller.uid,
          actor_name: actorName,
          previous_value: typeof existingData[field] === "object"
            ? JSON.stringify(existingData[field])
            : String(existingData[field] ?? ""),
          new_value: typeof updates[field] === "object"
            ? JSON.stringify(updates[field])
            : String(updates[field] ?? ""),
          comment: null,
          created_at: now,
        });
      }
    }

    // Batch: update feedback + add activities
    const batch = adminDb.batch();
    batch.update(feedbackRef, updateData);

    for (const activity of activities) {
      const actRef = feedbackRef.collection("activity").doc();
      batch.set(actRef, activity);
    }

    await batch.commit();

    // Fire-and-forget: notify submitter when admin responds or resolves
    const newStatus = updates.status as FeedbackStatus | undefined;
    const hasNewResponse = updates.admin_response && updates.admin_response !== existingData.admin_response;
    const isResolved = newStatus === "resolved" || newStatus === "wont_do";

    if (hasNewResponse || isResolved) {
      const submitterEmail = existingData.submitted_by_email as string;
      if (submitterEmail) {
        const churchDoc = await adminDb.collection("churches").doc(church_id).get();
        const churchName = churchDoc.exists ? (churchDoc.data()!.name as string) || "Your Church" : "Your Church";

        const emailSubject = isResolved && !hasNewResponse
          ? `Your feedback "${existingData.title}" has been resolved`
          : `Response to your feedback: "${existingData.title}"`;

        sendEmail({
          to: submitterEmail,
          subject: emailSubject,
          from: orgFrom(churchName),
          html: `
            <h2>${existingData.title}</h2>
            ${hasNewResponse ? `<p><strong>Admin response:</strong></p><p>${updates.admin_response}</p>` : ""}
            ${isResolved ? `<p>This item has been marked as <strong>${newStatus === "resolved" ? "resolved" : "won't do"}</strong>.</p>` : ""}
            <p><a href="${process.env.NEXT_PUBLIC_BASE_URL || "https://volunteercal.com"}/dashboard/feedback">View your feedback</a></p>
          `,
          text: `${existingData.title}\n${hasNewResponse ? `Admin response: ${updates.admin_response}\n` : ""}${isResolved ? `Status: ${newStatus}\n` : ""}`,
        }).catch(() => {});
      }
    }

    return NextResponse.json({ id: feedback_id, ...updateData });
  } catch (error) {
    console.error("[PATCH /api/feedback]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
