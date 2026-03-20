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
import { formatPhone, normalizePhone } from "@/lib/utils/phone";
import { getOrgTerms } from "@/lib/utils/org-terms";
import { INTEGRATIONS } from "@/lib/integrations/config";
import { ShortLinkCreator } from "@/components/ui/short-link-creator";
import type {
  Volunteer,
  Ministry,
  Membership,
  OrgRole,
  OrgType,
  Service,
  InviteQueueItem,
} from "@/lib/types";
import { getServiceMinistries } from "@/lib/utils/service-helpers";
import type { IntegrationProvider, IntegrationConfig } from "@/lib/integrations/types";

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
  const initialTab = searchParams.get("tab") === "invites" ? "invites" : "roster";
  const [tab, setTab] = useState<"roster" | "invites">(initialTab);

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
        const [vols, mins, mems, svcs, churchSnap] = await Promise.all([
          getChurchDocuments(churchId!, "volunteers"),
          getChurchDocuments(churchId!, "ministries"),
          getChurchMemberships(churchId!),
          getChurchDocuments(churchId!, "services"),
          getDoc(doc(db, "churches", churchId!)),
        ]);
        setVolunteers(vols as unknown as Volunteer[]);
        setMinistries(mins as unknown as Ministry[]);
        setServices(svcs as unknown as Service[]);
        setMemberships(mems);
        if (churchSnap.exists()) {
          setChurchName(churchSnap.data().name || "");
          setChurchTier(churchSnap.data().subscription_tier || "free");
          setOrgType(churchSnap.data().org_type as OrgType);
        }
        // Load invite queue
        const qItems = await getChurchDocuments(churchId!, "invite_queue") as unknown as InviteQueueItem[];
        setQueueItems(qItems.filter((i) => i.status === "pending_review" || i.status === "approved"));
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

  const filteredRoster = searchQuery
    ? rosterPeople.filter(
        ({ volunteer: v }) =>
          v.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          v.email.toLowerCase().includes(searchQuery.toLowerCase()),
      )
    : rosterPeople;

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
            {volunteers.length} in roster · {activeMems.length} active members · {pendingMems.length} pending
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

      {/* Add People panels */}
      {addMode === "csv" && canManage && (
        <CSVImportPanel
          churchId={churchId!}
          onQueued={() => {
            setAddMode(null);
            loadQueueItems();
          }}
          onCancel={() => setAddMode(null)}
        />
      )}

      {addMode === "chms" && canManage && (
        <ChMSImportPanel
          churchId={churchId!}
          user={user}
          onDone={() => {
            setAddMode(null);
            loadQueueItems();
          }}
          onCancel={() => setAddMode(null)}
        />
      )}

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

      {/* Queue review panel */}
      {canManage && showQueuePanel && (
        <InviteQueuePanel
          churchId={churchId!}
          user={user}
          items={queueItems}
          ministries={ministries}
          onClose={() => setShowQueuePanel(false)}
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
      </div>

      {/* === ROSTER TAB === */}
      {tab === "roster" && (
        <>
          {/* Search */}
          {volunteers.length > 5 && (
            <div className="mb-4">
              <input
                type="search"
                placeholder="Search people..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full max-w-sm rounded-lg border border-vc-border bg-white px-3 py-2 text-sm text-vc-text placeholder:text-vc-text-muted focus:border-vc-coral focus:outline-none focus:ring-2 focus:ring-vc-coral/20"
              />
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
              {filteredRoster.length === 0 && searchQuery && (
                <div className="px-5 py-8 text-center text-sm text-vc-text-muted">
                  No people match &ldquo;{searchQuery}&rdquo;
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
    </div>
  );
}

// ---------------------------------------------------------------------------
// Roster Row (with inline edit)
// ---------------------------------------------------------------------------

function RosterRow({
  volunteer: v,
  membership: mem,
  canManage,
  getMinistryName,
  getMinistryColor,
  onDelete,
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
  churchId: string;
  ministries: Ministry[];
  availableRoles: { role_id: string; title: string; ministry_id: string }[];
  onUpdated: (v: Volunteer) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(v.name);
  const [email, setEmail] = useState(v.email);
  const [phone, setPhone] = useState(v.phone || "");
  const [selectedMinistries, setSelectedMinistries] = useState<string[]>(v.ministry_ids);
  const [selectedRoles, setSelectedRoles] = useState<string[]>(v.role_ids);
  const [bgCheckStatus, setBgCheckStatus] = useState<string>(v.background_check?.status || "not_required");
  const [bgCheckExpiry, setBgCheckExpiry] = useState(v.background_check?.expires_at || "");
  const [allowMultiRole, setAllowMultiRole] = useState(v.role_constraints?.allow_multi_role || false);
  const [conditionalRoles, setConditionalRoles] = useState<Array<{ role_id: string; requires_any: string[] }>>(
    v.role_constraints?.conditional_roles || [],
  );
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  function toggleMinistry(id: string) {
    setSelectedMinistries((prev) =>
      prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id],
    );
  }

  function toggleRole(id: string) {
    setSelectedRoles((prev) =>
      prev.includes(id) ? prev.filter((r) => r !== id) : [...prev, id],
    );
  }

  async function handleSave() {
    setSaving(true);
    try {
      const background_check = bgCheckStatus === "not_required" ? undefined : {
        status: bgCheckStatus as "cleared" | "pending" | "expired" | "not_required",
        expires_at: bgCheckExpiry || null,
        provider: v.background_check?.provider || null,
        checked_at: bgCheckStatus === "cleared" && v.background_check?.status !== "cleared"
          ? new Date().toISOString()
          : v.background_check?.checked_at || null,
      };
      const roleConstraints = (allowMultiRole || conditionalRoles.length > 0)
        ? {
            allow_multi_role: allowMultiRole,
            conditional_roles: conditionalRoles,
          }
        : undefined;
      const updateData = {
        name,
        email,
        phone: phone ? normalizePhone(phone) : null,
        ministry_ids: selectedMinistries,
        role_ids: selectedRoles,
        background_check: background_check || undefined,
        role_constraints: roleConstraints,
      };
      await updateChurchDocument(churchId, "volunteers", v.id, updateData);
      onUpdated({ ...v, ...updateData });
      setEditing(false);
    } catch {
      // silent
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    await onDelete();
    setDeleting(false);
  }

  if (editing) {
    return (
      <tr>
        <td colSpan={6} className="px-5 py-4">
          <div className="space-y-3 rounded-lg border border-vc-border-light bg-vc-bg/50 p-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <Input label="Name" required value={name} onChange={(e) => setName(e.target.value)} />
              <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              <Input label="Phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} onBlur={() => { if (phone) setPhone(formatPhone(phone)); }} />
            </div>
            {ministries.length > 0 && (
              <div>
                <label className="mb-1.5 block text-sm font-medium text-vc-text">
                  {getMinistryName("__label__") === "__label__" ? "Teams" : "Ministries"}
                </label>
                <div className="flex flex-wrap gap-2">
                  {ministries.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => toggleMinistry(m.id)}
                      className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-all ${
                        selectedMinistries.includes(m.id)
                          ? "border-transparent text-white"
                          : "border-vc-border text-vc-text-secondary hover:border-vc-indigo/20"
                      }`}
                      style={
                        selectedMinistries.includes(m.id)
                          ? { backgroundColor: m.color }
                          : undefined
                      }
                    >
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: selectedMinistries.includes(m.id) ? "white" : m.color }}
                      />
                      {m.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {/* Roles (filtered to selected ministries) */}
            {(() => {
              const relevantRoles = availableRoles.filter(
                (r) => selectedMinistries.includes(r.ministry_id),
              );
              if (relevantRoles.length === 0) return null;
              return (
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-vc-text">
                    Qualified Roles
                  </label>
                  <p className="mb-2 text-xs text-vc-text-muted">
                    Leave all unchecked to allow any role. Check specific roles to restrict scheduling.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {relevantRoles.map((r) => (
                      <button
                        key={r.role_id}
                        type="button"
                        onClick={() => toggleRole(r.role_id)}
                        className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-all ${
                          selectedRoles.includes(r.role_id)
                            ? "border-vc-coral bg-vc-coral/10 text-vc-coral"
                            : "border-vc-border text-vc-text-secondary hover:border-vc-indigo/20"
                        }`}
                      >
                        {selectedRoles.includes(r.role_id) && (
                          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                          </svg>
                        )}
                        {r.title}
                        <span className="text-[10px] text-vc-text-muted">
                          ({getMinistryName(r.ministry_id)})
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })()}
            {/* Background Check */}
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-vc-text">Background Check</label>
                <select
                  className="w-full rounded-lg border border-vc-border-light bg-white px-3 py-2 text-sm text-vc-text focus:border-vc-coral focus:outline-none"
                  value={bgCheckStatus}
                  onChange={(e) => setBgCheckStatus(e.target.value)}
                >
                  <option value="not_required">Not Required</option>
                  <option value="pending">Pending</option>
                  <option value="cleared">Cleared</option>
                  <option value="expired">Expired</option>
                </select>
              </div>
              {(bgCheckStatus === "cleared" || bgCheckStatus === "expired") && (
                <Input
                  label="Expiry Date"
                  type="date"
                  value={bgCheckExpiry}
                  onChange={(e) => setBgCheckExpiry(e.target.value)}
                />
              )}
            </div>
            {/* Advanced Role Constraints (worship/music teams) */}
            {selectedRoles.length >= 2 && (
              <div className="rounded-lg border border-vc-border-light bg-vc-bg-warm/30 p-3 space-y-3">
                <label className="block text-sm font-medium text-vc-text">
                  Advanced Role Settings
                </label>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={allowMultiRole}
                    onChange={(e) => setAllowMultiRole(e.target.checked)}
                    className="h-4 w-4 rounded border-vc-border text-vc-coral focus:ring-vc-coral"
                  />
                  <span className="text-sm text-vc-text-secondary">
                    Allow multiple roles in the same service <span className="text-xs text-vc-text-muted">(e.g., Guitar + Vocals)</span>
                  </span>
                </label>
                <div>
                  <p className="mb-2 text-xs text-vc-text-muted">
                    Conditional roles — e.g., &quot;Vocals&quot; only when also assigned &quot;Guitar&quot; or &quot;Keys&quot;
                  </p>
                  {selectedRoles.map((roleId) => {
                    const roleInfo = availableRoles.find((r) => r.role_id === roleId);
                    if (!roleInfo) return null;
                    const existing = conditionalRoles.find((c) => c.role_id === roleId);
                    const otherRoles = selectedRoles.filter((r) => r !== roleId);
                    if (otherRoles.length === 0) return null;
                    return (
                      <div key={roleId} className="flex flex-wrap items-center gap-2 mb-2">
                        <span className="text-sm text-vc-text font-medium w-24 shrink-0">{roleInfo.title}</span>
                        <span className="text-xs text-vc-text-muted">requires:</span>
                        {otherRoles.map((otherId) => {
                          const otherInfo = availableRoles.find((r) => r.role_id === otherId);
                          const isRequired = existing?.requires_any.includes(otherId) || false;
                          return (
                            <button
                              key={otherId}
                              type="button"
                              onClick={() => {
                                setConditionalRoles((prev) => {
                                  const clone = prev.map((c) => ({ ...c, requires_any: [...c.requires_any] }));
                                  const idx = clone.findIndex((c) => c.role_id === roleId);
                                  if (isRequired) {
                                    if (idx >= 0) {
                                      clone[idx].requires_any = clone[idx].requires_any.filter((r) => r !== otherId);
                                      if (clone[idx].requires_any.length === 0) clone.splice(idx, 1);
                                    }
                                  } else {
                                    if (idx >= 0) {
                                      clone[idx].requires_any.push(otherId);
                                    } else {
                                      clone.push({ role_id: roleId, requires_any: [otherId] });
                                    }
                                  }
                                  return clone;
                                });
                              }}
                              className={`rounded px-2 py-1 text-xs font-medium border transition-all ${
                                isRequired
                                  ? "border-vc-sage bg-vc-sage/10 text-vc-sage"
                                  : "border-vc-border text-vc-text-muted hover:border-vc-sage/30"
                              }`}
                            >
                              {otherInfo?.title || otherId}
                            </button>
                          );
                        })}
                        {!existing && <span className="text-xs text-vc-text-muted italic">no dependency</span>}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            <div className="flex gap-2">
              <Button size="sm" loading={saving} onClick={handleSave}>Save</Button>
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
            </div>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr className="hover:bg-vc-bg-warm/50 transition-colors">
      <td className="px-5 py-3 font-medium text-vc-indigo">{v.name}</td>
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
          <div className="flex gap-2">
            <button
              onClick={() => setEditing(true)}
              className="text-xs font-medium text-vc-text-secondary hover:text-vc-coral transition-colors"
            >
              Edit
            </button>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="text-xs font-medium text-vc-text-muted hover:text-vc-danger transition-colors"
            >
              {deleting ? "..." : "Delete"}
            </button>
          </div>
        </td>
      )}
    </tr>
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

function PanelHeader({
  title,
  subtitle,
  onClose,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
}) {
  return (
    <div className="mb-5 flex items-start justify-between gap-4">
      <div>
        <h2 className="text-lg font-semibold text-vc-indigo">{title}</h2>
        {subtitle && <p className="mt-0.5 text-sm text-vc-text-muted">{subtitle}</p>}
      </div>
      <button
        onClick={onClose}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-vc-text-muted hover:bg-vc-bg-warm hover:text-vc-indigo transition-colors"
        title="Close"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

function AddIndividualPanel({
  churchId,
  ministries,
  onAdded,
  onCancel,
}: {
  churchId: string;
  ministries: Ministry[];
  onAdded: (v: Volunteer) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [selectedMinistries, setSelectedMinistries] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  function toggleMinistry(id: string) {
    setSelectedMinistries((prev) =>
      prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id],
    );
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);

    try {
      const data: Omit<Volunteer, "id"> = {
        name,
        email,
        phone: phone || null,
        church_id: churchId,
        user_id: null,
        ministry_ids: selectedMinistries,
        role_ids: [],
        household_id: null,
        availability: {
          blockout_dates: [],
          recurring_unavailable: [],
          preferred_frequency: 2,
          max_roles_per_month: 4,
        },
        reminder_preferences: { channels: ["email"] },
        stats: {
          times_scheduled_last_90d: 0,
          last_served_date: null,
          decline_count: 0,
          no_show_count: 0,
        },
        imported_from: "manual",
        status: "active" as const,
        membership_id: null,
        created_at: new Date().toISOString(),
      };

      const ref = await addChurchDocument(churchId, "volunteers", data);
      onAdded({ id: ref.id, ...data });
    } catch {
      // silent
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mb-6 rounded-xl border border-vc-border-light bg-white p-6">
      <PanelHeader title="Add Person" subtitle="Add someone to your roster manually." onClose={onCancel} />
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <Input
            label="Full Name"
            required
            placeholder="Jane Smith"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Input
            label="Email"
            type="email"
            placeholder="jane@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Input
            label="Phone"
            type="tel"
            placeholder="(555) 123-4567"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </div>

        {ministries.length > 0 && (
          <div>
            <label className="mb-1.5 block text-sm font-medium text-vc-text">
              Assign to ministries
            </label>
            <div className="flex flex-wrap gap-2">
              {ministries.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => toggleMinistry(m.id)}
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-all ${
                    selectedMinistries.includes(m.id)
                      ? "border-transparent text-white"
                      : "border-vc-border text-vc-text-secondary hover:border-vc-indigo/20"
                  }`}
                  style={
                    selectedMinistries.includes(m.id)
                      ? { backgroundColor: m.color }
                      : undefined
                  }
                >
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: selectedMinistries.includes(m.id) ? "white" : m.color }}
                  />
                  {m.name}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex justify-end pt-2">
          <Button type="submit" loading={saving}>Add Person</Button>
        </div>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------------------
// CSV Import Panel
// ---------------------------------------------------------------------------

function CSVImportPanel({
  churchId,
  onQueued,
  onCancel,
}: {
  churchId: string;
  onQueued: (count: number) => void;
  onCancel: () => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [importStatus, setImportStatus] = useState<{ count: number; errors: string[] } | null>(null);

  async function handleCSVImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setSaving(true);
    setImportStatus(null);

    try {
      const text = await file.text();
      const lines = text.split("\n").filter((l) => l.trim());
      if (lines.length < 2) {
        setImportStatus({ count: 0, errors: ["CSV file is empty or has no data rows."] });
        setSaving(false);
        return;
      }

      const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
      const nameIdx = headers.findIndex((h) => h === "name" || h === "full name" || h === "volunteer");
      const emailIdx = headers.findIndex((h) => h === "email" || h === "email address");
      const phoneIdx = headers.findIndex((h) => h === "phone" || h === "phone number" || h === "mobile");

      if (nameIdx === -1) {
        setImportStatus({ count: 0, errors: ["CSV must have a 'name' column."] });
        setSaving(false);
        return;
      }

      let queued = 0;
      const errors: string[] = [];
      const now = new Date().toISOString();

      for (let i = 1; i < lines.length; i++) {
        const cols = parseCSVLine(lines[i]);
        const volName = cols[nameIdx]?.trim();
        if (!volName) {
          errors.push(`Row ${i + 1}: missing name, skipped.`);
          continue;
        }

        const email = emailIdx >= 0 ? cols[emailIdx]?.trim() || "" : "";
        const phone = phoneIdx >= 0 ? cols[phoneIdx]?.trim() || null : null;

        try {
          await addChurchDocument(churchId, "invite_queue", {
            church_id: churchId,
            name: volName,
            email,
            phone,
            role: "volunteer",
            ministry_ids: [],
            source: "csv",
            source_provider: null,
            status: "pending_review",
            volunteer_id: null,
            error_message: null,
            reviewed_by: null,
            reviewed_at: null,
            sent_at: null,
            created_at: now,
          });
          queued++;
        } catch {
          errors.push(`Row ${i + 1}: failed to queue "${volName}".`);
        }
      }

      setImportStatus({ count: queued, errors });
      if (queued > 0) onQueued(queued);
    } catch {
      setImportStatus({ count: 0, errors: ["Failed to read CSV file."] });
    } finally {
      setSaving(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return (
    <div className="mb-6 rounded-xl border border-vc-border-light bg-white p-6">
      <PanelHeader
        title="Import from CSV"
        subtitle="Upload a spreadsheet with name (required), email, and phone columns. People will be added to your review queue."
        onClose={onCancel}
      />

      {!importStatus ? (
        <div
          onClick={() => fileInputRef.current?.click()}
          className="cursor-pointer rounded-xl border-2 border-dashed border-vc-border bg-vc-bg/50 px-6 py-10 text-center transition-colors hover:border-vc-coral/40 hover:bg-vc-coral/5"
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            onChange={handleCSVImport}
            className="hidden"
          />
          {saving ? (
            <div className="flex flex-col items-center gap-2">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-vc-coral/20 border-t-vc-coral" />
              <p className="text-sm font-medium text-vc-indigo">Importing {fileName}...</p>
            </div>
          ) : (
            <>
              <svg className="mx-auto h-10 w-10 text-vc-text-muted" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
              </svg>
              <p className="mt-3 text-sm font-medium text-vc-indigo">
                Click to choose a CSV file
              </p>
              <p className="mt-1 text-xs text-vc-text-muted">
                Columns: <strong>name</strong> (required), email, phone. You&apos;ll review and approve before invites are sent.
              </p>
            </>
          )}
        </div>
      ) : (
        <div>
          {importStatus.count > 0 && (
            <div className="flex items-center gap-3 rounded-lg bg-vc-sage/10 px-4 py-3">
              <svg className="h-5 w-5 shrink-0 text-vc-sage" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
              </svg>
              <p className="text-sm font-medium text-vc-sage">
                Added {importStatus.count} {importStatus.count !== 1 ? "people" : "person"} to the review queue.
              </p>
            </div>
          )}
          {importStatus.errors.length > 0 && (
            <div className="mt-3 rounded-lg bg-vc-danger/5 p-4">
              <p className="mb-1 text-xs font-semibold text-vc-danger">Issues</p>
              <div className="space-y-0.5">
                {importStatus.errors.map((err, i) => (
                  <p key={i} className="text-xs text-vc-danger/80">{err}</p>
                ))}
              </div>
            </div>
          )}
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => { setImportStatus(null); setFileName(null); }}>
              Import more
            </Button>
            <Button onClick={onCancel}>Done</Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ChMS Import Panel (Planning Center, Breeze, Rock RMS)
// ---------------------------------------------------------------------------

type ChMSStep = "select" | "connect" | "testing" | "connected" | "preview" | "select_teams" | "importing" | "done";

interface PreviewTeam {
  id: string;
  name: string;
  member_count: number;
}

interface QueueImportStats {
  queued: number;
  teams_selected: number;
  total_people: number;
}

function ChMSImportPanel({
  churchId,
  user,
  onDone,
  onCancel,
}: {
  churchId: string;
  user: ReturnType<typeof useAuth>["user"];
  onDone: () => void;
  onCancel: () => void;
}) {
  const [step, setStep] = useState<ChMSStep>("select");
  const [selectedProvider, setSelectedProvider] = useState<IntegrationConfig | null>(null);
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  const [testResult, setTestResult] = useState<boolean | null>(null);
  const [importing, setImporting] = useState(false);
  const [importStats, setImportStats] = useState<QueueImportStats | null>(null);
  const [previewTeams, setPreviewTeams] = useState<PreviewTeam[]>([]);
  const [previewPeopleCount, setPreviewPeopleCount] = useState(0);
  const [selectedTeamIds, setSelectedTeamIds] = useState<string[]>([]);
  const [selectAllTeams, setSelectAllTeams] = useState(true);
  const [error, setError] = useState("");

  async function getAuthHeaders(): Promise<Record<string, string>> {
    if (!user) return {};
    const token = await user.getIdToken();
    return { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
  }

  function selectProvider(config: IntegrationConfig) {
    setSelectedProvider(config);
    setCredentials({});
    setTestResult(null);
    setError("");
    setStep("connect");
  }

  async function testConnection() {
    if (!selectedProvider) return;
    setStep("testing");
    setError("");
    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/import", {
        method: "POST",
        headers,
        body: JSON.stringify({ action: "test", provider: selectedProvider.provider, credentials, church_id: churchId }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Connection test failed"); setTestResult(false); setStep("connect"); return; }
      setTestResult(data.connected);
      if (data.connected) {
        await fetch("/api/import", {
          method: "POST",
          headers,
          body: JSON.stringify({ action: "save_creds", provider: selectedProvider.provider, credentials, church_id: churchId }),
        });
        setStep("connected");
      } else { setError("Could not connect. Please check your credentials."); setStep("connect"); }
    } catch { setError("Connection test failed. Please try again."); setStep("connect"); }
  }

  async function runPreview() {
    if (!selectedProvider) return;
    setError("");
    setStep("preview");
    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/import", {
        method: "POST",
        headers,
        body: JSON.stringify({ action: "preview", provider: selectedProvider.provider, credentials, church_id: churchId }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Preview failed"); setStep("connected"); return; }
      setPreviewTeams(data.teams || []);
      setPreviewPeopleCount(data.total_people || 0);
      setSelectedTeamIds((data.teams || []).map((t: PreviewTeam) => t.id));
      setSelectAllTeams(true);
      setStep("select_teams");
    } catch { setError("Failed to load preview. Please try again."); setStep("connected"); }
  }

  async function runImportToQueue() {
    if (!selectedProvider) return;
    setImporting(true);
    setError("");
    setStep("importing");
    try {
      const headers = await getAuthHeaders();
      const teamIds = selectAllTeams ? undefined : selectedTeamIds;
      const res = await fetch("/api/import", {
        method: "POST",
        headers,
        body: JSON.stringify({ action: "import_to_queue", provider: selectedProvider.provider, credentials, church_id: churchId, team_ids: teamIds }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Import failed"); setStep("select_teams"); return; }
      setImportStats(data);
      setStep("done");
    } catch { setError("Import failed. Please try again."); setStep("select_teams"); } finally { setImporting(false); }
  }

  function startOver() {
    setStep("select");
    setSelectedProvider(null);
    setCredentials({});
    setTestResult(null);
    setImportStats(null);
    setPreviewTeams([]);
    setPreviewPeopleCount(0);
    setSelectedTeamIds([]);
    setSelectAllTeams(true);
    setError("");
  }

  const STEP_LABELS: Record<ChMSStep, string> = {
    select: "Choose platform",
    connect: "Enter credentials",
    testing: "Testing connection",
    connected: "Connected",
    preview: "Loading preview",
    select_teams: "Select teams",
    importing: "Importing",
    done: "Complete",
  };

  const stepOrder: ChMSStep[] = ["select", "connect", "connected", "select_teams", "done"];
  const currentStepIdx = stepOrder.indexOf(
    step === "testing" ? "connect" : step === "preview" ? "select_teams" : step === "importing" ? "done" : step,
  );

  return (
    <div className="mb-6 rounded-xl border border-vc-border-light bg-white p-6">
      <PanelHeader
        title="Import from ChMS"
        subtitle="One-time import from your church management system. Your existing data will not be affected."
        onClose={step === "importing" ? () => {} : onCancel}
      />

      {/* Step indicator */}
      {step !== "select" && (
        <div className="mb-6 flex items-center gap-2">
          {stepOrder.map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              {i > 0 && <div className={`h-px w-6 ${i <= currentStepIdx ? "bg-vc-coral" : "bg-vc-border-light"}`} />}
              <div
                className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${
                  i < currentStepIdx
                    ? "bg-vc-sage text-white"
                    : i === currentStepIdx
                      ? "bg-vc-coral text-white"
                      : "bg-vc-bg-warm text-vc-text-muted"
                }`}
              >
                {i < currentStepIdx ? (
                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                  </svg>
                ) : (
                  i + 1
                )}
              </div>
              <span className={`text-xs font-medium ${i === currentStepIdx ? "text-vc-indigo" : "text-vc-text-muted"}`}>
                {STEP_LABELS[s]}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Select Provider */}
      {step === "select" && (
        <div className="grid gap-4 sm:grid-cols-3">
          {INTEGRATIONS.map((config) => (
            <button
              key={config.provider}
              onClick={() => selectProvider(config)}
              className="group rounded-xl border border-vc-border-light bg-vc-bg/50 p-5 text-left transition-all hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/[0.03] hover:border-vc-coral/40"
            >
              <ProviderIcon provider={config.provider} />
              <h3 className="mt-3 font-semibold text-vc-indigo">{config.label}</h3>
              <p className="mt-1 text-sm text-vc-text-secondary">{config.description}</p>
            </button>
          ))}
        </div>
      )}

      {/* Enter Credentials */}
      {(step === "connect" || step === "testing") && selectedProvider && (
        <div className="max-w-lg">
          <div className="flex items-center gap-3 mb-4">
            <ProviderIcon provider={selectedProvider.provider} />
            <div>
              <h3 className="font-semibold text-vc-indigo">{selectedProvider.label}</h3>
              <p className="text-xs text-vc-text-muted">Credentials are stored securely and only used for importing.</p>
            </div>
          </div>
          <div className="space-y-3">
            {selectedProvider.authFields.map((field) => (
              <div key={field.key}>
                <label className="mb-1.5 block text-sm font-medium text-vc-text">
                  {field.label}
                  {field.required && <span className="text-vc-coral ml-0.5">*</span>}
                </label>
                <input
                  type={field.type}
                  placeholder={field.placeholder}
                  required={field.required}
                  value={credentials[field.key] || ""}
                  onChange={(e) => setCredentials((prev) => ({ ...prev, [field.key]: e.target.value }))}
                  className="w-full rounded-lg border border-vc-border bg-white px-3 py-2 text-base text-vc-text placeholder:text-vc-text-muted focus:border-vc-coral focus:outline-none focus:ring-2 focus:ring-vc-coral/20"
                />
              </div>
            ))}
          </div>
          {error && <div className="mt-3 rounded-lg bg-vc-danger/5 px-4 py-3 text-sm text-vc-danger">{error}</div>}
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="ghost" onClick={startOver}>Back</Button>
            <Button
              onClick={testConnection}
              loading={step === "testing"}
              disabled={selectedProvider.authFields.some((f) => f.required && !credentials[f.key]?.trim())}
            >
              Test Connection
            </Button>
          </div>
        </div>
      )}

      {/* Connected — load preview */}
      {step === "connected" && selectedProvider && (
        <div className="max-w-lg">
          <div className="flex items-center gap-3 rounded-lg bg-vc-sage/10 px-4 py-3 mb-4">
            <svg className="h-5 w-5 shrink-0 text-vc-sage" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
            </svg>
            <div>
              <p className="text-sm font-medium text-vc-sage">Connected to {selectedProvider.label}</p>
              <p className="text-xs text-vc-text-muted">Next, preview your teams and choose which ones to import.</p>
            </div>
          </div>
          {error && <div className="mb-3 rounded-lg bg-vc-danger/5 px-4 py-3 text-sm text-vc-danger">{error}</div>}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={startOver}>Back</Button>
            <Button onClick={runPreview}>Preview Teams</Button>
          </div>
        </div>
      )}

      {/* Loading preview */}
      {step === "preview" && (
        <div className="max-w-lg text-center py-8">
          <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-4 border-vc-coral/20 border-t-vc-coral" />
          <h3 className="font-semibold text-vc-indigo">Loading teams from {selectedProvider?.label}...</h3>
        </div>
      )}

      {/* Select teams */}
      {step === "select_teams" && selectedProvider && (
        <div className="max-w-lg">
          <div className="mb-4 rounded-lg bg-vc-bg-warm px-4 py-3">
            <p className="text-sm font-medium text-vc-indigo">
              Found {previewPeopleCount} people in {previewTeams.length} team{previewTeams.length !== 1 ? "s" : ""}
            </p>
            <p className="text-xs text-vc-text-muted mt-0.5">
              Select teams to import. People will be added to your review queue for approval before invites are sent.
            </p>
          </div>

          <div className="space-y-1 mb-4">
            <label className="flex items-center gap-2 rounded-lg px-3 py-2 hover:bg-vc-bg-warm transition-colors cursor-pointer">
              <input
                type="checkbox"
                checked={selectAllTeams}
                onChange={(e) => {
                  setSelectAllTeams(e.target.checked);
                  setSelectedTeamIds(e.target.checked ? previewTeams.map((t) => t.id) : []);
                }}
                className="rounded border-vc-border text-vc-coral focus:ring-vc-coral"
              />
              <span className="text-sm font-medium text-vc-indigo">All Teams</span>
              <span className="ml-auto text-xs text-vc-text-muted">{previewPeopleCount} people</span>
            </label>
            <div className="my-1 border-t border-vc-border-light" />
            {previewTeams.map((team) => (
              <label key={team.id} className="flex items-center gap-2 rounded-lg px-3 py-2 hover:bg-vc-bg-warm transition-colors cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectAllTeams || selectedTeamIds.includes(team.id)}
                  disabled={selectAllTeams}
                  onChange={(e) => {
                    setSelectedTeamIds((prev) =>
                      e.target.checked ? [...prev, team.id] : prev.filter((id) => id !== team.id),
                    );
                  }}
                  className="rounded border-vc-border text-vc-coral focus:ring-vc-coral"
                />
                <span className="text-sm text-vc-text-secondary">{team.name}</span>
                <span className="ml-auto text-xs text-vc-text-muted">{team.member_count} people</span>
              </label>
            ))}
          </div>

          {error && <div className="mb-3 rounded-lg bg-vc-danger/5 px-4 py-3 text-sm text-vc-danger">{error}</div>}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setStep("connected")}>Back</Button>
            <Button
              onClick={runImportToQueue}
              disabled={!selectAllTeams && selectedTeamIds.length === 0}
            >
              Import to Review Queue
            </Button>
          </div>
        </div>
      )}

      {/* Importing */}
      {step === "importing" && (
        <div className="max-w-lg text-center py-8">
          <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-4 border-vc-coral/20 border-t-vc-coral" />
          <h3 className="font-semibold text-vc-indigo">Importing from {selectedProvider?.label}...</h3>
          <p className="mt-1 text-sm text-vc-text-secondary">
            This may take a minute for large organizations.
          </p>
        </div>
      )}

      {/* Done */}
      {step === "done" && importStats && (
        <div className="max-w-lg">
          <div className="grid grid-cols-3 gap-3">
            <StatCard label="People found" value={importStats.total_people} />
            <StatCard label="Added to queue" value={importStats.queued} />
            <StatCard label="Teams selected" value={importStats.teams_selected} />
          </div>
          <div className="mt-3 rounded-lg bg-vc-sage/10 px-4 py-3">
            <p className="text-sm font-medium text-vc-sage">
              {importStats.queued} people added to the review queue.
            </p>
            <p className="text-xs text-vc-text-muted mt-0.5">
              Review and approve them on the People page, then send invites.
            </p>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="ghost" onClick={startOver}>Import from another source</Button>
            <Button onClick={onDone}>Done</Button>
          </div>
        </div>
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
  const [showRoleMenu, setShowRoleMenu] = useState(false);
  const [showScopeEditor, setShowScopeEditor] = useState(false);
  const [scopeSelection, setScopeSelection] = useState<string[]>(membership.ministry_scope || []);
  const [scopeAll, setScopeAll] = useState(!membership.ministry_scope?.length);

  useEffect(() => {
    if (!membership.user_id) return;
    getDoc(doc(db, "users", membership.user_id))
      .then((snap) => {
        if (snap.exists()) {
          setUserName(snap.data().display_name || "");
          setUserEmail(snap.data().email || "");
        }
      })
      .catch(() => {});
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
              {userName || userEmail || membership.user_id}
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
                className="rounded-lg bg-vc-sage/15 px-3 py-1.5 text-xs font-medium text-vc-sage hover:bg-vc-sage/25 transition-colors"
              >
                Approve
              </button>
              <button
                onClick={onReject}
                className="rounded-lg bg-vc-bg-cream px-3 py-1.5 text-xs font-medium text-vc-text-muted hover:bg-vc-bg-warm transition-colors"
              >
                Reject
              </button>
            </>
          )}

          {membership.status === "active" && !isCurrentUser && membership.role !== "owner" && (
            <div className="relative">
              <button
                onClick={() => setShowRoleMenu(!showRoleMenu)}
                className="rounded-lg border border-vc-border px-2 py-1.5 text-xs text-vc-text-secondary hover:bg-vc-bg-warm transition-colors"
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

// ---------------------------------------------------------------------------
// Invite Queue Review Panel
// ---------------------------------------------------------------------------

function InviteQueuePanel({
  churchId,
  user,
  items,
  ministries,
  onClose,
  onRefresh,
}: {
  churchId: string;
  user: ReturnType<typeof useAuth>["user"];
  items: InviteQueueItem[];
  ministries: Ministry[];
  onClose: () => void;
  onRefresh: () => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [localItems, setLocalItems] = useState(items);
  const [sending, setSending] = useState(false);
  const [sendProgress, setSendProgress] = useState<{ sent: number; failed: number; total: number } | null>(null);

  useEffect(() => { setLocalItems(items); }, [items]);

  const pendingReview = localItems.filter((i) => i.status === "pending_review");
  const approved = localItems.filter((i) => i.status === "approved");

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function selectAll() {
    if (selected.size === pendingReview.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(pendingReview.map((i) => i.id)));
    }
  }

  async function bulkUpdateStatus(ids: string[], status: "approved" | "skipped") {
    for (const id of ids) {
      try {
        await updateChurchDocument(churchId, "invite_queue", id, {
          status,
          reviewed_by: user?.uid || null,
          reviewed_at: new Date().toISOString(),
        });
      } catch { /* best effort */ }
    }
    setLocalItems((prev) =>
      prev.map((i) => ids.includes(i.id) ? { ...i, status } : i),
    );
    setSelected(new Set());
  }

  function handleApproveSelected() {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    bulkUpdateStatus(ids, "approved");
  }

  function handleSkipSelected() {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    bulkUpdateStatus(ids, "skipped");
  }

  async function handleSendApproved() {
    const approvedIds = approved.map((i) => i.id);
    if (approvedIds.length === 0) return;
    setSending(true);
    setSendProgress({ sent: 0, failed: 0, total: approvedIds.length });
    try {
      const token = await getAuth().currentUser?.getIdToken();
      const res = await fetch("/api/invite/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ church_id: churchId, queue_item_ids: approvedIds }),
      });
      const data = await res.json();
      setSendProgress({ sent: data.sent || 0, failed: data.failed || 0, total: approvedIds.length });
      onRefresh();
    } catch {
      setSendProgress((prev) => prev ? { ...prev, failed: prev.total } : null);
    } finally {
      setSending(false);
    }
  }

  function handleEditRole(id: string, newRole: OrgRole) {
    updateChurchDocument(churchId, "invite_queue", id, { role: newRole });
    setLocalItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, role: newRole } : i)),
    );
  }

  return (
    <div className="mb-6 rounded-xl border border-vc-border-light bg-white p-6">
      <PanelHeader
        title="Review Import Queue"
        subtitle={`${pendingReview.length} pending review · ${approved.length} approved`}
        onClose={onClose}
      />

      {sendProgress && !sending && (
        <div className="mb-4 rounded-lg bg-vc-sage/10 px-4 py-3">
          <p className="text-sm font-medium text-vc-sage">
            {sendProgress.sent} invite{sendProgress.sent !== 1 ? "s" : ""} sent
            {sendProgress.failed > 0 && (
              <span className="text-vc-danger"> · {sendProgress.failed} failed</span>
            )}
          </p>
        </div>
      )}

      {/* Bulk actions */}
      {pendingReview.length > 0 && (
        <div className="mb-4 flex items-center gap-2 flex-wrap">
          <button
            onClick={selectAll}
            className="rounded-lg border border-vc-border px-3 py-1.5 text-xs font-medium text-vc-text-secondary hover:bg-vc-bg-warm transition-colors"
          >
            {selected.size === pendingReview.length ? "Deselect All" : "Select All"}
          </button>
          {selected.size > 0 && (
            <>
              <span className="text-xs text-vc-text-muted">{selected.size} selected</span>
              <button
                onClick={handleApproveSelected}
                className="rounded-lg bg-vc-sage/15 px-3 py-1.5 text-xs font-medium text-vc-sage hover:bg-vc-sage/25 transition-colors"
              >
                Approve
              </button>
              <button
                onClick={handleSkipSelected}
                className="rounded-lg bg-vc-bg-cream px-3 py-1.5 text-xs font-medium text-vc-text-muted hover:bg-vc-bg-warm transition-colors"
              >
                Skip
              </button>
            </>
          )}
          {approved.length > 0 && (
            <div className="ml-auto">
              <Button onClick={handleSendApproved} loading={sending}>
                Send {approved.length} Invite{approved.length !== 1 ? "s" : ""}
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Only approved, no pending */}
      {pendingReview.length === 0 && approved.length > 0 && (
        <div className="mb-4 flex items-center justify-between">
          <p className="text-sm text-vc-text-secondary">All items reviewed. Ready to send invites.</p>
          <Button onClick={handleSendApproved} loading={sending}>
            Send {approved.length} Invite{approved.length !== 1 ? "s" : ""}
          </Button>
        </div>
      )}

      {/* Sending progress */}
      {sending && sendProgress && (
        <div className="mb-4 rounded-lg bg-vc-bg-warm px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-vc-coral/20 border-t-vc-coral" />
            <p className="text-sm font-medium text-vc-indigo">
              Sending invites... {sendProgress.sent + sendProgress.failed} of {sendProgress.total}
            </p>
          </div>
        </div>
      )}

      {/* Queue table */}
      {localItems.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border border-vc-border-light">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-vc-border-light bg-vc-bg-warm/50">
                <th className="w-10 px-3 py-2" />
                <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-vc-text-muted">Name</th>
                <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-vc-text-muted">Email</th>
                <th className="hidden px-3 py-2 text-xs font-semibold uppercase tracking-wider text-vc-text-muted sm:table-cell">Phone</th>
                <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-vc-text-muted">Source</th>
                <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-vc-text-muted">Role</th>
                <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-vc-text-muted">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-vc-border-light">
              {localItems.map((item) => (
                <tr key={item.id} className="hover:bg-vc-bg-warm/30 transition-colors">
                  <td className="px-3 py-2">
                    {item.status === "pending_review" && (
                      <input
                        type="checkbox"
                        checked={selected.has(item.id)}
                        onChange={() => toggleSelect(item.id)}
                        className="rounded border-vc-border text-vc-coral focus:ring-vc-coral"
                      />
                    )}
                  </td>
                  <td className="px-3 py-2 font-medium text-vc-indigo">{item.name || "\u2014"}</td>
                  <td className="px-3 py-2 text-vc-text-secondary">{item.email || "\u2014"}</td>
                  <td className="hidden px-3 py-2 text-vc-text-secondary sm:table-cell">{formatPhone(item.phone)}</td>
                  <td className="px-3 py-2">
                    <span className="inline-flex items-center rounded-full bg-vc-bg-warm px-2 py-0.5 text-xs font-medium text-vc-text-secondary">
                      {item.source === "csv" ? "CSV" : item.source === "chms" ? (item.source_provider || "ChMS") : "Manual"}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <select
                      value={item.role}
                      onChange={(e) => handleEditRole(item.id, e.target.value as OrgRole)}
                      disabled={item.status !== "pending_review" && item.status !== "approved"}
                      className="rounded-lg border border-vc-border bg-white px-2 py-1 text-xs text-vc-text-secondary focus:border-vc-coral focus:outline-none"
                    >
                      <option value="volunteer">Volunteer</option>
                      <option value="scheduler">Scheduler</option>
                      <option value="admin">Admin</option>
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    {item.status === "pending_review" && (
                      <span className="inline-flex items-center rounded-full bg-vc-sand/30 px-2 py-0.5 text-xs font-medium text-vc-sand">
                        Pending
                      </span>
                    )}
                    {item.status === "approved" && (
                      <span className="inline-flex items-center rounded-full bg-vc-sage/15 px-2 py-0.5 text-xs font-medium text-vc-sage">
                        Approved
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="rounded-xl border border-vc-border-light bg-white p-8 text-center">
          <p className="text-vc-text-muted">Queue is empty. Import people from CSV or a ChMS to get started.</p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Phone formatting
// ---------------------------------------------------------------------------


// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-vc-bg-warm p-3 text-center">
      <p className="text-2xl font-semibold text-vc-indigo">{value}</p>
      <p className="text-xs text-vc-text-muted">{label}</p>
    </div>
  );
}

function ProviderIcon({ provider }: { provider: IntegrationProvider }) {
  const colors: Record<IntegrationProvider, string> = {
    planning_center: "bg-vc-indigo/10 text-vc-indigo",
    breeze: "bg-vc-coral/10 text-vc-coral",
    rock_rms: "bg-vc-sage/10 text-vc-sage",
  };

  return (
    <div className={`inline-flex h-10 w-10 items-center justify-center rounded-xl ${colors[provider]}`}>
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244" />
      </svg>
    </div>
  );
}

/** Parse a single CSV line handling quoted fields */
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}
