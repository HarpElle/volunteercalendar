"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/context/auth-context";
import { getChurchDocuments } from "@/lib/firebase/firestore";
import { Spinner } from "@/components/ui/spinner";
import type { Schedule, Assignment, Service, Volunteer, Ministry } from "@/lib/types";

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
}

export default function DashboardPage() {
  const router = useRouter();
  const { profile } = useAuth();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  const churchId = profile?.church_id;

  useEffect(() => {
    if (profile && !profile.church_id) {
      router.replace("/dashboard/setup");
    }
  }, [profile, router]);

  useEffect(() => {
    if (!churchId) return;
    async function load() {
      try {
        const [vols, mins, svcs, scheds, assigns] = await Promise.all([
          getChurchDocuments(churchId!, "volunteers"),
          getChurchDocuments(churchId!, "ministries"),
          getChurchDocuments(churchId!, "services"),
          getChurchDocuments(churchId!, "schedules"),
          getChurchDocuments(churchId!, "assignments"),
        ]);

        const volunteers = vols as unknown as Volunteer[];
        const ministries = mins as unknown as Ministry[];
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
            if (!acc.has(key)) acc.set(key, { serviceId: a.service_id, date: a.service_date, count: 0 });
            acc.get(key)!.count++;
            return acc;
          }, new Map());

        const upcomingServices = Array.from(upcoming.values())
          .sort((a, b) => a.date.localeCompare(b.date))
          .slice(0, 6)
          .map((u) => {
            const svc = serviceMap.get(u.serviceId);
            const ministry = svc ? ministryMap.get(svc.ministry_id) : null;
            const needed = svc ? svc.roles.reduce((r, role) => r + role.count, 0) : 0;
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
        });
      } catch {
        setStats(null);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [churchId]);

  if (!profile?.church_id) return null;

  const hasData = stats && (stats.volunteers > 0 || stats.ministries > 0);

  function formatDate(dateStr: string): string {
    const d = new Date(dateStr + "T12:00:00");
    return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="font-display text-3xl text-vc-indigo">
          Welcome{profile.display_name ? `, ${profile.display_name}` : ""}
        </h1>
        <p className="mt-1 text-vc-text-secondary">
          Here&apos;s an overview of your church&apos;s volunteer schedule.
        </p>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Spinner /></div>
      ) : !hasData ? (
        <>
          {/* Basic counts when no data */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-8">
            {[
              { label: "Volunteers", value: stats?.volunteers ?? 0, color: "bg-vc-coral/10 text-vc-coral", href: "/dashboard/volunteers" },
              { label: "Ministries", value: stats?.ministries ?? 0, color: "bg-vc-indigo/10 text-vc-indigo", href: "/dashboard/ministries" },
              { label: "Services", value: stats?.services ?? 0, color: "bg-vc-sage/10 text-vc-sage", href: "/dashboard/services" },
              { label: "Schedules", value: stats?.activeSchedules ?? 0, color: "bg-vc-sand/10 text-vc-sand-dark", href: "/dashboard/schedules" },
            ].map((s) => (
              <Link key={s.label} href={s.href} className="rounded-xl border border-vc-border-light bg-white p-5 transition-shadow hover:shadow-md">
                <p className="text-sm font-medium text-vc-text-muted">{s.label}</p>
                <p className={`mt-2 inline-flex rounded-lg px-3 py-1 text-2xl font-semibold ${s.color}`}>{s.value}</p>
              </Link>
            ))}
          </div>

          {/* Getting started */}
          <div className="rounded-xl border border-vc-coral/20 bg-vc-coral/5 p-6">
            <h2 className="font-display text-xl text-vc-indigo">Next steps</h2>
            <p className="mt-1 text-sm text-vc-text-secondary">Finish setting up to generate your first schedule.</p>
            <ol className="mt-4 space-y-3">
              {[
                { step: "Add ministries", desc: "Worship, Kids, Tech, Greeters, etc.", href: "/dashboard/ministries", done: (stats?.ministries ?? 0) > 0 },
                { step: "Configure services", desc: "Sunday 9 AM, Wednesday 7 PM, etc.", href: "/dashboard/services", done: (stats?.services ?? 0) > 0 },
                { step: "Import volunteers", desc: "CSV upload or add them manually", href: "/dashboard/volunteers", done: (stats?.volunteers ?? 0) > 0 },
                { step: "Generate your first schedule", desc: "Auto-draft a fair, conflict-free schedule", href: "/dashboard/schedules", done: (stats?.activeSchedules ?? 0) > 0 },
              ].map((item, i) => (
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
                      <p className="text-sm font-medium text-vc-indigo">{item.step}</p>
                      <p className="text-xs text-vc-text-muted">{item.desc}</p>
                    </div>
                  </Link>
                </li>
              ))}
            </ol>
          </div>
        </>
      ) : stats && (
        <>
          {/* Top-level stats */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-6">
            <Link href="/dashboard/volunteers" className="rounded-xl border border-vc-border-light bg-white p-5 transition-shadow hover:shadow-md">
              <p className="text-sm font-medium text-vc-text-muted">Active Volunteers</p>
              <p className="mt-2 text-2xl font-semibold text-vc-indigo">{stats.volunteers}</p>
              {stats.unscheduledVolunteers > 0 && (
                <p className="mt-1 text-xs text-vc-text-muted">{stats.unscheduledVolunteers} not yet scheduled</p>
              )}
            </Link>
            <Link href="/dashboard/schedules" className="rounded-xl border border-vc-border-light bg-white p-5 transition-shadow hover:shadow-md">
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
                  <span className="text-vc-text-secondary">Ministries</span>
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
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            {/* Upcoming Services */}
            <div className="rounded-xl border border-vc-border-light bg-white overflow-hidden">
              <div className="border-b border-vc-border-light px-5 py-3 flex items-center justify-between">
                <h2 className="font-semibold text-vc-indigo">Upcoming Services</h2>
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
                <h2 className="font-semibold text-vc-indigo">Most Scheduled Volunteers</h2>
                <Link href="/dashboard/volunteers" className="text-xs text-vc-coral hover:underline">View all</Link>
              </div>
              {stats.topVolunteers.length === 0 ? (
                <div className="p-5 text-center text-sm text-vc-text-muted">No assignments yet.</div>
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
              <div className="mt-2 flex gap-6 text-xs">
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
    </div>
  );
}
