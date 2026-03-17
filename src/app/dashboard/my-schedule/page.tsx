"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/lib/context/auth-context";
import { getChurchDocuments } from "@/lib/firebase/firestore";
import { Spinner } from "@/components/ui/spinner";
import type { Assignment, Service, Ministry } from "@/lib/types";

function formatDate(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function formatTime(time: string | null | undefined): string {
  if (!time) return "";
  const [h, m] = time.split(":");
  const hour = Number(h);
  const ampm = hour >= 12 ? "PM" : "AM";
  const display = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${display}:${m} ${ampm}`;
}

export default function MySchedulePage() {
  const { user, profile, activeMembership, memberships } = useAuth();
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [services, setServices] = useState<Map<string, Service>>(new Map());
  const [ministries, setMinistries] = useState<Map<string, Ministry>>(new Map());
  const [loading, setLoading] = useState(true);
  const [timeFilter, setTimeFilter] = useState<"upcoming" | "past">("upcoming");

  const today = new Date().toISOString().split("T")[0];

  useEffect(() => {
    async function loadAll() {
      const allAssignments: Assignment[] = [];
      const serviceMap = new Map<string, Service>();
      const ministryMap = new Map<string, Ministry>();

      // Load data from all active orgs
      const activeMembers = memberships.filter((m) => m.status === "active");
      for (const m of activeMembers) {
        try {
          const [assigns, svcs, mins] = await Promise.all([
            getChurchDocuments(m.church_id, "assignments") as Promise<unknown[]>,
            getChurchDocuments(m.church_id, "services") as Promise<unknown[]>,
            getChurchDocuments(m.church_id, "ministries") as Promise<unknown[]>,
          ]);

          // Find volunteer record linked to this membership
          const volId = m.volunteer_id;
          if (volId) {
            const myAssignments = (assigns as Assignment[]).filter(
              (a) => a.volunteer_id === volId,
            );
            allAssignments.push(...myAssignments);
          }

          for (const s of svcs as Service[]) serviceMap.set(s.id, s);
          for (const min of mins as Ministry[]) ministryMap.set(min.id, min);
        } catch {
          // Skip orgs that fail to load
        }
      }

      // Fallback: also check legacy profile church_id
      if (activeMembers.length === 0 && profile?.church_id) {
        try {
          const [assigns, svcs, mins] = await Promise.all([
            getChurchDocuments(profile.church_id, "assignments") as Promise<unknown[]>,
            getChurchDocuments(profile.church_id, "services") as Promise<unknown[]>,
            getChurchDocuments(profile.church_id, "ministries") as Promise<unknown[]>,
          ]);
          // Find assignments by user_id match in volunteers
          const vols = await getChurchDocuments(profile.church_id, "volunteers") as unknown[];
          const myVol = (vols as { id: string; user_id: string | null }[]).find(
            (v) => v.user_id === user?.uid,
          );
          if (myVol) {
            const myAssigns = (assigns as Assignment[]).filter(
              (a) => a.volunteer_id === myVol.id,
            );
            allAssignments.push(...myAssigns);
          }
          for (const s of svcs as Service[]) serviceMap.set(s.id, s);
          for (const min of mins as Ministry[]) ministryMap.set(min.id, min);
        } catch {
          // silent
        }
      }

      setAssignments(allAssignments);
      setServices(serviceMap);
      setMinistries(ministryMap);
      setLoading(false);
    }
    if (user) loadAll();
  }, [user, profile, memberships]);

  const filtered = assignments
    .filter((a) =>
      timeFilter === "upcoming"
        ? a.service_date >= today
        : a.service_date < today,
    )
    .sort((a, b) =>
      timeFilter === "upcoming"
        ? a.service_date.localeCompare(b.service_date)
        : b.service_date.localeCompare(a.service_date),
    );

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6">
        <h1 className="font-display text-3xl text-vc-indigo">My Schedule</h1>
        <p className="mt-1 text-vc-text-secondary">
          Your upcoming serving assignments across all organizations.
        </p>
      </div>

      {/* Tabs */}
      <div className="mb-4 flex gap-1 rounded-xl bg-vc-bg-warm p-1">
        <button
          onClick={() => setTimeFilter("upcoming")}
          className={`flex-1 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
            timeFilter === "upcoming" ? "bg-white text-vc-indigo shadow-sm" : "text-vc-text-secondary"
          }`}
        >
          Upcoming
        </button>
        <button
          onClick={() => setTimeFilter("past")}
          className={`flex-1 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
            timeFilter === "past" ? "bg-white text-vc-indigo shadow-sm" : "text-vc-text-secondary"
          }`}
        >
          Past
        </button>
      </div>

      {/* Schedule list */}
      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-vc-border bg-white p-12 text-center">
          <svg className="mx-auto h-10 w-10 text-vc-text-muted" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
          </svg>
          <p className="mt-3 text-vc-text-secondary">
            {timeFilter === "upcoming"
              ? "No upcoming assignments. You're free!"
              : "No past assignments found."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((a) => {
            const service = a.service_id ? services.get(a.service_id) : null;
            const ministry = a.ministry_id ? ministries.get(a.ministry_id) : null;
            const isPast = a.service_date < today;
            const statusColor =
              a.status === "confirmed"
                ? "bg-vc-sage/15 text-vc-sage"
                : a.status === "declined"
                  ? "bg-vc-danger/10 text-vc-danger"
                  : a.status === "draft"
                    ? "bg-gray-100 text-gray-500"
                    : "bg-vc-sand/30 text-vc-sand";

            // Determine time for this role
            const roleTime = service?.roles.find((r) => r.role_id === a.role_id);
            const displayStart = roleTime?.start_time || service?.start_time;
            const displayEnd = roleTime?.end_time || service?.end_time;
            const isAllDay = service?.all_day;

            return (
              <div
                key={a.id}
                className={`rounded-xl border border-vc-border-light bg-white p-4 transition-shadow hover:shadow-md ${
                  isPast ? "opacity-60" : ""
                }`}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-semibold text-vc-indigo">{formatDate(a.service_date)}</p>
                    <p className="mt-0.5 text-sm text-vc-text-secondary">
                      {service?.name || "Service"}
                      {ministry && (
                        <span className="ml-1.5 text-vc-text-muted">· {ministry.name}</span>
                      )}
                    </p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${statusColor}`}>
                    {a.status}
                  </span>
                </div>
                <div className="mt-2 flex items-center gap-3 flex-wrap">
                  <span className="inline-flex items-center rounded-lg bg-vc-indigo/5 px-2 py-0.5 text-xs font-medium text-vc-indigo">
                    {a.role_title}
                  </span>
                  {isAllDay ? (
                    <span className="text-xs text-vc-text-muted">All day</span>
                  ) : displayStart ? (
                    <span className="text-xs text-vc-text-muted">
                      {formatTime(displayStart)}{displayEnd ? ` – ${formatTime(displayEnd)}` : ""}
                    </span>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
