"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useAuth } from "@/lib/context/auth-context";
import { getChurchDocuments, getDocument } from "@/lib/firebase/firestore";
import { where } from "firebase/firestore";
import { getCurrentPosition, isWithinRadius } from "@/lib/utils/geolocation";
import type { Assignment, Service, Campus, ChurchSettings } from "@/lib/types";

/** How often (ms) we re-evaluate whether to show the banner */
const POLL_INTERVAL = 60_000;
const DEFAULT_WINDOW_BEFORE = 60; // minutes
const DEFAULT_WINDOW_AFTER = 30;
const DEFAULT_PROXIMITY_RADIUS = 200; // meters

interface EligibleAssignment {
  assignment: Assignment;
  serviceName: string;
  serviceTime: string; // formatted display time
  method: "self" | "proximity";
  campusName?: string;
}

export function SmartCheckInBanner() {
  const { user, activeMembership } = useAuth();
  const [eligible, setEligible] = useState<EligibleAssignment | null>(null);
  const [checking, setChecking] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const churchId = activeMembership?.church_id;
  const volunteerId = activeMembership?.volunteer_id;

  const evaluate = useCallback(async () => {
    if (!churchId || !volunteerId) return;

    try {
      // Load church settings + timezone
      const churchDoc = await getDocument("churches", churchId) as
        | { id: string; settings?: ChurchSettings; timezone?: string }
        | null;
      if (!churchDoc) return;

      const settings = (churchDoc.settings || {}) as ChurchSettings;
      if (settings.self_check_in_enabled === false) return;

      const timezone = (churchDoc as { timezone?: string }).timezone || "America/New_York";
      const windowBefore = settings.check_in_window_before ?? DEFAULT_WINDOW_BEFORE;
      const windowAfter = settings.check_in_window_after ?? DEFAULT_WINDOW_AFTER;
      const proximityEnabled = settings.proximity_check_in_enabled === true;
      const proximityRadius = settings.proximity_radius_meters ?? DEFAULT_PROXIMITY_RADIUS;

      // Today's date in church timezone
      const nowInTz = new Date(new Date().toLocaleString("en-US", { timeZone: timezone }));
      const yyyy = nowInTz.getFullYear();
      const mm = String(nowInTz.getMonth() + 1).padStart(2, "0");
      const dd = String(nowInTz.getDate()).padStart(2, "0");
      const today = `${yyyy}-${mm}-${dd}`;

      // Load today's confirmed assignments for this volunteer
      const assignments = (await getChurchDocuments(
        churchId,
        "assignments",
        where("volunteer_id", "==", volunteerId),
        where("service_date", "==", today),
        where("status", "==", "confirmed"),
      )) as (Assignment & { id: string })[];

      // Filter: not yet attended, not dismissed, has service_id
      const candidates = assignments.filter(
        (a) =>
          a.attended !== "present" &&
          a.service_id &&
          localStorage.getItem(`vc_checkin_dismissed_${a.id}`) !== "true",
      );

      if (candidates.length === 0) {
        setEligible(null);
        return;
      }

      // Optionally get user position for proximity check (non-blocking)
      let userPos: { lat: number; lng: number } | null = null;
      let campusMap: Map<string, Campus> | null = null;
      if (proximityEnabled) {
        const [pos, campusDocs] = await Promise.all([
          getCurrentPosition(),
          getChurchDocuments(churchId, "campuses") as Promise<Campus[]>,
        ]);
        userPos = pos;
        campusMap = new Map(campusDocs.map((c) => [c.id, c]));
      }

      // Check each candidate against the time window
      for (const assignment of candidates) {
        const serviceDoc = await getDocument(
          `churches/${churchId}/services`,
          assignment.service_id!,
        ) as (Service & { id: string; campus_id?: string | null }) | null;
        if (!serviceDoc) continue;

        const startTime = serviceDoc.start_time || "09:00";
        const serviceInTz = new Date(
          new Date(`${today}T${startTime}`).toLocaleString("en-US", { timeZone: timezone }),
        );
        const diffMinutes = (nowInTz.getTime() - serviceInTz.getTime()) / 60_000;

        if (diffMinutes >= -windowBefore && diffMinutes <= windowAfter) {
          // Format display time
          const [h, m] = startTime.split(":");
          const hour = parseInt(h, 10);
          const ampm = hour >= 12 ? "PM" : "AM";
          const displayHour = hour % 12 || 12;
          const serviceTime = `${displayHour}:${m} ${ampm}`;

          // Check proximity if enabled
          let method: "self" | "proximity" = "self";
          let campusName: string | undefined;

          if (proximityEnabled && userPos && campusMap && serviceDoc.campus_id) {
            const campus = campusMap.get(serviceDoc.campus_id);
            if (campus?.location && isWithinRadius(userPos, campus.location, proximityRadius)) {
              method = "proximity";
              campusName = campus.name;
            }
          }

          setEligible({
            assignment,
            serviceName: serviceDoc.name,
            serviceTime,
            method,
            campusName,
          });
          return;
        }
      }

      // No assignment in window
      setEligible(null);
    } catch (err) {
      console.error("SmartCheckInBanner evaluate error:", err);
    }
  }, [churchId, volunteerId]);

  useEffect(() => {
    evaluate();
    intervalRef.current = setInterval(evaluate, POLL_INTERVAL);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [evaluate]);

  async function handleCheckIn() {
    if (!eligible || !user || !churchId) return;
    setChecking(true);
    setError(null);

    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/check-in/self", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          church_id: churchId,
          assignment_id: eligible.assignment.id,
          method: eligible.method,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Check-in failed");
        setChecking(false);
        return;
      }

      setSuccess(true);
      // Hide after showing success briefly
      setTimeout(() => {
        setEligible(null);
        setSuccess(false);
      }, 2500);
    } catch {
      setError("Check-in failed. Please try again.");
    } finally {
      setChecking(false);
    }
  }

  function handleDismiss() {
    if (!eligible) return;
    localStorage.setItem(`vc_checkin_dismissed_${eligible.assignment.id}`, "true");
    setEligible(null);
  }

  if (!eligible) return null;

  const isProximity = eligible.method === "proximity";

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        className="mb-6 rounded-xl bg-vc-coral px-5 py-4 text-white"
      >
        <div className="flex items-start gap-4">
          {/* Icon */}
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/15">
            {success ? (
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            ) : isProximity ? (
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" />
              </svg>
            ) : (
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
              </svg>
            )}
          </div>

          {/* Text */}
          <div className="flex-1">
            {success ? (
              <p className="text-sm font-semibold">
                Checked in! You&apos;re all set.
              </p>
            ) : (
              <>
                <p className="text-sm font-semibold">
                  {isProximity && eligible.campusName
                    ? `You\u2019re at ${eligible.campusName}. Check in for ${eligible.serviceName} at ${eligible.serviceTime}?`
                    : `You\u2019re scheduled for ${eligible.serviceName} at ${eligible.serviceTime}`}
                </p>
                <p className="mt-0.5 text-sm text-white/75">
                  {isProximity
                    ? "We detected you\u2019re near the venue."
                    : "Tap to check in for your assignment."}
                </p>
                {error && (
                  <p className="mt-1 rounded-lg bg-white/15 px-3 py-1.5 text-sm text-white/90">
                    {error}
                  </p>
                )}
              </>
            )}
          </div>

          {/* Actions */}
          {!success && (
            <div className="flex shrink-0 items-center gap-2">
              <button
                onClick={handleCheckIn}
                disabled={checking}
                className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-vc-coral transition-colors hover:bg-white/90 active:scale-[0.98] disabled:opacity-60"
              >
                {checking ? "Checking in\u2026" : "Check In"}
              </button>
              <button
                onClick={handleDismiss}
                className="rounded-full px-3 py-2 text-sm text-white/60 transition-colors hover:text-white"
                aria-label="Dismiss check-in banner"
              >
                Not now
              </button>
            </div>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
