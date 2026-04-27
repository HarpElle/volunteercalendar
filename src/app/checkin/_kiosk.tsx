"use client";

import { Suspense, useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useWakeLock } from "@/lib/hooks/use-wake-lock";
import {
  getStoredKioskChurchId,
  getStoredKioskStationId,
  getStoredKioskToken,
  kioskFetch,
} from "@/lib/kiosk-client";
import { FamilyLookup } from "@/components/checkin/family-lookup";
import { ChildSelection } from "@/components/checkin/child-selection";
import { AllergyConfirm } from "@/components/checkin/allergy-confirm";
import { CheckInSuccess } from "@/components/checkin/checkin-success";
import { VisitorRegistration } from "@/components/checkin/visitor-registration";
import { CheckoutEntry, type CheckoutResult } from "@/components/checkin/checkout-entry";
import { CheckoutSuccess } from "@/components/checkin/checkout-success";
import { KioskInstallPrompt } from "@/components/checkin/kiosk-install-prompt";
import { PrinterSetupWizard } from "@/components/checkin/printer-setup-wizard";

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

type KioskScreen = "lookup" | "register" | "select" | "confirm" | "success" | "checkout-enter" | "checkout-success" | "printer-setup";
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
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlChurchId = searchParams.get("church_id") || "";
  const urlStationId = searchParams.get("station") || "";

  // In the Capacitor kiosk app, there's no church_id in the URL.
  // Resolve from localStorage (set on activation — see /kiosk page).
  const [storedChurchId, setStoredChurchId] = useState("");
  const [storedStationId, setStoredStationId] = useState("");
  const [kioskName, setKioskName] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [hasPrinterConfig, setHasPrinterConfig] = useState(false);

  useEffect(() => {
    // Track B: an activated kiosk has a token in localStorage. If there's
    // no token AND no URL church_id (i.e. preview mode), bounce to /kiosk
    // for activation. This is the only way a non-activated device can
    // hit the live check-in routes — the API itself will 401 anyway.
    const token = getStoredKioskToken();
    const boundChurchId = getStoredKioskChurchId();
    const boundStationId = getStoredKioskStationId();

    if (!urlChurchId && !token) {
      router.replace("/kiosk");
      return;
    }
    if (boundChurchId) setStoredChurchId(boundChurchId);
    if (boundStationId) setStoredStationId(boundStationId);

    const savedName = localStorage.getItem("vc_kiosk_name");
    if (savedName) setKioskName(savedName);
    setHasPrinterConfig(!!localStorage.getItem("vc_kiosk_printer"));
  }, [urlChurchId, router]);

  const churchId = urlChurchId || storedChurchId;
  // Station ID: explicit station_id from activation → URL param → kiosk name → undefined.
  const stationId =
    storedStationId ||
    urlStationId ||
    (kioskName ? kioskName.toLowerCase().replace(/\s+/g, "-") : undefined);

  // Keep screen awake for kiosk use
  useWakeLock();

  // In Capacitor WebView, the keyboard can cover inputs.
  // Scroll the focused input into view when the keyboard appears.
  useEffect(() => {
    const handleFocusIn = (e: FocusEvent) => {
      const target = e.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) {
        // Delay to let the keyboard finish opening
        setTimeout(() => {
          target.scrollIntoView({ behavior: "smooth", block: "center" });
        }, 300);
      }
    };
    document.addEventListener("focusin", handleFocusIn);
    return () => document.removeEventListener("focusin", handleFocusIn);
  }, []);

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
        const res = await kioskFetch(`/api/checkin/services?church_id=${churchId}`);
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
          const res = await kioskFetch("/api/checkin/lookup", {
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
      const res = await kioskFetch("/api/checkin/checkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          church_id: churchId,
          household_id: household!.household.id,
          child_ids: childIds,
          station_id: stationId,
          service_date: (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; })(),
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
      const res = await kioskFetch("/api/checkin/lookup", {
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

  // No church_id — show kiosk setup screen
  if (!churchId) {
    return <KioskSetup onComplete={(id, name) => {
      localStorage.setItem("vc_kiosk_church_id", id);
      localStorage.setItem("vc_kiosk_name", name);
      setStoredChurchId(id);
      setKioskName(name);
    }} />;
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

      {/* Admin toolbar — slim bar at bottom of home screens */}
      {(screen === "lookup" || screen === "checkout-enter") && (
        <div className="absolute bottom-0 left-0 right-0 z-40 flex items-center h-11 px-3
          border-t border-gray-100/80 bg-white/80 backdrop-blur-sm">
          {/* Settings gear */}
          <button
            type="button"
            onClick={() => { setShowSettings(true); onActivity(); }}
            className="flex items-center justify-center w-9 h-9 rounded-lg
              text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
            aria-label="Kiosk settings"
          >
            <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
            </svg>
          </button>

          {/* Center: Kiosk name + printer status */}
          <div className="flex-1 flex items-center justify-center gap-2 text-[11px] text-gray-400 select-none">
            {kioskName && <span className="font-medium text-gray-500">{kioskName}</span>}
            {kioskName && <span className="w-0.5 h-0.5 rounded-full bg-gray-300" />}
            <span className="flex items-center gap-1">
              <span className={`w-1.5 h-1.5 rounded-full ${hasPrinterConfig ? "bg-vc-sage" : "bg-gray-300"}`} />
              {hasPrinterConfig ? "Printer ready" : "No printer"}
            </span>
          </div>

          {/* Right: Mode toggle */}
          <button
            type="button"
            onClick={() => { toggleMode(); onActivity(); }}
            className={`
              inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px]
              font-semibold transition-colors
              ${mode === "checkin"
                ? "text-vc-sage hover:bg-vc-sage/10"
                : "text-vc-coral hover:bg-vc-coral/10"
              }
            `}
          >
            {mode === "checkin" ? "Check Out" : "Check In"}
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21 3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
            </svg>
          </button>
        </div>
      )}

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
          onSetupPrinter={() => setScreen("printer-setup")}
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

      {screen === "printer-setup" && (
        <PrinterSetupWizard
          churchId={churchId}
          stationName={kioskName}
          onComplete={() => {
            setHasPrinterConfig(true);
            resetKiosk();
          }}
          onSkip={() => {
            resetKiosk();
          }}
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

      {/* Settings sheet — slide-up panel */}
      {showSettings && (
        <div className="fixed inset-0 z-50" onClick={() => setShowSettings(false)}>
          <div className="absolute inset-0 bg-black/20" />
          <div
            className="absolute bottom-0 left-0 right-0 bg-white rounded-t-2xl shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 max-w-sm mx-auto">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-bold text-vc-indigo font-display">Kiosk Settings</h3>
                <button
                  type="button"
                  onClick={() => setShowSettings(false)}
                  className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Kiosk Name */}
              <div className="mb-5">
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                  Kiosk Name
                </label>
                <input
                  type="text"
                  value={kioskName}
                  onChange={(e) => setKioskName(e.target.value)}
                  onBlur={() => {
                    const trimmed = kioskName.trim();
                    if (trimmed) {
                      localStorage.setItem("vc_kiosk_name", trimmed);
                      setKioskName(trimmed);
                    }
                  }}
                  onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
                  placeholder="e.g. Lobby Kiosk"
                  className="w-full px-3 py-2.5 rounded-xl border border-vc-border-light text-vc-indigo
                    placeholder:text-gray-400 outline-none focus:border-vc-coral focus:ring-1
                    focus:ring-vc-coral/30 text-sm min-h-[44px]"
                />
              </div>

              {/* Printer Setup */}
              <button
                type="button"
                onClick={() => { setShowSettings(false); setScreen("printer-setup"); }}
                className="w-full flex items-center justify-between px-4 py-3 rounded-xl border border-vc-border-light
                  hover:border-vc-coral hover:bg-vc-coral/5 transition-colors text-left mb-3 min-h-[44px]"
              >
                <div className="flex items-center gap-3">
                  <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0 1 10.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0 .229 2.523a1.125 1.125 0 0 1-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0 0 21 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 0 0-1.913-.247M6.34 18H5.25A2.25 2.25 0 0 1 3 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.041 48.041 0 0 1 1.913-.247m10.5 0a48.536 48.536 0 0 0-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M18 10.5h.008v.008H18V10.5Zm-3 0h.008v.008H15V10.5Z" />
                  </svg>
                  <div>
                    <p className="font-medium text-vc-indigo text-sm">Printer</p>
                    <p className="text-xs text-gray-400">
                      {hasPrinterConfig ? "Configured" : "Not configured"}
                    </p>
                  </div>
                </div>
                <svg className="w-4 h-4 text-gray-300" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                </svg>
              </button>

              {/* Switch Church — only when set via localStorage */}
              {!urlChurchId && (
                <button
                  type="button"
                  onClick={() => {
                    localStorage.removeItem("vc_kiosk_church_id");
                    localStorage.removeItem("vc_kiosk_name");
                    localStorage.removeItem("vc_kiosk_printer");
                    setStoredChurchId("");
                    setKioskName("");
                    setChurchName("");
                    setServices([]);
                    setSelectedServiceId(null);
                    setHasPrinterConfig(false);
                    setShowSettings(false);
                    resetKiosk();
                  }}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-red-100
                    hover:bg-red-50 transition-colors text-left min-h-[44px]"
                >
                  <svg className="w-5 h-5 text-red-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21 3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
                  </svg>
                  <div>
                    <p className="font-medium text-red-600 text-sm">Switch Church</p>
                    <p className="text-xs text-gray-400">Disconnect from {churchName || "this church"}</p>
                  </div>
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Extract church_id (or setup code) from a URL string or return raw input. */
function extractChurchId(raw: string): string {
  const trimmed = raw.trim();
  // If it looks like a 6-char setup code, return as-is (uppercase)
  if (/^[A-Za-z0-9]{6}$/.test(trimmed)) return trimmed.toUpperCase();
  try {
    const url = new URL(trimmed.startsWith("http") ? trimmed : `https://x.com?church_id=${trimmed}`);
    return url.searchParams.get("church_id") || trimmed;
  } catch {
    return trimmed;
  }
}

/**
 * Kiosk Setup — shown when no church_id is available.
 * In the Capacitor app, this is the first screen the admin sees.
 * Options: scan the dashboard's Check-In QR code, paste a URL, or type a church ID.
 */
function KioskSetup({ onComplete }: { onComplete: (churchId: string, kioskName: string) => void }) {
  const [step, setStep] = useState<"church" | "name">("church");
  const [validatedChurchId, setValidatedChurchId] = useState("");
  const [input, setInput] = useState("");
  const [kioskNameInput, setKioskNameInput] = useState("Kiosk 1");
  const [validating, setValidating] = useState(false);
  const [error, setError] = useState("");
  const [scanning, setScanning] = useState(false);

  const validateChurch = useCallback(async (churchId: string) => {
    if (!churchId) {
      setError("Please enter a setup code or paste the kiosk URL.");
      return;
    }
    setValidating(true);
    setError("");
    try {
      const res = await kioskFetch(`/api/checkin/services?church_id=${churchId}`);
      if (!res.ok) {
        setError("Church not found. Check the code and try again.");
        setValidating(false);
        return;
      }
      setValidatedChurchId(churchId);
      setStep("name");
      setValidating(false);
    } catch {
      setError("Could not connect. Check your internet and try again.");
      setValidating(false);
    }
  }, []);

  const handleSubmit = () => validateChurch(extractChurchId(input));

  const handleQrResult = useCallback((scannedValue: string) => {
    setScanning(false);
    const churchId = extractChurchId(scannedValue);
    if (churchId) {
      setInput(scannedValue);
      validateChurch(churchId);
    } else {
      setError("QR code didn't contain a valid kiosk URL.");
    }
  }, [validateChurch]);

  if (scanning) {
    return (
      <QrScanner
        onResult={handleQrResult}
        onCancel={() => setScanning(false)}
      />
    );
  }

  // Step 2: Name this kiosk
  if (step === "name") {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="max-w-sm w-full p-8 text-center">
          <div className="w-16 h-16 rounded-2xl bg-vc-sage/10 flex items-center justify-center mx-auto mb-6">
            <svg className="w-8 h-8 text-vc-sage" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.568 3H5.25A2.25 2.25 0 0 0 3 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 0 0 5.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 0 0 9.568 3Z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 6h.008v.008H6V6Z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-vc-indigo font-display mb-2">
            Name This Kiosk
          </h1>
          <p className="text-gray-500 text-sm mb-6">
            Give this kiosk a name so you can tell your stations apart.
          </p>

          <input
            type="text"
            value={kioskNameInput}
            onChange={(e) => setKioskNameInput(e.target.value)}
            placeholder="e.g. Lobby Kiosk"
            className="w-full px-4 py-3 rounded-xl border border-vc-border-light text-vc-indigo text-center
              placeholder:text-gray-400 outline-none focus:border-vc-coral focus:ring-1
              focus:ring-vc-coral/30 text-lg font-medium min-h-[44px] mb-4"
            onKeyDown={(e) => {
              if (e.key === "Enter" && kioskNameInput.trim()) {
                onComplete(validatedChurchId, kioskNameInput.trim());
              }
            }}
          />

          <button
            type="button"
            onClick={() => onComplete(validatedChurchId, kioskNameInput.trim() || "Kiosk 1")}
            className="w-full py-3 rounded-xl bg-vc-coral text-white font-semibold text-base
              min-h-[44px]"
          >
            Continue
          </button>

          <button
            type="button"
            onClick={() => { setStep("church"); setValidatedChurchId(""); }}
            className="mt-4 text-gray-400 text-sm"
          >
            Back
          </button>
        </div>
      </div>
    );
  }

  // Step 1: Connect to church
  return (
    <div className="flex items-center justify-center h-full">
      <div className="max-w-sm w-full p-8 text-center">
        <div className="w-16 h-16 rounded-2xl bg-vc-coral/10 flex items-center justify-center mx-auto mb-6">
          <svg className="w-8 h-8 text-vc-coral" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 1.5H8.25A2.25 2.25 0 0 0 6 3.75v16.5a2.25 2.25 0 0 0 2.25 2.25h7.5A2.25 2.25 0 0 0 18 20.25V3.75a2.25 2.25 0 0 0-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 18.75h3" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-vc-indigo font-display mb-2">
          Set Up Kiosk
        </h1>
        <p className="text-gray-500 text-sm mb-6">
          Scan the QR code from your Check-In dashboard,
          or enter your setup code below.
        </p>

        {/* QR scan button */}
        <button
          type="button"
          onClick={() => { setScanning(true); setError(""); }}
          className="w-full flex items-center justify-center gap-3 py-4 rounded-xl
            bg-vc-indigo text-white font-semibold text-base min-h-[56px] mb-4
            hover:bg-vc-indigo/90 transition-colors"
        >
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0 1 3.75 9.375v-4.5ZM3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 0 1-1.125-1.125v-4.5ZM13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 0 1-1.125-1.125v-4.5Z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 6.75h.75v.75h-.75v-.75ZM6.75 16.5h.75v.75h-.75v-.75ZM16.5 6.75h.75v.75h-.75v-.75ZM13.5 13.5h.75v.75h-.75v-.75ZM13.5 19.5h.75v.75h-.75v-.75ZM19.5 13.5h.75v.75h-.75v-.75ZM19.5 19.5h.75v.75h-.75v-.75ZM16.5 16.5h.75v.75h-.75v-.75Z" />
          </svg>
          Scan QR Code
        </button>

        <div className="flex items-center gap-3 mb-4">
          <div className="flex-1 h-px bg-gray-200" />
          <span className="text-xs text-gray-400 uppercase tracking-wide">or</span>
          <div className="flex-1 h-px bg-gray-200" />
        </div>

        <input
          type="text"
          value={input}
          onChange={(e) => { setInput(e.target.value); setError(""); }}
          placeholder="Kiosk URL or setup code"
          className="w-full px-4 py-3 rounded-xl border border-vc-border-light text-vc-indigo
            placeholder:text-gray-400 outline-none focus:border-vc-coral focus:ring-1
            focus:ring-vc-coral/30 text-base min-h-[44px] mb-3"
          onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
        />
        {error && <p className="text-red-500 text-sm mb-3">{error}</p>}
        <button
          type="button"
          onClick={handleSubmit}
          disabled={validating}
          className="w-full py-3 rounded-xl bg-vc-coral text-white font-semibold text-base
            min-h-[44px] disabled:opacity-50"
        >
          {validating ? "Verifying..." : "Connect Kiosk"}
        </button>
      </div>
    </div>
  );
}

/**
 * QR Scanner — uses the device camera + jsQR library (same as family-lookup).
 * Works in all WebViews including Capacitor on iOS.
 */
function QrScanner({
  onResult,
  onCancel,
}: {
  onResult: (value: string) => void;
  onCancel: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scannerRef = useRef<number | null>(null);
  const [cameraError, setCameraError] = useState("");

  const stopCamera = useCallback(() => {
    if (scannerRef.current) {
      cancelAnimationFrame(scannerRef.current);
      scannerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    const start = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
        });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
      } catch {
        setCameraError("Camera access denied. Please allow camera access and try again.");
        return;
      }

      // Dynamic import of jsQR (same library used by family-lookup scanner)
      const { default: jsQR } = await import("jsqr");
      const canvas = canvasRef.current;
      const video = videoRef.current;
      if (!canvas || !video || cancelled) return;

      const ctx = canvas.getContext("2d")!;

      const scan = () => {
        if (cancelled || !video.videoWidth) {
          scannerRef.current = requestAnimationFrame(scan);
          return;
        }

        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0);

        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, canvas.width, canvas.height);

        if (code?.data) {
          stopCamera();
          onResult(code.data);
          return;
        }

        scannerRef.current = requestAnimationFrame(scan);
      };

      scannerRef.current = requestAnimationFrame(scan);
    };

    start();
    return () => {
      cancelled = true;
      stopCamera();
    };
  }, [onResult, stopCamera]);

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      {/* Camera viewfinder */}
      <div className="flex-1 relative overflow-hidden">
        {cameraError ? (
          <div className="flex items-center justify-center h-full p-8">
            <p className="text-white text-center text-lg">{cameraError}</p>
          </div>
        ) : (
          <>
            <video
              ref={videoRef as RefObject<HTMLVideoElement>}
              className="absolute inset-0 w-full h-full object-cover"
              playsInline
              muted
            />
            <canvas ref={canvasRef as RefObject<HTMLCanvasElement>} className="hidden" />
            {/* Scanning overlay with viewfinder cutout */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="relative w-64 h-64">
                {/* Corner brackets */}
                <div className="absolute top-0 left-0 w-8 h-8 border-t-3 border-l-3 border-white rounded-tl-lg" />
                <div className="absolute top-0 right-0 w-8 h-8 border-t-3 border-r-3 border-white rounded-tr-lg" />
                <div className="absolute bottom-0 left-0 w-8 h-8 border-b-3 border-l-3 border-white rounded-bl-lg" />
                <div className="absolute bottom-0 right-0 w-8 h-8 border-b-3 border-r-3 border-white rounded-br-lg" />
                {/* Scanning line animation */}
                <div className="absolute left-2 right-2 h-0.5 bg-vc-coral/80 animate-[scan_2s_ease-in-out_infinite]" />
              </div>
            </div>
            <p className="absolute bottom-8 left-0 right-0 text-center text-white/80 text-sm font-medium">
              Point at the QR code on your Check-In dashboard
            </p>
          </>
        )}
      </div>

      {/* Cancel button */}
      <div className="bg-black/90 p-6 flex justify-center">
        <button
          type="button"
          onClick={() => { stopCamera(); onCancel(); }}
          className="px-8 py-3 rounded-full border-2 border-white/30 text-white font-semibold
            text-base min-h-[44px] hover:bg-white/10 transition-colors"
        >
          Cancel
        </button>
      </div>

      {/* Scanning line animation keyframes */}
      <style>{`
        @keyframes scan {
          0%, 100% { top: 8px; }
          50% { top: calc(100% - 8px); }
        }
      `}</style>
    </div>
  );
}
