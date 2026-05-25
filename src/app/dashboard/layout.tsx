"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/lib/context/auth-context";
import { Spinner } from "@/components/ui/spinner";
import { db } from "@/lib/firebase/config";
import { doc, getDoc } from "firebase/firestore";
import { isAdmin, isScheduler } from "@/lib/utils/permissions";
import { shouldShowCheckinNav } from "@/lib/utils/checkin-permissions";
import { useServiceWorker } from "@/lib/hooks/use-service-worker";
import { useNotifications } from "@/lib/hooks/use-notifications";
import { PwaInstallBanner } from "@/components/ui/pwa-install-banner";
import { SmartCheckInBanner } from "@/components/ui/smart-check-in-banner";
import { Sidebar } from "@/components/dashboard/sidebar";
import { MobileHeader } from "@/components/dashboard/mobile-header";
import { BottomNav } from "@/components/dashboard/bottom-nav";
import { MoreMenu } from "@/components/dashboard/more-menu";
import { FeedbackButton } from "@/components/feedback/feedback-button";
import { CampusProvider } from "@/lib/context/campus-context";
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
  const [churchName, setChurchName] = useState<string>("");
  const [orgNames, setOrgNames] = useState<Map<string, string>>(new Map());
  const [showGuideDot, setShowGuideDot] = useState(false);
  const [hasPrerequisites, setHasPrerequisites] = useState(false);
  const [subscriptionTier, setSubscriptionTier] = useState<SubscriptionTier>("free");
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);

  // Register service worker for PWA + push notifications
  useServiceWorker();

  // Real-time unread notification badge
  const { hasUnread } = useNotifications(user?.uid, activeMembership?.church_id || profile?.church_id);

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

        // Pass G Phase 5: redirect to suspended landing if the org is
        // platform-admin-suspended. Soft block — data preserved; admin
        // can unsuspend via /api/platform/orgs/<id>/suspend.
        if (data.suspended_at) {
          router.replace("/account/suspended");
        }
      }
    }).catch(() => {});
  }, [churchId, router]);

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

  useEffect(() => {
    if (!user) return;
    user.getIdToken().then((token) => {
      fetch("/api/platform/me", { headers: { Authorization: `Bearer ${token}` } })
        .then((r) => r.json())
        .then((d) => setIsPlatformAdmin(d.is_platform_admin === true))
        .catch(() => {});
    });
  }, [user]);

  // Role checks
  const userIsAdmin = isAdmin(activeMembership);
  const userIsScheduler = isScheduler(activeMembership);
  const isVolunteerOnly = activeMembership && !userIsScheduler;
  // Use shouldShowCheckinNav (stricter than canAccessCheckin): schedulers
  // need the explicit checkin_volunteer flag to see Check-In in mobile
  // bottom nav + More menu. Page-level access still uses canAccessCheckin
  // (permissive) on the check-in routes themselves.
  const userCanAccessCheckin = !!activeMembership && shouldShowCheckinNav(activeMembership);

  // Tier flags drive sidebar lock badges; mobile entry points additionally
  // require the user's role to permit access (Codex Phase 1 Finding 1).
  const worshipEnabled = TIER_LIMITS[subscriptionTier]?.worship_enabled ?? false;
  const checkinEnabled = TIER_LIMITS[subscriptionTier]?.checkin_enabled ?? false;
  const canShowCheckin = checkinEnabled && userCanAccessCheckin;

  // Redirect logged-out visitors to /login (not the landing page) so the
  // intent is clear. Codex QA 2026-05-15: previously redirected to "/"
  // and showed a blank page during the redirect window. Now we keep the
  // spinner visible until React Router lands them on /login.
  useEffect(() => {
    if (!loading && !user) {
      router.replace("/login");
    }
  }, [loading, user, router]);

  useEffect(() => {
    if (!loading && user && isVolunteerOnly && pathname === "/dashboard") {
      router.replace("/dashboard/my-schedule");
    }
  }, [loading, user, isVolunteerOnly, pathname, router]);

  const handleSignOut = useCallback(async () => {
    await signOut();
    router.push("/");
  }, [signOut, router]);

  // Show the spinner during initial auth resolution AND while the redirect
  // is in flight for logged-out users — eliminates the blank-page window.
  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-vc-bg">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <CampusProvider>
    <div className="flex min-h-screen bg-vc-bg">
      {/* Desktop sidebar — hidden on mobile */}
      <Sidebar
        activeMembership={activeMembership}
        subscriptionTier={subscriptionTier}
        showGuideDot={showGuideDot}
        hasUnreadNotifications={hasUnread}
        churchName={churchName}
        churchId={churchId}
        activeMemberships={activeMemberships}
        orgNames={orgNames}
        switchOrg={switchOrg}
        displayName={profile?.display_name || "User"}
        email={user.email || ""}
        userPhotoUrl={profile?.photo_url}
        hasPrerequisites={hasPrerequisites}
        signOut={handleSignOut}
        isPlatformAdmin={isPlatformAdmin}
      />

      {/* Main content column. `min-w-0` is critical: flex items default to
          `min-width: auto`, which means a child won't shrink below its
          content's min-content width. Without `min-w-0` on this column,
          a single oversized inline element (a wide TabBar, a 7-tab module
          strip with shrink-0 children) makes the column grow past the
          viewport. The viewport-level overflow-x: clip would hide the
          scrollbar but the layout calculations inside would still produce
          oversized children, breaking internal overflow-x-auto on
          ModuleTabs because the nav grows to fit its content instead of
          being constrained and triggering its own scrollbar. */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Slim mobile header — no hamburger, just branding */}
        <MobileHeader />

        {/* Page content — extra bottom padding on mobile for bottom nav.
            NOTE: no `overflow-y-auto` here. The outer is `min-h-screen`
            (grows with content) so the window scrolls. If main had
            `overflow-y-auto`, CSS sticky inside main would bind to main
            as the scroll ancestor — but main never overflows because
            the outer can grow. Sticky elements would stay "pinned" to
            a non-scrolling main and move with the window scroll.

            `min-w-0 overflow-x-hidden` together force main to actually
            shrink to its allocated cross-axis width (the column's width,
            which is now also constrained via min-w-0) and clip anything
            wider. With both set, the ModuleTabs nav becomes properly
            narrower than its content and overflow-x-auto activates
            internal horizontal scroll for the tab list. */}
        <main id="main-content" className="min-w-0 flex-1 overflow-x-hidden p-4 pb-24 sm:p-6 sm:pb-24 lg:p-8 lg:pb-8 xl:p-10 xl:pb-10">
          <PwaInstallBanner />
          <SmartCheckInBanner />
          {children}
        </main>
      </div>

      {/* Mobile bottom nav */}
      <BottomNav
        isAdmin={userIsAdmin || userIsScheduler}
        worshipEnabled={worshipEnabled}
        canShowCheckin={canShowCheckin}
        hasUnreadNotifications={hasUnread}
        onMoreOpen={() => setMoreMenuOpen(true)}
      />

      {/* Floating feedback button */}
      <FeedbackButton />

      {/* More menu (mobile admin) */}
      <MoreMenu
        open={moreMenuOpen}
        onClose={() => setMoreMenuOpen(false)}
        subscriptionTier={subscriptionTier}
        hasUnreadNotifications={hasUnread}
        isAdminShell={userIsAdmin || userIsScheduler}
        isAdmin={userIsAdmin}
        canAccessCheckin={userCanAccessCheckin}
        hasPrerequisites={hasPrerequisites}
        onSignOut={handleSignOut}
      />
    </div>
    </CampusProvider>
  );
}
