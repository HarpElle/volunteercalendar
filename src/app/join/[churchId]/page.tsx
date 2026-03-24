import type { Metadata } from "next";
import { adminDb } from "@/lib/firebase/admin";
import { SHORT_CODE_RE, resolveShortCode } from "@/lib/utils/short-code";
import JoinChurchPage from "./_join";

/**
 * Dynamic OG metadata for /join/[churchId].
 * When the churchId resolves to a real church, the link preview shows
 * "Join Anchor Falls Church — VolunteerCal" with a branded OG image.
 * Also supports short codes (e.g. /join/HK7W3N).
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ churchId: string }>;
}): Promise<Metadata> {
  const { churchId: rawId } = await params;

  let churchName = "";
  try {
    // Try direct doc lookup first
    let snap = await adminDb.doc(`churches/${rawId}`).get();

    // Fall back to short code resolution
    if (!snap.exists && SHORT_CODE_RE.test(rawId.toUpperCase())) {
      const resolved = await resolveShortCode(rawId);
      if (resolved) {
        snap = await adminDb.doc(`churches/${resolved}`).get();
      }
    }

    if (snap.exists) {
      churchName = (snap.data()?.name as string) || "";
    }
  } catch {
    // Non-critical — fall back to generic metadata
  }

  const title = churchName
    ? `Join ${churchName} — VolunteerCal`
    : "Join an Organization | VolunteerCal";
  const description = churchName
    ? `Sign up to volunteer with ${churchName} on VolunteerCal`
    : "Join your organization's volunteer team on VolunteerCal";

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
  return <JoinChurchPage />;
}
