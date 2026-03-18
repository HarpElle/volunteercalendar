import { redirect, notFound } from "next/navigation";
import { adminDb } from "@/lib/firebase/admin";

interface Props {
  params: Promise<{ slug: string }>;
}

/**
 * /s/[slug] — resolves a short link and redirects to the target URL.
 * Server component for instant redirect with no client JS needed.
 */
export default async function ShortLinkPage({ params }: Props) {
  const { slug } = await params;
  const normalizedSlug = slug.toLowerCase().trim();

  const now = new Date().toISOString();
  const snap = await adminDb
    .collection("short_links")
    .where("slug", "==", normalizedSlug)
    .where("expires_at", ">", now)
    .limit(1)
    .get();

  if (snap.empty) {
    notFound();
  }

  const data = snap.docs[0].data();
  redirect(data.target_url);
}
