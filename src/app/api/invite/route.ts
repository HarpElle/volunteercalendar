import { NextResponse } from "next/server";
import { Resend } from "resend";
import { buildInviteEmail } from "@/lib/utils/email-templates";
import { adminAuth, adminDb } from "@/lib/firebase/admin";

const resend = new Resend(process.env.RESEND_API_KEY);

/**
 * POST /api/invite
 *
 * Sends an invitation email and creates a pending membership.
 *
 * Body: {
 *   email: string          — invitee's email
 *   name: string           — invitee's display name
 *   churchId: string       — org to invite to
 *   role: "volunteer" | "scheduler" | "admin"
 *   ministryScope?: string[]  — for scheduler role
 * }
 *
 * Auth: Bearer token (Firebase ID token from the inviter)
 */
export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const idToken = authHeader.slice(7);
    const decoded = await adminAuth.verifyIdToken(idToken);
    const inviterUid = decoded.uid;

    // Verify inviter is admin+ for this church
    const inviterMembershipId = `${inviterUid}_${(await request.clone().json()).churchId}`;
    const inviterMembershipSnap = await adminDb.collection("memberships").doc(inviterMembershipId).get();
    if (!inviterMembershipSnap.exists) {
      return NextResponse.json({ error: "Not a member of this organization" }, { status: 403 });
    }
    const inviterMembership = inviterMembershipSnap.data()!;
    if (!["admin", "owner"].includes(inviterMembership.role) || inviterMembership.status !== "active") {
      return NextResponse.json({ error: "Only admins can invite members" }, { status: 403 });
    }

    const body = await request.json();
    const { email, name, churchId, role, ministryScope } = body;

    if (!email || !churchId || !role) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Load church name
    const churchSnap = await adminDb.collection("churches").doc(churchId).get();
    if (!churchSnap.exists) {
      return NextResponse.json({ error: "Church not found" }, { status: 404 });
    }
    const churchName = churchSnap.data()!.name || "your organization";

    // Load inviter profile for name
    const inviterSnap = await adminDb.collection("users").doc(inviterUid).get();
    const inviterName = inviterSnap.exists ? inviterSnap.data()!.display_name || "An admin" : "An admin";

    // Check if user already exists in Firebase Auth
    let inviteeUid: string | null = null;
    try {
      const userRecord = await adminAuth.getUserByEmail(email);
      inviteeUid = userRecord.uid;
    } catch {
      // User doesn't exist yet — that's fine, they'll register
    }

    // If user exists, check for existing membership
    if (inviteeUid) {
      const existingId = `${inviteeUid}_${churchId}`;
      const existingSnap = await adminDb.collection("memberships").doc(existingId).get();
      if (existingSnap.exists) {
        const existing = existingSnap.data()!;
        if (existing.status === "active") {
          return NextResponse.json({ error: "User is already a member" }, { status: 409 });
        }
        if (existing.status === "pending_volunteer_approval") {
          return NextResponse.json({ error: "Invitation already sent" }, { status: 409 });
        }
        // If pending_org_approval (they self-registered), approve them
        if (existing.status === "pending_org_approval") {
          await adminDb.collection("memberships").doc(existingId).update({
            status: "active",
            role,
            ministry_scope: ministryScope || [],
            invited_by: inviterUid,
            updated_at: new Date().toISOString(),
          });
          return NextResponse.json({ success: true, action: "approved_existing" });
        }
      }
    }

    // Create membership doc (use UID if known, otherwise store email for later matching)
    const now = new Date().toISOString();
    if (inviteeUid) {
      const membershipId = `${inviteeUid}_${churchId}`;
      await adminDb.collection("memberships").doc(membershipId).set({
        user_id: inviteeUid,
        church_id: churchId,
        role,
        ministry_scope: ministryScope || [],
        status: "pending_volunteer_approval",
        invited_by: inviterUid,
        volunteer_id: null,
        reminder_preferences: { channels: ["email"] },
        created_at: now,
        updated_at: now,
      });

      // Build accept URL
      const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://volunteercal.com";
      const acceptUrl = `${baseUrl}/invites/${membershipId}`;

      // Send invite email
      if (process.env.RESEND_API_KEY) {
        const emailContent = buildInviteEmail({
          inviteeName: name || email,
          churchName,
          inviterName,
          role,
          acceptUrl,
        });

        await resend.emails.send({
          from: `${churchName} via VolunteerCal <noreply@harpelle.com>`,
          replyTo: "info@volunteercal.com",
          to: [email],
          subject: emailContent.subject,
          html: emailContent.html,
          text: emailContent.text,
        });
      }

      return NextResponse.json({ success: true, membershipId });
    } else {
      // User doesn't exist yet — store a "pre-invite" that will be matched on registration
      // For now, create with a placeholder user_id keyed by email
      const placeholderDocId = `invite_${Buffer.from(email).toString("base64url")}_${churchId}`;
      await adminDb.collection("pending_invites").doc(placeholderDocId).set({
        email,
        name: name || "",
        church_id: churchId,
        role,
        ministry_scope: ministryScope || [],
        invited_by: inviterUid,
        created_at: now,
      });

      // Send invite email with registration link
      const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://volunteercal.com";
      const acceptUrl = `${baseUrl}/register?redirect=/join/${churchId}&email=${encodeURIComponent(email)}`;

      if (process.env.RESEND_API_KEY) {
        const emailContent = buildInviteEmail({
          inviteeName: name || email,
          churchName,
          inviterName,
          role,
          acceptUrl,
        });

        await resend.emails.send({
          from: `${churchName} via VolunteerCal <noreply@harpelle.com>`,
          replyTo: "info@volunteercal.com",
          to: [email],
          subject: emailContent.subject,
          html: emailContent.html,
          text: emailContent.text,
        });
      }

      return NextResponse.json({ success: true, pending: true });
    }
  } catch (error) {
    console.error("Invite error:", error);
    return NextResponse.json(
      { error: "Failed to send invitation" },
      { status: 500 },
    );
  }
}
