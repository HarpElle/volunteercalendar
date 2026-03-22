"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { FamilyLookup } from "@/components/checkin/family-lookup";
import { ChildSelection } from "@/components/checkin/child-selection";
import { AllergyConfirm } from "@/components/checkin/allergy-confirm";
import { CheckInSuccess } from "@/components/checkin/checkin-success";
import { VisitorRegistration } from "@/components/checkin/visitor-registration";

// --- Types for kiosk state ---

interface HouseholdResult {
  household: {
    id: string;
    primary_guardian_name: string;
    primary_guardian_phone_masked: string;
  };
  children: {
    id: string;
    first_name: string;
    last_name: string;
    preferred_name?: string;
    grade?: string;
    has_alerts: boolean;
    allergies?: string;
    medical_notes?: string;
    photo_url?: string;
    room_name: string;
    pre_checked_in: boolean;
  }[];
}

interface CheckInResult {
  sessions: {
    id: string;
    child_id: string;
    room_name: string;
    checked_in_at: string;
  }[];
  security_code: string;
  label_payloads: { format: string; data: string; printer_id: string }[];
  print_server_url: string | null;
}

type KioskScreen = "lookup" | "register" | "select" | "confirm" | "success";

const INACTIVITY_TIMEOUT = 30_000; // 30 seconds

/**
 * /checkin — Kiosk check-in page.
 *
 * Query params:
 *   church_id  — required, scopes all operations
 *   station    — optional printer station ID
 *   token      — optional QR deep link token (auto-triggers lookup)
 *
 * 4-screen state machine: lookup → select → confirm → success
 * Auto-resets to Screen 1 after 30s of inactivity.
 */
export default function CheckInKiosk() {
  const searchParams = useSearchParams();
  const churchId = searchParams.get("church_id") || "";
  const stationId = searchParams.get("station") || undefined;

  const [screen, setScreen] = useState<KioskScreen>("lookup");
  const [household, setHousehold] = useState<HouseholdResult | null>(null);
  const [selectedChildIds, setSelectedChildIds] = useState<string[]>([]);
  const [checkInResult, setCheckInResult] = useState<CheckInResult | null>(null);
  const [error, setError] = useState("");

  const inactivityTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset to Screen 1
  const resetKiosk = useCallback(() => {
    setScreen("lookup");
    setHousehold(null);
    setSelectedChildIds([]);
    setCheckInResult(null);
    setError("");
  }, []);

  // Activity tracker — resets 30s inactivity timer
  const onActivity = useCallback(() => {
    if (inactivityTimer.current) {
      clearTimeout(inactivityTimer.current);
    }
    inactivityTimer.current = setTimeout(resetKiosk, INACTIVITY_TIMEOUT);
  }, [resetKiosk]);

  // Start inactivity timer on mount
  useEffect(() => {
    onActivity();
    return () => {
      if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
    };
  }, [onActivity]);

  // Handle QR deep link token
  useEffect(() => {
    const token = searchParams.get("token");
    if (token && churchId && screen === "lookup") {
      // Auto-trigger lookup with QR token
      const doLookup = async () => {
        try {
          const res = await fetch("/api/checkin/lookup", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ church_id: churchId, qr_token: token }),
          });
          if (res.ok) {
            const data = await res.json();
            if (data.households?.length > 0) {
              handleHouseholdFound(data.households);
            }
          }
        } catch {
          // Fail silently — user can scan again
        }
      };
      doLookup();
    }
    // Only run on initial mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Screen transition handlers ---

  const handleHouseholdFound = (results: HouseholdResult[]) => {
    onActivity();
    setHousehold(results[0]);
    setScreen("select");
  };

  const handleChildrenSelected = (ids: string[]) => {
    onActivity();
    setSelectedChildIds(ids);

    // Check if any selected children have alerts
    const selectedChildren =
      household?.children.filter((c) => ids.includes(c.id)) || [];
    const hasAlerts = selectedChildren.some((c) => c.has_alerts);

    if (hasAlerts) {
      setScreen("confirm");
    } else {
      // No alerts — skip to check-in
      doCheckIn(ids);
    }
  };

  const handleAllergyConfirmed = () => {
    doCheckIn(selectedChildIds);
  };

  const doCheckIn = async (childIds: string[]) => {
    onActivity();
    setError("");

    try {
      const res = await fetch("/api/checkin/checkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          church_id: churchId,
          household_id: household!.household.id,
          child_ids: childIds,
          station_id: stationId,
          service_date: new Date().toISOString().split("T")[0],
          alerts_acknowledged: true,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Check-in failed");
        return;
      }

      const result = (await res.json()) as CheckInResult;
      setCheckInResult(result);
      setScreen("success");
    } catch {
      setError("Network error. Please try again.");
    }
  };

  const handleFirstTimeVisitor = () => {
    onActivity();
    setScreen("register");
  };

  const handleRegistered = async (result: {
    household_id: string;
    qr_token: string;
    children: { id: string; first_name: string; last_name: string }[];
  }) => {
    onActivity();
    // After registration, look up the new household so we can transition
    // to child selection with full data (room assignments, etc.)
    try {
      const res = await fetch("/api/checkin/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ church_id: churchId, qr_token: result.qr_token }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.households?.length > 0) {
          handleHouseholdFound(data.households);
          return;
        }
      }
    } catch {
      // Fall through
    }
    // Fallback: reset to lookup so they can scan/type
    setError("Registration complete! Please look up your family to check in.");
    setScreen("lookup");
  };

  // No church_id — show error
  if (!churchId) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center p-8">
          <h1 className="text-2xl font-bold text-vc-indigo font-display mb-2">
            Kiosk Not Configured
          </h1>
          <p className="text-gray-500">
            This kiosk needs a church_id parameter in the URL.
          </p>
        </div>
      </div>
    );
  }

  // Get selected child names for success screen
  const selectedChildNames =
    household?.children
      .filter((c) => selectedChildIds.includes(c.id))
      .map((c) => c.preferred_name || c.first_name) || [];

  return (
    <div className="relative h-full">
      {screen === "lookup" && (
        <FamilyLookup
          churchId={churchId}
          onHouseholdFound={handleHouseholdFound}
          onFirstTimeVisitor={handleFirstTimeVisitor}
          onActivity={onActivity}
        />
      )}

      {screen === "register" && (
        <VisitorRegistration
          churchId={churchId}
          onRegistered={handleRegistered}
          onBack={() => {
            setScreen("lookup");
            onActivity();
          }}
          onActivity={onActivity}
        />
      )}

      {screen === "select" && household && (
        <ChildSelection
          guardianName={household.household.primary_guardian_name}
          children={household.children}
          onConfirm={handleChildrenSelected}
          onBack={() => {
            setScreen("lookup");
            onActivity();
          }}
          onActivity={onActivity}
        />
      )}

      {screen === "confirm" && household && (
        <AllergyConfirm
          childrenWithAlerts={household.children
            .filter(
              (c) => selectedChildIds.includes(c.id) && c.has_alerts,
            )
            .map((c) => ({
              id: c.id,
              name: c.preferred_name || c.first_name,
              allergies: c.allergies,
              medical_notes: c.medical_notes,
            }))}
          totalChildren={selectedChildIds.length}
          onConfirm={handleAllergyConfirmed}
          onBack={() => {
            setScreen("select");
            onActivity();
          }}
          onActivity={onActivity}
        />
      )}

      {screen === "success" && checkInResult && (
        <CheckInSuccess
          result={checkInResult}
          childNames={selectedChildNames}
          onReset={resetKiosk}
          onActivity={onActivity}
        />
      )}

      {/* Global error toast */}
      {error && screen !== "lookup" && (
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 max-w-md w-full px-4 z-50">
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-5 py-3 text-center font-medium">
            {error}
            <button
              type="button"
              onClick={() => setError("")}
              className="ml-3 text-red-400 underline"
            >
              dismiss
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
