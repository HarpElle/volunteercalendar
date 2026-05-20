import { getAuth } from "firebase/auth";

/**
 * Standard fetcher for SWR — attaches a Firebase ID-token Bearer header to
 * every request. Throws on non-2xx so SWR's `error` state activates.
 *
 * Use as `useSWR(url, authedFetcher)` for any /api/* endpoint that requires
 * a verified Firebase user.
 */
export async function authedFetcher<T = unknown>(url: string): Promise<T> {
  const user = getAuth().currentUser;
  if (!user) throw new Error("Not authenticated");
  const token = await user.getIdToken();
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const err = new Error(body.error || `Request failed: ${res.status}`);
    (err as Error & { status?: number }).status = res.status;
    throw err;
  }
  return res.json() as Promise<T>;
}
