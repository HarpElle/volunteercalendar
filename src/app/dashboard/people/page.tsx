"use client";

import { Suspense, useEffect, useState, useRef, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/context/auth-context";
import {
  addChurchDocument,
  getChurchDocuments,
  updateChurchDocument,
  removeChurchDocument,
  getChurchMemberships,
  updateMembershipStatus,
  updateMembershipRole,
  deleteMembership,
} from "@/lib/firebase/firestore";
import { db } from "@/lib/firebase/config";
import { doc, getDoc } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { isAdmin, isScheduler } from "@/lib/utils/permissions";
import { formatPhone } from "@/lib/utils/phone";
import { VolunteerEditModal } from "@/components/forms/volunteer-edit-modal";
import { InviteQueueDrawer } from "@/components/forms/invite-queue-drawer";
import { getOrgTerms } from "@/lib/utils/org-terms";
import { ShortLinkCreator } from "@/components/ui/short-link-creator";
import { CSVImportModal } from "@/components/forms/csv-import-modal";
import { ChMSImportModal } from "@/components/forms/chms-import-modal";
import { HouseholdFormModal } from "@/components/forms/household-form-modal";
import type {
  Volunteer,
  Ministry,
  Membership,
  Household,
  OrgRole,
  OrgType,
  Service,
  InviteQueueItem,
} from "@/lib/types";
import { getServiceMinistries } from "@/lib/utils/service-helpers";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ROLE_LABELS: Record<OrgRole, string> = {
  owner: "Owner",
  admin: "Admin",
  scheduler: "Scheduler",
  volunteer: "Volunteer",
};

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  active: { label: "Active", color: "bg-vc-sage/15 text-vc-sage" },
  pending_org_approval: { label: "Awaiting Approval", color: "bg-vc-sand/30 text-vc-sand" },
  pending_volunteer_approval: { label: "Invite Sent", color: "bg-vc-indigo/10 text-vc-indigo" },
  inactive: { label: "Inactive", color: "bg-vc-bg-cream text-vc-text-muted" },
};

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function PeoplePage() {
  return (
    <Suspense>
      <PeopleContent />
    </Suspense>
  );
}

function PeopleContent() {
  const searchParams = useSearchParams();
  const { user, profile, activeMembership } = useAuth();
  const churchId = activeMembership?.church_id || profile?.church_id;

  const canManage = isAdmin(activeMembership);
  const canViewRoster = isScheduler(activeMembership);

  // Tab state
  const rawTab = searchParams.get("tab");
  const initialTab = rawTab === "invites" ? "invites" : rawTab === "families" ? "families" : "roster";
  const [tab, setTab] = useState<"roster" | "invites" | "families">(initialTab);

  // Data
  const [volunteers, setVolunteers] = useState<Volunteer[]>([]);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [ministries, setMinistries] = useState<Ministry[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [churchName, setChurchName] = useState("");
  const [churchTier, setChurchTier] = useState("free");
  const [orgType, setOrgType] = useState<OrgType | undefined>();
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterMinistries, setFilterMinistries] = useState<string[]>([]);
  const [filterRoles, setFilterRoles] = useState<string[]>([]);
  const [filterStatus, setFilterStatus] = useState<"active" | "archived" | "all">("active");
  const [filterTeam, setFilterTeam] = useState<"all" | "on-team" | "no-team">("all");
  const [showFilters, setShowFilters] = useState(false);

  // Households (Families tab)
  const [households, setHouseholds] = useState<Household[]>([]);
  const [householdModalOpen, setHouseholdModalOpen] = useState(false);
  const [editingHousehold, setEditingHousehold] = useState<Household | undefined>();

  // Add People panel
  const [addMode, setAddMode] = useState<null | "individual" | "csv" | "chms">(null);

  // Invite queue
  const [queueItems, setQueueItems] = useState<InviteQueueItem[]>([]);
  const [showQueuePanel, setShowQueuePanel] = useState(false);

  async function loadQueueItems() {
    if (!churchId) return;
    const items = await getChurchDocuments(churchId, "invite_queue") as unknown as InviteQueueItem[];
    const pending = items.filter((i) => i.status === "pending_review" || i.status === "approved");
    setQueueItems(pending);
  }

  useEffect(() => {
    if (!churchId) return;
    async function load() {
      try {
        const [vols, mins, mems, svcs, hh, churchSnap] = await Promise.all([
          getChurchDocuments(churchId!, "volunteers"),
          getChurchDocuments(churchId!, "ministries"),
          getChurchMemberships(churchId!),
          getChurchDocuments(churchId!, "services"),
          getChurchDocuments(churchId!, "households"),
          getDoc(doc(db, "churches", churchId!)),
        ]);
        setVolunteers(vols as unknown as Volunteer[]);
        setMinistries(mins as unknown as Ministry[]);
        setServices(svcs as unknown as Service[]);
        setHouseholds(hh as unknown as Household[]);
        setMemberships(mems);
        if (churchSnap.exists()) {
          setChurchName(churchSnap.data().name || "");
          setChurchTier(churchSnap.data().subscription_tier || "free");
          setOrgType(churchSnap.data().org_type as OrgType);
        }
        // Load invite queue
        const qItems = await getChurchDocuments(churchId!, "invite_queue") as unknown as InviteQueueItem[];
        setQueueItems(qItems.filter((i) => i.status === "pending_review" || i.status === "approved"));

        // Auto-sync: ensure active members have volunteer records on the roster
        const volsByEmail = new Set((vols as unknown as Volunteer[]).map((v) => v.email?.toLowerCase()));
        const volsByUserId = new Set((vols as unknown as Volunteer[]).map((v) => v.user_id).filter(Boolean));
        const missingMembers = mems.filter(
          (m) => m.status === "active" && m.user_id && !volsByUserId.has(m.user_id),
        );
        for (const mem of missingMembers) {
          const memUser = await getDoc(doc(db, "users", mem.user_id));
          const memEmail = memUser?.data()?.email?.toLowerCase() || "";
          if (volsByEmail.has(memEmail)) continue; // already on roster by email
          const now = new Date().toISOString();
          const volData = {
            church_id: churchId!,
            name: memUser?.data()?.display_name || memEmail || "Member",
            email: memUser?.data()?.email || "",
            phone: memUser?.data()?.phone || null,
            user_id: mem.user_id,
            membership_id: mem.id,
            status: "active" as const,
            ministry_ids: [] as string[],
            role_ids: [] as string[],
            campus_ids: [] as string[],
            household_id: null,
            availability: {
              blockout_dates: [] as string[],
              recurring_unavailable: [] as string[],
              preferred_frequency: 2,
              max_roles_per_month: 8,
            },
            reminder_preferences: { channels: ["email" as const] },
            stats: {
              times_scheduled_last_90d: 0,
              last_served_date: null,
              decline_count: 0,
              no_show_count: 0,
            },
            imported_from: null,
            created_at: now,
          };
          const newRef = await addChurchDocument(churchId!, "volunteers", volData);
          setVolunteers((prev) => [...prev, { ...volData, id: newRef.id } as unknown as Volunteer]);
          volsByEmail.add(memEmail);
          volsByUserId.add(mem.user_id);
        }
      } catch {
        // silent
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [churchId]);

  const terms = getOrgTerms(orgType);

  // Collect unique roles from all services (for role assignment UI)
  const uniqueRoles = (() => {
    const seen = new Map<string, { role_id: string; title: string; ministry_id: string }>();
    for (const svc of services) {
      const svcMinistries = getServiceMinistries(svc);
      for (const sm of svcMinistries) {
        for (const role of sm.roles) {
          if (!seen.has(role.role_id)) {
            seen.set(role.role_id, { role_id: role.role_id, title: role.title, ministry_id: sm.ministry_id });
          }
        }
      }
    }
    return Array.from(seen.values());
  })();

  // Derived lists
  const activeMems = memberships.filter((m) => m.status === "active");
  const pendingMems = memberships.filter(
    (m) => m.status === "pending_org_approval" || m.status === "pending_volunteer_approval",
  );

  // Build unified roster: start with volunteers, enrich with membership data
  const rosterPeople = volunteers.map((v) => {
    const mem = v.membership_id
      ? memberships.find((m) => m.id === v.membership_id) || null
      : memberships.find((m) => m.volunteer_id === v.id) || null;
    return { volunteer: v, membership: mem };
  });

  const filteredRoster = rosterPeople.filter(({ volunteer: v }) => {
    // Status filter (default: active only)
    if (filterStatus !== "all" && v.status !== filterStatus) return false;
    // Team membership filter
    if (filterTeam === "on-team" && (!v.ministry_ids || v.ministry_ids.length === 0)) return false;
    if (filterTeam === "no-team" && v.ministry_ids && v.ministry_ids.length > 0) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const digits = q.replace(/\D/g, "");
      const nameMatch = v.name.toLowerCase().includes(q);
      const emailMatch = v.email.toLowerCase().includes(q);
      const phoneMatch = digits.length > 0 && v.phone?.replace(/\D/g, "").includes(digits);
      if (!nameMatch && !emailMatch && !phoneMatch) return false;
    }
    if (filterMinistries.length > 0) {
      if (!v.ministry_ids?.some((id) => filterMinistries.includes(id))) return false;
    }
    if (filterRoles.length > 0) {
      if (!v.role_ids?.some((id) => filterRoles.includes(id))) return false;
    }
    return true;
  });

  const activeFilterCount = filterMinistries.length + filterRoles.length
    + (filterStatus !== "active" ? 1 : 0)
    + (filterTeam !== "all" ? 1 : 0);

  // Helpers
  function getMinistryName(id: string) {
    return ministries.find((m) => m.id === id)?.name || id;
  }
  function getMinistryColor(id: string) {
    return ministries.find((m) => m.id === id)?.color || "#9A9BB5";
  }

  // Membership actions
  async function handleApprove(m: Membership) {
    await updateMembershipStatus(m.id, "active");
    setMemberships((prev) =>
      prev.map((x) => (x.id === m.id ? { ...x, status: "active" as const, updated_at: new Date().toISOString() } : x)),
    );

    // Create volunteer record so they appear on the Roster tab immediately
    if (m.user_id && churchId) {
      try {
        const memUser = await getDoc(doc(db, "users", m.user_id));
        const memEmail = memUser?.data()?.email?.toLowerCase() || "";
        const alreadyOnRoster = volunteers.some(
          (v) => v.user_id === m.user_id || (memEmail && v.email?.toLowerCase() === memEmail),
        );
        if (!alreadyOnRoster) {
          const now = new Date().toISOString();
          const volData = {
            church_id: churchId,
            name: memUser?.data()?.display_name || memEmail || "Member",
            email: memUser?.data()?.email || "",
            phone: memUser?.data()?.phone || null,
            user_id: m.user_id,
            membership_id: m.id,
            status: "active" as const,
            ministry_ids: [] as string[],
            role_ids: [] as string[],
            campus_ids: [] as string[],
            household_id: null,
            availability: {
              blockout_dates: [] as string[],
              recurring_unavailable: [] as string[],
              preferred_frequency: 2,
              max_roles_per_month: 8,
            },
            reminder_preferences: { channels: ["email" as const] },
            stats: {
              times_scheduled_last_90d: 0,
              last_served_date: null,
              decline_count: 0,
              no_show_count: 0,
            },
            imported_from: null,
            created_at: now,
          };
          const newRef = await addChurchDocument(churchId, "volunteers", volData);
          setVolunteers((prev) => [...prev, { ...volData, id: newRef.id } as unknown as Volunteer]);
        }
      } catch (err) {
        console.error("Failed to create volunteer record on approval:", err);
      }
    }

    // Fire-and-forget approval notification email
    getAuth().currentUser?.getIdToken().then((token) =>
      fetch("/api/notify/membership-approved", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ membership_id: m.id, church_id: m.church_id }),
      }).catch(() => {}),
    );
  }

  async function handleReject(m: Membership) {
    await deleteMembership(m.id);
    setMemberships((prev) => prev.filter((x) => x.id !== m.id));
  }

  async function handleChangeRole(m: Membership, newRole: OrgRole, ministryScope?: string[]) {
    const oldRole = m.role;
    await updateMembershipRole(m.id, newRole, ministryScope);
    setMemberships((prev) =>
      prev.map((x) => (x.id === m.id ? { ...x, role: newRole, ...(ministryScope !== undefined ? { ministry_scope: ministryScope } : {}), updated_at: new Date().toISOString() } : x)),
    );
    // Fire-and-forget role promotion notification
    if (newRole !== oldRole) {
      getAuth().currentUser?.getIdToken().then((token) =>
        fetch("/api/notify/role-change", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ membership_id: m.id, old_role: oldRole, new_role: newRole, church_id: m.church_id }),
        }).catch(() => {}),
      );
    }
  }

  async function handleRemoveMember(m: Membership) {
    if (!confirm(`Remove this member from ${churchName}?`)) return;
    await deleteMembership(m.id);
    setMemberships((prev) => prev.filter((x) => x.id !== m.id));
  }

  // Volunteer CRUD
  async function handleDeleteVolunteer(id: string) {
    if (!churchId) return;
    try {
      await removeChurchDocument(churchId, "volunteers", id);
      setVolunteers((prev) => prev.filter((v) => v.id !== id));
    } catch {
      // silent
    }
  }

  async function handleArchiveVolunteer(id: string) {
    if (!churchId) return;
    const vol = volunteers.find((v) => v.id === id);
    if (!vol) return;
    if (!confirm(`Archive ${vol.name}? They'll be removed from all teams and excluded from future scheduling and event invitations. They can still see the organization. You can restore them later.`)) return;
    try {
      const token = await getAuth().currentUser?.getIdToken();
      const res = await fetch(`/api/volunteers/${id}/archive`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ church_id: churchId, action: "archive" }),
      });
      if (res.ok) {
        setVolunteers((prev) =>
          prev.map((v) => v.id === id ? { ...v, status: "archived" as const, ministry_ids: [], role_ids: [] } : v),
        );
      }
    } catch {
      // silent
    }
  }

  async function handleRestoreVolunteer(id: string) {
    if (!churchId) return;
    try {
      const token = await getAuth().currentUser?.getIdToken();
      const res = await fetch(`/api/volunteers/${id}/archive`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ church_id: churchId, action: "restore" }),
      });
      if (res.ok) {
        setVolunteers((prev) =>
          prev.map((v) => v.id === id ? { ...v, status: "active" as const } : v),
        );
      }
    } catch {
      // silent
    }
  }

  async function handleRemoveFromOrg(id: string) {
    if (!churchId) return;
    const vol = volunteers.find((v) => v.id === id);
    if (!vol) return;
    if (!confirm(`Remove ${vol.name} from this organization? They will lose all access and won't be able to see the organization unless re-invited. This cannot be undone.`)) return;
    try {
      const token = await getAuth().currentUser?.getIdToken();
      const res = await fetch(`/api/volunteers/${id}/remove`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ church_id: churchId }),
      });
      if (res.ok) {
        setVolunteers((prev) => prev.filter((v) => v.id !== id));
      }
    } catch {
      // silent
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!canViewRoster) {
    return (
      <div className="text-center py-20">
        <h1 className="font-display text-2xl text-vc-indigo mb-2">Access Denied</h1>
        <p className="text-vc-text-secondary">Only schedulers, admins, and owners can view people.</p>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-3xl text-vc-indigo">People</h1>
          <p className="mt-1 text-vc-text-secondary">
            {volunteers.filter(v => v.status !== "archived").length} active · {volunteers.filter(v => v.status === "archived").length} archived · {pendingMems.length} pending
          </p>
        </div>
        {canManage && addMode === null && (
          <AddPeopleMenu onSelect={(mode) => {
            if (mode === "individual") {
              setTab("invites");
            } else {
              setAddMode(mode);
            }
          }} />
        )}
      </div>

      {/* Import modals */}
      <CSVImportModal
        open={addMode === "csv" && canManage}
        churchId={churchId!}
        onQueued={() => {
          setAddMode(null);
          loadQueueItems();
        }}
        onCancel={() => setAddMode(null)}
      />

      <ChMSImportModal
        open={addMode === "chms" && canManage}
        churchId={churchId!}
        user={user}
        onDone={() => {
          setAddMode(null);
          loadQueueItems();
        }}
        onCancel={() => setAddMode(null)}
      />

      {/* Queue banner */}
      {canManage && queueItems.length > 0 && !showQueuePanel && (
        <div className="mb-4 flex items-center justify-between rounded-xl border border-vc-coral/20 bg-vc-coral/5 px-5 py-3">
          <div className="flex items-center gap-3">
            <svg className="h-5 w-5 text-vc-coral" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
            </svg>
            <p className="text-sm font-medium text-vc-indigo">
              You have <strong>{queueItems.length}</strong> {queueItems.length === 1 ? "person" : "people"} pending review
            </p>
          </div>
          <Button onClick={() => setShowQueuePanel(true)}>
            Review Queue
          </Button>
        </div>
      )}

      {/* Queue review drawer */}
      {canManage && (
        <InviteQueueDrawer
          open={showQueuePanel}
          onClose={() => setShowQueuePanel(false)}
          churchId={churchId!}
          user={user}
          items={queueItems}
          ministries={ministries}
          onRefresh={() => {
            loadQueueItems();
            if (churchId) {
              getChurchDocuments(churchId, "volunteers").then((vols) =>
                setVolunteers(vols as unknown as Volunteer[]),
              );
            }
          }}
        />
      )}

      {/* Tabs */}
      <div className="mb-4 flex gap-1 rounded-xl bg-vc-bg-warm p-1">
        <button
          onClick={() => setTab("roster")}
          className={`flex-1 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
            tab === "roster" ? "bg-white text-vc-indigo shadow-sm" : "text-vc-text-secondary"
          }`}
        >
          Roster ({volunteers.length})
        </button>
        {canManage && (
          <button
            onClick={() => setTab("invites")}
            className={`flex-1 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              tab === "invites" ? "bg-white text-vc-indigo shadow-sm" : "text-vc-text-secondary"
            }`}
          >
            Invites ({pendingMems.length})
          </button>
        )}
        {canManage && (
          <button
            onClick={() => setTab("families")}
            className={`flex-1 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              tab === "families" ? "bg-white text-vc-indigo shadow-sm" : "text-vc-text-secondary"
            }`}
          >
            Families ({households.length})
          </button>
        )}
      </div>

      {/* === ROSTER TAB === */}
      {tab === "roster" && (
        <>
          {/* Search & Filters */}
          <div className="mb-4 space-y-3">
            <div className="flex items-center gap-2">
              <input
                type="search"
                placeholder="Search by name, email, or phone..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="min-w-0 flex-1 rounded-lg border border-vc-border bg-white px-3 py-2.5 text-sm text-vc-text placeholder:text-vc-text-muted focus:border-vc-coral focus:outline-none focus:ring-2 focus:ring-vc-coral/20"
              />
              {(ministries.length > 0 || uniqueRoles.length > 0) && (
                <button
                  onClick={() => setShowFilters(!showFilters)}
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors ${
                    showFilters || activeFilterCount > 0
                      ? "border-vc-coral bg-vc-coral/10 text-vc-coral"
                      : "border-vc-border text-vc-text-secondary hover:border-vc-indigo/20"
                  }`}
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 3c2.755 0 5.455.232 8.083.678.533.09.917.556.917 1.096v1.044a2.25 2.25 0 0 1-.659 1.591l-5.432 5.432a2.25 2.25 0 0 0-.659 1.591v2.927a2.25 2.25 0 0 1-1.244 2.013L9.75 21v-6.568a2.25 2.25 0 0 0-.659-1.591L3.659 7.409A2.25 2.25 0 0 1 3 5.818V4.774c0-.54.384-1.006.917-1.096A48.32 48.32 0 0 1 12 3Z" />
                  </svg>
                  Filter
                  {activeFilterCount > 0 && (
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-vc-coral text-[10px] font-bold text-white">
                      {activeFilterCount}
                    </span>
                  )}
                </button>
              )}
            </div>

            {showFilters && (
              <div className="rounded-xl border border-vc-border-light bg-white p-4 space-y-4">
                {/* Status & Team filters */}
                <div className="flex flex-wrap gap-4">
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-vc-text-muted">
                      Status
                    </label>
                    <select
                      value={filterStatus}
                      onChange={(e) => setFilterStatus(e.target.value as "active" | "archived" | "all")}
                      className="rounded-lg border border-vc-border bg-white px-3 py-2 text-sm text-vc-text focus:border-vc-coral focus:outline-none focus:ring-2 focus:ring-vc-coral/20 min-h-[44px]"
                    >
                      <option value="active">Active</option>
                      <option value="archived">Archived</option>
                      <option value="all">All</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-vc-text-muted">
                      Team
                    </label>
                    <select
                      value={filterTeam}
                      onChange={(e) => setFilterTeam(e.target.value as "all" | "on-team" | "no-team")}
                      className="rounded-lg border border-vc-border bg-white px-3 py-2 text-sm text-vc-text focus:border-vc-coral focus:outline-none focus:ring-2 focus:ring-vc-coral/20 min-h-[44px]"
                    >
                      <option value="all">All</option>
                      <option value="on-team">On a Team</option>
                      <option value="no-team">Not on Any Team</option>
                    </select>
                  </div>
                </div>

                {ministries.length > 0 && (
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-vc-text-muted">
                      {terms.plural}
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {ministries.map((m) => (
                        <button
                          key={m.id}
                          onClick={() =>
                            setFilterMinistries((prev) =>
                              prev.includes(m.id) ? prev.filter((x) => x !== m.id) : [...prev, m.id],
                            )
                          }
                          className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-all min-h-[44px] ${
                            filterMinistries.includes(m.id)
                              ? "border-transparent text-white"
                              : "border-vc-border text-vc-text-secondary hover:border-vc-indigo/20"
                          }`}
                          style={filterMinistries.includes(m.id) ? { backgroundColor: m.color } : undefined}
                        >
                          <span
                            className="h-2.5 w-2.5 shrink-0 rounded-full"
                            style={{ backgroundColor: filterMinistries.includes(m.id) ? "white" : m.color }}
                          />
                          {m.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {uniqueRoles.length > 0 && (
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-vc-text-muted">
                      Roles
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {uniqueRoles.map((r) => (
                        <button
                          key={r.role_id}
                          onClick={() =>
                            setFilterRoles((prev) =>
                              prev.includes(r.role_id) ? prev.filter((x) => x !== r.role_id) : [...prev, r.role_id],
                            )
                          }
                          className={`inline-flex items-center rounded-lg border px-3 py-1.5 text-sm font-medium transition-all min-h-[44px] ${
                            filterRoles.includes(r.role_id)
                              ? "border-vc-coral bg-vc-coral/10 text-vc-coral"
                              : "border-vc-border text-vc-text-secondary hover:border-vc-indigo/20"
                          }`}
                        >
                          {r.title}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {activeFilterCount > 0 && (
                  <button
                    onClick={() => { setFilterMinistries([]); setFilterRoles([]); setFilterStatus("active"); setFilterTeam("all"); }}
                    className="text-xs font-medium text-vc-coral hover:text-vc-coral-dark transition-colors"
                  >
                    Clear all filters
                  </button>
                )}
              </div>
            )}
          </div>

          {/* UX messaging for filter states */}
          {filterStatus === "archived" && (
            <div className="mb-4 flex items-start gap-3 rounded-xl border border-vc-border-light bg-vc-bg-warm px-5 py-3">
              <svg className="mt-0.5 h-4 w-4 shrink-0 text-vc-text-muted" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="m20.25 7.5-.625 10.632a2.25 2.25 0 0 1-2.247 2.118H6.622a2.25 2.25 0 0 1-2.247-2.118L3.75 7.5m8.25 3v6.75m0 0-3-3m3 3 3-3M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125Z" />
              </svg>
              <p className="text-sm text-vc-text-secondary">
                Archived volunteers are excluded from scheduling, team rosters, and event invitations. They can still see the organization but won&apos;t receive any assignments.
              </p>
            </div>
          )}
          {filterTeam === "no-team" && filterStatus !== "archived" && (
            <div className="mb-4 flex items-start gap-3 rounded-xl border border-vc-border-light bg-vc-bg-warm px-5 py-3">
              <svg className="mt-0.5 h-4 w-4 shrink-0 text-vc-text-muted" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z" />
              </svg>
              <p className="text-sm text-vc-text-secondary">
                These volunteers are active but not assigned to any team. They can still be invited to Events and will appear in your organization.
              </p>
            </div>
          )}

          {volunteers.length === 0 && addMode === null ? (
            <div className="rounded-xl border border-dashed border-vc-border bg-white p-12 text-center">
              <p className="text-vc-text-secondary">No people in your roster yet.</p>
              <p className="mt-1 text-sm text-vc-text-muted">
                Add people individually, import from CSV, or connect a church management system.
              </p>
            </div>
          ) : (
            <div className="rounded-xl border border-vc-border-light bg-white">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-vc-border-light">
                      <th className="w-[20%] px-5 py-3 text-xs font-semibold uppercase tracking-wider text-vc-text-muted">Name</th>
                      <th className="w-[22%] px-5 py-3 text-xs font-semibold uppercase tracking-wider text-vc-text-muted">Email</th>
                      <th className="hidden w-[14%] px-5 py-3 text-xs font-semibold uppercase tracking-wider text-vc-text-muted sm:table-cell">Phone</th>
                      <th className="w-[12%] px-5 py-3 text-xs font-semibold uppercase tracking-wider text-vc-text-muted">Role</th>
                      <th className="w-[18%] px-5 py-3 text-xs font-semibold uppercase tracking-wider text-vc-text-muted">{terms.plural}</th>
                      {canManage && (
                        <th className="w-[14%] px-5 py-3 text-xs font-semibold uppercase tracking-wider text-vc-text-muted">Actions</th>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-vc-border-light">
                    {filteredRoster.map(({ volunteer: v, membership: mem }) => (
                      <RosterRow
                        key={v.id}
                        volunteer={v}
                        membership={mem}
                        canManage={canManage}
                        getMinistryName={getMinistryName}
                        getMinistryColor={getMinistryColor}
                        onDelete={() => handleDeleteVolunteer(v.id)}
                        onArchive={() => handleArchiveVolunteer(v.id)}
                        onRestore={() => handleRestoreVolunteer(v.id)}
                        onRemoveFromOrg={() => handleRemoveFromOrg(v.id)}
                        churchId={churchId!}
                        ministries={ministries}
                        availableRoles={uniqueRoles}
                        onUpdated={(updated) =>
                          setVolunteers((prev) =>
                            prev.map((x) => (x.id === updated.id ? updated : x)),
                          )
                        }
                      />
                    ))}
                  </tbody>
                </table>
              </div>
              {filteredRoster.length === 0 && (searchQuery || activeFilterCount > 0) && (
                <div className="px-5 py-8 text-center text-sm text-vc-text-muted">
                  No people match your search{activeFilterCount > 0 ? " and filters" : ""}.
                  {activeFilterCount > 0 && (
                    <button
                      onClick={() => { setFilterMinistries([]); setFilterRoles([]); setFilterStatus("active"); setFilterTeam("all"); setSearchQuery(""); }}
                      className="ml-1 font-medium text-vc-coral hover:text-vc-coral-dark transition-colors"
                    >
                      Clear all
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Share join link */}
          {canManage && (
            <JoinLinkSection churchId={churchId!} churchName={churchName} churchTier={churchTier} />
          )}
        </>
      )}

      {/* === INVITES TAB === */}
      {tab === "invites" && canManage && (
        <>
          {/* Invite form */}
          <InviteForm
            churchId={churchId!}
            user={user}
            ministries={ministries}
            onInvited={() => {
              if (churchId) {
                getChurchMemberships(churchId).then(setMemberships);
              }
            }}
          />

          <div className="mt-6 space-y-2">
            {pendingMems.length === 0 ? (
              <div className="rounded-xl border border-vc-border-light bg-white p-8 text-center">
                <p className="text-vc-text-muted">No pending requests or invitations.</p>
              </div>
            ) : (
              pendingMems.map((m) => (
                <MemberRow
                  key={m.id}
                  membership={m}
                  ministries={ministries}
                  isCurrentUser={m.user_id === user?.uid}
                  onApprove={() => handleApprove(m)}
                  onReject={() => handleReject(m)}
                  onChangeRole={(role, scope) => handleChangeRole(m, role, scope)}
                  onRemove={() => handleRemoveMember(m)}
                />
              ))
            )}
          </div>
        </>
      )}

      {/* === FAMILIES TAB === */}
      {tab === "families" && canManage && (
        <>
          <div className="mb-4 flex items-center justify-between">
            <p className="text-sm text-vc-text-secondary">
              {households.length === 0
                ? "No families defined yet. Add a family to set household scheduling constraints."
                : `${households.length} ${households.length === 1 ? "family" : "families"}`}
            </p>
            <Button
              size="sm"
              onClick={() => {
                setEditingHousehold(undefined);
                setHouseholdModalOpen(true);
              }}
            >
              <span className="flex items-center gap-1.5">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
                Add Family
              </span>
            </Button>
          </div>

          {households.length === 0 ? (
            <div className="rounded-xl border border-dashed border-vc-border bg-white p-12 text-center">
              <svg className="mx-auto mb-3 h-10 w-10 text-vc-text-muted" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 12 8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
              </svg>
              <p className="text-vc-text-secondary">No families yet.</p>
              <p className="mt-1 text-sm text-vc-text-muted">
                Group volunteers into families to control how household members are scheduled together.
              </p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {households.map((hh) => (
                <HouseholdCard
                  key={hh.id}
                  household={hh}
                  volunteers={volunteers}
                  onEdit={() => {
                    setEditingHousehold(hh);
                    setHouseholdModalOpen(true);
                  }}
                  onDelete={async () => {
                    if (!churchId) return;
                    if (!confirm(`Delete the ${hh.name} family?`)) return;
                    await removeChurchDocument(churchId, "households", hh.id);
                    setHouseholds((prev) => prev.filter((h) => h.id !== hh.id));
                  }}
                />
              ))}
            </div>
          )}

          <HouseholdFormModal
            open={householdModalOpen}
            onClose={() => {
              setHouseholdModalOpen(false);
              setEditingHousehold(undefined);
            }}
            volunteers={volunteers}
            existingHousehold={editingHousehold}
            onSave={async (data) => {
              if (!churchId || !user) return;
              if (editingHousehold) {
                await updateChurchDocument(churchId, "households", editingHousehold.id, {
                  ...data,
                  updated_by: user.uid,
                });
                setHouseholds((prev) =>
                  prev.map((h) =>
                    h.id === editingHousehold.id
                      ? { ...h, ...data, updated_by: user.uid }
                      : h,
                  ),
                );
              } else {
                const now = new Date().toISOString();
                const docData = {
                  ...data,
                  church_id: churchId,
                  created_at: now,
                  updated_by: user.uid,
                };
                const ref = await addChurchDocument(churchId, "households", docData);
                setHouseholds((prev) => [...prev, { ...docData, id: ref.id } as Household]);
              }
              setHouseholdModalOpen(false);
              setEditingHousehold(undefined);
            }}
          />
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Household Card
// ---------------------------------------------------------------------------

function HouseholdCard({
  household,
  volunteers,
  onEdit,
  onDelete,
}: {
  household: Household;
  volunteers: Volunteer[];
  onEdit: () => void;
  onDelete: () => void;
}) {
  const memberNames = household.volunteer_ids
    .map((id) => volunteers.find((v) => v.id === id)?.name)
    .filter(Boolean);

  const constraintBadges: { label: string; color: string }[] = [];
  if (household.constraints.never_same_service) {
    constraintBadges.push({ label: "Never together", color: "bg-vc-coral/10 text-vc-coral" });
  }
  if (household.constraints.prefer_same_service) {
    constraintBadges.push({ label: "Prefer together", color: "bg-vc-sage/15 text-vc-sage" });
  }
  if (household.constraints.never_same_time) {
    constraintBadges.push({ label: "Never same day", color: "bg-amber-100 text-amber-700" });
  }

  return (
    <div className="rounded-xl border border-vc-border-light bg-white p-4 transition-shadow hover:shadow-md">
      <div className="mb-3 flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-lg text-vc-indigo">{household.name}</h3>
          <p className="mt-0.5 text-xs text-vc-text-muted">
            {household.volunteer_ids.length} {household.volunteer_ids.length === 1 ? "member" : "members"}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={onEdit}
            className="inline-flex min-h-[44px] items-center px-2 text-xs font-medium text-vc-text-secondary transition-colors hover:text-vc-coral"
          >
            Edit
          </button>
          <button
            onClick={onDelete}
            className="inline-flex min-h-[44px] items-center px-2 text-xs font-medium text-vc-text-muted transition-colors hover:text-vc-danger"
          >
            Delete
          </button>
        </div>
      </div>

      {/* Member names */}
      {memberNames.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1">
          {memberNames.map((n, i) => (
            <span
              key={i}
              className="inline-flex items-center rounded-full bg-vc-indigo/8 px-2 py-0.5 text-xs font-medium text-vc-indigo"
            >
              {n}
            </span>
          ))}
        </div>
      )}

      {/* Constraint badges */}
      {constraintBadges.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {constraintBadges.map((b) => (
            <span
              key={b.label}
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${b.color}`}
            >
              {b.label}
            </span>
          ))}
        </div>
      )}

      {/* Notes */}
      {household.notes && (
        <p className="mt-2 text-xs text-vc-text-muted line-clamp-2">{household.notes}</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Roster Row
// ---------------------------------------------------------------------------

function RosterRow({
  volunteer: v,
  membership: mem,
  canManage,
  getMinistryName,
  getMinistryColor,
  onDelete,
  onArchive,
  onRestore,
  onRemoveFromOrg,
  churchId,
  ministries,
  availableRoles,
  onUpdated,
}: {
  volunteer: Volunteer;
  membership: Membership | null;
  canManage: boolean;
  getMinistryName: (id: string) => string;
  getMinistryColor: (id: string) => string;
  onDelete: () => void;
  onArchive: () => void;
  onRestore: () => void;
  onRemoveFromOrg: () => void;
  churchId: string;
  ministries: Ministry[];
  availableRoles: { role_id: string; title: string; ministry_id: string }[];
  onUpdated: (v: Volunteer) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [showActions, setShowActions] = useState(false);
  const isArchived = v.status === "archived";

  return (
    <>
      <tr className={`transition-colors ${isArchived ? "opacity-60 bg-vc-bg-warm/30" : "hover:bg-vc-bg-warm/50"}`}>
        <td className="px-5 py-3">
          <div className="flex items-center gap-2">
            <span className={`font-medium ${isArchived ? "text-vc-text-muted" : "text-vc-indigo"}`}>{v.name}</span>
            {isArchived && (
              <span className="inline-flex items-center rounded-full bg-vc-bg-warm px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-vc-text-muted">
                Archived
              </span>
            )}
          </div>
        </td>
        <td className="px-5 py-3 text-vc-text-secondary">{v.email || "\u2014"}</td>
        <td className="hidden px-5 py-3 text-vc-text-secondary sm:table-cell">{formatPhone(v.phone)}</td>
        <td className="px-5 py-3">
          {mem ? (
            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
              STATUS_LABELS[mem.status]?.color || "bg-vc-bg-cream text-vc-text-muted"
            }`}>
              {ROLE_LABELS[mem.role]}
            </span>
          ) : (
            <span className="text-xs text-vc-text-muted">Roster only</span>
          )}
        </td>
        <td className="px-5 py-3">
          <div className="flex flex-wrap gap-1">
            {v.ministry_ids.length > 0 ? (
              v.ministry_ids.map((mid) => (
                <span
                  key={mid}
                  className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium"
                  style={{ backgroundColor: getMinistryColor(mid) + "15", color: getMinistryColor(mid) }}
                >
                  {getMinistryName(mid)}
                </span>
              ))
            ) : (
              <span className="text-xs text-vc-text-muted">None</span>
            )}
          </div>
        </td>
        {canManage && (
          <td className="px-5 py-3">
            <div className="relative flex items-center gap-1">
              {!isArchived && (
                <button
                  onClick={() => setEditing(true)}
                  className="inline-flex items-center min-h-[44px] px-2 text-xs font-medium text-vc-text-secondary hover:text-vc-coral transition-colors"
                >
                  Edit
                </button>
              )}
              {isArchived && (
                <button
                  onClick={onRestore}
                  className="inline-flex items-center min-h-[44px] px-2 text-xs font-medium text-vc-sage hover:text-vc-sage/80 transition-colors"
                >
                  Restore
                </button>
              )}
              <button
                onClick={() => setShowActions(!showActions)}
                className="inline-flex items-center justify-center min-h-[44px] min-w-[44px] rounded-lg text-vc-text-muted hover:text-vc-indigo hover:bg-vc-bg-warm transition-colors"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.75a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5ZM12 12.75a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5ZM12 18.75a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5Z" />
                </svg>
              </button>
              {showActions && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setShowActions(false)} />
                  <div className="absolute right-0 top-full z-40 mt-1 w-48 rounded-xl border border-vc-border-light bg-white py-1 shadow-xl shadow-black/[0.08]">
                    {!isArchived && (
                      <button
                        onClick={() => { setShowActions(false); onArchive(); }}
                        className="flex w-full items-center gap-2 px-3 py-2 text-sm text-vc-text-secondary hover:bg-vc-bg-warm transition-colors"
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="m20.25 7.5-.625 10.632a2.25 2.25 0 0 1-2.247 2.118H6.622a2.25 2.25 0 0 1-2.247-2.118L3.75 7.5m8.25 3v6.75m0 0-3-3m3 3 3-3M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125Z" />
                        </svg>
                        Archive
                      </button>
                    )}
                    {isArchived && (
                      <button
                        onClick={() => { setShowActions(false); onRestore(); }}
                        className="flex w-full items-center gap-2 px-3 py-2 text-sm text-vc-sage hover:bg-vc-bg-warm transition-colors"
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 15 3 9m0 0 6-6M3 9h12a6 6 0 0 1 0 12h-3" />
                        </svg>
                        Restore
                      </button>
                    )}
                    <button
                      onClick={() => { setShowActions(false); onRemoveFromOrg(); }}
                      className="flex w-full items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M22 10.5h-6m-2.25-4.125a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0ZM4 19.235v-.11a6.375 6.375 0 0 1 12.75 0v.109A12.318 12.318 0 0 1 10.374 21c-2.331 0-4.512-.645-6.374-1.766Z" />
                      </svg>
                      Remove from Organization
                    </button>
                  </div>
                </>
              )}
            </div>
          </td>
        )}
      </tr>
      {canManage && !isArchived && (
        <VolunteerEditModal
          open={editing}
          onClose={() => setEditing(false)}
          volunteer={v}
          churchId={churchId}
          ministries={ministries}
          availableRoles={availableRoles}
          getMinistryName={getMinistryName}
          getMinistryColor={getMinistryColor}
          onUpdated={(updated) => {
            onUpdated(updated);
            setEditing(false);
          }}
          onDelete={onDelete}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Add Individual Panel
// ---------------------------------------------------------------------------

function AddPeopleMenu({ onSelect }: { onSelect: (mode: "individual" | "csv" | "chms") => void }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <Button onClick={() => setOpen(!open)}>
        <span className="flex items-center gap-1.5">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Add People
        </span>
      </Button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-40 mt-2 w-64 rounded-xl border border-vc-border-light bg-white p-2 shadow-xl shadow-black/[0.08]">
            <button
              onClick={() => { setOpen(false); onSelect("individual"); }}
              className="flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-vc-bg-warm"
            >
              <svg className="mt-0.5 h-4 w-4 shrink-0 text-vc-coral" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M18 7.5v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0ZM3 19.235v-.11a6.375 6.375 0 0 1 12.75 0v.109A12.318 12.318 0 0 1 9.374 21c-2.331 0-4.512-.645-6.374-1.766Z" />
              </svg>
              <div>
                <p className="text-sm font-medium text-vc-indigo">Add person</p>
                <p className="text-xs text-vc-text-muted">Add and send email invitation</p>
              </div>
            </button>
            <button
              onClick={() => { setOpen(false); onSelect("csv"); }}
              className="flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-vc-bg-warm"
            >
              <svg className="mt-0.5 h-4 w-4 shrink-0 text-vc-coral" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
              </svg>
              <div>
                <p className="text-sm font-medium text-vc-indigo">Import CSV</p>
                <p className="text-xs text-vc-text-muted">Upload a spreadsheet</p>
              </div>
            </button>
            <button
              onClick={() => { setOpen(false); onSelect("chms"); }}
              className="flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-vc-bg-warm"
            >
              <svg className="mt-0.5 h-4 w-4 shrink-0 text-vc-coral" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244" />
              </svg>
              <div>
                <p className="text-sm font-medium text-vc-indigo">Import from ChMS</p>
                <p className="text-xs text-vc-text-muted">Planning Center, Breeze, Rock RMS</p>
              </div>
            </button>
          </div>
        </>
      )}
    </div>
  );
}



// ---------------------------------------------------------------------------
// Invite Form (for Invites tab)
// ---------------------------------------------------------------------------

function InviteForm({
  churchId,
  user,
  ministries,
  onInvited,
}: {
  churchId: string;
  user: ReturnType<typeof useAuth>["user"];
  ministries: Ministry[];
  onInvited: () => void;
}) {
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteRole, setInviteRole] = useState<OrgRole>("volunteer");
  const [inviting, setInviting] = useState(false);
  const [inviteMsg, setInviteMsg] = useState("");
  const [inviteScopeAll, setInviteScopeAll] = useState(true);
  const [inviteScopeIds, setInviteScopeIds] = useState<string[]>([]);

  async function handleInvite(e: FormEvent) {
    e.preventDefault();
    if (!user) return;
    setInviting(true);
    setInviteMsg("");

    try {
      const token = await getAuth().currentUser?.getIdToken();
      const ministryScope = inviteRole === "scheduler" && !inviteScopeAll ? inviteScopeIds : undefined;
      const res = await fetch("/api/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ email: inviteEmail, name: inviteName, churchId, role: inviteRole, ministryScope }),
      });
      const data = await res.json();
      if (!res.ok) {
        setInviteMsg(data.error || "Failed to send invitation");
      } else {
        setInviteMsg(data.action === "approved_existing" ? "Member approved!" : "Invitation sent!");
        setInviteEmail("");
        setInviteName("");
        setInviteRole("volunteer");
        setInviteScopeAll(true);
        setInviteScopeIds([]);
        onInvited();
      }
    } catch {
      setInviteMsg("Failed to send invitation");
    } finally {
      setInviting(false);
    }
  }

  return (
    <div className="rounded-xl border border-vc-border-light bg-white p-6">
      <h2 className="text-lg font-semibold text-vc-indigo mb-4">Invite a New Member</h2>
      <form onSubmit={handleInvite} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Email"
            type="email"
            required
            placeholder="volunteer@example.com"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
          />
          <Input
            label="Name (optional)"
            placeholder="Jane Doe"
            value={inviteName}
            onChange={(e) => setInviteName(e.target.value)}
          />
        </div>
        <div>
          <label className="text-sm font-medium text-vc-text mb-2 block">Role</label>
          <div className="flex flex-wrap gap-2">
            {(["volunteer", "scheduler", "admin"] as OrgRole[]).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setInviteRole(r)}
                className={`rounded-lg border px-4 py-2 text-sm font-medium transition-all ${
                  inviteRole === r
                    ? "border-vc-coral bg-vc-coral/5 text-vc-indigo ring-1 ring-vc-coral"
                    : "border-vc-border text-vc-text-secondary hover:border-vc-indigo/20"
                }`}
              >
                {ROLE_LABELS[r]}
              </button>
            ))}
          </div>
        </div>
        {inviteRole === "scheduler" && ministries.length > 0 && (
          <div>
            <label className="text-sm font-medium text-vc-text mb-2 block">Team Access</label>
            <label className="flex items-center gap-2 mb-2">
              <input
                type="checkbox"
                checked={inviteScopeAll}
                onChange={(e) => {
                  setInviteScopeAll(e.target.checked);
                  if (e.target.checked) setInviteScopeIds([]);
                }}
                className="rounded border-vc-border text-vc-coral focus:ring-vc-coral"
              />
              <span className="text-sm text-vc-text-secondary">All Teams</span>
            </label>
            {!inviteScopeAll && (
              <div className="space-y-2 pl-1">
                {ministries.map((m) => (
                  <label key={m.id} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={inviteScopeIds.includes(m.id)}
                      onChange={(e) => {
                        setInviteScopeIds((prev) =>
                          e.target.checked ? [...prev, m.id] : prev.filter((id) => id !== m.id),
                        );
                      }}
                      className="rounded border-vc-border text-vc-coral focus:ring-vc-coral"
                    />
                    <span className="text-sm text-vc-text-secondary">{m.name}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        )}
        {inviteMsg && (
          <p className={`text-sm ${inviteMsg.includes("sent") || inviteMsg.includes("approved") ? "text-vc-sage" : "text-vc-danger"}`}>
            {inviteMsg}
          </p>
        )}
        <Button type="submit" loading={inviting}>Send Invitation</Button>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Join Link Section
// ---------------------------------------------------------------------------

function JoinLinkSection({ churchId, churchName, churchTier }: { churchId: string; churchName: string; churchTier: string }) {
  const { user } = useAuth();
  const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
  const joinLink = `${baseUrl}/join/${churchId}`;
  const [copied, setCopied] = useState(false);
  const [showShareMenu, setShowShareMenu] = useState(false);
  const [showShortLinkCreator, setShowShortLinkCreator] = useState(false);
  const [joinShortLinkUrl, setJoinShortLinkUrl] = useState<string | null>(null);
  const shareRef = useRef<HTMLDivElement>(null);

  // Fetch short link for join URL
  useEffect(() => {
    if (!churchId || !user) return;
    async function fetchShortLink() {
      try {
        const token = await user!.getIdToken();
        const res = await fetch(`/api/short-links?church_id=${churchId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          const joinPath = `/join/${churchId}`;
          const match = (data.links || []).find((l: { target_url: string }) => l.target_url === joinPath);
          if (match) {
            setJoinShortLinkUrl(`${window.location.origin}/s/${match.slug}`);
          }
        }
      } catch {
        // silent
      }
    }
    fetchShortLink();
  }, [churchId, user]);

  // Close share menu on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (shareRef.current && !shareRef.current.contains(e.target as Node)) {
        setShowShareMenu(false);
      }
    }
    if (showShareMenu) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showShareMenu]);

  const hasShortLink = !!joinShortLinkUrl;

  function handleCopy() {
    const urlToCopy = hasShortLink ? joinShortLinkUrl! : joinLink;
    navigator.clipboard.writeText(urlToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handlePrintFlyer() {
    setShowShareMenu(false);
    const { printFlyer } = await import("@/lib/utils/print-flyer");
    printFlyer({
      title: "Volunteer With Us!",
      subtitle: "Scan the QR code to sign up as a volunteer.",
      orgName: churchName,
      url: joinLink,
      shortUrl: joinShortLinkUrl || undefined,
      instructions: [
        "Scan the QR code with your phone camera",
        "Create a free account (or sign in)",
        "Request to join — we'll approve you shortly!",
      ],
    });
  }

  async function handleDownloadSlide() {
    setShowShareMenu(false);
    const { downloadSlide } = await import("@/lib/utils/download-slide");
    downloadSlide({
      title: "Volunteer With Us!",
      subtitle: "Scan the QR code to sign up as a volunteer.",
      orgName: churchName,
      url: joinLink,
      shortUrl: joinShortLinkUrl || undefined,
    });
  }

  const menuBtnClass = "w-full px-3 py-2.5 text-left text-sm text-vc-text-secondary hover:bg-vc-bg-warm transition-colors flex items-center gap-2";

  return (
    <div className="mt-6 rounded-xl border border-dashed border-vc-border bg-vc-bg-warm p-5">
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-medium text-vc-indigo">Share join link</p>
        <div className="relative" ref={shareRef}>
          <button
            onClick={() => setShowShareMenu(!showShareMenu)}
            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-vc-text-secondary hover:bg-white hover:text-vc-indigo transition-colors"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 1 0 0 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186 9.566-5.314m-9.566 7.5 9.566 5.314m0 0a2.25 2.25 0 1 0 3.935 2.186 2.25 2.25 0 0 0-3.935-2.186Zm0-12.814a2.25 2.25 0 1 0 3.933-2.185 2.25 2.25 0 0 0-3.933 2.185Z" />
            </svg>
            Share options
          </button>
          {showShareMenu && (
            <div className="absolute right-0 top-full mt-1 z-10 w-52 rounded-xl border border-vc-border-light bg-white py-1 shadow-lg">
              {/* 1. Short link (create or edit) — first with premium badge */}
              <button
                onClick={() => { setShowShareMenu(false); setShowShortLinkCreator(true); }}
                className={menuBtnClass}
              >
                <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244" />
                </svg>
                <span className="flex items-center gap-1.5">
                  {hasShortLink ? "Edit short link" : "Create short link"}
                  {!hasShortLink && (
                    <span className="rounded bg-vc-coral/10 px-1 py-0.5 text-[10px] font-semibold uppercase leading-none text-vc-coral">
                      Pro
                    </span>
                  )}
                </span>
              </button>

              {/* 2. Copy link / Copy short link */}
              <button
                onClick={() => { handleCopy(); setShowShareMenu(false); }}
                className={menuBtnClass}
              >
                {copied ? (
                  <svg className="h-4 w-4 shrink-0 text-vc-sage" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                  </svg>
                ) : (
                  <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244" />
                  </svg>
                )}
                {copied ? "Copied!" : hasShortLink ? "Copy short link" : "Copy link"}
              </button>

              {/* 3. Print QR flyer */}
              <button
                onClick={handlePrintFlyer}
                className={menuBtnClass}
              >
                <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0 1 10.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0 .229 2.523a1.125 1.125 0 0 1-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0 0 21 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 0 0-1.913-.247M6.34 18H5.25A2.25 2.25 0 0 1 3 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.041 48.041 0 0 1 1.913-.247m10.5 0a48.536 48.536 0 0 0-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M18 10.5h.008v.008H18V10.5Zm-3 0h.008v.008H15V10.5Z" />
                </svg>
                Print QR flyer
              </button>

              {/* 4. Download slide */}
              <button
                onClick={handleDownloadSlide}
                className={menuBtnClass}
              >
                <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
                </svg>
                Download slide (16:9)
              </button>
            </div>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <input
          readOnly
          value={hasShortLink ? joinShortLinkUrl! : joinLink}
          className="flex-1 rounded-lg border border-vc-border bg-white px-3 py-2 text-sm text-vc-text-secondary"
          onClick={(e) => (e.target as HTMLInputElement).select()}
        />
        <button
          onClick={handleCopy}
          className={`shrink-0 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
            copied
              ? "border-vc-sage/30 bg-vc-sage/10 text-vc-sage"
              : "border-vc-border text-vc-text-secondary hover:bg-white"
          }`}
        >
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
      <p className="mt-1 text-xs text-vc-text-muted">
        Anyone with this link can request to join. You'll need to approve them.
      </p>

      {showShortLinkCreator && (
        <div className="mt-3">
          <ShortLinkCreator
            churchId={churchId}
            targetUrl={`/join/${churchId}`}
            label={`Volunteer signup — ${churchName}`}
            tier={churchTier}
            onClose={() => setShowShortLinkCreator(false)}
          />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Member Row (for Invites tab)
// ---------------------------------------------------------------------------

function MemberRow({
  membership,
  ministries,
  isCurrentUser,
  onApprove,
  onReject,
  onChangeRole,
  onRemove,
}: {
  membership: Membership;
  ministries: Ministry[];
  isCurrentUser: boolean;
  onApprove: () => void;
  onReject: () => void;
  onChangeRole: (role: OrgRole, ministryScope?: string[]) => void;
  onRemove: () => void;
}) {
  const [userName, setUserName] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [showRoleMenu, setShowRoleMenu] = useState(false);
  const [showScopeEditor, setShowScopeEditor] = useState(false);
  const [scopeSelection, setScopeSelection] = useState<string[]>(membership.ministry_scope || []);
  const [scopeAll, setScopeAll] = useState(!membership.ministry_scope?.length);

  useEffect(() => {
    if (!membership.user_id) { setLoaded(true); return; }
    getDoc(doc(db, "users", membership.user_id))
      .then((snap) => {
        if (snap.exists()) {
          setUserName(snap.data().display_name || "");
          setUserEmail(snap.data().email || "");
        }
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, [membership.user_id]);

  const statusInfo = STATUS_LABELS[membership.status] || { label: membership.status, color: "bg-vc-bg-cream text-vc-text-muted" };
  const isPending = membership.status === "pending_org_approval" || membership.status === "pending_volunteer_approval";

  function handleSaveScopeEditor() {
    const newScope = scopeAll ? [] : scopeSelection;
    onChangeRole(membership.role, newScope);
    setShowScopeEditor(false);
  }

  return (
    <div className="rounded-xl border border-vc-border-light bg-white p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-vc-indigo/10 text-sm font-semibold text-vc-indigo">
          {(userName || userEmail || "?").charAt(0).toUpperCase()}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-medium text-vc-indigo truncate">
              {loaded ? (userName || userEmail || "Unknown member") : "Loading\u2026"}
              {isCurrentUser && <span className="ml-1 text-xs text-vc-text-muted">(you)</span>}
            </p>
            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${statusInfo.color}`}>
              {statusInfo.label}
            </span>
          </div>
          {userEmail && <p className="text-sm text-vc-text-muted truncate">{userEmail}</p>}
          <div className="mt-1 flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center rounded-lg bg-vc-bg-warm px-2 py-0.5 text-xs font-medium capitalize text-vc-text-secondary">
              {membership.role}
            </span>
            {membership.role === "scheduler" && (
              <>
                {!membership.ministry_scope?.length ? (
                  <span className="inline-flex items-center rounded-lg bg-vc-sage/10 px-2 py-0.5 text-xs font-medium text-vc-sage">
                    All Teams
                  </span>
                ) : (
                  membership.ministry_scope.map((mid) => {
                    const m = ministries.find((x) => x.id === mid);
                    return m ? (
                      <span key={mid} className="inline-flex items-center rounded-lg bg-vc-indigo/10 px-2 py-0.5 text-xs font-medium text-vc-indigo">
                        {m.name}
                      </span>
                    ) : null;
                  })
                )}
              </>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1.5 shrink-0">
          {isPending && membership.status === "pending_org_approval" && (
            <>
              <button
                onClick={onApprove}
                className="rounded-lg bg-vc-sage/15 px-3 py-2 text-sm font-medium text-vc-sage hover:bg-vc-sage/25 transition-colors min-h-[44px]"
              >
                Approve
              </button>
              <button
                onClick={onReject}
                className="rounded-lg bg-vc-bg-cream px-3 py-2 text-sm font-medium text-vc-text-muted hover:bg-vc-bg-warm transition-colors min-h-[44px]"
              >
                Reject
              </button>
            </>
          )}

          {membership.status === "active" && !isCurrentUser && membership.role !== "owner" && (
            <div className="relative">
              <button
                onClick={() => setShowRoleMenu(!showRoleMenu)}
                className="rounded-lg border border-vc-border px-3 py-2 text-xs text-vc-text-secondary hover:bg-vc-bg-warm transition-colors min-h-[44px] min-w-[44px] inline-flex items-center justify-center"
              >
                ...
              </button>
              {showRoleMenu && (
                <div className="absolute right-0 top-full mt-1 z-10 w-48 rounded-xl border border-vc-border-light bg-white py-1 shadow-lg">
                  {(["volunteer", "scheduler", "admin"] as OrgRole[]).map((r) => (
                    <button
                      key={r}
                      onClick={() => { onChangeRole(r); setShowRoleMenu(false); }}
                      className={`w-full px-3 py-2 text-left text-sm transition-colors hover:bg-vc-bg-warm ${
                        r === membership.role ? "font-medium text-vc-coral" : "text-vc-text-secondary"
                      }`}
                    >
                      {ROLE_LABELS[r]}
                    </button>
                  ))}
                  {membership.role === "scheduler" && (
                    <>
                      <div className="my-1 border-t border-vc-border-light" />
                      <button
                        onClick={() => { setShowScopeEditor(true); setShowRoleMenu(false); }}
                        className="w-full px-3 py-2 text-left text-sm text-vc-text-secondary transition-colors hover:bg-vc-bg-warm"
                      >
                        Manage team access
                      </button>
                    </>
                  )}
                  <div className="my-1 border-t border-vc-border-light" />
                  <button
                    onClick={() => { onRemove(); setShowRoleMenu(false); }}
                    className="w-full px-3 py-2 text-left text-sm text-vc-danger hover:bg-vc-danger/5 transition-colors"
                  >
                    Remove
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Team scope editor */}
      {showScopeEditor && membership.role === "scheduler" && (
        <div className="mt-3 rounded-lg border border-vc-border-light bg-vc-bg-warm p-4">
          <p className="text-sm font-medium text-vc-indigo mb-3">Team Access</p>
          <label className="flex items-center gap-2 mb-3">
            <input
              type="checkbox"
              checked={scopeAll}
              onChange={(e) => {
                setScopeAll(e.target.checked);
                if (e.target.checked) setScopeSelection([]);
              }}
              className="rounded border-vc-border text-vc-coral focus:ring-vc-coral"
            />
            <span className="text-sm text-vc-text-secondary">All Teams</span>
          </label>
          {!scopeAll && (
            <div className="space-y-2 mb-3">
              {ministries.map((m) => (
                <label key={m.id} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={scopeSelection.includes(m.id)}
                    onChange={(e) => {
                      setScopeSelection((prev) =>
                        e.target.checked ? [...prev, m.id] : prev.filter((id) => id !== m.id),
                      );
                    }}
                    className="rounded border-vc-border text-vc-coral focus:ring-vc-coral"
                  />
                  <span className="text-sm text-vc-text-secondary">{m.name}</span>
                </label>
              ))}
              {ministries.length === 0 && (
                <p className="text-xs text-vc-text-muted">No teams created yet.</p>
              )}
            </div>
          )}
          <div className="flex gap-2">
            <Button onClick={handleSaveScopeEditor} className="text-xs">
              Save
            </Button>
            <Button variant="outline" onClick={() => setShowScopeEditor(false)} className="text-xs">
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}


