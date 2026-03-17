"use client";

import { useState, useEffect, type FormEvent } from "react";
import { useAuth } from "@/lib/context/auth-context";
import {
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
import { isAdmin } from "@/lib/utils/permissions";
import type { Membership, OrgRole } from "@/lib/types";

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

export default function MembersPage() {
  const { profile, activeMembership, user } = useAuth();
  const churchId = activeMembership?.church_id || profile?.church_id;

  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [churchName, setChurchName] = useState("");
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"active" | "pending">("active");

  // Invite form
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteRole, setInviteRole] = useState<OrgRole>("volunteer");
  const [inviting, setInviting] = useState(false);
  const [inviteMsg, setInviteMsg] = useState("");

  const canManage = isAdmin(activeMembership);

  useEffect(() => {
    if (!churchId) return;
    async function load() {
      const [mems, churchSnap] = await Promise.all([
        getChurchMemberships(churchId!),
        getDoc(doc(db, "churches", churchId!)),
      ]);
      setMemberships(mems);
      if (churchSnap.exists()) setChurchName(churchSnap.data().name || "");
      setLoading(false);
    }
    load();
  }, [churchId]);

  const activeMems = memberships.filter((m) => m.status === "active");
  const pendingMems = memberships.filter(
    (m) => m.status === "pending_org_approval" || m.status === "pending_volunteer_approval",
  );

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

  async function handleRemove(m: Membership) {
    if (!confirm(`Remove this member from ${churchName}?`)) return;
    await deleteMembership(m.id);
    setMemberships((prev) => prev.filter((x) => x.id !== m.id));
  }

  async function handleInvite(e: FormEvent) {
    e.preventDefault();
    if (!churchId || !user) return;
    setInviting(true);
    setInviteMsg("");

    try {
      const token = await getAuth().currentUser?.getIdToken();
      const res = await fetch("/api/invite", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          email: inviteEmail,
          name: inviteName,
          churchId,
          role: inviteRole,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setInviteMsg(data.error || "Failed to send invitation");
      } else {
        setInviteMsg(data.action === "approved_existing" ? "Member approved!" : "Invitation sent!");
        setInviteEmail("");
        setInviteName("");
        setInviteRole("volunteer");
        // Refresh memberships
        const mems = await getChurchMemberships(churchId);
        setMemberships(mems);
      }
    } catch {
      setInviteMsg("Failed to send invitation");
    } finally {
      setInviting(false);
    }
  }

  // Get join link for sharing
  const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
  const joinLink = `${baseUrl}/join/${churchId}`;

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!canManage) {
    return (
      <div className="text-center py-20">
        <h1 className="font-display text-2xl text-vc-indigo mb-2">Access Denied</h1>
        <p className="text-vc-text-secondary">Only admins and owners can manage members.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-3xl text-vc-indigo">Members</h1>
          <p className="mt-1 text-vc-text-secondary">
            {activeMems.length} active · {pendingMems.length} pending
          </p>
        </div>
        <Button onClick={() => setShowInvite(!showInvite)}>
          {showInvite ? "Cancel" : "Invite Member"}
        </Button>
      </div>

      {/* Invite Form */}
      {showInvite && (
        <div className="mb-6 rounded-2xl border border-vc-border-light bg-white p-6">
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
            <Button type="submit" loading={inviting}>
              Send Invitation
            </Button>
          </form>

          {/* Shareable join link */}
          <div className="mt-5 border-t border-vc-border-light pt-4">
            <p className="text-sm font-medium text-vc-text mb-2">Or share this join link</p>
            <div className="flex items-center gap-2">
              <input
                readOnly
                value={joinLink}
                className="flex-1 rounded-lg border border-vc-border bg-vc-bg px-3 py-2 text-sm text-vc-text-secondary"
                onClick={(e) => (e.target as HTMLInputElement).select()}
              />
              <button
                onClick={() => navigator.clipboard.writeText(joinLink)}
                className="shrink-0 rounded-lg border border-vc-border px-3 py-2 text-sm font-medium text-vc-text-secondary hover:bg-vc-bg-warm transition-colors"
              >
                Copy
              </button>
            </div>
            <p className="mt-1 text-xs text-vc-text-muted">
              Anyone with this link can request to join. You'll need to approve them.
            </p>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="mb-4 flex gap-1 rounded-xl bg-vc-bg-warm p-1">
        <button
          onClick={() => setTab("active")}
          className={`flex-1 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
            tab === "active" ? "bg-white text-vc-indigo shadow-sm" : "text-vc-text-secondary"
          }`}
        >
          Active ({activeMems.length})
        </button>
        <button
          onClick={() => setTab("pending")}
          className={`flex-1 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
            tab === "pending" ? "bg-white text-vc-indigo shadow-sm" : "text-vc-text-secondary"
          }`}
        >
          Pending ({pendingMems.length})
        </button>
      </div>

      {/* Member List */}
      <div className="space-y-2">
        {tab === "active" && activeMems.length === 0 && (
          <div className="rounded-xl border border-vc-border-light bg-white p-8 text-center">
            <p className="text-vc-text-muted">No active members yet. Invite someone to get started.</p>
          </div>
        )}

        {tab === "pending" && pendingMems.length === 0 && (
          <div className="rounded-xl border border-vc-border-light bg-white p-8 text-center">
            <p className="text-vc-text-muted">No pending requests or invitations.</p>
          </div>
        )}

        {(tab === "active" ? activeMems : pendingMems).map((m) => (
          <MemberRow
            key={m.id}
            membership={m}
            isCurrentUser={m.user_id === user?.uid}
            onApprove={() => handleApprove(m)}
            onReject={() => handleReject(m)}
            onChangeRole={(role) => handleChangeRole(m, role)}
            onRemove={() => handleRemove(m)}
          />
        ))}
      </div>
    </div>
  );
}

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
    getDoc(doc(db, "users", membership.user_id)).then((snap) => {
      if (snap.exists()) {
        setUserName(snap.data().display_name || "");
        setUserEmail(snap.data().email || "");
      }
    }).catch(() => {});
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
            {membership.role === "scheduler" && membership.ministry_scope.length > 0 && (
              <span className="text-xs text-vc-text-muted">
                {membership.ministry_scope.length} {membership.ministry_scope.length === 1 ? "ministry" : "ministries"}
              </span>
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
                      onClick={() => {
                        onChangeRole(r);
                        setShowRoleMenu(false);
                      }}
                      className={`w-full px-3 py-2 text-left text-sm transition-colors hover:bg-vc-bg-warm ${
                        r === membership.role ? "font-medium text-vc-coral" : "text-vc-text-secondary"
                      }`}
                    >
                      {ROLE_LABELS[r]}
                    </button>
                  ))}
                  <div className="my-1 border-t border-vc-border-light" />
                  <button
                    onClick={() => {
                      onRemove();
                      setShowRoleMenu(false);
                    }}
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
