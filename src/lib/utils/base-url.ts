/**
 * Resolves the canonical base URL for outbound links (emails, notifications).
 *
 * Priority: NEXT_PUBLIC_APP_URL env var → request origin header → request
 * referer header → hard-coded fallback.
 */
export function getBaseUrl(request?: Request): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    request?.headers.get("origin") ||
    request?.headers.get("referer")?.replace(/\/[^/]*$/, "") ||
    "https://volunteercal.com"
  );
}
