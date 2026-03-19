"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/context/auth-context";
import { getChurchDocuments, getEventSignups } from "@/lib/firebase/firestore";
import { Spinner } from "@/components/ui/spinner";
import { isAdmin } from "@/lib/utils/permissions";
import type { Service, Event, Schedule, EventSignup, Assignment, Ministry } from "@/lib/types";

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

  const [loading, setLoading] = useState(true);
  const [services, setServices] = useState<Service[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [ministries, setMinistries] = useState<Ministry[]>([]);
  const [signupCounts, setSignupCounts] = useState<Map<string, number>>(new Map());

  const today = new Date().toISOString().split("T")[0];

  useEffect(() => {
    if (!churchId) {
      setLoading(false);
      return;
    }
    async function load() {
      try {
        const [svcDocs, evtDocs, schDocs, assignDocs, minDocs] = await Promise.all([
          getChurchDocuments(churchId!, "services"),
          getChurchDocuments(churchId!, "events"),
          getChurchDocuments(churchId!, "schedules"),
          getChurchDocuments(churchId!, "assignments"),
          getChurchDocuments(churchId!, "ministries"),
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

        // Load signup counts for upcoming events
        const upcomingEvents = evts.filter((e) => e.date >= today);
        const counts = new Map<string, number>();
        for (const evt of upcomingEvents) {
          try {
            const signups = await getEventSignups(evt.id, churchId!);
            counts.set(evt.id, signups.filter((s) => s.status !== "cancelled").length);
          } catch {
            counts.set(evt.id, 0);
          }
        }
        setSignupCounts(counts);
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
      <div className="flex justify-center py-20">
        <Spinner size="lg" />
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

  // Stats
  const totalVolunteersAssigned = new Set(assignments.map((a) => a.volunteer_id)).size;
  const draftAssignments = assignments.filter(
    (a) => a.status === "draft" && a.service_date >= today,
  );
  const confirmedAssignments = assignments.filter(
    (a) => a.status === "confirmed" && a.service_date >= today,
  );

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-display text-3xl text-vc-indigo">Dashboard</h1>
        <p className="mt-1 text-vc-text-secondary">
          Scheduling operations at a glance.
        </p>
      </div>

      {/* Quick Stats */}
      <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-2xl border border-vc-border-light bg-white p-4">
          <p className="text-2xl font-semibold text-vc-indigo">{draftAssignments.length}</p>
          <p className="text-xs text-vc-text-muted">Awaiting Response</p>
        </div>
        <div className="rounded-2xl border border-vc-border-light bg-white p-4">
          <p className="text-2xl font-semibold text-vc-sage">{confirmedAssignments.length}</p>
          <p className="text-xs text-vc-text-muted">Confirmed Upcoming</p>
        </div>
        <div className="rounded-2xl border border-vc-border-light bg-white p-4">
          <p className="text-2xl font-semibold text-vc-coral">{upcomingEvents.length}</p>
          <p className="text-xs text-vc-text-muted">Upcoming Events</p>
        </div>
        <div className="rounded-2xl border border-vc-border-light bg-white p-4">
          <p className="text-2xl font-semibold text-vc-indigo">{totalVolunteersAssigned}</p>
          <p className="text-xs text-vc-text-muted">Active Volunteers</p>
        </div>
      </div>

      {/* Upcoming Events with Signup Status */}
      <section className="mb-8">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-vc-indigo">Upcoming Events</h2>
          <Link
            href="/dashboard/services-events"
            className="text-sm text-vc-coral hover:underline"
          >
            View all
          </Link>
        </div>
        {upcomingEvents.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-vc-border bg-white p-8 text-center">
            <p className="text-vc-text-muted">No upcoming events in the next 30 days.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {upcomingEvents.slice(0, 5).map((evt) => {
              const totalSlots = evt.roles.reduce((sum, r) => sum + r.count, 0);
              const signedUp = signupCounts.get(evt.id) || 0;
              const fillPct = totalSlots > 0 ? Math.round((signedUp / totalSlots) * 100) : 0;
              return (
                <div key={evt.id} className="rounded-xl border border-vc-border-light bg-white p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-semibold text-vc-indigo">{evt.name}</p>
                      <p className="text-sm text-vc-text-secondary">{formatDate(evt.date)}</p>
                    </div>
                    <div className="text-right">
                      <span className="text-sm font-medium text-vc-indigo">
                        {signedUp}/{totalSlots}
                      </span>
                      <span className="ml-1 text-xs text-vc-text-muted">signed up</span>
                    </div>
                  </div>
                  <div className="mt-2 h-1.5 rounded-full bg-vc-bg-warm">
                    <div
                      className="h-full rounded-full bg-vc-sage transition-all"
                      style={{ width: `${Math.min(fillPct, 100)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Draft Assignments (awaiting response) */}
      {draftAssignments.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-4 text-lg font-semibold text-vc-indigo">Awaiting Response</h2>
          <div className="space-y-2">
            {draftAssignments.slice(0, 8).map((a) => (
              <div key={a.id} className="flex items-center justify-between rounded-xl border border-vc-border-light bg-white px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-vc-indigo">{a.role_title}</p>
                  <p className="text-xs text-vc-text-muted">
                    {formatDate(a.service_date)}
                  </p>
                </div>
                <span className="rounded-full bg-vc-sand/30 px-2 py-0.5 text-xs font-medium text-vc-sand">
                  Draft
                </span>
              </div>
            ))}
            {draftAssignments.length > 8 && (
              <p className="text-center text-xs text-vc-text-muted">
                +{draftAssignments.length - 8} more awaiting response
              </p>
            )}
          </div>
        </section>
      )}

      {/* Active Schedules */}
      {showAdminSection && activeSchedules.length > 0 && (
        <section className="mb-8">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-vc-indigo">Active Schedules</h2>
            <Link
              href="/dashboard/schedules"
              className="text-sm text-vc-coral hover:underline"
            >
              Manage
            </Link>
          </div>
          <div className="space-y-2">
            {activeSchedules.map((sch) => (
              <Link
                key={sch.id}
                href={`/dashboard/schedules/${sch.id}`}
                className="flex items-center justify-between rounded-xl border border-vc-border-light bg-white px-4 py-3 transition-shadow hover:shadow-md"
              >
                <div>
                  <p className="text-sm font-medium text-vc-indigo">
                    {formatDate(sch.date_range_start)} – {formatDate(sch.date_range_end)}
                  </p>
                </div>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${
                  sch.status === "published"
                    ? "bg-vc-sage/15 text-vc-sage"
                    : "bg-gray-100 text-gray-500"
                }`}>
                  {sch.status}
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
