"use client";

import { useState } from "react";
import { useAuth } from "@/lib/context/auth-context";
import { RoomCalendarView } from "@/components/rooms/room-calendar-view";
import { RoomBookingForm } from "@/components/rooms/room-booking-form";
import { TIER_LIMITS } from "@/lib/constants";
import { db } from "@/lib/firebase/config";
import { doc, getDoc } from "firebase/firestore";
import { useEffect } from "react";
import type { SubscriptionTier } from "@/lib/types";

/**
 * /calendar — Authenticated member calendar showing all room reservations.
 * "Book Room" button opens the booking wizard.
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
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-vc-indigo font-display">
          Room Calendar
        </h1>
        <p className="text-sm text-gray-500 mt-1">
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
