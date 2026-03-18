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
import { getOrgTerms } from "@/lib/utils/org-terms";
import { INTEGRATIONS } from "@/lib/integrations/config";
import { ShortLinkCreator } from "@/components/ui/short-link-creator";
import type {
  Volunteer,
  Ministry,
  Membership,
  OrgRole,
  OrgType,
} from "@/lib/types";
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
  inactive: { label: "Inactive", color: "bg-gray-100 text-gray-500" },
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
  const [churchName, setChurchName] = useState("");
  const [orgType, setOrgType] = useState<OrgType | undefined>();
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  // Add People panel
  const [addMode, setAddMode] = useState<null | "individual" | "csv" | "chms">(null);

  useEffect(() => {
    if (!churchId) return;
    async function load() {
      try {
        const [vols, mins, mems, churchSnap] = await Promise.all([
          getChurchDocuments(churchId!, "volunteers"),
          getChurchDocuments(churchId!, "ministries"),
          getChurchMemberships(churchId!),
          getDoc(doc(db, "churches", churchId!)),
        ]);
        setVolunteers(vols as unknown as Volunteer[]);
        setMinistries(mins as unknown as Ministry[]);
        setMemberships(mems);
        if (churchSnap.exists()) {
          setChurchName(churchSnap.data().name || "");
          setOrgType(churchSnap.data().org_type as OrgType);
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
  }

  async function handleReject(m: Membership) {
    await deleteMembership(m.id);
    setMemberships((prev) => prev.filter((x) => x.id !== m.id));
  }

  async function handleChangeRole(m: Membership, newRole: OrgRole) {
    await updateMembershipRole(m.id, newRole);
    setMemberships((prev) =>
      prev.map((x) => (x.id === m.id ? { ...x, role: newRole, updated_at: new Date().toISOString() } : x)),
    );
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
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-3xl text-vc-indigo">People</h1>
          <p className="mt-1 text-vc-text-secondary">
            {volunteers.length} in roster · {activeMems.length} active members · {pendingMems.length} pending
          </p>
        </div>
        {canManage && addMode === null && (
          <AddPeopleMenu onSelect={setAddMode} />
        )}
      </div>

      {/* Add People panels */}
      {addMode === "individual" && canManage && (
        <AddIndividualPanel
          churchId={churchId!}
          ministries={ministries}
          onAdded={(v) => {
            setVolunteers((prev) => [...prev, v]);
            setAddMode(null);
          }}
          onCancel={() => setAddMode(null)}
        />
      )}

      {addMode === "csv" && canManage && (
        <CSVImportPanel
          churchId={churchId!}
          onImported={(newVols) => {
            setVolunteers((prev) => [...prev, ...newVols]);
            setAddMode(null);
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
            // Refresh data
            if (churchId) {
              getChurchDocuments(churchId, "volunteers").then((vols) =>
                setVolunteers(vols as unknown as Volunteer[]),
              );
            }
          }}
          onCancel={() => setAddMode(null)}
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
                      <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-vc-text-muted">Name</th>
                      <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-vc-text-muted">Email</th>
                      <th className="hidden px-5 py-3 text-xs font-semibold uppercase tracking-wider text-vc-text-muted sm:table-cell">Phone</th>
                      <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-vc-text-muted">Role</th>
                      <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-vc-text-muted">{terms.plural}</th>
                      {canManage && (
                        <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-vc-text-muted">Actions</th>
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
            <JoinLinkSection churchId={churchId!} churchName={churchName} />
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
                  isCurrentUser={m.user_id === user?.uid}
                  onApprove={() => handleApprove(m)}
                  onReject={() => handleReject(m)}
                  onChangeRole={(role) => handleChangeRole(m, role)}
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
  onUpdated: (v: Volunteer) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(v.name);
  const [email, setEmail] = useState(v.email);
  const [phone, setPhone] = useState(v.phone || "");
  const [selectedMinistries, setSelectedMinistries] = useState<string[]>(v.ministry_ids);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  function toggleMinistry(id: string) {
    setSelectedMinistries((prev) =>
      prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id],
    );
  }

  async function handleSave() {
    setSaving(true);
    try {
      const updateData = {
        name,
        email,
        phone: phone || null,
        ministry_ids: selectedMinistries,
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
              <Input label="Phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
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
      <td className="hidden px-5 py-3 text-vc-text-secondary sm:table-cell">{v.phone || "\u2014"}</td>
      <td className="px-5 py-3">
        {mem ? (
          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
            STATUS_LABELS[mem.status]?.color || "bg-gray-100 text-gray-500"
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
                <p className="text-xs text-vc-text-muted">Add someone manually</p>
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
  onImported,
  onCancel,
}: {
  churchId: string;
  onImported: (volunteers: Volunteer[]) => void;
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

      let imported = 0;
      const errors: string[] = [];
      const newVolunteers: Volunteer[] = [];

      for (let i = 1; i < lines.length; i++) {
        const cols = parseCSVLine(lines[i]);
        const volName = cols[nameIdx]?.trim();
        if (!volName) {
          errors.push(`Row ${i + 1}: missing name, skipped.`);
          continue;
        }

        const volData: Omit<Volunteer, "id"> = {
          name: volName,
          email: emailIdx >= 0 ? cols[emailIdx]?.trim() || "" : "",
          phone: phoneIdx >= 0 ? cols[phoneIdx]?.trim() || null : null,
          church_id: churchId,
          user_id: null,
          ministry_ids: [],
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
          imported_from: "csv",
          status: "active" as const,
          membership_id: null,
          created_at: new Date().toISOString(),
        };

        try {
          const ref = await addChurchDocument(churchId, "volunteers", volData);
          newVolunteers.push({ id: ref.id, ...volData });
          imported++;
        } catch {
          errors.push(`Row ${i + 1}: failed to save "${volName}".`);
        }
      }

      setImportStatus({ count: imported, errors });
      if (imported > 0) onImported(newVolunteers);
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
        subtitle="Upload a spreadsheet with name (required), email, and phone columns."
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
                Columns: <strong>name</strong> (required), email, phone. Ministries can be assigned after import.
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
                Successfully imported {importStatus.count} {importStatus.count !== 1 ? "people" : "person"}.
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

type ChMSStep = "select" | "connect" | "testing" | "connected" | "importing" | "done";

interface ImportStats {
  imported: number;
  skipped: number;
  teams_found: number;
  people_found: number;
  errors: string[];
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
  const [importStats, setImportStats] = useState<ImportStats | null>(null);
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

  async function runImport() {
    if (!selectedProvider) return;
    setImporting(true);
    setError("");
    setStep("importing");
    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/import", {
        method: "POST",
        headers,
        body: JSON.stringify({ action: "import", provider: selectedProvider.provider, credentials, church_id: churchId }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Import failed"); setStep("connected"); return; }
      setImportStats(data);
      setStep("done");
    } catch { setError("Import failed. Please try again."); setStep("connected"); } finally { setImporting(false); }
  }

  function startOver() {
    setStep("select");
    setSelectedProvider(null);
    setCredentials({});
    setTestResult(null);
    setImportStats(null);
    setError("");
  }

  const STEP_LABELS: Record<ChMSStep, string> = {
    select: "Choose platform",
    connect: "Enter credentials",
    testing: "Testing connection",
    connected: "Ready to import",
    importing: "Importing",
    done: "Complete",
  };

  const stepOrder: ChMSStep[] = ["select", "connect", "connected", "done"];
  const currentStepIdx = stepOrder.indexOf(
    step === "testing" ? "connect" : step === "importing" ? "done" : step,
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

      {/* Connected */}
      {step === "connected" && selectedProvider && (
        <div className="max-w-lg">
          <div className="flex items-center gap-3 rounded-lg bg-vc-sage/10 px-4 py-3 mb-4">
            <svg className="h-5 w-5 shrink-0 text-vc-sage" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
            </svg>
            <div>
              <p className="text-sm font-medium text-vc-sage">Connected to {selectedProvider.label}</p>
              <p className="text-xs text-vc-text-muted">Existing people (matched by email) will be updated, not duplicated.</p>
            </div>
          </div>
          {error && <div className="mb-3 rounded-lg bg-vc-danger/5 px-4 py-3 text-sm text-vc-danger">{error}</div>}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={startOver}>Back</Button>
            <Button onClick={runImport} loading={importing}>Import People</Button>
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
          <div className="grid grid-cols-2 gap-3">
            <StatCard label="People found" value={importStats.people_found} />
            <StatCard label="Imported" value={importStats.imported} />
            <StatCard label="Teams found" value={importStats.teams_found} />
            <StatCard label="Skipped" value={importStats.skipped} />
          </div>
          {importStats.errors.length > 0 && (
            <div className="mt-4 rounded-lg bg-vc-danger/5 p-4">
              <p className="mb-1 text-xs font-semibold text-vc-danger">Issues</p>
              {importStats.errors.map((err, i) => (
                <p key={i} className="text-xs text-vc-danger/80">{err}</p>
              ))}
            </div>
          )}
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
  onInvited,
}: {
  churchId: string;
  user: ReturnType<typeof useAuth>["user"];
  onInvited: () => void;
}) {
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteRole, setInviteRole] = useState<OrgRole>("volunteer");
  const [inviting, setInviting] = useState(false);
  const [inviteMsg, setInviteMsg] = useState("");

  async function handleInvite(e: FormEvent) {
    e.preventDefault();
    if (!user) return;
    setInviting(true);
    setInviteMsg("");

    try {
      const token = await getAuth().currentUser?.getIdToken();
      const res = await fetch("/api/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ email: inviteEmail, name: inviteName, churchId, role: inviteRole }),
      });
      const data = await res.json();
      if (!res.ok) {
        setInviteMsg(data.error || "Failed to send invitation");
      } else {
        setInviteMsg(data.action === "approved_existing" ? "Member approved!" : "Invitation sent!");
        setInviteEmail("");
        setInviteName("");
        setInviteRole("volunteer");
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

function JoinLinkSection({ churchId, churchName }: { churchId: string; churchName: string }) {
  const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
  const joinLink = `${baseUrl}/join/${churchId}`;
  const [copied, setCopied] = useState(false);
  const [showShareMenu, setShowShareMenu] = useState(false);
  const [showShortLinkCreator, setShowShortLinkCreator] = useState(false);
  const shareRef = useRef<HTMLDivElement>(null);

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

  function handleCopy() {
    navigator.clipboard.writeText(joinLink);
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
      instructions: [
        "Scan the QR code with your phone camera",
        "Create a free account (or sign in)",
        "Request to join — we'll approve you shortly!",
      ],
      footer: "Powered by VolunteerCal",
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
    });
  }

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
              <button
                onClick={handlePrintFlyer}
                className="w-full px-3 py-2.5 text-left text-sm text-vc-text-secondary hover:bg-vc-bg-warm transition-colors flex items-center gap-2"
              >
                <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0 1 10.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0 .229 2.523a1.125 1.125 0 0 1-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0 0 21 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 0 0-1.913-.247M6.34 18H5.25A2.25 2.25 0 0 1 3 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.041 48.041 0 0 1 1.913-.247m10.5 0a48.536 48.536 0 0 0-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M18 10.5h.008v.008H18V10.5Zm-3 0h.008v.008H15V10.5Z" />
                </svg>
                Print QR flyer
              </button>
              <button
                onClick={handleDownloadSlide}
                className="w-full px-3 py-2.5 text-left text-sm text-vc-text-secondary hover:bg-vc-bg-warm transition-colors flex items-center gap-2"
              >
                <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
                </svg>
                Download slide (16:9)
              </button>
              <div className="my-1 border-t border-vc-border-light" />
              <button
                onClick={() => { setShowShareMenu(false); setShowShortLinkCreator(true); }}
                className="w-full px-3 py-2.5 text-left text-sm text-vc-text-secondary hover:bg-vc-bg-warm transition-colors flex items-center gap-2"
              >
                <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244" />
                </svg>
                Create short link
              </button>
            </div>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <input
          readOnly
          value={joinLink}
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
  isCurrentUser,
  onApprove,
  onReject,
  onChangeRole,
  onRemove,
}: {
  membership: Membership;
  isCurrentUser: boolean;
  onApprove: () => void;
  onReject: () => void;
  onChangeRole: (role: OrgRole) => void;
  onRemove: () => void;
}) {
  const [userName, setUserName] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [showRoleMenu, setShowRoleMenu] = useState(false);

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

  const statusInfo = STATUS_LABELS[membership.status] || { label: membership.status, color: "bg-gray-100 text-gray-500" };
  const isPending = membership.status === "pending_org_approval" || membership.status === "pending_volunteer_approval";

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
                className="rounded-lg bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-500 hover:bg-gray-200 transition-colors"
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
                <div className="absolute right-0 top-full mt-1 z-10 w-40 rounded-xl border border-vc-border-light bg-white py-1 shadow-lg">
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
    </div>
  );
}

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
