import type { Metadata } from "next";
import { adminDb } from "@/lib/firebase/admin";
import ConfirmPage from "./_confirm";

/**
 * Dynamic OG metadata for /confirm/[token].
 * Shows the church name in link previews when confirmation
 * links are opened from email.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;

  let churchName = "";
  try {
    const snap = await adminDb
      .collectionGroup("assignments")
      .where("confirmation_token", "==", token)
      .limit(1)
      .get();

    if (!snap.empty) {
      const churchId = snap.docs[0].data().church_id as string;
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
    ? `${churchName} — Volunteer Confirmation | VolunteerCal`
    : "Volunteer Confirmation | VolunteerCal";
  const description = churchName
    ? `Confirm your volunteer assignment at ${churchName}`
    : "Confirm your volunteer assignment on VolunteerCal";

  const ogImageUrl = churchName
    ? `/api/og?title=${encodeURIComponent(churchName)}&subtitle=${encodeURIComponent("Volunteer Confirmation")}`
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
  return <ConfirmPage />;
}
