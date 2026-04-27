/**
 * Short-link target URL validation (Track A.5).
 *
 * Permits:
 *   - Relative app paths (`/dashboard/whatever`)
 *   - URLs on our own domains (volunteercal.com, harpelle.com)
 *   - URLs on a small allowlist of trusted external hosts
 *
 * Used at create time (in /api/short-links) and at redirect time (in
 * /s/[slug]) to defend against legacy short links pointing to disallowed
 * destinations.
 */

const TRUSTED_EXTERNAL_HOSTS = new Set([
  // Google
  "docs.google.com",
  "forms.gle",
  "calendar.google.com",
  "drive.google.com",
  "meet.google.com",
  // Video / streaming
  "youtu.be",
  "www.youtube.com",
  "youtube.com",
  "vimeo.com",
  // Common church platforms
  "subsplash.com",
  "tithely.com",
  "givelify.com",
  "pushpay.com",
  "planningcenteronline.com",
  // Social
  "instagram.com",
  "www.instagram.com",
  "facebook.com",
  "www.facebook.com",
  "fb.me",
  // Maps
  "maps.google.com",
  "goo.gl",
  // Generic event hosts
  "eventbrite.com",
  "www.eventbrite.com",
]);

const OWN_DOMAINS = new Set([
  "volunteercal.com",
  "www.volunteercal.com",
  "harpelle.com",
  "www.harpelle.com",
]);

export type TargetUrlValidation =
  | { ok: true; value: string; kind: "relative" | "volunteercal" | "allowlist" }
  | { ok: false; error: string };

export function validateTargetUrl(raw: string): TargetUrlValidation {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return { ok: false, error: "Target URL is required." };
  }
  if (trimmed.length > 2048) {
    return { ok: false, error: "Target URL is too long (max 2048 chars)." };
  }

  // Relative path — must start with a single slash, not "//" (protocol-relative).
  if (trimmed.startsWith("/") && !trimmed.startsWith("//")) {
    return { ok: true, value: trimmed, kind: "relative" };
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return {
      ok: false,
      error: "Target URL must be a valid URL or a relative path starting with /.",
    };
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return { ok: false, error: "Only http(s) URLs are allowed." };
  }

  const host = url.hostname.toLowerCase();
  if (OWN_DOMAINS.has(host)) {
    return { ok: true, value: url.toString(), kind: "volunteercal" };
  }
  if (TRUSTED_EXTERNAL_HOSTS.has(host)) {
    return { ok: true, value: url.toString(), kind: "allowlist" };
  }

  return {
    ok: false,
    error:
      "External destination not on the trusted allowlist. Use a relative app path, a volunteercal.com URL, or a domain like docs.google.com / youtu.be / subsplash.com.",
  };
}
