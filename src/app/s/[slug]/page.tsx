import { redirect, notFound } from "next/navigation";
import { adminDb } from "@/lib/firebase/admin";
import { validateTargetUrl } from "@/lib/utils/short-link-target";

/**
 * Next.js signals control-flow primitives (redirect, notFound) by throwing a
 * tagged error whose `digest` starts with NEXT_REDIRECT or NEXT_NOT_FOUND.
 * If we catch a Firestore error and the code path then calls notFound(),
 * that throw must propagate — so we re-throw any tagged framework error
 * that bubbles into our catch block.
 */
function isNextControlFlowError(err: unknown): boolean {
  return (
    !!err
    && typeof err === "object"
    && "digest" in err
    && typeof (err as { digest?: unknown }).digest === "string"
    && (
      (err as { digest: string }).digest.startsWith("NEXT_REDIRECT")
      || (err as { digest: string }).digest.startsWith("NEXT_NOT_FOUND")
    )
  );
}

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
 *
 * Codex QA (2026-05-15) caught a Sentry-reported render error for `/s/bogus`
 * (release c3220ff). Root cause: the composite query (slug == X) + (expires_at > now)
 * needs an index that was missing from firestore.indexes.json. The added try/catch
 * here is defense-in-depth so future missing/building indexes degrade to a
 * friendly 404 instead of a server crash.
 */
export default async function ShortLinkPage({ params }: Props) {
  const { slug } = await params;
  const normalizedSlug = slug.toLowerCase().trim();

  const now = new Date().toISOString();

  let target: string;
  try {
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
    target = String(data.target_url ?? "");
  } catch (err) {
    // Don't swallow notFound()/redirect() from inside the try.
    if (isNextControlFlowError(err)) throw err;
    // Real error (missing index, Firestore unavailable, malformed slug, etc).
    // Log and degrade to 404 so users see the friendly page.
    console.error(`[/s/${normalizedSlug}] lookup failed:`, err);
    notFound();
  }

  // Defense-in-depth: validate the stored target before redirecting.
  // Catches both legacy permissive entries and any data tampering.
  const result = validateTargetUrl(target);
  if (!result.ok) {
    notFound();
  }

  redirect(result.value);
}
