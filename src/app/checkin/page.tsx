"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useWakeLock } from "@/lib/hooks/use-wake-lock";
import { FamilyLookup } from "@/components/checkin/family-lookup";
import { ChildSelection } from "@/components/checkin/child-selection";
import { AllergyConfirm } from "@/components/checkin/allergy-confirm";
import { CheckInSuccess } from "@/components/checkin/checkin-success";
import { VisitorRegistration } from "@/components/checkin/visitor-registration";
import { CheckoutEntry, type CheckoutResult } from "@/components/checkin/checkout-entry";
import { CheckoutSuccess } from "@/components/checkin/checkout-success";
import { KioskInstallPrompt } from "@/components/checkin/kiosk-install-prompt";

// --- Types for kiosk state ---

interface HouseholdResult {
  household: {
    id: string;
    primary_guardian_name: string;
    secondary_guardian_name?: string | null;
    matched_guardian: "primary" | "secondary";
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

interface ServiceOption {
  id: string;
  name: string;
  start_time: string;
  end_time: string;
  is_current: boolean;
}

type KioskScreen = "lookup" | "register" | "select" | "confirm" | "success" | "checkout-enter" | "checkout-success";
type KioskMode = "checkin" | "checkout";

const INACTIVITY_TIMEOUT = 30_000; // 30 seconds

/**
 * Format guardian welcome name based on lookup method.
 * QR with two guardians: "John & Jane Doe" or "John Doe & Jane Smith"
 * Phone: show matched guardian's name only.
 */
function formatGuardianWelcome(
  h: HouseholdResult["household"],
  method: "qr" | "phone",
): string {
  if (method === "phone" || !h.secondary_guardian_name) {
    // Phone lookup → show the matched guardian
    return h.matched_guardian === "secondary" && h.secondary_guardian_name
      ? h.secondary_guardian_name
      : h.primary_guardian_name;
  }
  // QR lookup with both guardians
  const primary = h.primary_guardian_name;
  const secondary = h.secondary_guardian_name;
  const pLast = primary.split(" ").slice(-1)[0];
  const sLast = secondary.split(" ").slice(-1)[0];
  const pFirst = primary.split(" ").slice(0, -1).join(" ") || primary;
  const sFirst = secondary.split(" ").slice(0, -1).join(" ") || secondary;

  if (pLast.toLowerCase() === sLast.toLowerCase()) {
    return `${pFirst} & ${sFirst} ${pLast}`;
  }
  return `${primary} & ${secondary}`;
}

function formatTime12(time24: string): string {
  const [h, m] = time24.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${hour12}:${m.toString().padStart(2, "0")} ${period}`;
}

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
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-full"><div className="animate-pulse text-vc-text-muted">Loading...</div></div>}>
      <CheckInKioskInner />
    </Suspense>
  );
}

function CheckInKioskInner() {
  const searchParams = useSearchParams();
  const churchId = searchParams.get("church_id") || "";
  const stationId = searchParams.get("station") || undefined;

  // Keep screen awake for kiosk use
  useWakeLock();

  const [mode, setMode] = useState<KioskMode>("checkin");
  const [screen, setScreen] = useState<KioskScreen>("lookup");
  const [household, setHousehold] = useState<HouseholdResult | null>(null);
  const [selectedChildIds, setSelectedChildIds] = useState<string[]>([]);
  const [checkInResult, setCheckInResult] = useState<CheckInResult | null>(null);
  const [checkoutResult, setCheckoutResult] = useState<CheckoutResult | null>(null);
  const [error, setError] = useState("");
  const [selectedServiceId, setSelectedServiceId] = useState<string | null>(null);
  const [services, setServices] = useState<ServiceOption[]>([]);
  const [churchName, setChurchName] = useState("");

  const inactivityTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lookupMethodRef = useRef<"qr" | "phone">("phone");

  // Fetch today's services on mount
  useEffect(() => {
    if (!churchId) return;
    const fetchServices = async () => {
      try {
        const res = await fetch(`/api/checkin/services?church_id=${churchId}`);
        if (res.ok) {
          const data = await res.json();
          const svcList = data.services as ServiceOption[];
          setServices(svcList);
          if (data.church_name) setChurchName(data.church_name);
          // Auto-select if only one service today
          if (svcList.length === 1) {
            setSelectedServiceId(svcList[0].id);
          } else {
            // Auto-select the current one if there is one
            const current = svcList.find((s) => s.is_current);
            if (current) setSelectedServiceId(current.id);
          }
        }
      } catch {
        // Non-critical — service_id will remain null
      }
    };
    fetchServices();
  }, [churchId]);

  // Reset to appropriate starting screen based on mode
  const resetKiosk = useCallback(() => {
    setScreen(mode === "checkout" ? "checkout-enter" : "lookup");
    setHousehold(null);
    setSelectedChildIds([]);
    setCheckInResult(null);
    setCheckoutResult(null);
    setError("");
  }, [mode]);

  // Toggle between check-in and checkout modes
  const toggleMode = useCallback(() => {
    const newMode = mode === "checkin" ? "checkout" : "checkin";
    setMode(newMode);
    setScreen(newMode === "checkout" ? "checkout-enter" : "lookup");
    setHousehold(null);
    setSelectedChildIds([]);
    setCheckInResult(null);
    setCheckoutResult(null);
    setError("");
  }, [mode]);

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
      lookupMethodRef.current = "qr";
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

  const handleHouseholdFound = (results: HouseholdResult[], method?: "qr" | "phone") => {
    onActivity();
    if (method) lookupMethodRef.current = method;
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
          service_id: selectedServiceId || undefined,
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
      {/* Service selector — show when multiple services today */}
      {services.length > 1 && mode === "checkin" && screen === "lookup" && (
        <div className="absolute top-4 left-4 z-40">
          <select
            value={selectedServiceId || ""}
            onChange={(e) => {
              setSelectedServiceId(e.target.value || null);
              onActivity();
            }}
            className="px-4 py-2.5 rounded-xl border border-gray-200 bg-white text-sm
              text-vc-indigo font-medium focus:border-vc-coral focus:ring-1
              focus:ring-vc-coral/30 outline-none min-h-[44px]"
          >
            <option value="">Select Service</option>
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({formatTime12(s.start_time)})
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Mode toggle — Check In / Check Out */}
      <div className="absolute top-4 right-4 z-40">
        <button
          type="button"
          onClick={() => { toggleMode(); onActivity(); }}
          className={`
            inline-flex items-center gap-2 px-5 py-3 rounded-xl font-semibold text-sm
            transition-colors shadow-sm min-h-[44px]
            ${mode === "checkin"
              ? "bg-vc-sage/15 text-vc-sage hover:bg-vc-sage/25 border border-vc-sage/30"
              : "bg-vc-coral/15 text-vc-coral hover:bg-vc-coral/25 border border-vc-coral/30"
            }
          `}
        >
          {mode === "checkin" ? (
            <>
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m3 0 3-3m0 0-3-3m3 3H9" />
              </svg>
              Switch to Check Out
            </>
          ) : (
            <>
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15M12 9l-3 3m0 0 3 3m-3-3h12.75" />
              </svg>
              Switch to Check In
            </>
          )}
        </button>
      </div>

      {screen === "lookup" && (
        <FamilyLookup
          churchId={churchId}
          churchName={churchName}
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
          guardianName={formatGuardianWelcome(household.household, lookupMethodRef.current)}
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
          churchName={churchName}
          onReset={resetKiosk}
          onActivity={onActivity}
        />
      )}

      {/* Checkout screens */}
      {screen === "checkout-enter" && (
        <CheckoutEntry
          churchId={churchId}
          churchName={churchName}
          onSuccess={(result) => {
            setCheckoutResult(result);
            setScreen("checkout-success");
            onActivity();
          }}
          onBack={toggleMode}
          onActivity={onActivity}
        />
      )}

      {screen === "checkout-success" && checkoutResult && (
        <CheckoutSuccess
          result={checkoutResult}
          churchName={churchName}
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

      {/* PWA install prompt — only shown when not in standalone mode */}
      {screen === "lookup" && <KioskInstallPrompt />}
    </div>
  );
}
