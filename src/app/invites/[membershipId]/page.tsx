import type { Metadata } from "next";
import { adminDb } from "@/lib/firebase/admin";
import AcceptInvitePage from "./_invite";

/**
 * Dynamic OG metadata for /invites/[membershipId].
 * Shows the church name in link previews when invite links
 * are shared via email or messaging.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ membershipId: string }>;
}): Promise<Metadata> {
  const { membershipId } = await params;

  let churchName = "";
  try {
    const memberSnap = await adminDb.doc(`memberships/${membershipId}`).get();
    if (memberSnap.exists) {
      const churchId = memberSnap.data()?.church_id as string;
      if (churchId) {
        const churchSnap = await adminDb.doc(`churches/${churchId}`).get();
        if (churchSnap.exists) {
          churchName = (churchSnap.data()?.name as string) || "";
        }
      }
    }
  } catch {
    // Non-critical — fall back to generic metadata
  }

  const title = churchName
    ? `You're Invited — ${churchName} | VolunteerCal`
    : "You're Invited | VolunteerCal";
  const description = churchName
    ? `You've been invited to join ${churchName} on VolunteerCal`
    : "You've been invited to join a volunteer team on VolunteerCal";

  const ogImageUrl = churchName
    ? `/api/og?title=${encodeURIComponent(churchName)}&subtitle=${encodeURIComponent("Join Our Team")}`
    : "/api/og";

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: [{ url: ogImageUrl, width: 1200, height: 630 }],
    },
  };
}

export default function Page() {
  return <AcceptInvitePage />;
}
