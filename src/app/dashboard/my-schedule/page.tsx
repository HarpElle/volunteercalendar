"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/context/auth-context";
import Link from "next/link";
import { getChurchDocuments, getUserEventSignups } from "@/lib/firebase/firestore";
import { where } from "firebase/firestore";
import type { MyScheduleResponse } from "@/app/api/my-schedule/route";
import { SkeletonList } from "@/components/ui/skeleton";
import { TeamScheduleView } from "@/components/scheduling/team-schedule-view";
import { CalendarFeedCta } from "@/components/scheduling/calendar-feed-cta";
import { SelfRemoveModal } from "@/components/scheduling/self-remove-modal";
import { CantMakeItModal } from "@/components/scheduling/cant-make-it-modal";
import { RequestSwapModal } from "@/components/scheduling/request-swap-modal";
import { OpenSwapsSection } from "@/components/scheduling/open-swaps-section";
import type {
  Assignment,
  Service,
  Ministry,
  Event,
  EventSignup,
  Person,
  CalendarFeed,
  UserNotification,
  Schedule,
  OnboardingStep,
  ServiceRole,
} from "@/lib/types";
import {
  generateOccurrences,
  canServeInMinistry,
  hasCompletedPrerequisites,
} from "@/lib/services/scheduler";
import { getServiceMinistries } from "@/lib/utils/service-helpers";
import { useConfirm } from "@/components/ui/confirm-dialog";

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
  /**
   * True when this assignment is a self-signup claim AND the parent
   * schedule is still in `draft` (not yet locked for review/publish).
   * Drives the "Release" button — volunteers can undo their own claim
   * while the admin hasn't started reviewing the schedule yet.
   * PR #38 bonus (Phase 6 follow-up #4).
   */
  isReleasable?: boolean;
  /** Church the assignment belongs to (used by handleReleaseClaim). */
  churchId?: string;
  /**
   * Confirmation token (assignments only). Lets the My Schedule UI POST to
   * /api/confirm without needing to open the email link. Codex Run 2 retest
   * (2026-05-17): previously the only confirmation path was the emailed
   * token link, so pending assignments inside the app had no Confirm/Decline
   * actions and labeled as "Draft."
   */
  confirmationToken?: string | null;
  /**
   * Attendance / absence state. Codex Run 2 Phase 3 (2026-05-17): after
   * submitting "Can't Make It" the page now shows a Can't Make It chip and
   * hides the Confirm/Decline/Remove buttons, so the volunteer can see their
   * action was recorded. Previously the page silently reverted to Confirmed.
   */
  attended?: string | null;
}

type TabKey = "upcoming" | "past" | "team" | "open-slots";

/**
 * One claimable opening on a Self-Service draft schedule. Computed
 * client-side from (schedule, service occurrence, role) minus filled
 * assignments. PR #35 (Phase 6 follow-up #3).
 */
interface OpenSlot {
  scheduleId: string;
  scheduleDateStart: string;
  scheduleDateEnd: string;
  serviceId: string;
  serviceName: string;
  serviceDate: string;
  /** Per Service type: start_time is required (non-null); end_time is nullable. */
  startTime: string;
  endTime: string | null;
  ministryId: string;
  ministryName: string;
  ministryColor: string;
  roleId: string;
  roleTitle: string;
  /**
   * Synthetic key so React keys stay stable across re-renders and we can
   * track the "Claim" button's in-flight state per row.
   */
  key: string;
}

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
  const [volunteerMap, setVolunteerMap] = useState<Map<string, Person>>(new Map());
  const [myMinistryIds, setMyMinistryIds] = useState<string[]>([]);
  const [myVolunteerId, setMyVolunteerId] = useState<string>("");
  const [calendarFeeds, setCalendarFeeds] = useState<CalendarFeed[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>(initialTab);
  const [removeItem, setRemoveItem] = useState<{ kind: string; id: string; roleName: string; eventOrServiceName: string; date: string } | null>(null);
  const [cantMakeItItem, setCantMakeItItem] = useState<{
    kind: string;
    id: string;
    roleName: string;
    eventOrServiceName: string;
    date: string;
    // W12-B: true when the service is TODAY. Flips the modal into
    // the urgent SMS-bypass-prefs path. Carried on the state object
    // so a single modal handles both calendars-of-notice.
    urgent?: boolean;
  } | null>(null);
  const [swapRequestItem, setSwapRequestItem] = useState<{ id: string; roleName: string; eventOrServiceName: string; date: string } | null>(null);
  const [swapToast, setSwapToast] = useState<string | null>(null);
  // Codex Run 2 retest (2026-05-17): in-app confirm/decline for pending
  // assignments. Tracks the assignment ID currently in flight so we can
  // disable both buttons and show a spinner on the right one.
  const [respondingId, setRespondingId] = useState<string | null>(null);
  const [responseError, setResponseError] = useState<string | null>(null);
  // Codex Run 3 retest (2026-05-17): availability campaign banner. Populated
  // from /api/user/notifications filtered to unread "availability_request"
  // notifications across the volunteer's active orgs.
  const [availabilityRequests, setAvailabilityRequests] = useState<
    UserNotification[]
  >([]);
  // PR #35 (Phase 6 follow-up #3): Self-Service open-slot claim state.
  // Keyed by OpenSlot.key for the in-flight "Claim" spinner; error string
  // is rendered inline below the claim list so a 409 ("slot already
  // filled") is visible without a toast.
  const [claimingKey, setClaimingKey] = useState<string | null>(null);
  const [claimError, setClaimError] = useState<string | null>(null);
  // PR #37: success toast for "Signed up!" feedback after a successful
  // claim. Auto-dismisses after 5s.
  const [claimSuccess, setClaimSuccess] = useState<string | null>(null);
  const [selfServiceSchedules, setSelfServiceSchedules] = useState<Schedule[]>([]);
  const [orgPrereqsByChurch, setOrgPrereqsByChurch] = useState<
    Map<string, OnboardingStep[]>
  >(new Map());
  const [myPersonByChurch, setMyPersonByChurch] = useState<Map<string, Person>>(
    new Map(),
  );

  const today = new Date().toISOString().split("T")[0];

  // Load schedule data via the server endpoint (Wave 5 Batch E phase 3).
  //
  // Previously this ran a per-church loop with 5 client-side assignment
  // reads (own + team + open-slot fill + 2 claim-refetch reads). All of
  // those cross the tightened assignment read rule, so they now flow
  // through /api/my-schedule, which does the multi-church aggregation +
  // the self-signup carve-out server-side via the Admin SDK. The endpoint
  // is the authorized read path that lets the rule deny direct volunteer
  // reads of non-published assignments.
  //
  // Event signups (collectionGroup, owner-scoped) and calendar feeds
  // (owner-scoped) are NOT assignment reads — the rule doesn't touch
  // them — so they stay client-side here.
  useEffect(() => {
    if (!user) return;
    const currentUser = user;
    async function loadAll() {
      setFetchError(false);
      let resolvedVolId = "";
      try {
        const token = await currentUser.getIdToken();
        const res = await fetch("/api/my-schedule", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error("my-schedule fetch failed");
        const data = (await res.json()) as MyScheduleResponse;
        resolvedVolId = data.myVolunteerId ?? "";

        // The endpoint already applied the self-signup carve-out to
        // `assignments`; `teamAssignments` is the unfiltered all-church
        // set that feeds the team view + open-slot fill computation.
        setAssignments(data.assignments);
        setServices(new Map(data.services.map((s) => [s.id, s] as const)));
        setMinistries(new Map(data.ministries.map((m) => [m.id, m] as const)));
        setEvents(new Map(data.events.map((e) => [e.id, e] as const)));
        setVolunteerMap(new Map(data.volunteers.map((v) => [v.id, v] as const)));
        setMyMinistryIds(data.myMinistryIds);
        setMyVolunteerId(resolvedVolId);
        setSelfServiceSchedules(data.selfServiceSchedules);
        setOrgPrereqsByChurch(new Map(Object.entries(data.orgPrereqsByChurch)));
        setMyPersonByChurch(new Map(Object.entries(data.myPersonByChurch)));
        setAllChurchAssignments(data.teamAssignments);
      } catch {
        setFetchError(true);
        setLoading(false);
        return;
      }

      // Event signups — collectionGroup query, owner-scoped, not
      // assignment-rule-restricted, so it stays a client read.
      try {
        const allSignups = await getUserEventSignups(currentUser.uid);
        setEventSignups(allSignups);
      } catch {
        // silent — rules may reject if no signups exist
      }

      // Calendar feeds — owner-scoped client read (rule rejects any
      // read that isn't owner-matched), also rule-safe. Needs the
      // resolved volunteer id from the endpoint response.
      const activeMembers = memberships.filter((m) => m.status === "active");
      const feedChurchId = activeMembers[0]?.church_id || profile?.church_id;
      if (feedChurchId && resolvedVolId && currentUser.uid) {
        try {
          const feedDocs = (await getChurchDocuments(
            feedChurchId,
            "calendar_feeds",
            where("created_by_user_id", "==", currentUser.uid),
          )) as unknown[];
          setCalendarFeeds(
            (feedDocs as CalendarFeed[]).filter(
              (f) => f.target_id === resolvedVolId,
            ),
          );
        } catch {
          // silent
        }
      }

      setLoading(false);
    }
    loadAll();
  }, [user, profile, memberships]);

  // Codex Run 3 retest (2026-05-17): availability_request notifications drive
  // the "Availability requested" banner. Re-fetched whenever the active org
  // changes so the banner is org-scoped.
  useEffect(() => {
    async function loadAvailabilityRequests() {
      if (!user) return;
      const active = memberships.filter((m) => m.status === "active");
      const results: UserNotification[] = [];
      for (const m of active) {
        try {
          const token = await user.getIdToken();
          const res = await fetch(
            `/api/user/notifications?church_id=${encodeURIComponent(m.church_id)}&limit=50`,
            { headers: { Authorization: `Bearer ${token}` } },
          );
          if (!res.ok) continue;
          const data = (await res.json()) as { notifications: UserNotification[] };
          results.push(
            ...data.notifications.filter(
              (n) => n.type === "availability_request" && !n.read,
            ),
          );
        } catch {
          // best effort — banner just doesn't render
        }
      }
      setAvailabilityRequests(results);
    }
    loadAvailabilityRequests();
  }, [user, memberships]);

  async function dismissAvailabilityRequest(notif: UserNotification) {
    if (!user) return;
    setAvailabilityRequests((prev) => prev.filter((n) => n.id !== notif.id));
    try {
      const token = await user.getIdToken();
      await fetch(`/api/user/notifications/read`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          notification_id: notif.id,
          church_id: notif.church_id,
        }),
      });
    } catch {
      // Banner is already gone from UI; ignore network error
    }
  }

  // --- Build unified schedule items ---

  // Set of schedule IDs that are still in `draft` AND self-service —
  // self-signup assignments on these schedules are releasable. PR #38.
  const releasableScheduleIds = new Set(
    selfServiceSchedules
      .filter((s) => s.status === "draft")
      .map((s) => s.id),
  );

  const scheduleItems: ScheduleItem[] = [];

  // Assignments → schedule items
  for (const a of assignments) {
    const service = a.service_id ? services.get(a.service_id) : null;
    const ministry = a.ministry_id ? ministries.get(a.ministry_id) : null;
    const roleTime = service?.roles.find((r) => r.role_id === a.role_id);
    const isSelfSignup = a.signup_type === "self_signup";
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
      confirmationToken: a.confirmation_token || null,
      attended: a.attended || null,
      isReleasable: isSelfSignup && releasableScheduleIds.has(a.schedule_id),
      churchId: a.church_id,
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

  // --- Confirm / Decline (in-app) ---
  // Posts to the same token-protected endpoint the email link uses, so the
  // confirmation/decline flow is unified. Codex Run 2 retest (2026-05-17):
  // before this, the only way to confirm was the emailed link — pending
  // assignments inside the app had no Confirm/Decline actions.
  async function respondToAssignment(
    item: ScheduleItem,
    action: "confirm" | "decline",
  ) {
    if (!item.confirmationToken) {
      setResponseError("Couldn't find a response token. Try refreshing the page.");
      return;
    }
    setRespondingId(item.id);
    setResponseError(null);
    try {
      const res = await fetch("/api/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: item.confirmationToken, action }),
      });
      if (!res.ok && res.status !== 409) {
        const body = await res.json().catch(() => ({}));
        setResponseError(body.error || "Couldn't record your response. Try again.");
        return;
      }
      // Optimistic local update — the server has accepted (or it was already
      // confirmed on the other side). Avoid a full reload.
      setAssignments((prev) =>
        prev.map((a) =>
          a.id === item.id
            ? { ...a, status: action === "confirm" ? "confirmed" : "declined" }
            : a,
        ),
      );
    } catch {
      setResponseError("Network error. Please try again.");
    } finally {
      setRespondingId(null);
    }
  }

  // --- Open Slots (PR #35, Phase 6 follow-up #3) ---
  //
  // For every self-service draft/in-review schedule across the volunteer's
  // active churches, expand the schedule into service occurrences via
  // generateOccurrences(), then for each (occurrence, role) compute open
  // slots = role.count - (filled non-trainee assignments). Drop slots
  // where the volunteer is not on the team OR has not (still) completed
  // the team's prerequisites.
  const openSlots: OpenSlot[] = (() => {
    if (selfServiceSchedules.length === 0) return [];
    const slots: OpenSlot[] = [];
    const allServices = Array.from(services.values());

    for (const sched of selfServiceSchedules) {
      // Scope services to the schedule's selected ministries (if any).
      const scopedMinistryIds = sched.ministry_ids || [];
      const scopedServices = scopedMinistryIds.length > 0
        ? allServices.filter((s) => {
            const ids = [s.ministry_id, ...(s.ministries?.map((m) => m.ministry_id) ?? [])];
            return scopedMinistryIds.some((id) => ids.includes(id));
          })
        : allServices;
      const me = myPersonByChurch.get(sched.church_id);
      if (!me) continue; // No person record in this church; can't claim
      const orgPrereqs = orgPrereqsByChurch.get(sched.church_id) || [];
      const ministriesArr = Array.from(ministries.values()).filter(
        (m) => m.church_id === sched.church_id,
      );

      const occurrences = generateOccurrences(
        scopedServices,
        sched.date_range_start,
        sched.date_range_end,
      );
      for (const occ of occurrences) {
        if (occ.date < today) continue; // never list past dates
        const sms = getServiceMinistries(occ.service, occ.date);
        for (const sm of sms) {
          const ministry = ministriesArr.find((m) => m.id === sm.ministry_id);
          if (!ministry) continue;
          if (!canServeInMinistry(me, sm.ministry_id)) continue;
          for (const role of sm.roles as ServiceRole[]) {
            // Filled count: non-trainee assignments for this exact slot.
            const filled = allChurchAssignments.filter(
              (a) =>
                a.schedule_id === sched.id &&
                a.service_id === occ.service.id &&
                a.service_date === occ.date &&
                a.role_id === role.role_id &&
                (a.assignment_type ?? "regular") !== "trainee",
            ).length;
            if (filled >= role.count) continue;

            // Prereq check (uses the PR #33 expiry-aware helper).
            if (
              !hasCompletedPrerequisites(
                me,
                sm.ministry_id,
                [ministry],
                orgPrereqs,
                role.role_id,
              )
            ) {
              continue;
            }

            // Skip slots the volunteer already has a claim for on this
            // occurrence (no double-booking same service/date).
            const alreadyClaimedSameOccurrence = allChurchAssignments.some(
              (a) =>
                a.schedule_id === sched.id &&
                a.service_id === occ.service.id &&
                a.service_date === occ.date &&
                a.person_id === me.id,
            );
            if (alreadyClaimedSameOccurrence) continue;

            slots.push({
              scheduleId: sched.id,
              scheduleDateStart: sched.date_range_start,
              scheduleDateEnd: sched.date_range_end,
              serviceId: occ.service.id,
              serviceName: occ.service.name,
              serviceDate: occ.date,
              startTime: occ.service.start_time,
              endTime: occ.service.end_time,
              ministryId: sm.ministry_id,
              ministryName: ministry.name,
              ministryColor: ministry.color,
              roleId: role.role_id,
              roleTitle: role.title,
              key: `${sched.id}|${occ.service.id}|${occ.date}|${sm.ministry_id}|${role.role_id}`,
            });
          }
        }
      }
    }
    return slots.sort((a, b) => {
      const dateComp = a.serviceDate.localeCompare(b.serviceDate);
      if (dateComp !== 0) return dateComp;
      const timeComp = (a.startTime || "").localeCompare(b.startTime || "");
      if (timeComp !== 0) return timeComp;
      return a.roleTitle.localeCompare(b.roleTitle);
    });
  })();

  async function handleClaim(slot: OpenSlot) {
    if (!user) return;
    setClaimError(null);
    setClaimSuccess(null);
    setClaimingKey(slot.key);

    const churchId = selfServiceSchedules.find((s) => s.id === slot.scheduleId)?.church_id;
    if (!churchId) {
      setClaimError("Couldn't determine which org this slot belongs to.");
      setClaimingKey(null);
      return;
    }

    /**
     * After ANY claim attempt that mutates server state (success or 409),
     * refetch:
     *   - all-church assignments → updates the open-slot filled-count so
     *     the stale row disappears from Open Slots
     *   - my own assignments → updates Upcoming so the new claim is
     *     immediately visible (handles the self_signup carve-out from
     *     PR #37)
     *
     * Codex PR #36 retest 2026-05-18: previously only refetched on
     * success, so a 409 left the just-filled row hanging around in the
     * loser's Open Slots view. And before the page-load filter accepted
     * self_signup, the claim landed in Firestore but never surfaced on
     * Upcoming until the schedule got published.
     */
    async function refetchChurchState() {
      // Wave 5 Batch E phase 3: after a claim, re-fetch /api/my-schedule
      // wholesale instead of the old 2 client assignment reads. The
      // endpoint returns ALL churches with the self-signup carve-out
      // already applied, so a full replacement is both simpler and
      // correct (no per-church slicing needed). The just-claimed slot
      // surfaces on Upcoming because the carve-out keeps the volunteer's
      // own self_signup claim visible even on the still-draft schedule.
      if (!user) return;
      try {
        const token = await user.getIdToken();
        const res = await fetch("/api/my-schedule", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const data = (await res.json()) as MyScheduleResponse;
        setAssignments(data.assignments);
        setAllChurchAssignments(data.teamAssignments);
      } catch {
        // best-effort
      }
    }

    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/assignments/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          church_id: churchId,
          schedule_id: slot.scheduleId,
          service_id: slot.serviceId,
          service_date: slot.serviceDate,
          role_id: slot.roleId,
          ministry_id: slot.ministryId,
        }),
      });

      if (res.status === 409) {
        // Race-loser path. Show a friendly message AND refresh so the
        // stale row drops from the list.
        await refetchChurchState();
        const data = await res.json().catch(() => ({}));
        setClaimError(
          data.error
            ? `That slot was just filled. We refreshed the list.`
            : "That slot was just filled. We refreshed the list.",
        );
        return;
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setClaimError(data.error || `Couldn't sign up for slot (${res.status})`);
        return;
      }
      await refetchChurchState();
      setClaimSuccess(
        `Signed up for ${slot.roleTitle} on ${formatDate(slot.serviceDate)}. See it on Upcoming.`,
      );
    } catch {
      setClaimError("Network error. Please try again.");
    } finally {
      setClaimingKey(null);
    }
  }

  // PR #37: auto-clear the success toast after 5s.
  useEffect(() => {
    if (!claimSuccess) return;
    const t = setTimeout(() => setClaimSuccess(null), 5000);
    return () => clearTimeout(t);
  }, [claimSuccess]);

  // PR #38 bonus: volunteer releases their own self-signup claim while
  // the parent schedule is still in draft. Confirm modal → DELETE
  // /api/assignments/claim → optimistic remove from local state.
  const { confirm } = useConfirm();
  const [releasingId, setReleasingId] = useState<string | null>(null);

  async function handleReleaseClaim(item: ScheduleItem) {
    if (!user || !item.churchId) return;
    const ok = await confirm({
      title: `Release ${item.roleName} on ${formatDate(item.date)}?`,
      message:
        "This frees up the slot for another volunteer to sign up. You can sign up again later if the slot is still open and the schedule is still in draft.",
      confirmLabel: "Release slot",
      variant: "danger",
    });
    if (!ok) return;
    setReleasingId(item.id);
    try {
      const token = await user.getIdToken();
      const res = await fetch(
        `/api/assignments/claim?church_id=${encodeURIComponent(item.churchId)}&assignment_id=${encodeURIComponent(item.id)}`,
        { method: "DELETE", headers: { Authorization: `Bearer ${token}` } },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setResponseError(data.error || `Couldn't release slot (${res.status})`);
        return;
      }
      // Optimistic remove from both slices so Upcoming + Open Slots
      // recompute consistently.
      setAssignments((prev) => prev.filter((a) => a.id !== item.id));
      setAllChurchAssignments((prev) => prev.filter((a) => a.id !== item.id));
    } catch {
      setResponseError("Network error. Please try again.");
    } finally {
      setReleasingId(null);
    }
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

      {/* W12-A: Open swap requests from teammates. Only renders when
           there's at least one swap I could cover; otherwise the
           section auto-hides to avoid clutter. */}
      {activeMembership?.church_id && (
        <OpenSwapsSection
          churchId={activeMembership.church_id}
          onAccepted={() => {
            // Refetch the schedule on accept — the assignment just
            // transferred to me and should appear in Upcoming.
            window.location.reload();
          }}
        />
      )}

      {/* Tabs */}
      <div className="mb-6 flex gap-1 rounded-xl bg-vc-bg-warm p-1">
        {([
          { key: "upcoming" as const, label: "Upcoming" },
          { key: "past" as const, label: "Past" },
          { key: "team" as const, label: "Team" },
          {
            key: "open-slots" as const,
            label: openSlots.length > 0 ? `Open Slots (${openSlots.length})` : "Open Slots",
          },
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

      {/* Availability campaign banner (Codex Run 3 retest 2026-05-17).
          PR #40 polish: silently drop banners whose due_date has already
          passed — the campaign action is moot once the deadline is gone.
          The notification stays in the inbox for history; the banner
          just doesn't render. */}
      {availabilityRequests
        .filter((notif) => {
          const dueDate = notif.metadata?.due_date;
          if (!dueDate) return true; // no deadline → always show
          return dueDate >= today;   // future or today → show; past → hide
        })
        .map((notif) => {
        const dueDate = notif.metadata?.due_date || null;
        return (
          <div
            key={notif.id}
            className="mb-4 flex flex-col gap-3 rounded-xl border border-vc-coral/30 bg-vc-coral/5 px-4 py-3 sm:flex-row sm:items-start sm:justify-between"
          >
            <div className="flex-1">
              <p className="text-sm font-semibold text-vc-indigo">
                {notif.title}
              </p>
              <p className="mt-0.5 text-sm text-vc-text-secondary">
                {notif.body}
              </p>
              {dueDate && (
                <p className="mt-1 text-xs text-vc-coral">
                  Due {formatDate(dueDate)}
                </p>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Link
                href={notif.metadata?.link_href || "/dashboard/my-availability"}
                onClick={() => dismissAvailabilityRequest(notif)}
                className="inline-flex min-h-[44px] items-center rounded-lg bg-vc-coral px-3 py-2 text-sm font-medium text-white hover:bg-vc-coral/90"
              >
                Submit Availability
              </Link>
              <button
                onClick={() => dismissAvailabilityRequest(notif)}
                className="inline-flex min-h-[44px] items-center rounded-lg border border-vc-border px-3 py-2 text-sm font-medium text-vc-text-secondary hover:bg-vc-bg-warm"
              >
                Dismiss
              </button>
            </div>
          </div>
        );
      })}

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

      {/* In-app confirm/decline error banner */}
      {responseError && (
        <div className="mb-4 flex items-start justify-between gap-3 rounded-xl border border-vc-danger/20 bg-vc-danger/5 px-4 py-3">
          <p className="text-sm text-vc-danger">{responseError}</p>
          <button
            onClick={() => setResponseError(null)}
            aria-label="Dismiss error"
            className="shrink-0 text-vc-text-muted hover:text-vc-danger"
          >
            ×
          </button>
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
                // After the client-side published-schedule filter runs, any
                // assignment-kind item with status "draft" is a PUBLISHED but
                // not-yet-responded-to assignment. Treat it as Pending in the
                // UI and surface Confirm/Decline actions. Codex Run 2 retest
                // (2026-05-17): previously labeled "Draft" with no Confirm.
                const isPending = item.kind === "assignment" && item.status === "draft";
                // Codex Run 2 Phase 3 (2026-05-17): if the volunteer submitted
                // Can't Make It, the absence API set `attended = "excused"`
                // on the assignment. Show that state distinctly and suppress
                // the action buttons (they've already responded).
                const cantMakeIt = item.attended === "excused" && !isPast;
                const statusColor = cantMakeIt
                  ? "bg-vc-coral/10 text-vc-coral"
                  : isPending
                    ? "bg-vc-sand/30 text-vc-sand-dark"
                    : item.status === "confirmed" || item.status === "approved"
                      ? "bg-vc-sage/15 text-vc-sage"
                      : item.status === "declined" || item.status === "cancelled"
                        ? "bg-vc-danger/10 text-vc-danger"
                        : "bg-vc-bg-cream text-vc-text-muted";
                const statusLabel = cantMakeIt
                  ? "Can't make it"
                  : isPending
                    ? "Pending"
                    : item.status === "approved"
                      ? "confirmed"
                      : item.status;

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
                      {!isPast && item.status !== "declined" && item.status !== "cancelled" && !cantMakeIt && (
                        <div className="flex items-center gap-1">
                          {isPending ? (
                            <>
                              <button
                                onClick={() => respondToAssignment(item, "decline")}
                                disabled={respondingId === item.id}
                                className="min-h-[44px] rounded-lg border border-vc-border px-3 py-1.5 text-xs font-medium text-vc-text-secondary transition-colors hover:border-vc-danger/30 hover:bg-vc-danger/5 hover:text-vc-danger disabled:opacity-50"
                              >
                                {respondingId === item.id ? "..." : "Decline"}
                              </button>
                              <button
                                onClick={() => respondToAssignment(item, "confirm")}
                                disabled={respondingId === item.id}
                                className="min-h-[44px] rounded-lg bg-vc-sage px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-vc-sage/90 disabled:opacity-50"
                              >
                                {respondingId === item.id ? "..." : "Confirm"}
                              </button>
                            </>
                          ) : (
                            <>
                              {item.isReleasable ? (
                                /* PR #38 bonus: self-signup claim on a
                                   still-draft schedule — volunteer can
                                   undo it cleanly. Mutually-exclusive
                                   with "Can't Make It"/"Remove" because
                                   the schedule isn't published yet, so
                                   absence-tracking semantics don't apply. */
                                <button
                                  onClick={() => handleReleaseClaim(item)}
                                  disabled={releasingId === item.id}
                                  className="min-h-[44px] min-w-[44px] px-2 py-2 text-xs text-vc-text-muted hover:text-vc-danger transition-colors disabled:opacity-50"
                                >
                                  {releasingId === item.id ? "Releasing…" : "Release slot"}
                                </button>
                              ) : item.date === today ? (
                                /* W12-B: day-of urgent path. When the
                                   service is TODAY, peer-swap (W12-A) is
                                   too slow and the routine "Can't Make
                                   It" email path may miss the scheduler.
                                   Replace all three action buttons with
                                   one prominent coral button that opens
                                   the modal in urgent mode → SMS-blasts
                                   scheduler + admin regardless of their
                                   notification prefs. */
                                <button
                                  onClick={() => setCantMakeItItem({
                                    kind: item.kind,
                                    id: item.id,
                                    roleName: item.roleName,
                                    eventOrServiceName: item.eventOrServiceName,
                                    date: item.date,
                                    urgent: true,
                                  })}
                                  className="min-h-[44px] rounded-lg bg-vc-coral px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-vc-coral/90 flex items-center gap-1.5"
                                >
                                  <span aria-hidden="true">⚠️</span>
                                  Can&rsquo;t make it today
                                </button>
                              ) : (
                                <>
                                  {/* W12-A: Need-a-sub button — sub-only path
                                       via the existing /api/swap backend. Only
                                       shown for assignments (event signups
                                       don't have ministry-scoped swap shape). */}
                                  {item.kind === "assignment" && (
                                    <button
                                      onClick={() => setSwapRequestItem({
                                        id: item.id,
                                        roleName: item.roleName,
                                        eventOrServiceName: item.eventOrServiceName,
                                        date: item.date,
                                      })}
                                      className="min-h-[44px] min-w-[44px] px-2 py-2 text-xs text-vc-text-muted hover:text-vc-indigo transition-colors"
                                    >
                                      Need a Sub
                                    </button>
                                  )}
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
                                </>
                              )}
                            </>
                          )}
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

      {/* Open Slots tab — PR #35 (Phase 6 follow-up #3) */}
      {activeTab === "open-slots" && (
        <>
          {claimSuccess && (
            <div className="mb-4 flex items-start justify-between gap-3 rounded-xl border border-vc-sage/30 bg-vc-sage/5 px-4 py-3">
              <p className="text-sm text-vc-sage-dark">{claimSuccess}</p>
              <button
                onClick={() => setClaimSuccess(null)}
                aria-label="Dismiss"
                className="shrink-0 text-vc-text-muted hover:text-vc-sage-dark"
              >
                ×
              </button>
            </div>
          )}
          {claimError && (
            <div className="mb-4 flex items-start justify-between gap-3 rounded-xl border border-vc-danger/20 bg-vc-danger/5 px-4 py-3">
              <p className="text-sm text-vc-danger">{claimError}</p>
              <button
                onClick={() => setClaimError(null)}
                aria-label="Dismiss error"
                className="shrink-0 text-vc-text-muted hover:text-vc-danger"
              >
                ×
              </button>
            </div>
          )}
          {openSlots.length === 0 ? (
            <div className="rounded-xl border border-dashed border-vc-border bg-white p-12 text-center">
              <svg className="mx-auto h-10 w-10 text-vc-text-muted" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
              </svg>
              <p className="mt-3 text-vc-text-secondary">
                No open slots for you right now.
              </p>
              <p className="mt-1 text-sm text-vc-text-muted">
                When your admin opens a self-service schedule, claimable
                slots for your teams will show up here.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {openSlots.map((slot) => {
                const isClaiming = claimingKey === slot.key;
                return (
                  <div
                    key={slot.key}
                    className="rounded-xl border border-vc-border-light bg-white px-4 py-3"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 text-xs text-vc-text-muted">
                          <span
                            className="h-2 w-2 rounded-full"
                            style={{ backgroundColor: slot.ministryColor }}
                          />
                          {slot.ministryName}
                        </div>
                        <p className="mt-0.5 font-medium text-vc-indigo">
                          {slot.roleTitle}
                        </p>
                        <p className="text-sm text-vc-text-secondary">
                          {formatDate(slot.serviceDate)} · {slot.serviceName}
                          {slot.startTime ? ` · ${formatTime(slot.startTime)}` : ""}
                          {slot.endTime ? `–${formatTime(slot.endTime)}` : ""}
                        </p>
                      </div>
                      <button
                        onClick={() => handleClaim(slot)}
                        disabled={isClaiming || claimingKey !== null}
                        className="inline-flex min-h-[44px] items-center rounded-lg bg-vc-coral px-4 py-2 text-sm font-medium text-white hover:bg-vc-coral/90 disabled:opacity-50"
                      >
                        {isClaiming ? "Signing up…" : "Sign Up"}
                      </button>
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

      {/* W12-A: Request-Swap modal */}
      {swapRequestItem && (
        <RequestSwapModal
          open={!!swapRequestItem}
          onClose={() => setSwapRequestItem(null)}
          onCreated={({ teammates_emailed, teammates_notified }) => {
            // Lead with email count — that's the channel volunteers
            // actually see. Fall back to in-app count if no teammates
            // had emails on file, and finally to the empty-team case.
            const emailed = teammates_emailed ?? 0;
            const notified = teammates_notified ?? 0;
            let msg: string;
            if (emailed > 0) {
              msg = `Emailed ${emailed} teammate${emailed === 1 ? "" : "s"}. First to tap "Cover this" takes the spot.`;
            } else if (notified > 0) {
              msg = `Sent to ${notified} teammate${notified === 1 ? "" : "s"} in-app. (No email addresses on file.)`;
            } else {
              msg = "Swap request created. (No teammates on this team to notify yet.)";
            }
            setSwapToast(msg);
            setTimeout(() => setSwapToast(null), 5000);
          }}
          churchId={activeMembership?.church_id || profile?.church_id || ""}
          assignmentId={swapRequestItem.id}
          roleName={swapRequestItem.roleName}
          serviceName={swapRequestItem.eventOrServiceName}
          serviceDate={swapRequestItem.date}
        />
      )}

      {/* W12-A: success toast for swap-request creation */}
      {swapToast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-3 rounded-xl bg-vc-indigo text-white text-sm shadow-lg max-w-md">
          {swapToast}
        </div>
      )}

      {/* Can't Make It modal */}
      {cantMakeItItem && (
        <CantMakeItModal
          open={!!cantMakeItItem}
          onClose={() => setCantMakeItItem(null)}
          onNotified={() => {
            // Codex Run 2 Phase 3 (2026-05-17): optimistic update so the
            // volunteer sees the new "Can't make it" state immediately
            // without waiting for a reload. The /api/notify/absence
            // endpoint has already written attended="excused" server-side.
            if (cantMakeItItem.kind === "assignment") {
              setAssignments((prev) =>
                prev.map((a) =>
                  a.id === cantMakeItItem.id
                    ? { ...a, attended: "excused" }
                    : a,
                ),
              );
            }
            setCantMakeItItem(null);
          }}
          churchId={activeMembership?.church_id || profile?.church_id || ""}
          itemType={cantMakeItItem.kind === "assignment" ? "assignment" : "event_signup"}
          itemId={cantMakeItItem.id}
          roleName={cantMakeItItem.roleName}
          serviceName={cantMakeItItem.eventOrServiceName}
          serviceDate={cantMakeItItem.date}
          urgent={cantMakeItItem.urgent ?? false}
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
