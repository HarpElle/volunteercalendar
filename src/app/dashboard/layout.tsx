"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/context/auth-context";
import { Spinner } from "@/components/ui/spinner";
import { db } from "@/lib/firebase/config";
import { doc, getDoc } from "firebase/firestore";
import { getOrgTerms } from "@/lib/utils/org-terms";
import { isAdmin, isOwner, isScheduler } from "@/lib/utils/permissions";
import type { OrgType, Membership } from "@/lib/types";

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
  gate?: (m: Membership | null) => boolean;
}

interface NavSection {
  label: string | null;
  items: NavItem[];
  gate?: (m: Membership | null) => boolean;
}

function getNavSections(): NavSection[] {
  return [
    {
      label: null,
      items: [
        {
          label: "Home",
          href: "/dashboard",
          icon: (
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 12 8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
            </svg>
          ),
        },
        {
          label: "My Schedule",
          href: "/dashboard/my-schedule",
          icon: (
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5m-9-1.5h.008v.008H12v-.008Z" />
            </svg>
          ),
        },
      ],
    },
    {
      label: "Scheduling",
      gate: (m) => isScheduler(m),
      items: [
        {
          label: "Schedules",
          href: "/dashboard/schedules",
          icon: (
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
            </svg>
          ),
          gate: (m) => isScheduler(m),
        },
        {
          label: "Services & Events",
          href: "/dashboard/services-events",
          icon: (
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
            </svg>
          ),
          gate: (m) => isAdmin(m),
        },
      ],
    },
    {
      label: "Manage",
      gate: (m) => isScheduler(m),
      items: [
        {
          label: "People",
          href: "/dashboard/people",
          icon: (
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
            </svg>
          ),
          gate: (m) => isScheduler(m),
        },
        {
          label: "Notifications",
          href: "/dashboard/notifications",
          icon: (
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0" />
            </svg>
          ),
          gate: (m) => isAdmin(m),
        },
      ],
    },
    {
      label: "Organization",
      gate: (m) => isAdmin(m),
      items: [
        {
          label: "Organization",
          href: "/dashboard/organization",
          icon: (
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
            </svg>
          ),
          gate: (m) => isAdmin(m),
        },
      ],
    },
  ];
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, profile, loading, signOut, memberships, activeMembership, switchOrg } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [orgSwitcherOpen, setOrgSwitcherOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [orgType, setOrgType] = useState<OrgType>("church");
  const [churchName, setChurchName] = useState<string>("");
  const userMenuRef = useRef<HTMLDivElement>(null);

  // Determine the effective church ID (membership-first, legacy fallback)
  const churchId = activeMembership?.church_id || profile?.church_id;

  useEffect(() => {
    if (!churchId) return;
    getDoc(doc(db, "churches", churchId)).then((snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setOrgType((data.org_type as OrgType) || "church");
        setChurchName(data.name || "");
      }
    }).catch(() => {});
  }, [churchId]);

  // Close user menu when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    }
    if (userMenuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [userMenuOpen]);

  const navSections = getNavSections();
  const activeMemberships = memberships.filter((m) => m.status === "active");
  const hasMultipleOrgs = activeMemberships.length > 1;

  // Filter sections: hide sections where the gate fails or all items are gated out
  const visibleSections = navSections
    .map((section) => {
      if (section.gate && !section.gate(activeMembership)) return null;
      const visibleItems = section.items.filter(
        (item) => !item.gate || item.gate(activeMembership),
      );
      if (visibleItems.length === 0) return null;
      return { ...section, items: visibleItems };
    })
    .filter(Boolean) as NavSection[];

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/login");
    }
  }, [loading, user, router]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-vc-bg">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!user) return null;

  async function handleSignOut() {
    setUserMenuOpen(false);
    await signOut();
    router.push("/");
  }

  return (
    <div className="flex min-h-screen bg-vc-bg">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/30 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-vc-border-light bg-white transition-transform duration-200 lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Sidebar header */}
        <div className="flex h-16 items-center gap-2 border-b border-vc-border-light px-5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-vc-indigo">
            <svg className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
            </svg>
          </div>
          <span className="text-lg font-semibold text-vc-indigo">
            Volunteer<span className="text-vc-coral">Cal</span>
          </span>
        </div>

        {/* Org switcher (when user belongs to multiple orgs) */}
        {hasMultipleOrgs && (
          <div className="border-b border-vc-border-light px-3 py-3">
            <button
              onClick={() => setOrgSwitcherOpen(!orgSwitcherOpen)}
              className="flex w-full items-center justify-between rounded-lg bg-vc-bg-warm px-3 py-2 text-sm font-medium text-vc-indigo hover:bg-vc-bg transition-colors"
            >
              <span className="truncate">{churchName || "Select org"}</span>
              <svg className={`h-4 w-4 shrink-0 transition-transform ${orgSwitcherOpen ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
              </svg>
            </button>
            {orgSwitcherOpen && (
              <div className="mt-1 space-y-0.5">
                {activeMemberships.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => {
                      switchOrg(m.church_id);
                      setOrgSwitcherOpen(false);
                    }}
                    className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${
                      m.church_id === churchId
                        ? "bg-vc-coral/10 text-vc-coral font-medium"
                        : "text-vc-text-secondary hover:bg-vc-bg-warm"
                    }`}
                  >
                    <span className="truncate">{m.church_id === churchId ? churchName : m.church_id}</span>
                    <span className="ml-auto shrink-0 text-xs capitalize text-vc-text-muted">{m.role}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Nav sections */}
        <nav className="flex-1 overflow-y-auto px-3 py-4">
          {visibleSections.map((section, sIdx) => (
            <div key={sIdx} className={sIdx > 0 ? "mt-2" : ""}>
              {section.label && (
                <p className="px-3 pt-4 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-vc-text-muted">
                  {section.label}
                </p>
              )}
              <div className="space-y-0.5">
                {section.items.map((item) => {
                  const isActive = pathname === item.href
                    || (item.href !== "/dashboard" && pathname.startsWith(item.href));
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setSidebarOpen(false)}
                      className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                        isActive
                          ? "bg-vc-coral/10 text-vc-coral"
                          : "text-vc-text-secondary hover:bg-vc-bg-warm hover:text-vc-indigo"
                      }`}
                    >
                      {item.icon}
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* User section with popover menu */}
        <div className="relative border-t border-vc-border-light p-4" ref={userMenuRef}>
          {/* User menu popover */}
          {userMenuOpen && (
            <div className="absolute bottom-full left-3 right-3 mb-2 rounded-xl border border-vc-border-light bg-white shadow-lg">
              <div className="border-b border-vc-border-light px-4 py-3">
                <p className="truncate text-sm font-medium text-vc-indigo">
                  {profile?.display_name || "User"}
                </p>
                <p className="truncate text-xs text-vc-text-muted">
                  {user.email}
                </p>
                <p className="mt-0.5 truncate text-xs capitalize text-vc-text-muted">
                  {activeMembership?.role || "member"}{churchName ? ` @ ${churchName}` : ""}
                </p>
              </div>
              <div className="py-1">
                <Link
                  href="/dashboard/account"
                  onClick={() => { setUserMenuOpen(false); setSidebarOpen(false); }}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-vc-text-secondary hover:bg-vc-bg-warm hover:text-vc-indigo transition-colors"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
                  </svg>
                  Account Settings
                </Link>
                <Link
                  href="/dashboard/my-orgs"
                  onClick={() => { setUserMenuOpen(false); setSidebarOpen(false); }}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-vc-text-secondary hover:bg-vc-bg-warm hover:text-vc-indigo transition-colors"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3.75h.008v.008h-.008v-.008Zm0 3h.008v.008h-.008v-.008Zm0 3h.008v.008h-.008v-.008Z" />
                  </svg>
                  My Organizations
                </Link>
              </div>
              <div className="border-t border-vc-border-light py-1">
                <button
                  onClick={handleSignOut}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-vc-text-secondary hover:bg-vc-bg-warm hover:text-vc-indigo transition-colors"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m3 0 3-3m0 0-3-3m3 3H9" />
                  </svg>
                  Sign out
                </button>
              </div>
            </div>
          )}

          {/* Avatar trigger */}
          <button
            onClick={() => setUserMenuOpen(!userMenuOpen)}
            className="flex w-full items-center gap-3 rounded-lg px-1 py-1 transition-colors hover:bg-vc-bg-warm"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-vc-indigo text-sm font-semibold text-white">
              {(profile?.display_name || user.email || "?").charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 truncate text-left">
              <p className="truncate text-sm font-medium text-vc-indigo">
                {profile?.display_name || "User"}
              </p>
              <p className="truncate text-xs capitalize text-vc-text-muted">
                {activeMembership?.role || profile?.role || "member"}
              </p>
            </div>
            <svg className={`h-4 w-4 shrink-0 text-vc-text-muted transition-transform ${userMenuOpen ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 15.75 7.5-7.5 7.5 7.5" />
            </svg>
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex flex-1 flex-col">
        {/* Top bar (mobile) */}
        <header className="flex h-16 items-center gap-4 border-b border-vc-border-light bg-white px-4 lg:hidden">
          <button
            onClick={() => setSidebarOpen(true)}
            className="rounded-lg p-2 text-vc-text-secondary hover:bg-vc-bg-warm"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
            </svg>
          </button>
          <span className="text-lg font-semibold text-vc-indigo">
            Volunteer<span className="text-vc-coral">Cal</span>
          </span>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
