"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/context/auth-context";
import { Spinner } from "@/components/ui/spinner";
import { isAdmin } from "@/lib/utils/permissions";
import { TIER_LIMITS } from "@/lib/constants";
import { db } from "@/lib/firebase/config";
import { doc, getDoc } from "firebase/firestore";
import type { Church } from "@/lib/types";
import { RoomsShell } from "@/components/dashboard/rooms-shell";
import { FacilitySharingSection } from "@/components/rooms/facility-sharing-section";
import { AccessDenied } from "@/components/ui/access-denied";

/**
 * /dashboard/rooms/facility — Rooms → Facility Groups tab.
 *
 * Phase 3c-ii: extracted from /dashboard/org/campuses, which previously
 * mixed campus configuration, room settings, and facility-sharing into a
 * single page. This route now owns the cross-org shared-facility slice.
 * /dashboard/org/campuses redirects here as the highest-frequency
 * landing per plan §6.6.
 *
 * Detail view for a specific group continues to live at
 * /dashboard/rooms/facility/[groupId].
 */
export default function RoomsFacilityPage() {
  const { activeMembership, profile } = useAuth();
  const churchId = activeMembership?.church_id || profile?.church_id;

  const [church, setChurch] = useState<Church | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!churchId) { setLoading(false); return; }
    (async () => {
      try {
        const churchSnap = await getDoc(doc(db, "churches", churchId));
        if (churchSnap.exists()) {
          setChurch({ id: churchSnap.id, ...churchSnap.data() } as unknown as Church);
        }
      } catch {
        // silent
      } finally {
        setLoading(false);
      }
    })();
  }, [churchId]);

  if (!isAdmin(activeMembership)) return <AccessDenied requiredRole="Admin" />;
  if (!churchId) return null;

  if (loading) {
    return (
      <div>
        <RoomsShell />
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      </div>
    );
  }

  const currentTier = church?.subscription_tier || "free";
  const limits = TIER_LIMITS[currentTier] || TIER_LIMITS.free;

  return (
    <div>
      <RoomsShell />
      <div className="mx-auto max-w-5xl">
        <FacilitySharingSection churchId={churchId} tierLimits={limits} />
      </div>
    </div>
  );
}
