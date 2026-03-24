import type { Metadata } from "next";
import { adminDb } from "@/lib/firebase/admin";
import GuardianPortalPage from "./_portal";

/**
 * Dynamic OG metadata for /guardian?church_id=XXX&token=YYY.
 * Shows the church name in link previews when parents receive the portal link.
 */
export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ church_id?: string }>;
}): Promise<Metadata> {
  const params = await searchParams;
  const churchId = params.church_id;

  let churchName = "";
  if (churchId) {
    try {
      const snap = await adminDb.collection("churches").doc(churchId).get();
      if (snap.exists) {
        churchName = (snap.data()?.name as string) || "";
      }
    } catch {
      // Non-critical — fall back to generic metadata
    }
  }

  const title = churchName
    ? `Family Portal — ${churchName}`
    : "Family Portal — VolunteerCal";
  const description = churchName
    ? `View and manage your family's check-in information at ${churchName}`
    : "View and manage your family check-in information";

  const ogImageUrl = churchName
    ? `/api/og?title=${encodeURIComponent(churchName)}&subtitle=${encodeURIComponent("Family Portal")}`
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
  return <GuardianPortalPage />;
}
