"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/context/auth-context";
import { getChurchDocuments } from "@/lib/firebase/firestore";
import { db } from "@/lib/firebase/config";
import { doc, getDoc } from "firebase/firestore";
import { Spinner } from "@/components/ui/spinner";
import type { Schedule, Assignment, Service, Volunteer, Ministry } from "@/lib/types";
import { getServiceMinistryIds, getAllServiceRoles } from "@/lib/utils/service-helpers";
import { isAdmin } from "@/lib/utils/permissions";

interface DashboardStats {
  volunteers: number;
  ministries: number;
  services: number;
  activeSchedules: number;
  fillRate: number;
  confirmed: number;
  declined: number;
  pending: number;
  totalAssignments: number;
  topVolunteers: { name: string; count: number }[];
  unscheduledVolunteers: number;
  upcomingServices: { name: string; date: string; ministryColor: string; assigned: number; needed: number }[];
  hasPrerequisites: boolean;
}

export default function DashboardPage() {
  const { user, profile, activeMembership } = useAuth();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [pendingApprovals, setPendingApprovals] = useState<Array<Record<string, unknown>>>([]);

  const churchId = activeMembership?.church_id || profile?.default_church_id || profile?.church_id;
  const hasOrg = !!churchId;

  useEffect(() => {
    if (!churchId) return;
    async function load() {
      try {
        const [vols, mins, svcs, scheds, assigns, churchSnap] = await Promise.all([
          getChurchDocuments(churchId!, "volunteers"),
          getChurchDocuments(churchId!, "ministries"),
          getChurchDocuments(churchId!, "services"),
          getChurchDocuments(churchId!, "schedules"),
          getChurchDocuments(churchId!, "assignments"),
          getDoc(doc(db, "churches", churchId!)),
        ]);

        const volunteers = vols as unknown as Volunteer[];
        const ministries = mins as unknown as Ministry[];
        const orgPrereqs = churchSnap.exists() ? (churchSnap.data().org_prerequisites || []) : [];
        const hasPrereqs = orgPrereqs.length > 0 || ministries.some((m) => m.prerequisites && m.prerequisites.length > 0);
        const services = svcs as unknown as Service[];
        const schedules = scheds as unknown as Schedule[];
        const assignments = assigns as unknown as Assignment[];

        const ministryMap = new Map(ministries.map((m) => [m.id, m]));
        const serviceMap = new Map(services.map((s) => [s.id, s]));

        // Active = published or in_review or approved
        const activeScheds = schedules.filter((s) =>
          s.status === "published" || s.status === "in_review" || s.status === "approved"
        );
        const activeSchedIds = new Set(activeScheds.map((s) => s.id));
        const activeAssignments = assignments.filter((a) => activeSchedIds.has(a.schedule_id));

        // Fill rate: total role slots across active schedules vs filled
        const totalSlots = activeScheds.reduce((sum, sched) => {
          // Count unique service-date combos in assignments for this schedule
          const schedAssigns = assignments.filter((a) => a.schedule_id === sched.id);
          const serviceDates = new Set(schedAssigns.map((a) => `${a.service_id}:${a.service_date}`));
          let slots = 0;
          for (const sd of serviceDates) {
            const serviceId = sd.split(":")[0];
            const svc = serviceMap.get(serviceId);
            if (svc) slots += svc.roles.reduce((r, role) => r + role.count, 0);
          }
          return sum + slots;
        }, 0);

        const confirmed = activeAssignments.filter((a) => a.status === "confirmed").length;
        const declined = activeAssignments.filter((a) => a.status === "declined").length;
        const pendingCount = activeAssignments.filter((a) => a.status === "draft").length;

        // Volunteer equity — count assignments per volunteer
        const volCounts = new Map<string, number>();
        for (const a of activeAssignments) {
          volCounts.set(a.volunteer_id, (volCounts.get(a.volunteer_id) || 0) + 1);
        }
        const topVolunteers = Array.from(volCounts.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([vid, count]) => ({
            name: volunteers.find((v) => v.id === vid)?.name || "Unknown",
            count,
          }));

        const scheduledVolIds = new Set(activeAssignments.map((a) => a.volunteer_id));
        const unscheduledVolunteers = volunteers.filter((v) => !scheduledVolIds.has(v.id)).length;

        // Upcoming services (next 14 days)
        const today = new Date();
        const twoWeeks = new Date(today);
        twoWeeks.setDate(twoWeeks.getDate() + 14);
        const todayStr = today.toISOString().split("T")[0];
        const twoWeeksStr = twoWeeks.toISOString().split("T")[0];

        const upcoming = activeAssignments
          .filter((a) => a.service_date >= todayStr && a.service_date <= twoWeeksStr)
          .reduce<Map<string, { serviceId: string; date: string; count: number }>>((acc, a) => {
            const key = `${a.service_id}:${a.service_date}`;
            if (!acc.has(key)) acc.set(key, { serviceId: a.service_id || "", date: a.service_date, count: 0 });
            acc.get(key)!.count++;
            return acc;
          }, new Map());

        const upcomingServices = Array.from(upcoming.values())
          .sort((a, b) => a.date.localeCompare(b.date))
          .slice(0, 6)
          .map((u) => {
            const svc = serviceMap.get(u.serviceId);
            const svcMinistryIds = svc ? getServiceMinistryIds(svc) : [];
            const ministry = svcMinistryIds.length > 0 ? ministryMap.get(svcMinistryIds[0]) : null;
            const needed = svc ? getAllServiceRoles(svc).reduce((r, role) => r + role.count, 0) : 0;
            return {
              name: svc?.name || "Service",
              date: u.date,
              ministryColor: ministry?.color || "#9A9BB5",
              assigned: u.count,
              needed,
            };
          });

        setStats({
          volunteers: volunteers.length,
          ministries: ministries.length,
          services: services.length,
          activeSchedules: activeScheds.length,
          fillRate: totalSlots > 0 ? Math.round((activeAssignments.length / totalSlots) * 100) : 0,
          confirmed,
          declined,
          pending: pendingCount,
          totalAssignments: activeAssignments.length,
          topVolunteers,
          unscheduledVolunteers,
          upcomingServices,
          hasPrerequisites: hasPrereqs,
        });
      } catch {
        setStats(null);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [churchId]);

  // Fetch pending approvals for admin notification banner
  useEffect(() => {
    if (!churchId || !user || !isAdmin(activeMembership)) return;
    async function loadPending() {
      try {
        const token = await user!.getIdToken();
        const res = await fetch(
          `/api/memberships?church_id=${encodeURIComponent(churchId!)}`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        if (res.ok) {
          const all: Record<string, unknown>[] = await res.json();
          setPendingApprovals(all.filter((m) => m.status === "pending_org_approval"));
        }
      } catch {
        // Non-critical — dashboard still works without this
      }
    }
    loadPending();
  }, [churchId, user, activeMembership]);

  if (!hasOrg) {
    return (
      <div className="mx-auto max-w-lg py-16 text-center">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-vc-sand/30">
          <svg className="h-8 w-8 text-vc-indigo/60" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3h.008v.008h-.008v-.008Zm0 3h.008v.008h-.008v-.008Zm0 3h.008v.008h-.008v-.008Z" />
          </svg>
        </div>
        <h1 className="font-display text-2xl text-vc-indigo">
          No Organization
        </h1>
        <p className="mt-2 text-vc-text-secondary">
          You&apos;re not currently part of any organization. Create a new one to
          start scheduling volunteers, or delete your account if you no longer
          need the service.
        </p>
        <div className="mt-8 flex flex-col items-center gap-3">
          <Link
            href="/dashboard/setup"
            className="inline-flex h-11 items-center justify-center rounded-xl bg-vc-coral px-6 text-sm font-semibold text-white transition-colors hover:bg-vc-coral/90"
          >
            Create a New Organization
          </Link>
          <Link
            href="/dashboard/account"
            className="text-sm text-vc-text-muted underline underline-offset-2 hover:text-vc-indigo"
          >
            Manage account settings
          </Link>
        </div>
      </div>
    );
  }

  const hasData = stats && (stats.volunteers > 0 || stats.ministries > 0);

  // Setup guide — persistent until all steps done or dismissed
  const [guideDismissed, setGuideDismissed] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("vc_setup_guide_dismissed") === "true";
  });
  const [guideCollapsed, setGuideCollapsed] = useState(false);


  const setupSteps = stats ? [
    { step: "Set up your organization", desc: "Name, timezone, and scheduling preferences", href: "/dashboard/organization", done: true },
    { step: "Create a team", desc: "Worship, Kids, Tech, Greeters, etc.", href: "/dashboard/organization", done: (stats.ministries ?? 0) > 0 },
    { step: "Set up onboarding prerequisites", desc: "Background checks, training, or other requirements before serving", href: "/dashboard/onboarding", done: stats.hasPrerequisites, optional: true },
    { step: "Add your volunteers", desc: "CSV upload, ChMS import, or add manually", href: "/dashboard/people", done: (stats.volunteers ?? 0) > 0 },
    { step: "Set up a service or event", desc: "Recurring services with roles, or one-time events", href: "/dashboard/services-events", done: (stats.services ?? 0) > 0 },
    { step: "Share your join link", desc: "Invite volunteers to sign up on their own", href: "/dashboard/people", done: (stats.volunteers ?? 0) >= 3 },
    { step: "Generate your first schedule", desc: "Auto-draft a fair, conflict-free rotation", href: "/dashboard/schedules", done: (stats.activeSchedules ?? 0) > 0 },
  ] : [];

  const requiredSteps = setupSteps.filter((s) => !s.optional);
  const completedSteps = setupSteps.filter((s) => s.done).length;
  const allDone = requiredSteps.length > 0 && requiredSteps.every((s) => s.done);
  const showGuide = stats && !guideDismissed && !allDone;

  const dismissGuide = useCallback(() => {
    setGuideDismissed(true);
    localStorage.setItem("vc_setup_guide_dismissed", "true");
  }, []);

  function formatDate(dateStr: string): string {
    const d = new Date(dateStr + "T12:00:00");
    return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="font-display text-3xl text-vc-indigo">
          Welcome{profile?.display_name ? `, ${profile.display_name}` : ""}
        </h1>
        <p className="mt-1 text-vc-text-secondary">
          Here&apos;s an overview of your organization&apos;s volunteer schedule.
        </p>
      </div>

      {/* Pending approval notification */}
      {!loading && isAdmin(activeMembership) && pendingApprovals.length > 0 && (
        <div className="mb-6 rounded-xl border border-vc-coral/20 bg-vc-coral/5 p-5">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-vc-coral/15">
              <svg className="h-5 w-5 text-vc-coral" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-vc-indigo">
                {pendingApprovals.length} {pendingApprovals.length === 1 ? "person" : "people"} waiting for approval
              </p>
              <p className="mt-1 text-sm text-vc-text-secondary">
                {pendingApprovals.slice(0, 3).map((m) =>
                  (m._user_display_name as string) || (m._user_email as string) || "Someone",
                ).join(", ")}
                {pendingApprovals.length > 3 && ` and ${pendingApprovals.length - 3} more`}
              </p>
            </div>
            <Link
              href="/dashboard/people?tab=invites"
              className="inline-flex h-11 shrink-0 items-center justify-center rounded-xl bg-vc-coral px-4 text-sm font-semibold text-white transition-colors hover:bg-vc-coral/90"
            >
              Review
            </Link>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16"><Spinner /></div>
      ) : (
        <>
          {/* Setup Guide — persistent until complete or dismissed */}
          {showGuide && (
            <div className="mb-6 rounded-xl border border-vc-coral/20 bg-vc-coral/5 p-5">
              <div className="flex items-center justify-between">
                <button
                  onClick={() => setGuideCollapsed(!guideCollapsed)}
                  className="flex items-center gap-2"
                >
                  <h2 className="font-display text-lg text-vc-indigo">Setup Guide</h2>
                  <span className="rounded-full bg-vc-coral/10 px-2.5 py-0.5 text-xs font-semibold text-vc-coral">
                    {completedSteps}/{setupSteps.length}
                  </span>
                  <svg className={`h-4 w-4 text-vc-text-muted transition-transform ${guideCollapsed ? "" : "rotate-180"}`} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                  </svg>
                </button>
                  <button
                  onClick={dismissGuide}
                  className="text-xs text-vc-text-muted hover:text-vc-indigo transition-colors"
                  title="You can also collapse the guide to minimize it"
                >
                  Dismiss
                </button>
              </div>

              {/* Progress bar */}
              <div className="mt-3 h-1.5 rounded-full bg-vc-sand/20 overflow-hidden">
                <div
                  className="h-full rounded-full bg-vc-coral transition-all duration-500"
                  style={{ width: `${(completedSteps / setupSteps.length) * 100}%` }}
                />
              </div>

              {!guideCollapsed && (
                <ol className="mt-4 space-y-2">
                  {setupSteps.map((item, i) => (
                    <li key={i}>
                      <Link href={item.href} className="flex items-start gap-3 rounded-lg p-2 -mx-2 hover:bg-white/60 transition-colors">
                        <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                          item.done ? "bg-vc-sage/20 text-vc-sage" : "border border-vc-border bg-white text-vc-text-muted"
                        }`}>
                          {item.done ? (
                            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                            </svg>
                          ) : i + 1}
                        </span>
                        <div>
                          <p className={`text-sm font-medium ${item.done ? "text-vc-text-muted line-through" : "text-vc-indigo"}`}>
                            {item.step}
                            {item.optional && !item.done && (
                              <span className="ml-2 inline-flex items-center rounded-full bg-vc-sand/20 px-2 py-0.5 text-[10px] font-medium text-vc-sand-dark">
                                Optional
                              </span>
                            )}
                          </p>
                          <p className="text-xs text-vc-text-muted">{item.desc}</p>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          )}

          {/* All done celebration (shows briefly before auto-dismissing) */}
          {stats && !guideDismissed && allDone && (
            <div className="mb-6 rounded-xl border border-vc-sage/30 bg-vc-sage/5 p-5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-vc-sage/20 text-vc-sage">
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                  </svg>
                </span>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-vc-sage">You&apos;re all set! Here&apos;s what to explore next:</p>
                  <ul className="mt-1.5 space-y-1 text-xs text-vc-text-muted">
                    <li>
                      <Link href="/dashboard/volunteer-health" className="text-vc-coral hover:underline">Volunteer Health</Link>
                      {" "}— monitor engagement and spot burnout early
                    </li>
                    <li>
                      <Link href="/dashboard/help" className="text-vc-coral hover:underline">Help Center</Link>
                      {" "}— guides on calendar feeds, QR check-in, and more
                    </li>
                  </ul>
                </div>
              </div>
              <button onClick={dismissGuide} className="text-xs text-vc-text-muted hover:text-vc-indigo transition-colors">Dismiss</button>
            </div>
          )}

          {/* Stats grid — always visible when we have stats */}
          {stats && (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-6">
              {!hasData ? (
                <>
                  {[
                    { label: "Volunteers", value: stats.volunteers, color: "bg-vc-coral/10 text-vc-coral", href: "/dashboard/people" },
                    { label: "Teams", value: stats.ministries, color: "bg-vc-indigo/10 text-vc-indigo", href: "/dashboard/organization" },
                    { label: "Services", value: stats.services, color: "bg-vc-sage/10 text-vc-sage", href: "/dashboard/services-events" },
                    { label: "Schedules", value: stats.activeSchedules, color: "bg-vc-sand/10 text-vc-sand-dark", href: "/dashboard/schedules" },
                  ].map((s) => (
                    <Link key={s.label} href={s.href} className="group rounded-xl border border-vc-border-light bg-white p-5 transition-all hover:-translate-y-0.5 hover:shadow-md">
                      <p className="text-sm font-medium text-vc-text-muted">{s.label}</p>
                      <p className={`mt-2 inline-flex rounded-lg px-3 py-1 text-2xl font-semibold ${s.color}`}>{s.value}</p>
                    </Link>
                  ))}
                </>
              ) : (
                <>
                  <Link href="/dashboard/people" className="rounded-xl border border-vc-border-light bg-white p-5 transition-all hover:-translate-y-0.5 hover:shadow-md">
                    <p className="text-sm font-medium text-vc-text-muted">Active Volunteers</p>
                    <p className="mt-2 text-2xl font-semibold text-vc-indigo">{stats.volunteers}</p>
                    {stats.unscheduledVolunteers > 0 && (
                      <p className="mt-1 text-xs text-vc-text-muted">{stats.unscheduledVolunteers} not yet scheduled</p>
                    )}
                  </Link>
                  <Link href="/dashboard/schedules" className="rounded-xl border border-vc-border-light bg-white p-5 transition-all hover:-translate-y-0.5 hover:shadow-md">
                    <p className="text-sm font-medium text-vc-text-muted">Fill Rate</p>
                    <p className={`mt-2 text-2xl font-semibold ${
                      stats.fillRate >= 80 ? "text-vc-sage" : stats.fillRate >= 50 ? "text-vc-sand-dark" : "text-vc-danger"
                    }`}>{stats.fillRate}%</p>
                    <p className="mt-1 text-xs text-vc-text-muted">{stats.totalAssignments} assignments across {stats.activeSchedules} schedule{stats.activeSchedules !== 1 ? "s" : ""}</p>
                  </Link>
                  <div className="rounded-xl border border-vc-border-light bg-white p-5">
                    <p className="text-sm font-medium text-vc-text-muted">Confirmation Rate</p>
                    {stats.totalAssignments > 0 ? (
                      <>
                        <p className="mt-2 text-2xl font-semibold text-vc-sage">
                          {Math.round((stats.confirmed / stats.totalAssignments) * 100)}%
                        </p>
                        <div className="mt-2 flex gap-3 text-xs">
                          <span className="text-vc-sage">{stats.confirmed} confirmed</span>
                          <span className="text-vc-danger">{stats.declined} declined</span>
                          <span className="text-vc-text-muted">{stats.pending} pending</span>
                        </div>
                      </>
                    ) : (
                      <p className="mt-2 text-2xl font-semibold text-vc-text-muted">—</p>
                    )}
                  </div>
                  <div className="rounded-xl border border-vc-border-light bg-white p-5">
                    <p className="text-sm font-medium text-vc-text-muted">Resources</p>
                    <div className="mt-2 space-y-1">
                      <div className="flex justify-between text-sm">
                        <span className="text-vc-text-secondary">Teams</span>
                        <span className="font-semibold text-vc-indigo">{stats.ministries}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-vc-text-secondary">Services</span>
                        <span className="font-semibold text-vc-indigo">{stats.services}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-vc-text-secondary">Schedules</span>
                        <span className="font-semibold text-vc-indigo">{stats.activeSchedules}</span>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Detail panels — shown when there's real data */}
          {hasData && stats && (
            <>
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Upcoming Services */}
            <div className="rounded-xl border border-vc-border-light bg-white overflow-hidden">
              <div className="border-b border-vc-border-light px-5 py-3 flex items-center justify-between">
                <h2 className="text-base font-semibold text-vc-indigo">Upcoming Services</h2>
                <Link href="/dashboard/schedules" className="text-xs text-vc-coral hover:underline">View all</Link>
              </div>
              {stats.upcomingServices.length === 0 ? (
                <div className="p-5 text-center text-sm text-vc-text-muted">No upcoming services in the next 2 weeks.</div>
              ) : (
                <div className="divide-y divide-vc-border-light">
                  {stats.upcomingServices.map((svc, i) => (
                    <div key={i} className="flex items-center gap-3 px-5 py-3">
                      <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: svc.ministryColor }} />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-vc-indigo truncate">{svc.name}</p>
                        <p className="text-xs text-vc-text-muted">{formatDate(svc.date)}</p>
                      </div>
                      <div className="text-right">
                        <span className={`text-sm font-semibold ${
                          svc.assigned >= svc.needed ? "text-vc-sage" : "text-vc-sand-dark"
                        }`}>
                          {svc.assigned}/{svc.needed}
                        </span>
                        <p className="text-xs text-vc-text-muted">filled</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Volunteer Equity */}
            <div className="rounded-xl border border-vc-border-light bg-white overflow-hidden">
              <div className="border-b border-vc-border-light px-5 py-3 flex items-center justify-between">
                <h2 className="text-base font-semibold text-vc-indigo">Most Scheduled Volunteers</h2>
                <Link href="/dashboard/volunteers" className="text-xs text-vc-coral hover:underline">View all</Link>
              </div>
              {stats.topVolunteers.length === 0 ? (
                <div className="p-5 text-center text-sm text-vc-text-muted">No assignments yet. Generate your first schedule to see who&apos;s serving.</div>
              ) : (
                <div className="divide-y divide-vc-border-light">
                  {stats.topVolunteers.map((vol, i) => {
                    const maxCount = stats.topVolunteers[0]?.count || 1;
                    return (
                      <div key={i} className="px-5 py-3">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-medium text-vc-indigo">{vol.name}</span>
                          <span className={`text-xs font-semibold rounded-full px-2 py-0.5 ${
                            vol.count > 6 ? "bg-vc-danger/10 text-vc-danger"
                              : vol.count > 3 ? "bg-vc-sand/30 text-vc-sand-dark"
                              : "bg-vc-sage/10 text-vc-sage"
                          }`}>{vol.count}</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-vc-border overflow-hidden">
                          <div
                            className="h-full rounded-full bg-vc-coral/60 transition-all"
                            style={{ width: `${(vol.count / maxCount) * 100}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                  {stats.unscheduledVolunteers > 0 && (
                    <div className="px-5 py-3 text-xs text-vc-text-muted">
                      + {stats.unscheduledVolunteers} volunteer{stats.unscheduledVolunteers !== 1 ? "s" : ""} not yet scheduled
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Confirmation response bar */}
          {stats.totalAssignments > 0 && (
            <div className="mt-6 rounded-xl border border-vc-border-light bg-white p-5">
              <h2 className="mb-3 font-semibold text-vc-indigo">Volunteer Responses</h2>
              <div className="h-3 rounded-full bg-vc-border overflow-hidden flex">
                {stats.confirmed > 0 && (
                  <div
                    className="bg-vc-sage h-full transition-all"
                    style={{ width: `${(stats.confirmed / stats.totalAssignments) * 100}%` }}
                    title={`${stats.confirmed} confirmed`}
                  />
                )}
                {stats.declined > 0 && (
                  <div
                    className="bg-vc-danger h-full transition-all"
                    style={{ width: `${(stats.declined / stats.totalAssignments) * 100}%` }}
                    title={`${stats.declined} declined`}
                  />
                )}
              </div>
              <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-xs">
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-vc-sage" /> Confirmed ({stats.confirmed})
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-vc-danger" /> Declined ({stats.declined})
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-vc-border" /> Pending ({stats.pending})
                </span>
              </div>
            </div>
          )}
            </>
          )}
        </>
      )}
    </div>
  );
}
