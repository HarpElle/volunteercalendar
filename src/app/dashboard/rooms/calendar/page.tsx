"use client";

import { useState } from "react";
import { useAuth } from "@/lib/context/auth-context";
import { RoomCalendarView } from "@/components/rooms/room-calendar-view";
import { RoomBookingForm } from "@/components/rooms/room-booking-form";
import { RoomsShell } from "@/components/dashboard/rooms-shell";
import { TIER_LIMITS } from "@/lib/constants";
import { db } from "@/lib/firebase/config";
import { doc, getDoc } from "firebase/firestore";
import { useEffect } from "react";
import type { SubscriptionTier } from "@/lib/types";

/**
 * /dashboard/rooms/calendar — Authenticated member calendar showing all room
 * reservations. "Book Room" button opens the booking wizard.
 *
 * Phase 3c-i route move: previously at /calendar (which had its own
 * standalone layout). Now lives inside the dashboard shell with the Rooms
 * module strip. The legacy /calendar URL redirects here. /calendar/public
 * (the public token-protected feed) is unaffected.
 */
export default function CalendarPage() {
  const { activeMembership } = useAuth();
  const churchId = activeMembership?.church_id;

  const [showBookingForm, setShowBookingForm] = useState(false);
  const [tier, setTier] = useState<SubscriptionTier>("free");

  useEffect(() => {
    if (!churchId) return;
    getDoc(doc(db, "churches", churchId)).then((snap) => {
      if (snap.exists()) {
        setTier((snap.data().subscription_tier as SubscriptionTier) || "free");
      }
    }).catch(() => {});
  }, [churchId]);

  const recurringEnabled = TIER_LIMITS[tier]?.rooms_recurring ?? false;

  if (!churchId) {
    return (
      <div className="text-center py-20 text-gray-500">
        No organization selected
      </div>
    );
  }

  return (
    <div>
      {/* Rooms module strip persists across all Rooms sub-pages
          (active tab = Calendar). Phase 3c-i added this destination so
          Phase 3c-ii's campuses-page split can route its public-calendar
          settings slice here. */}
      <RoomsShell />

      <div className="mb-6">
        <p className="text-sm text-gray-500">
          View and book room reservations
        </p>
      </div>

      <RoomCalendarView
        churchId={churchId}
        onBookRoom={() => setShowBookingForm(true)}
      />

      {showBookingForm && (
        <RoomBookingForm
          churchId={churchId}
          onClose={() => setShowBookingForm(false)}
          onCreated={() => {
            setShowBookingForm(false);
            // Calendar will refetch on next render
          }}
          recurringEnabled={recurringEnabled}
        />
      )}
    </div>
  );
}
