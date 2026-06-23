import { terminate, clearIndexedDbPersistence } from "firebase/firestore";
import { db } from "@/lib/firebase/config";

/**
 * One-time Firestore IndexedDB cache purge (Phase 3 — child-medical privacy).
 *
 * `persistentLocalCache` (src/lib/firebase/config.ts) keeps Firestore docs in
 * IndexedDB across reloads. A volunteer who loaded a child's people doc
 * BEFORE the Phase 3 migration would retain the old shape — with the five
 * sensitive medical fields still inline under child_profile — in their local
 * cache until that doc is next re-read online. To close that residual
 * exposure window we bump a cache-version flag: on the first load after the
 * bump, the client terminates Firestore, clears the IndexedDB persistence,
 * and reloads once for a clean slate.
 *
 * Bump `CACHE_VERSION` whenever a migration physically removes
 * previously-cached sensitive data from docs clients may already hold.
 *
 * Guarantees:
 *   - Runs at most once per (browser, version) — the flag is written before
 *     the reload so a purge failure can't loop.
 *   - No-op on the server and when the version already matches.
 */

const CACHE_VERSION = "2026-06-23-phase3-child-medical";
const STORAGE_KEY = "vc_firestore_cache_version";

let started = false;

export async function purgeStaleFirestoreCacheOnce(): Promise<void> {
  if (typeof window === "undefined") return;
  if (started) return;
  started = true;

  let stored: string | null = null;
  try {
    stored = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    // localStorage blocked (private mode / cookies off) — can't track the
    // version, so skip rather than purge on every load.
    return;
  }

  if (stored === CACHE_VERSION) return;

  // Write the new version FIRST so a failed/blocked purge doesn't loop the
  // reload on the next mount.
  try {
    window.localStorage.setItem(STORAGE_KEY, CACHE_VERSION);
  } catch {
    return;
  }

  // First-ever visit (no prior version key AND no app data yet) doesn't need a
  // reload, but an existing pre-Phase-3 client does. We can't perfectly tell
  // them apart, so we purge whenever the version is stale — the cost is one
  // extra reload on a client's first load after the bump.
  try {
    await terminate(db);
    await clearIndexedDbPersistence(db);
  } catch {
    // clearIndexedDbPersistence throws if connections are still open; the
    // reload below re-bootstraps with a fresh instance regardless.
  }

  window.location.reload();
}
