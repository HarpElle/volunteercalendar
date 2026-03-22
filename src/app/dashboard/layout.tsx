"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/lib/context/auth-context";
import { Spinner } from "@/components/ui/spinner";
import { db } from "@/lib/firebase/config";
import { doc, getDoc } from "firebase/firestore";
import { isScheduler } from "@/lib/utils/permissions";
import { useServiceWorker } from "@/lib/hooks/use-service-worker";
import { PwaInstallBanner } from "@/components/ui/pwa-install-banner";
import { SmartCheckInBanner } from "@/components/ui/smart-check-in-banner";
import { Sidebar } from "@/components/dashboard/sidebar";
import { MobileHeader } from "@/components/dashboard/mobile-header";
import type { SubscriptionTier } from "@/lib/types";
import { TIER_LIMITS } from "@/lib/constants";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, profile, loading, signOut, memberships, activeMembership, switchOrg } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [churchName, setChurchName] = useState<string>("");
  const [orgNames, setOrgNames] = useState<Map<string, string>>(new Map());
  const [showGuideDot, setShowGuideDot] = useState(false);
  const [hasPrerequisites, setHasPrerequisites] = useState(false);
  const [subscriptionTier, setSubscriptionTier] = useState<SubscriptionTier>("free");

  // Register service worker for PWA + push notifications
  useServiceWorker();

  // Show a dot on "Home" when the setup guide hasn't been dismissed
  useEffect(() => {
    setShowGuideDot(!localStorage.getItem("vc_setup_guide_dismissed"));
  }, []);

  // Determine the effective church ID (membership-first, legacy fallback)
  const churchId = activeMembership?.church_id || profile?.church_id;

  useEffect(() => {
    if (!churchId) return;
    getDoc(doc(db, "churches", churchId)).then((snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setChurchName(data.name || "");
        const orgPrereqs: unknown[] = data.org_prerequisites || [];
        setHasPrerequisites(orgPrereqs.length > 0);
        setSubscriptionTier((data.subscription_tier as SubscriptionTier) || "free");
      }
    }).catch(() => {});
  }, [churchId]);

  // Load names for all orgs (for org switcher)
  const activeMemberships = memberships.filter((m) => m.status === "active");
  const hasMultipleOrgs = activeMemberships.length > 1;

  useEffect(() => {
    if (!hasMultipleOrgs) return;
    async function loadOrgNames() {
      const names = new Map<string, string>();
      for (const m of activeMemberships) {
        try {
          const snap = await getDoc(doc(db, "churches", m.church_id));
          if (snap.exists()) {
            names.set(m.church_id, snap.data().name || m.church_id);
          }
        } catch {
          // silent
        }
      }
      setOrgNames(names);
    }
    loadOrgNames();
  }, [hasMultipleOrgs, memberships]);

  const worshipEnabled = TIER_LIMITS[subscriptionTier]?.worship_enabled ?? false;

  // Redirect volunteers from /dashboard to /dashboard/my-schedule
  const isVolunteerOnly = activeMembership && !isScheduler(activeMembership);

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/");
    }
  }, [loading, user, router]);

  useEffect(() => {
    if (!loading && user && isVolunteerOnly && pathname === "/dashboard") {
      router.replace("/dashboard/my-schedule");
    }
  }, [loading, user, isVolunteerOnly, pathname, router]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-vc-bg">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="flex min-h-screen bg-vc-bg">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/30 lg:hidden"
          onClick={() => setSidebarOpen(false)}
          role="button"
          aria-label="Close navigation"
        />
      )}

      <Sidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        activeMembership={activeMembership}
        hasPrerequisites={hasPrerequisites}
        worshipEnabled={worshipEnabled}
        showGuideDot={showGuideDot}
        churchName={churchName}
        churchId={churchId}
        activeMemberships={activeMemberships}
        orgNames={orgNames}
        switchOrg={switchOrg}
        displayName={profile?.display_name || "User"}
        email={user.email || ""}
        signOut={async () => { await signOut(); router.push("/"); }}
      />

      {/* Main content */}
      <div className="flex flex-1 flex-col">
        <MobileHeader onMenuOpen={() => setSidebarOpen(true)} />

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 xl:p-10">
          <PwaInstallBanner />
          <SmartCheckInBanner />
          {children}
        </main>
      </div>
    </div>
  );
}
