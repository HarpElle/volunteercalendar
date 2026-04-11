"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/context/auth-context";
import Link from "next/link";
import { getChurchDocuments, getUserEventSignups } from "@/lib/firebase/firestore";
import { where } from "firebase/firestore";
import { Spinner } from "@/components/ui/spinner";
import { SkeletonList } from "@/components/ui/skeleton";
import { TeamScheduleView } from "@/components/scheduling/team-schedule-view";
import { CalendarFeedCta } from "@/components/scheduling/calendar-feed-cta";
import { SelfRemoveModal } from "@/components/scheduling/self-remove-modal";
import { CantMakeItModal } from "@/components/scheduling/cant-make-it-modal";
import type { Assignment, Service, Ministry, Event, EventSignup, Volunteer, Person, CalendarFeed } from "@/lib/types";
import { personToLegacyVolunteer } from "@/lib/compat/volunteer-compat";

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

/** A unified item that can be either a scheduler assignment or an event signup. */
interface ScheduleItem {
  id: string;
  kind: "assignment" | "signup";
  date: string;
  roleName: string;
  eventOrServiceName: string;
  ministryName: string | null;
  startTime: string | null;
  endTime: string | null;
  allDay: boolean;
  status: string;
  isTrainee?: boolean;
}

type TabKey = "upcoming" | "past" | "team";

export default function MySchedulePage() {
  const { user, profile, activeMembership, memberships } = useAuth();
  const searchParams = useSearchParams();
  const initialTab = (searchParams.get("tab") as TabKey) || "upcoming";

  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [services, setServices] = useState<Map<string, Service>>(new Map());
  const [ministries, setMinistries] = useState<Map<string, Ministry>>(new Map());
  const [eventSignups, setEventSignups] = useState<EventSignup[]>([]);
  const [events, setEvents] = useState<Map<string, Event>>(new Map());
  const [allChurchAssignments, setAllChurchAssignments] = useState<Assignment[]>([]);
  const [volunteerMap, setVolunteerMap] = useState<Map<string, Volunteer>>(new Map());
  const [myMinistryIds, setMyMinistryIds] = useState<string[]>([]);
  const [myVolunteerId, setMyVolunteerId] = useState<string>("");
  const [calendarFeeds, setCalendarFeeds] = useState<CalendarFeed[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>(initialTab);
  const [removeItem, setRemoveItem] = useState<{ kind: string; id: string; roleName: string; eventOrServiceName: string; date: string } | null>(null);
  const [cantMakeItItem, setCantMakeItItem] = useState<{ kind: string; id: string; roleName: string; eventOrServiceName: string; date: string } | null>(null);

  const today = new Date().toISOString().split("T")[0];

  // Load schedule data (assignments + event signups)
  useEffect(() => {
    async function loadAll() {
      setFetchError(false);
      let loadedAnyOrg = false;
      const myAssignments: Assignment[] = [];
      const churchAssignments: Assignment[] = [];
      const serviceMap = new Map<string, Service>();
      const ministryMap = new Map<string, Ministry>();
      const eventMap = new Map<string, Event>();
      const volMap = new Map<string, Volunteer>();
      let ministryIds: string[] = [];
      let volId = "";

      // Only load assignments from the last 30 days forward
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const cutoffDate = thirtyDaysAgo.toISOString().split("T")[0];

      const activeMembers = memberships.filter((m) => m.status === "active");
      for (const m of activeMembers) {
        try {
          const [assigns, svcs, mins, evts, vols] = await Promise.all([
            getChurchDocuments(m.church_id, "assignments",
              where("service_date", ">=", cutoffDate),
            ) as Promise<unknown[]>,
            getChurchDocuments(m.church_id, "services") as Promise<unknown[]>,
            getChurchDocuments(m.church_id, "ministries") as Promise<unknown[]>,
            getChurchDocuments(m.church_id, "events") as Promise<unknown[]>,
            getChurchDocuments(m.church_id, "people",
              where("is_volunteer", "==", true),
              where("status", "==", "active"),
            ) as Promise<unknown[]>,
          ]);

          // Store all assignments for team view
          churchAssignments.push(...(assigns as Assignment[]));

          // Build volunteer name map from people collection
          const people = vols as unknown as Person[];
          for (const p of people) {
            const v = personToLegacyVolunteer(p);
            volMap.set(v.id, v);
          }

          if (m.volunteer_id) {
            const myFiltered = (assigns as Assignment[]).filter(
              (a) => (a.person_id || a.volunteer_id) === m.volunteer_id,
            );
            myAssignments.push(...myFiltered);

            // Get this user's ministry_ids from their volunteer record
            const myVol = volMap.get(m.volunteer_id);
            if (myVol) {
              ministryIds = myVol.ministry_ids || [];
              volId = myVol.id;
            }
          }

          for (const s of svcs as Service[]) serviceMap.set(s.id, s);
          for (const min of mins as Ministry[]) ministryMap.set(min.id, min);
          for (const e of evts as Event[]) eventMap.set(e.id, e);
          loadedAnyOrg = true;
        } catch {
          // Skip orgs that fail to load
        }
      }

      // Fallback: legacy profile church_id
      if (activeMembers.length === 0 && profile?.church_id) {
        try {
          const [assigns, svcs, mins, evts, vols] = await Promise.all([
            getChurchDocuments(profile.church_id, "assignments",
              where("service_date", ">=", cutoffDate),
            ) as Promise<unknown[]>,
            getChurchDocuments(profile.church_id, "services") as Promise<unknown[]>,
            getChurchDocuments(profile.church_id, "ministries") as Promise<unknown[]>,
            getChurchDocuments(profile.church_id, "events") as Promise<unknown[]>,
            getChurchDocuments(profile.church_id, "people",
              where("is_volunteer", "==", true),
              where("status", "==", "active"),
            ) as Promise<unknown[]>,
          ]);

          churchAssignments.push(...(assigns as Assignment[]));
          const fallbackPeople = vols as unknown as Person[];
          for (const p of fallbackPeople) {
            const v = personToLegacyVolunteer(p);
            volMap.set(v.id, v);
          }

          const myVol = fallbackPeople.find(
            (v) => v.user_id === user?.uid,
          );
          if (myVol) {
            const myFiltered = (assigns as Assignment[]).filter(
              (a) => (a.person_id || a.volunteer_id) === myVol.id,
            );
            myAssignments.push(...myFiltered);
            ministryIds = myVol.ministry_ids || [];
            volId = myVol.id;
          }
          for (const s of svcs as Service[]) serviceMap.set(s.id, s);
          for (const min of mins as Ministry[]) ministryMap.set(min.id, min);
          for (const e of evts as Event[]) eventMap.set(e.id, e);
          loadedAnyOrg = true;
        } catch {
          // silent
        }
      }

      // Load event signups for the current user
      let allSignups: EventSignup[] = [];
      if (user) {
        try {
          allSignups = await getUserEventSignups(user.uid);
        } catch {
          // silent — security rules may reject if no signups exist
        }
      }

      // Load calendar feeds for the active membership's church
      let feeds: CalendarFeed[] = [];
      const feedChurchId = activeMembers[0]?.church_id || profile?.church_id;
      if (feedChurchId && volId) {
        try {
          const feedDocs = await getChurchDocuments(feedChurchId, "calendar_feeds") as unknown[];
          feeds = (feedDocs as CalendarFeed[]).filter((f) => f.target_id === volId);
        } catch {
          // silent
        }
      }

      setAssignments(myAssignments);
      setAllChurchAssignments(churchAssignments);
      setServices(serviceMap);
      setMinistries(ministryMap);
      setEventSignups(allSignups);
      setEvents(eventMap);
      setVolunteerMap(volMap);
      setMyMinistryIds(ministryIds);
      setMyVolunteerId(volId);
      setCalendarFeeds(feeds);
      if (!loadedAnyOrg && activeMembers.length > 0) setFetchError(true);
      setLoading(false);
    }
    if (user) loadAll();
  }, [user, profile, memberships]);

  // --- Build unified schedule items ---

  const scheduleItems: ScheduleItem[] = [];

  // Assignments → schedule items
  for (const a of assignments) {
    const service = a.service_id ? services.get(a.service_id) : null;
    const ministry = a.ministry_id ? ministries.get(a.ministry_id) : null;
    const roleTime = service?.roles.find((r) => r.role_id === a.role_id);
    scheduleItems.push({
      id: a.id,
      kind: "assignment",
      date: a.service_date,
      roleName: a.role_title,
      eventOrServiceName: service?.name || "Service",
      ministryName: ministry?.name || null,
      startTime: roleTime?.start_time || service?.start_time || null,
      endTime: roleTime?.end_time || service?.end_time || null,
      allDay: service?.all_day || false,
      status: a.status,
      isTrainee: a.assignment_type === "trainee",
    });
  }

  // Event signups → schedule items (exclude cancelled)
  for (const s of eventSignups) {
    if (s.status === "cancelled") continue;
    const evt = events.get(s.event_id);
    const roleSlot = evt?.roles.find((r) => r.role_id === s.role_id);
    scheduleItems.push({
      id: s.id,
      kind: "signup",
      date: evt?.date || s.signed_up_at.split("T")[0],
      roleName: s.role_title,
      eventOrServiceName: evt?.name || "Event",
      ministryName: null,
      startTime: roleSlot?.start_time || evt?.start_time || null,
      endTime: roleSlot?.end_time || evt?.end_time || null,
      allDay: evt?.all_day || false,
      status: s.status,
    });
  }

  // --- Schedule filtering ---

  const timeFilter = activeTab === "past" ? "past" : "upcoming";
  const filtered = (activeTab === "upcoming" || activeTab === "past")
    ? scheduleItems
        .filter((item) =>
          timeFilter === "upcoming"
            ? item.date >= today
            : item.date < today,
        )
        .sort((a, b) => {
          // Primary: date (ascending for upcoming, descending for past)
          const dateComp = a.date.localeCompare(b.date);
          if (dateComp !== 0) return timeFilter === "upcoming" ? dateComp : -dateComp;
          // Secondary: start time (nulls/all-day sort first)
          const aTime = a.startTime || "";
          const bTime = b.startTime || "";
          const timeComp = aTime.localeCompare(bTime);
          if (timeComp !== 0) return timeComp;
          // Tertiary: role name
          return a.roleName.localeCompare(b.roleName);
        })
    : [];

  if (loading) {
    return (
      <div className="mx-auto max-w-2xl">
        <div className="mb-8">
          <div className="h-9 w-48 rounded-lg bg-vc-bg-cream animate-shimmer" />
          <div className="mt-2 h-5 w-72 rounded-lg bg-vc-bg-cream animate-shimmer" />
        </div>
        <div className="mb-6 flex gap-1 rounded-xl bg-vc-bg-warm p-1">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-9 flex-1 rounded-lg bg-vc-bg-cream animate-shimmer" />
          ))}
        </div>
        <SkeletonList rows={4} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-8">
        <h1 className="font-display text-3xl text-vc-indigo">My Schedule</h1>
        <p className="mt-1 text-vc-text-secondary">
          Your assignments, availability, and reminder preferences.
        </p>
      </div>

      {/* Tabs */}
      <div className="mb-6 flex gap-1 rounded-xl bg-vc-bg-warm p-1">
        {([
          { key: "upcoming" as const, label: "Upcoming" },
          { key: "past" as const, label: "Past" },
          { key: "team" as const, label: "Team" },
        ]).map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex-1 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === tab.key ? "bg-white text-vc-indigo shadow-sm" : "text-vc-text-secondary"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Fetch error banner */}
      {fetchError && !loading && (
        <div className="mb-4 rounded-xl border border-vc-danger/20 bg-vc-danger/5 px-4 py-3 text-center">
          <p className="text-sm text-vc-text-secondary">
            We had trouble loading your schedule data.{" "}
            <button onClick={() => window.location.reload()} className="font-medium text-vc-coral hover:underline">
              Refresh to try again
            </button>
          </p>
        </div>
      )}

      {/* Schedule list (Upcoming / Past tabs) */}
      {(activeTab === "upcoming" || activeTab === "past") && (
        <>
          {filtered.length === 0 ? (
            <div className="rounded-xl border border-dashed border-vc-border bg-white p-12 text-center">
              <svg className="mx-auto h-10 w-10 text-vc-text-muted" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
              </svg>
              <p className="mt-3 text-vc-text-secondary">
                {activeTab === "upcoming"
                  ? "No upcoming assignments. You\u2019re free!"
                  : "No past assignments found."}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filtered.map((item) => {
                const isPast = item.date < today;
                const statusColor =
                  item.status === "confirmed" || item.status === "approved"
                    ? "bg-vc-sage/15 text-vc-sage"
                    : item.status === "declined" || item.status === "cancelled"
                      ? "bg-vc-danger/10 text-vc-danger"
                      : item.status === "draft"
                        ? "bg-vc-bg-cream text-vc-text-muted"
                        : "bg-vc-sand/30 text-vc-sand";
                const statusLabel = item.status === "approved" ? "confirmed" : item.status;

                return (
                  <div
                    key={`${item.kind}-${item.id}`}
                    className={`rounded-xl border border-vc-border-light bg-white p-4 transition-shadow hover:shadow-md ${
                      isPast ? "opacity-60" : ""
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-semibold text-vc-indigo">{formatDate(item.date)}</p>
                        <p className="mt-0.5 text-sm text-vc-text-secondary">
                          {item.eventOrServiceName}
                          {item.ministryName && (
                            <span className="ml-1.5 text-vc-text-muted">&middot; {item.ministryName}</span>
                          )}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {item.isTrainee && (
                          <span className="rounded-full bg-vc-sand/20 px-2 py-0.5 text-[10px] font-medium text-vc-sand">
                            Shadowing
                          </span>
                        )}
                        {item.kind === "signup" && (
                          <span className="rounded-full bg-vc-coral/10 px-2 py-0.5 text-[10px] font-medium text-vc-coral">
                            Event
                          </span>
                        )}
                        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${statusColor}`}>
                          {statusLabel}
                        </span>
                      </div>
                    </div>
                    <div className="mt-2 flex items-center justify-between">
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className="inline-flex items-center rounded-lg bg-vc-indigo/5 px-2 py-0.5 text-xs font-medium text-vc-indigo">
                          {item.roleName}
                        </span>
                        {item.allDay ? (
                          <span className="text-xs text-vc-text-muted">All day</span>
                        ) : item.startTime ? (
                          <span className="text-xs text-vc-text-muted">
                            {formatTime(item.startTime)}{item.endTime ? ` – ${formatTime(item.endTime)}` : ""}
                          </span>
                        ) : null}
                      </div>
                      {!isPast && item.status !== "declined" && item.status !== "cancelled" && (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => setCantMakeItItem({
                              kind: item.kind,
                              id: item.id,
                              roleName: item.roleName,
                              eventOrServiceName: item.eventOrServiceName,
                              date: item.date,
                            })}
                            className="min-h-[44px] min-w-[44px] px-2 py-2 text-xs text-vc-text-muted hover:text-vc-coral transition-colors"
                          >
                            Can&apos;t Make It
                          </button>
                          <button
                            onClick={() => setRemoveItem({
                              kind: item.kind,
                              id: item.id,
                              roleName: item.roleName,
                              eventOrServiceName: item.eventOrServiceName,
                              date: item.date,
                            })}
                            className="min-h-[44px] min-w-[44px] px-2 py-2 text-xs text-vc-text-muted hover:text-vc-danger transition-colors"
                          >
                            Remove
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Team tab */}
      {activeTab === "team" && (
        <TeamScheduleView
          myMinistryIds={myMinistryIds}
          myVolunteerId={myVolunteerId}
          allAssignments={allChurchAssignments}
          services={services}
          ministries={ministries}
          volunteers={volunteerMap}
          activeMembership={activeMembership}
          churchId={activeMembership?.church_id || profile?.church_id || ""}
          onAssignmentRemoved={(id) => {
            setAssignments((prev) => prev.filter((a) => a.id !== id));
            setAllChurchAssignments((prev) => prev.filter((a) => a.id !== id));
          }}
        />
      )}

      {/* Calendar Feed CTA (Upcoming + Team tabs) */}
      {(activeTab === "upcoming" || activeTab === "team") && myVolunteerId && (
        <CalendarFeedCta
          churchId={activeMembership?.church_id || profile?.church_id || ""}
          volunteerId={myVolunteerId}
          myMinistryIds={myMinistryIds}
          ministries={ministries}
          existingFeeds={calendarFeeds}
        />
      )}

      {/* Availability CTA */}
      <Link
        href="/dashboard/my-availability"
        className="mt-6 flex items-center gap-3 rounded-xl border border-vc-border-light bg-vc-bg-warm p-4 transition-colors hover:border-vc-coral/30 hover:bg-vc-coral/5"
      >
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-vc-coral/10 text-vc-coral">
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
          </svg>
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-vc-indigo">My Availability</p>
          <p className="text-xs text-vc-text-muted">Manage blockout dates, weekly availability, and scheduling preferences</p>
        </div>
        <svg className="ml-auto h-4 w-4 shrink-0 text-vc-text-muted" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
        </svg>
      </Link>

      {/* Can't Make It modal */}
      {cantMakeItItem && (
        <CantMakeItModal
          open={!!cantMakeItItem}
          onClose={() => setCantMakeItItem(null)}
          onNotified={() => {
            setCantMakeItItem(null);
          }}
          churchId={activeMembership?.church_id || profile?.church_id || ""}
          itemType={cantMakeItItem.kind === "assignment" ? "assignment" : "event_signup"}
          itemId={cantMakeItItem.id}
          roleName={cantMakeItItem.roleName}
          serviceName={cantMakeItItem.eventOrServiceName}
          serviceDate={cantMakeItItem.date}
        />
      )}
      {/* Self-removal modal */}
      {removeItem && (
        <SelfRemoveModal
          open={!!removeItem}
          onClose={() => setRemoveItem(null)}
          onRemoved={() => {
            if (removeItem.kind === "assignment") {
              setAssignments((prev) => prev.filter((a) => a.id !== removeItem.id));
              setAllChurchAssignments((prev) => prev.filter((a) => a.id !== removeItem.id));
            } else {
              setEventSignups((prev) => prev.filter((s) => s.id !== removeItem.id));
            }
            setRemoveItem(null);
          }}
          churchId={activeMembership?.church_id || profile?.church_id || ""}
          itemType={removeItem.kind === "assignment" ? "assignment" : "event_signup"}
          itemId={removeItem.id}
          roleName={removeItem.roleName}
          serviceName={removeItem.eventOrServiceName}
          serviceDate={removeItem.date}
        />
      )}
    </div>
  );
}
