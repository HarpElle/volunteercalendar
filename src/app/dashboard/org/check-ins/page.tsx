"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/context/auth-context";
import { getChurchDocuments } from "@/lib/firebase/firestore";
import { Spinner } from "@/components/ui/spinner";
import { TabBar } from "@/components/ui/tab-bar";
import { isAdmin } from "@/lib/utils/permissions";
import { TIER_LIMITS } from "@/lib/constants";
import { db } from "@/lib/firebase/config";
import { doc, getDoc } from "firebase/firestore";
import type { Church, Campus } from "@/lib/types";
import { CheckinVolunteerSettings } from "@/components/settings/checkin-volunteer-settings";
import { CheckinThresholdsSettings } from "@/components/settings/checkin-thresholds-settings";

type CheckInsTab = "volunteers" | "children";

const TABS: Array<{ key: CheckInsTab; label: string }> = [
  { key: "volunteers", label: "Volunteers" },
  { key: "children", label: "Children" },
];

export default function CheckInsPage() {
  return (
    <Suspense>
      <CheckInsContent />
    </Suspense>
  );
}

function CheckInsContent() {
  const { user, profile, activeMembership } = useAuth();
  const searchParams = useSearchParams();
  const churchId = activeMembership?.church_id || profile?.church_id;

  const [church, setChurch] = useState<Church | null>(null);
  const [campuses, setCampuses] = useState<Campus[]>([]);
  const [loading, setLoading] = useState(true);

  const rawTab = searchParams.get("tab");
  const initialTab: CheckInsTab = rawTab === "children" ? "children" : "volunteers";
  const [activeTab, setActiveTab] = useState<CheckInsTab>(initialTab);

  // Volunteer check-in settings state
  const [selfCheckInEnabled, setSelfCheckInEnabled] = useState(true);
  const [windowBefore, setWindowBefore] = useState(60);
  const [windowAfter, setWindowAfter] = useState(30);
  const [proximityEnabled, setProximityEnabled] = useState(false);
  const [proximityRadius, setProximityRadius] = useState(200);

  useEffect(() => {
    if (!churchId) { setLoading(false); return; }
    async function load() {
      try {
        const [churchSnap, campusDocs] = await Promise.all([
          getDoc(doc(db, "churches", churchId!)),
          getChurchDocuments(churchId!, "campuses"),
        ]);
        if (churchSnap.exists()) {
          const data = churchSnap.data();
          const ch = { id: churchSnap.id, ...data } as unknown as Church;
          setChurch(ch);
          const s = data.settings || {};
          setSelfCheckInEnabled(s.self_check_in_enabled !== false);
          setWindowBefore(s.check_in_window_before ?? 60);
          setWindowAfter(s.check_in_window_after ?? 30);
          setProximityEnabled(s.proximity_check_in_enabled === true);
          setProximityRadius(s.proximity_radius_meters ?? 200);
        }
        setCampuses(campusDocs as unknown as Campus[]);
      } catch {
        // silent
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [churchId]);

  if (!isAdmin(activeMembership)) return null;

  const currentTier = church?.subscription_tier || "free";
  const limits = TIER_LIMITS[currentTier] || TIER_LIMITS.free;
  const checkinEnabled = limits.checkin_enabled ?? false;

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-8">
        <h1 className="font-display text-3xl text-vc-indigo">Check-Ins</h1>
        <p className="mt-1 text-vc-text-secondary">
          Configure volunteer and children&apos;s check-in settings.
        </p>
      </div>

      <TabBar
        tabs={TABS}
        active={activeTab}
        onChange={setActiveTab}
        variant="underline"
        className="mb-8"
      />

      {activeTab === "volunteers" && church && (
        <div className="space-y-8">
          <CheckinVolunteerSettings
            churchId={churchId!}
            church={church}
            setChurch={setChurch}
            selfCheckInEnabled={selfCheckInEnabled}
            setSelfCheckInEnabled={setSelfCheckInEnabled}
            windowBefore={windowBefore}
            setWindowBefore={setWindowBefore}
            windowAfter={windowAfter}
            setWindowAfter={setWindowAfter}
            proximityEnabled={proximityEnabled}
            setProximityEnabled={setProximityEnabled}
            proximityRadius={proximityRadius}
            setProximityRadius={setProximityRadius}
            campuses={campuses}
          />
        </div>
      )}

      {activeTab === "children" && (
        <div className="space-y-8">
          {checkinEnabled ? (
            <>
              <CheckinThresholdsSettings
                churchId={churchId!}
                guardianSmsEnabled={limits.checkin_guardian_sms ?? false}
              />

              <div className="space-y-4">
                <p className="text-sm text-vc-text-secondary">
                  Manage children&apos;s check-in from these pages:
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  {[
                    { label: "Check-In Dashboard", href: "/dashboard/checkin", desc: "Live check-in activity and kiosk setup" },
                    { label: "Households", href: "/dashboard/checkin/households", desc: "Manage families and guardians" },
                    { label: "Room Configuration", href: "/dashboard/checkin/rooms", desc: "Grade ranges, capacity, and overflow" },
                    { label: "Import Households", href: "/dashboard/checkin/import", desc: "Bulk import from CSV" },
                  ].map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      className="flex items-center justify-between rounded-xl border border-vc-border-light bg-white p-5 transition-all hover:shadow-md hover:-translate-y-0.5"
                    >
                      <div>
                        <p className="text-sm font-semibold text-vc-indigo">{item.label}</p>
                        <p className="mt-0.5 text-xs text-vc-text-muted">{item.desc}</p>
                      </div>
                      <svg className="h-4 w-4 shrink-0 text-vc-text-muted" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                      </svg>
                    </Link>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div className="rounded-xl border border-dashed border-vc-border bg-white p-12 text-center">
              <p className="text-vc-text-secondary">Children&apos;s check-in is available on Growth plans and above.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
