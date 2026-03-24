import type { Metadata } from "next";
import { adminDb } from "@/lib/firebase/admin";
import EventSignupPage from "./_signup";

/**
 * Dynamic OG metadata for /events/[churchId]/[eventId]/signup.
 * Shows the event name and church name in link previews when
 * admins share event signup links.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ churchId: string; eventId: string }>;
}): Promise<Metadata> {
  const { churchId, eventId } = await params;

  let churchName = "";
  let eventName = "";
  try {
    const [churchSnap, eventSnap] = await Promise.all([
      adminDb.doc(`churches/${churchId}`).get(),
      adminDb.doc(`churches/${churchId}/events/${eventId}`).get(),
    ]);
    if (churchSnap.exists) churchName = (churchSnap.data()?.name as string) || "";
    if (eventSnap.exists) eventName = (eventSnap.data()?.name as string) || "";
  } catch {
    // Non-critical — fall back to generic metadata
  }

  const title =
    eventName && churchName
      ? `${eventName} — ${churchName} | VolunteerCal`
      : churchName
        ? `Volunteer Signup — ${churchName} | VolunteerCal`
        : "Volunteer Signup | VolunteerCal";
  const description =
    eventName && churchName
      ? `Sign up to volunteer for ${eventName} at ${churchName}`
      : "Sign up to volunteer on VolunteerCal";

  const ogTitle =
    eventName && churchName
      ? `${eventName} — ${churchName}`
      : churchName || "";
  const ogSubtitle = "Sign Up to Volunteer";
  const ogImageUrl = ogTitle
    ? `/api/og?title=${encodeURIComponent(ogTitle)}&subtitle=${encodeURIComponent(ogSubtitle)}`
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
  return <EventSignupPage />;
}
