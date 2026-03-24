import type { Metadata } from "next";
import { adminDb } from "@/lib/firebase/admin";
import CheckInKiosk from "./_kiosk";

/**
 * Dynamic OG metadata for /checkin?church_id=XXX.
 * When a church_id is present, the link preview shows the church name
 * (e.g. "Anchor Falls Church — Children's Check-In, powered by VolunteerCal").
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
    ? `${churchName} — Children's Check-In`
    : "Check-In | VolunteerCal";
  const description = churchName
    ? `Children's check-in kiosk for ${churchName}, powered by VolunteerCal`
    : "Children's check-in kiosk";

  const ogImageUrl = churchName
    ? `/api/og?title=${encodeURIComponent(churchName)}&subtitle=${encodeURIComponent("Children's Check-In")}`
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
  return <CheckInKiosk />;
}
