import { getAuth } from "firebase/auth";

/**
 * Standard fetcher for SWR — attaches a Firebase ID-token Bearer header to
 * every request. Throws on non-2xx so SWR's `error` state activates.
 *
 * Use as `useSWR(url, authedFetcher)` for any /api/* endpoint that requires
 * a verified Firebase user.
 *
 * Instrumented with console.time so first-fetch durations show up in dev
 * tools — helps diagnose slow server-side endpoints (cold starts, missing
 * indexes, slow Firestore queries).
 */
export async function authedFetcher<T = unknown>(url: string): Promise<T> {
  const label = `[swr] ${url}`;
  console.time(label);
  try {
    const user = getAuth().currentUser;
    if (!user) {
      console.timeEnd(label);
      throw new Error("Not authenticated");
    }
    const token = await user.getIdToken();
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const err = new Error(body.error || `Request failed: ${res.status}`);
      (err as Error & { status?: number }).status = res.status;
      console.timeEnd(label);
      // Log the full response body so server-side error details (detail,
      // stack, etc.) are visible to whoever's diagnosing.
      console.error(`[swr] error ${res.status} for ${url}:`);
      console.error(`[swr] response body:`, JSON.stringify(body, null, 2));
      throw err;
    }
    const json = (await res.json()) as T;
    console.timeEnd(label);
    return json;
  } catch (err) {
    // Ensure timer ends even on throw before we set it manually
    try { console.timeEnd(label); } catch { /* timer may already be ended */ }
    throw err;
  }
}
