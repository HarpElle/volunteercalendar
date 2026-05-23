"use client";

import { useAuth } from "@/lib/context/auth-context";
import { isAdmin } from "@/lib/utils/permissions";
import { AccessDenied } from "@/components/ui/access-denied";
import { RoomsShell } from "@/components/dashboard/rooms-shell";
import { RoomsSettingsSection } from "@/components/rooms/rooms-settings-section";

/**
 * /dashboard/rooms/settings — Rooms → Settings tab.
 *
 * Phase 3c-ii: extracted from /dashboard/org/campuses, which previously
 * mixed campus configuration, room settings, and facility-sharing into a
 * single page. This route now owns the room-scheduling settings slice
 * (equipment tags, booking defaults, public-calendar feed configuration).
 * Previously this URL was just a redirect to /dashboard/org/campuses.
 */
export default function RoomsSettingsPage() {
  const { activeMembership, profile } = useAuth();
  const churchId = activeMembership?.church_id || profile?.church_id;

  if (!isAdmin(activeMembership)) return <AccessDenied requiredRole="Admin" />;
  if (!churchId) return null;

  return (
    <div>
      <RoomsShell />
      <div className="mx-auto max-w-5xl">
        <RoomsSettingsSection churchId={churchId} />
      </div>
    </div>
  );
}
