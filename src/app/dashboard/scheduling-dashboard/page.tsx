"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/context/auth-context";
import { getChurchDocuments, getEventSignupsBatch } from "@/lib/firebase/firestore";
import { db } from "@/lib/firebase/config";
import { Spinner } from "@/components/ui/spinner";
import { SkeletonStats, SkeletonList } from "@/components/ui/skeleton";
import { EventRoster } from "@/components/scheduling/event-roster";
import { ServiceRoster } from "@/components/scheduling/service-roster";
import { isAdmin, isScheduler } from "@/lib/utils/permissions";
import type { Service, Event, Schedule, Assignment, Ministry, EventSignup } from "@/lib/types";

function formatDate(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export default function SchedulingDashboardPage() {
  const { profile, activeMembership } = useAuth();
  const churchId = activeMembership?.church_id || profile?.church_id;
  const showAdminSection = isAdmin(activeMembership);
  const canMarkAttendance = isScheduler(activeMembership);

  const [loading, setLoading] = useState(true);
  const [services, setServices] = useState<Service[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [ministries, setMinistries] = useState<Ministry[]>([]);
  const [signupCounts, setSignupCounts] = useState<Map<string, number>>(new Map());
  const [allEventSignups, setAllEventSignups] = useState<EventSignup[]>([]);
  const [churchName, setChurchName] = useState("");
  const [rosterEvent, setRosterEvent] = useState<Event | null>(null);
  const [rosterService, setRosterService] = useState<{ service: Service; date: string } | null>(null);

  const today = new Date().toISOString().split("T")[0];

  useEffect(() => {
    if (!churchId) {
      setLoading(false);
      return;
    }
    async function load() {
      try {
        const [svcDocs, evtDocs, schDocs, assignDocs, minDocs, churchSnap] = await Promise.all([
          getChurchDocuments(churchId!, "services"),
          getChurchDocuments(churchId!, "events"),
          getChurchDocuments(churchId!, "schedules"),
          getChurchDocuments(churchId!, "assignments"),
          getChurchDocuments(churchId!, "ministries"),
          import("firebase/firestore").then(({ doc, getDoc }) =>
            getDoc(doc(db, "churches", churchId!)),
          ),
        ]);
        const svcs = svcDocs as unknown as Service[];
        const evts = evtDocs as unknown as Event[];
        const schs = schDocs as unknown as Schedule[];
        const assigns = assignDocs as unknown as Assignment[];
        const mins = minDocs as unknown as Ministry[];

        setServices(svcs);
        setEvents(evts);
        setSchedules(schs);
        setAssignments(assigns);
        setMinistries(mins);
        if (churchSnap.exists()) {
          setChurchName(churchSnap.data().name || "");
        }

        // Load signup counts for upcoming events (batch query)
        const upcomingEvents = evts.filter((e) => e.date >= today);
        const upcomingIds = upcomingEvents.map((e) => e.id);
        const allSignups = upcomingIds.length > 0
          ? await getEventSignupsBatch(upcomingIds, churchId!)
          : [];
        const counts = new Map<string, number>();
        for (const s of allSignups) {
          if (s.status !== "cancelled") {
            counts.set(s.event_id, (counts.get(s.event_id) || 0) + 1);
          }
        }
        setSignupCounts(counts);
        setAllEventSignups(allSignups);
      } catch {
        // silent
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [churchId]);

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl">
        <div className="mb-8">
          <h1 className="font-display text-3xl text-vc-indigo">Scheduling Dashboard</h1>
          <p className="mt-1 text-vc-text-secondary">Scheduling operations at a glance.</p>
        </div>
        <SkeletonStats count={4} className="mb-8" />
        <SkeletonList rows={4} />
      </div>
    );
  }

  // Upcoming events (next 30 days)
  const thirtyDaysOut = new Date();
  thirtyDaysOut.setDate(thirtyDaysOut.getDate() + 30);
  const cutoff = thirtyDaysOut.toISOString().split("T")[0];
  const upcomingEvents = events
    .filter((e) => e.date >= today && e.date <= cutoff)
    .sort((a, b) => a.date.localeCompare(b.date));

  // Upcoming assignments with gaps (unfilled roles in next 14 days)
  const fourteenDaysOut = new Date();
  fourteenDaysOut.setDate(fourteenDaysOut.getDate() + 14);
  const gapCutoff = fourteenDaysOut.toISOString().split("T")[0];

  // Active schedules
  const activeSchedules = schedules.filter(
    (s) => s.status === "published" || s.status === "draft",
  );

  // Recent service dates for attendance (past 14 days + today)
  const fourteenDaysAgo = new Date();
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
  const pastCutoff = fourteenDaysAgo.toISOString().split("T")[0];
  const serviceMap = new Map(services.map((s) => [s.id, s]));
  const serviceDateMap = new Map<string, { service: Service; date: string; count: number }>();
  for (const a of assignments) {
    if (a.service_id && a.service_date >= pastCutoff && a.service_date <= today && a.status !== "declined") {
      const key = `${a.service_id}-${a.service_date}`;
      const existing = serviceDateMap.get(key);
      if (existing) {
        existing.count++;
      } else {
        const svc = serviceMap.get(a.service_id);
        if (svc) {
          serviceDateMap.set(key, { service: svc, date: a.service_date, count: 1 });
        }
      }
    }
  }
  const recentServiceDates = [...serviceDateMap.values()].sort((a, b) =>
    b.date.localeCompare(a.date),
  );

  // Stats — combine service assignments + event signups
  const eventDateMap = new Map(events.map((e) => [e.id, e.date]));
  const activeSignups = allEventSignups.filter((s) => s.status !== "cancelled" && (eventDateMap.get(s.event_id) || "") >= today);

  const draftAssignments = assignments.filter(
    (a) => a.status === "draft" && a.service_date >= today,
  );
  const waitlistedSignups = activeSignups.filter((s) => s.status === "waitlisted");
  const awaitingResponseCount = draftAssignments.length + waitlistedSignups.length;

  const confirmedAssignments = assignments.filter(
    (a) => a.status === "confirmed" && a.service_date >= today,
  );
  const confirmedSignups = activeSignups.filter((s) => s.status === "confirmed");
  const confirmedUpcomingCount = confirmedAssignments.length + confirmedSignups.length;

  const volunteerIdSet = new Set(assignments.map((a) => a.person_id ?? a.volunteer_id));
  for (const s of activeSignups) volunteerIdSet.add(s.volunteer_id);
  const totalVolunteersActive = volunteerIdSet.size;

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-8">
        <h1 className="font-display text-3xl text-vc-indigo">Scheduling Dashboard</h1>
        <p className="mt-1 text-vc-text-secondary">
          Scheduling operations at a glance.
        </p>
      </div>

      {/* Quick Stats */}
      <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-xl border border-vc-border-light bg-white p-5 transition-shadow hover:shadow-sm">
          <p className="text-sm font-medium text-vc-text-muted">Awaiting Response</p>
          <p className="mt-2 text-2xl font-semibold text-vc-indigo">{awaitingResponseCount}</p>
        </div>
        <div className="rounded-xl border border-vc-border-light bg-white p-5 transition-shadow hover:shadow-sm">
          <p className="text-sm font-medium text-vc-text-muted">Confirmed Upcoming</p>
          <p className="mt-2 text-2xl font-semibold text-vc-sage">{confirmedUpcomingCount}</p>
        </div>
        <div className="rounded-xl border border-vc-border-light bg-white p-5 transition-shadow hover:shadow-sm">
          <p className="text-sm font-medium text-vc-text-muted">Upcoming Events</p>
          <p className="mt-2 text-2xl font-semibold text-vc-coral">{upcomingEvents.length}</p>
        </div>
        <div className="rounded-xl border border-vc-border-light bg-white p-5 transition-shadow hover:shadow-sm">
          <p className="text-sm font-medium text-vc-text-muted">Active Volunteers</p>
          <p className="mt-2 text-2xl font-semibold text-vc-indigo">{totalVolunteersActive}</p>
        </div>
      </div>

      {/* Upcoming Events with Signup Status */}
      <section className="mb-8 rounded-xl border border-vc-border-light bg-white overflow-hidden">
        <div className="border-b border-vc-border-light px-5 py-3 flex items-center justify-between">
          <h2 className="font-semibold text-vc-indigo">Upcoming Events</h2>
          <Link
            href="/dashboard/services-events"
            className="text-xs text-vc-coral hover:underline"
          >
            View all
          </Link>
        </div>
        {upcomingEvents.length === 0 ? (
          <div className="p-10 text-center">
            <svg className="mx-auto h-8 w-8 text-vc-text-muted/50" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
            </svg>
            <p className="mt-2 text-sm text-vc-text-muted">No upcoming events in the next 30 days.</p>
          </div>
        ) : (
          <div className="divide-y divide-vc-border-light">
            {upcomingEvents.slice(0, 5).map((evt) => {
              const totalSlots = evt.roles.reduce((sum, r) => sum + r.count, 0);
              const signedUp = signupCounts.get(evt.id) || 0;
              const fillPct = totalSlots > 0 ? Math.round((signedUp / totalSlots) * 100) : 0;
              return (
                <button
                  key={evt.id}
                  onClick={() => setRosterEvent(evt)}
                  className="w-full px-5 py-4 text-left transition-colors hover:bg-vc-bg-warm/50"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm font-medium text-vc-indigo">{evt.name}</p>
                      <p className="mt-0.5 text-xs text-vc-text-muted">{formatDate(evt.date)}</p>
                    </div>
                    <div className="text-right shrink-0 ml-4">
                      <span className={`text-sm font-semibold ${fillPct >= 100 ? "text-vc-sage" : "text-vc-indigo"}`}>
                        {signedUp}/{totalSlots}
                      </span>
                      <p className="text-xs text-vc-text-muted">signed up</p>
                    </div>
                  </div>
                  <div className="mt-2.5 h-2 rounded-full bg-vc-bg-warm overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${fillPct >= 100 ? "bg-vc-sage" : fillPct >= 50 ? "bg-vc-sage/70" : "bg-vc-sand"}`}
                      style={{ width: `${Math.min(fillPct, 100)}%` }}
                    />
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* Two-column layout for secondary sections */}
      <div className="mb-8 grid gap-6 lg:grid-cols-2">
        {/* Empty state when both sections have no data */}
        {draftAssignments.length === 0 && (showAdminSection ? activeSchedules.length === 0 : true) && (
          <div className="lg:col-span-2 rounded-xl border border-vc-border-light bg-white p-10 text-center">
            <svg className="mx-auto h-8 w-8 text-vc-sage/50" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
            </svg>
            <p className="mt-2 text-sm font-medium text-vc-indigo">All caught up!</p>
            <p className="mt-1 text-xs text-vc-text-muted">No draft assignments or pending responses right now.</p>
            {showAdminSection && (
              <Link
                href="/dashboard/schedules"
                className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-vc-coral hover:text-vc-coral-dark transition-colors"
              >
                Create a schedule
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
                </svg>
              </Link>
            )}
          </div>
        )}

        {/* Draft Assignments (awaiting response) */}
        {draftAssignments.length > 0 && (
          <section className="rounded-xl border border-vc-border-light bg-white overflow-hidden">
            <div className="border-b border-vc-border-light px-5 py-3">
              <h2 className="font-semibold text-vc-indigo">Awaiting Response</h2>
            </div>
            <div className="divide-y divide-vc-border-light">
              {draftAssignments.slice(0, 8).map((a) => (
                <div key={a.id} className="flex items-center justify-between px-5 py-3">
                  <div>
                    <p className="text-sm font-medium text-vc-indigo">{a.role_title}</p>
                    <p className="text-xs text-vc-text-muted">
                      {formatDate(a.service_date)}
                    </p>
                  </div>
                  <span className="rounded-full bg-vc-sand/20 px-2.5 py-0.5 text-xs font-medium text-vc-warning">
                    Draft
                  </span>
                </div>
              ))}
              {draftAssignments.length > 8 && (
                <div className="px-5 py-3 text-center text-xs text-vc-text-muted">
                  +{draftAssignments.length - 8} more awaiting response
                </div>
              )}
            </div>
          </section>
        )}

        {/* Active Schedules */}
        {showAdminSection && activeSchedules.length > 0 && (
          <section className="rounded-xl border border-vc-border-light bg-white overflow-hidden">
            <div className="border-b border-vc-border-light px-5 py-3 flex items-center justify-between">
              <h2 className="font-semibold text-vc-indigo">Active Schedules</h2>
              <Link
                href="/dashboard/schedules"
                className="text-xs text-vc-coral hover:underline"
              >
                Manage
              </Link>
            </div>
            <div className="divide-y divide-vc-border-light">
              {activeSchedules.map((sch) => (
                <Link
                  key={sch.id}
                  href={`/dashboard/schedules/${sch.id}`}
                  className="flex items-center justify-between px-5 py-3 transition-colors hover:bg-vc-bg-warm/50"
                >
                  <p className="text-sm font-medium text-vc-indigo">
                    {formatDate(sch.date_range_start)} – {formatDate(sch.date_range_end)}
                  </p>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${
                    sch.status === "published"
                      ? "bg-vc-sage/15 text-vc-sage"
                      : "bg-vc-bg-cream text-vc-text-muted"
                  }`}>
                    {sch.status}
                  </span>
                </Link>
              ))}
            </div>
          </section>
        )}
      </div>

      {/* Recent Service Dates — for attendance tracking */}
      {recentServiceDates.length > 0 && (
        <section className="mb-8 rounded-xl border border-vc-border-light bg-white overflow-hidden">
          <div className="border-b border-vc-border-light px-5 py-3">
            <h2 className="font-semibold text-vc-indigo">Take Attendance</h2>
            <p className="mt-0.5 text-xs text-vc-text-muted">
              Recent services — click to view roster or mark attendance.
            </p>
          </div>
          <div className="divide-y divide-vc-border-light">
            {recentServiceDates.slice(0, 8).map(({ service, date, count }) => (
              <button
                key={`${service.id}-${date}`}
                onClick={() => setRosterService({ service, date })}
                className="flex w-full items-center justify-between px-5 py-3 text-left transition-colors hover:bg-vc-bg-warm/50"
              >
                <div>
                  <p className="text-sm font-medium text-vc-indigo">{service.name}</p>
                  <p className="text-xs text-vc-text-muted">{formatDate(date)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-vc-indigo/8 px-2.5 py-0.5 text-xs font-medium text-vc-indigo-muted">{count} assigned</span>
                  <svg className="h-4 w-4 text-vc-text-muted" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                  </svg>
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Event Roster Modal */}
      {rosterEvent && churchId && (
        <EventRoster
          event={rosterEvent}
          churchId={churchId}
          open={!!rosterEvent}
          onClose={() => setRosterEvent(null)}
          canMarkAttendance={canMarkAttendance}
          activeMembership={activeMembership}
          orgName={churchName}
        />
      )}

      {/* Service Roster Modal */}
      {rosterService && churchId && (
        <ServiceRoster
          service={rosterService.service}
          serviceDate={rosterService.date}
          churchId={churchId}
          open={!!rosterService}
          onClose={() => setRosterService(null)}
          canMarkAttendance={canMarkAttendance}
          activeMembership={activeMembership}
          orgName={churchName}
        />
      )}
    </div>
  );
}
