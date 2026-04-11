"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/context/auth-context";
import {
  addChurchDocument,
  getChurchDocuments,
  updateChurchDocument,
  removeChurchDocument,
  updateMembershipStatus,
  updateMembershipRole,
  deleteMembership,
} from "@/lib/firebase/firestore";
import { db } from "@/lib/firebase/config";
import { doc, getDoc } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { isAdmin, isScheduler } from "@/lib/utils/permissions";
import { InviteQueueDrawer } from "@/components/forms/invite-queue-drawer";
import { getOrgTerms } from "@/lib/utils/org-terms";
import { CSVImportModal } from "@/components/forms/csv-import-modal";
import { ChMSImportModal } from "@/components/forms/chms-import-modal";
import { HouseholdFormModal } from "@/components/forms/household-form-modal";
import { getServiceMinistries } from "@/lib/utils/service-helpers";
import { getOrgEligibility } from "@/lib/utils/eligibility";
import { TeamSidebar } from "@/components/people/team-sidebar";
import { PeopleTable, PeopleList } from "@/components/people/people-table";
import { PersonDetailDrawer } from "@/components/people/person-detail-drawer";
import { AddPeopleMenu } from "@/components/people/add-people-menu";
import { InviteForm } from "@/components/people/invite-form";
import { MemberRow } from "@/components/people/member-row";
import { HouseholdCard } from "@/components/people/household-card";
import { Modal } from "@/components/ui/modal";
import { ShareMenu } from "@/components/ui/share-menu";
import { ShortLinkCreator } from "@/components/ui/short-link-creator";
import { TabBar } from "@/components/ui/tab-bar";
import { FilterBar } from "@/components/people/filter-bar";
import type {
  Volunteer,
  Person,
  Ministry,
  Membership,
  Household,
  OrgRole,
  OrgType,
  Service,
  InviteQueueItem,
  OnboardingStep,
} from "@/lib/types";
import { personToLegacyVolunteer } from "@/lib/compat/volunteer-compat";
import { TIER_LIMITS } from "@/lib/constants";
import { OverLimitBanner } from "@/components/ui/over-limit-banner";

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
  const [filterOrgRoles, setFilterOrgRoles] = useState<OrgRole[]>([]);
  const [filterEligibility, setFilterEligibility] = useState<"all" | "cleared" | "pending">("all");
  const [orgPrereqs, setOrgPrereqs] = useState<OnboardingStep[]>([]);
  const [sidebarMinistry, setSidebarMinistry] = useState<string | null>(null);
  const [selectedPerson, setSelectedPerson] = useState<{ volunteer: Volunteer; membership: Membership | null } | null>(null);
  const [copied, setCopied] = useState(false);
  const [joinShortLinkUrl, setJoinShortLinkUrl] = useState<string | null>(null);
  const [showShortLinkCreator, setShowShortLinkCreator] = useState(false);

  // Households (Families tab)
  const [households, setHouseholds] = useState<Household[]>([]);
  const [householdModalOpen, setHouseholdModalOpen] = useState(false);
  const [editingHousehold, setEditingHousehold] = useState<Household | undefined>();

  // Error toast state
  const [actionError, setActionError] = useState<string | null>(null);

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
        // Fetch ALL People page data via server-side API (Admin SDK bypasses
        // Firestore security-rule limitations on client-side queries)
        const token = await getAuth().currentUser?.getIdToken();
        const res = await fetch(`/api/people-data?church_id=${encodeURIComponent(churchId!)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || `API returned ${res.status}`);
        }
        const data = await res.json();
        setVolunteers(data.volunteers as Volunteer[]);
        setMinistries(data.ministries as Ministry[]);
        setServices(data.services as Service[]);
        setHouseholds(data.households as Household[]);
        setMemberships(data.memberships as Membership[]);
        setQueueItems(
          (data.queueItems as InviteQueueItem[]).filter(
            (i) => i.status === "pending_review" || i.status === "approved",
          ),
        );
        if (data.church) {
          setChurchName(data.church.name || "");
          setChurchTier(data.church.subscription_tier || "free");
          setOrgType(data.church.org_type as OrgType);
          setOrgPrereqs((data.church.org_prerequisites as OnboardingStep[]) || []);
        }
      } catch (err) {
        console.error("[People] Failed to load:", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [churchId]);

  // Fetch existing short link for the join URL (used by ShareMenu in header)
  useEffect(() => {
    if (!churchId || !user) return;
    async function fetchJoinShortLink() {
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
      } catch { /* silent */ }
    }
    fetchJoinShortLink();
  }, [churchId, user]);

  const joinLink = typeof window !== "undefined" ? `${window.location.origin}/join/${churchId}` : "";
  const hasJoinShortLink = !!joinShortLinkUrl;

  function handleCopyJoinLink() {
    navigator.clipboard.writeText(hasJoinShortLink ? joinShortLinkUrl! : joinLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handlePrintFlyer() {
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
        "Request to join — we\u2019ll approve you shortly!",
      ],
    });
  }

  async function handleDownloadSlide() {
    const { downloadSlide } = await import("@/lib/utils/download-slide");
    downloadSlide({
      title: "Volunteer With Us!",
      subtitle: "Scan the QR code to sign up as a volunteer.",
      orgName: churchName,
      url: joinLink,
      shortUrl: joinShortLinkUrl || undefined,
    });
  }

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

  const filteredRoster = rosterPeople.filter(({ volunteer: v, membership: mem }) => {
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
    // Sidebar single-ministry filter
    if (sidebarMinistry) {
      if (!v.ministry_ids?.includes(sidebarMinistry)) return false;
    }
    if (filterMinistries.length > 0) {
      if (!v.ministry_ids?.some((id) => filterMinistries.includes(id))) return false;
    }
    if (filterRoles.length > 0) {
      if (!v.role_ids?.some((id) => filterRoles.includes(id))) return false;
    }
    // Org role filter
    if (filterOrgRoles.length > 0) {
      if (!mem || !filterOrgRoles.includes(mem.role)) return false;
    }
    // Eligibility filter
    if (filterEligibility !== "all") {
      const elig = getOrgEligibility(v, orgPrereqs);
      if (filterEligibility === "cleared" && elig !== "cleared" && elig !== "no_prereqs") return false;
      if (filterEligibility === "pending" && elig !== "in_progress" && elig !== "not_started") return false;
    }
    return true;
  });

  const activeFilterCount = filterMinistries.length + filterRoles.length
    + (filterStatus !== "active" ? 1 : 0)
    + (filterTeam !== "all" ? 1 : 0)
    + filterOrgRoles.length
    + (filterEligibility !== "all" ? 1 : 0);

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
          // Server-side tier limit check before creating volunteer
          const authToken = await getAuth().currentUser?.getIdToken();
          if (authToken) {
            const checkRes = await fetch("/api/tier-check", {
              method: "POST",
              headers: {
                Authorization: `Bearer ${authToken}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ church_id: churchId, resource: "volunteers" }),
            });
            if (checkRes.ok) {
              const check = await checkRes.json();
              if (!check.allowed) {
                console.warn("Volunteer limit reached — skipping auto-creation");
                return;
              }
            }
          }

          const now = new Date().toISOString();
          const displayName = (memUser?.data()?.display_name || memEmail || "Member") as string;
          const nameParts = displayName.split(" ");
          const volData = {
            church_id: churchId,
            person_type: "adult",
            name: displayName,
            first_name: nameParts[0] || "",
            last_name: nameParts.slice(1).join(" ") || "",
            search_name: displayName.toLowerCase(),
            email: memUser?.data()?.email || null,
            phone: memUser?.data()?.phone || null,
            search_phones: [] as string[],
            photo_url: null,
            user_id: m.user_id,
            membership_id: m.id,
            status: "active" as const,
            is_volunteer: true,
            ministry_ids: [] as string[],
            role_ids: [] as string[],
            campus_ids: [] as string[],
            household_ids: [] as string[],
            scheduling_profile: {
              blockout_dates: [] as string[],
              recurring_unavailable: [] as string[],
              preferred_frequency: 2,
              max_roles_per_month: 8,
            },
            stats: {
              times_scheduled_last_90d: 0,
              last_served_date: null,
              decline_count: 0,
              no_show_count: 0,
            },
            imported_from: null,
            created_at: now,
            updated_at: now,
          };
          const newRef = await addChurchDocument(churchId, "people", volData);
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
      await removeChurchDocument(churchId, "people", id);
      setVolunteers((prev) => prev.filter((v) => v.id !== id));
    } catch {
      setActionError("Failed to delete volunteer. Please try again.");
    }
  }

  async function handleArchiveVolunteer(id: string) {
    if (!churchId) return;
    const vol = volunteers.find((v) => v.id === id);
    if (!vol) return;
    if (!confirm(`Archive ${vol.name}? They'll be removed from all teams and excluded from future scheduling and event invitations. They can still see the organization. You can restore them later.`)) return;
    try {
      const token = await getAuth().currentUser?.getIdToken();
      const res = await fetch(`/api/people/${id}/archive`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ church_id: churchId, action: "archive" }),
      });
      if (res.ok) {
        setVolunteers((prev) =>
          prev.map((v) => v.id === id ? { ...v, status: "archived" as const, ministry_ids: [], role_ids: [] } : v),
        );
      } else {
        setActionError("Failed to archive volunteer.");
      }
    } catch {
      setActionError("Failed to archive volunteer. Please try again.");
    }
  }

  async function handleRestoreVolunteer(id: string) {
    if (!churchId) return;
    try {
      const token = await getAuth().currentUser?.getIdToken();
      const res = await fetch(`/api/people/${id}/archive`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ church_id: churchId, action: "restore" }),
      });
      if (res.ok) {
        setVolunteers((prev) =>
          prev.map((v) => v.id === id ? { ...v, status: "active" as const } : v),
        );
      } else {
        setActionError("Failed to restore volunteer.");
      }
    } catch {
      setActionError("Failed to restore volunteer. Please try again.");
    }
  }

  async function handleRemoveFromOrg(id: string) {
    if (!churchId) return;
    const vol = volunteers.find((v) => v.id === id);
    if (!vol) return;
    if (!confirm(`Remove ${vol.name} from this organization? They will lose all access and won't be able to see the organization unless re-invited. This cannot be undone.`)) return;
    try {
      const token = await getAuth().currentUser?.getIdToken();
      const res = await fetch(`/api/people/${id}/remove`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ church_id: churchId }),
      });
      if (res.ok) {
        setVolunteers((prev) => prev.filter((v) => v.id !== id));
      } else {
        setActionError("Failed to remove volunteer from organization.");
      }
    } catch {
      setActionError("Failed to remove volunteer. Please try again.");
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
      {/* Error toast */}
      {actionError && (
        <div className="fixed top-4 right-4 z-50 flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 shadow-lg">
          <span>{actionError}</span>
          <button onClick={() => setActionError(null)} className="ml-2 font-medium hover:text-red-600">Dismiss</button>
        </div>
      )}

      {/* Header */}
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-3xl text-vc-indigo">Volunteers</h1>
          <p className="mt-1 text-vc-text-secondary">
            {volunteers.filter(v => v.status !== "archived").length} active · {volunteers.filter(v => v.status === "archived").length} archived · {pendingMems.length} pending
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canManage && (
            <ShareMenu
              label="Invite Link"
              buttonClassName="inline-flex items-center gap-1.5 rounded-lg border border-vc-border px-3 py-2 text-sm font-medium text-vc-text-secondary transition-colors hover:border-vc-indigo/20 hover:text-vc-indigo min-h-[44px]"
              onCopyLink={handleCopyJoinLink}
              onCopyShortLink={hasJoinShortLink ? handleCopyJoinLink : undefined}
              onPrintInvite={handlePrintFlyer}
              onDownloadSlide={handleDownloadSlide}
              onCreateShortLink={() => setShowShortLinkCreator(true)}
              copied={copied}
              hasShortLink={hasJoinShortLink}
              shortLinkUrl={joinShortLinkUrl || undefined}
            />
          )}
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
              getChurchDocuments(churchId, "people").then((docs) =>
                setVolunteers(
                  (docs as unknown as Person[])
                    .filter((p) => p.is_volunteer)
                    .map((p) => personToLegacyVolunteer(p)),
                ),
              );
            }
          }}
        />
      )}

      {/* Tabs */}
      <TabBar
        tabs={[
          { key: "roster" as const, label: `Roster (${volunteers.length})` },
          ...(canManage ? [{ key: "invites" as const, label: `Invites (${pendingMems.length})` }] : []),
          ...(canManage ? [{ key: "families" as const, label: `Families (${households.length})` }] : []),
        ]}
        active={tab}
        onChange={setTab}
        className="mb-4"
      />

      {/* === ROSTER TAB === */}
      {tab === "roster" && (
        <>
          <OverLimitBanner
            resourceLabel="volunteers"
            currentCount={volunteers.length}
            limit={(TIER_LIMITS[churchTier] || TIER_LIMITS.free).volunteers}
          />

          {/* Search & Filters */}
          <FilterBar
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            filterMinistries={filterMinistries}
            onFilterMinistriesChange={setFilterMinistries}
            filterRoles={filterRoles}
            onFilterRolesChange={setFilterRoles}
            filterStatus={filterStatus}
            onFilterStatusChange={setFilterStatus}
            filterTeam={filterTeam}
            onFilterTeamChange={setFilterTeam}
            filterOrgRoles={filterOrgRoles}
            onFilterOrgRolesChange={setFilterOrgRoles}
            filterEligibility={filterEligibility}
            onFilterEligibilityChange={setFilterEligibility}
            activeFilterCount={activeFilterCount}
            ministries={ministries}
            uniqueRoles={uniqueRoles}
            orgPrereqs={orgPrereqs}
            teamLabel={terms.plural}
          />

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
            <div className="flex gap-6">
              {/* Team sidebar (desktop) */}
              <TeamSidebar
                ministries={ministries}
                volunteers={volunteers}
                selectedMinistryId={sidebarMinistry}
                onSelectMinistry={setSidebarMinistry}
              />

              <div className="flex-1 min-w-0">
                {/* Desktop table */}
                <div className="hidden md:block">
                  <PeopleTable
                    people={filteredRoster}
                    orgPrereqs={orgPrereqs}
                    getMinistryName={getMinistryName}
                    getMinistryColor={getMinistryColor}
                    onSelectPerson={(v, m) => setSelectedPerson({ volunteer: v, membership: m })}
                  />
                </div>

                {/* Mobile list */}
                <div className="md:hidden">
                  <PeopleList
                    people={filteredRoster}
                    orgPrereqs={orgPrereqs}
                    getMinistryName={getMinistryName}
                    getMinistryColor={getMinistryColor}
                    onSelectPerson={(v, m) => setSelectedPerson({ volunteer: v, membership: m })}
                  />
                </div>

                {filteredRoster.length === 0 && (searchQuery || activeFilterCount > 0) && (
                  <div className="rounded-xl border border-vc-border-light bg-white px-5 py-8 text-center text-sm text-vc-text-muted">
                    No people match your search{activeFilterCount > 0 ? " and filters" : ""}.
                    {activeFilterCount > 0 && (
                      <button
                        onClick={() => { setFilterMinistries([]); setFilterRoles([]); setFilterOrgRoles([]); setFilterEligibility("all"); setFilterStatus("active"); setFilterTeam("all"); setSearchQuery(""); setSidebarMinistry(null); }}
                        className="ml-1 font-medium text-vc-coral hover:text-vc-coral-dark transition-colors"
                      >
                        Clear all
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Person detail drawer */}
          {selectedPerson && (
            <PersonDetailDrawer
              open={!!selectedPerson}
              onClose={() => setSelectedPerson(null)}
              volunteer={selectedPerson.volunteer}
              membership={selectedPerson.membership}
              churchId={churchId!}
              ministries={ministries}
              orgPrereqs={orgPrereqs}
              availableRoles={uniqueRoles}
              canManage={canManage}
              getMinistryName={getMinistryName}
              getMinistryColor={getMinistryColor}
              onVolunteerUpdated={(updated) => {
                setVolunteers((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
                setSelectedPerson((prev) => prev ? { ...prev, volunteer: updated } : null);
              }}
              onRoleChanged={(m, role, scope) => handleChangeRole(m, role, scope)}
              onArchive={() => { handleArchiveVolunteer(selectedPerson.volunteer.id); setSelectedPerson(null); }}
              onRestore={() => { handleRestoreVolunteer(selectedPerson.volunteer.id); setSelectedPerson(null); }}
              onRemoveFromOrg={() => { handleRemoveFromOrg(selectedPerson.volunteer.id); setSelectedPerson(null); }}
            />
          )}

          {/* Short link creator modal */}
          {canManage && (
            <Modal open={showShortLinkCreator} onClose={() => setShowShortLinkCreator(false)} title="Create Short Link" subtitle="Create a branded short URL for your join page">
              <ShortLinkCreator
                churchId={churchId!}
                targetUrl={`/join/${churchId}`}
                label={`Volunteer signup — ${churchName}`}
                tier={churchTier}
                onCreated={(slug) => {
                  setJoinShortLinkUrl(`${window.location.origin}/s/${slug}`);
                }}
                onClose={() => setShowShortLinkCreator(false)}
              />
            </Modal>
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
            onInvited={async () => {
              if (churchId) {
                const t = await getAuth().currentUser?.getIdToken();
                const r = await fetch(`/api/memberships?church_id=${encodeURIComponent(churchId)}`, {
                  headers: { Authorization: `Bearer ${t}` },
                });
                if (r.ok) setMemberships(await r.json());
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
                : `Group family members to set scheduling preferences\u2014serve together, never together, or never on the same day. ${households.length} ${households.length === 1 ? "family" : "families"}.`}
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

// Inline components extracted to src/components/people/:
// - HouseholdCard → household-card.tsx
// - AddPeopleMenu → add-people-menu.tsx
// - InviteForm → invite-form.tsx
// - JoinLinkSection → removed (replaced by ShareMenu + ShortLinkCreator inline)
// - MemberRow → member-row.tsx
