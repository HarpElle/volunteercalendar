"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { db } from "@/lib/firebase/config";
import { collection, getDocs, doc, updateDoc } from "firebase/firestore";
import { useAuth } from "@/lib/context/auth-context";
import type { Campus } from "@/lib/types";

/**
 * Pass H Phase 1: campus context.
 *
 * Provides:
 *   - `campuses` — full list of Campus docs for the active org (sorted)
 *   - `isMultiCampus` — true when campuses.length >= 2
 *   - `activeCampusId` — currently selected campus, OR null meaning "All campuses"
 *   - `setActiveCampusId(id)` — persists selection to localStorage AND
 *     to the user's membership doc (default_campus_id field) so the
 *     preference survives device switches
 *
 * Single-campus orgs (0 or 1 campus): everything still works, but
 * `isMultiCampus` is false so consumers can short-circuit (sidebar
 * selector hides itself, list filters become no-ops, etc).
 *
 * Mounted in src/app/dashboard/layout.tsx so every dashboard page can
 * consume it via the useActiveCampus() hook.
 */

const ALL_CAMPUSES_VALUE = null;
type CampusSelection = string | null;

interface CampusContextValue {
  campuses: Campus[];
  isMultiCampus: boolean;
  activeCampusId: CampusSelection;
  setActiveCampusId: (id: CampusSelection) => void;
  loading: boolean;
}

const CampusContext = createContext<CampusContextValue>({
  campuses: [],
  isMultiCampus: false,
  activeCampusId: ALL_CAMPUSES_VALUE,
  setActiveCampusId: () => {},
  loading: true,
});

const LS_KEY_PREFIX = "vc_active_campus_";

export function CampusProvider({ children }: { children: ReactNode }) {
  const { activeMembership, profile } = useAuth();
  const churchId = activeMembership?.church_id || profile?.church_id;

  const [campuses, setCampuses] = useState<Campus[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCampusId, setActiveCampusIdState] =
    useState<CampusSelection>(ALL_CAMPUSES_VALUE);

  // Load campuses for active church
  useEffect(() => {
    if (!churchId) {
      setLoading(false);
      setCampuses([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const snap = await getDocs(
          collection(db, `churches/${churchId}/campuses`),
        );
        if (cancelled) return;
        const docs = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }) as Campus)
          .sort((a, b) => {
            // Primary campus first, then alphabetical
            if (a.is_primary && !b.is_primary) return -1;
            if (!a.is_primary && b.is_primary) return 1;
            return (a.name || "").localeCompare(b.name || "");
          });
        setCampuses(docs);
      } catch {
        if (!cancelled) setCampuses([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [churchId]);

  // Resolve initial selection — preference order:
  // 1. localStorage (most recent client choice)
  // 2. activeMembership.default_campus_id (server-persisted)
  // 3. null = "All campuses"
  useEffect(() => {
    if (!churchId) return;
    const lsKey = `${LS_KEY_PREFIX}${churchId}`;
    const fromLs = typeof window !== "undefined"
      ? localStorage.getItem(lsKey)
      : null;
    const fromMembership = activeMembership?.default_campus_id ?? null;

    if (fromLs !== null) {
      // localStorage uses "" to encode "all campuses" explicitly chosen
      setActiveCampusIdState(fromLs === "" ? null : fromLs);
    } else if (fromMembership) {
      setActiveCampusIdState(fromMembership);
    }
    // else: leave at default null (All campuses)
  }, [churchId, activeMembership?.default_campus_id]);

  const setActiveCampusId = useCallback(
    (id: CampusSelection) => {
      setActiveCampusIdState(id);
      if (!churchId) return;

      // Persist to localStorage (immediate)
      const lsKey = `${LS_KEY_PREFIX}${churchId}`;
      try {
        localStorage.setItem(lsKey, id ?? "");
      } catch {
        // Ignore storage quota errors
      }

      // Persist to membership doc (fire-and-forget — non-blocking)
      if (activeMembership?.id) {
        updateDoc(doc(db, "memberships", activeMembership.id), {
          default_campus_id: id,
          updated_at: new Date().toISOString(),
        }).catch((err) => {
          console.warn(
            "[CampusProvider] failed to persist default_campus_id:",
            err,
          );
        });
      }
    },
    [churchId, activeMembership?.id],
  );

  const value = useMemo<CampusContextValue>(
    () => ({
      campuses,
      isMultiCampus: campuses.length >= 2,
      activeCampusId,
      setActiveCampusId,
      loading,
    }),
    [campuses, activeCampusId, setActiveCampusId, loading],
  );

  return (
    <CampusContext.Provider value={value}>{children}</CampusContext.Provider>
  );
}

/** Consumer hook. Safe to call from anywhere inside the dashboard layout. */
export function useActiveCampus(): CampusContextValue {
  return useContext(CampusContext);
}

/**
 * Helper: returns the display name for a campus id, or null if not found.
 * Use for inline labels where you have an id but want a name.
 */
export function useCampusName(campusId: string | null | undefined): string | null {
  const { campuses } = useActiveCampus();
  if (!campusId) return null;
  return campuses.find((c) => c.id === campusId)?.name ?? null;
}
