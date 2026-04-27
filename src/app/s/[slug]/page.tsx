import { redirect, notFound } from "next/navigation";
import { adminDb } from "@/lib/firebase/admin";
import { validateTargetUrl } from "@/lib/utils/short-link-target";

interface Props {
  params: Promise<{ slug: string }>;
}

/**
 * /s/[slug] — resolves a short link and redirects to the target URL.
 *
 * Server component for instant redirect with no client JS needed. Re-validates
 * the target URL at redirect time as defense-in-depth: legacy short links
 * created before Track A.5's allowlist may point to disallowed destinations,
 * and we don't want to keep redirecting to them.
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
  const target = String(data.target_url ?? "");

  // Defense-in-depth: validate the stored target before redirecting.
  // Catches both legacy permissive entries and any data tampering.
  const result = validateTargetUrl(target);
  if (!result.ok) {
    notFound();
  }

  redirect(result.value);
}
