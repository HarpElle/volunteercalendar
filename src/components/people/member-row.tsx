"use client";

import { useState, useEffect } from "react";
import { db } from "@/lib/firebase/config";
import { doc, getDoc } from "firebase/firestore";
import { Button } from "@/components/ui/button";
import type { Membership, Ministry, OrgRole } from "@/lib/types";

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

interface MemberRowProps {
  membership: Membership;
  ministries: Ministry[];
  isCurrentUser: boolean;
  onApprove: () => void;
  onReject: () => void;
  onChangeRole: (role: OrgRole, ministryScope?: string[]) => void;
  onRemove: () => void;
}

export function MemberRow({
  membership,
  ministries,
  isCurrentUser,
  onApprove,
  onReject,
  onChangeRole,
  onRemove,
}: MemberRowProps) {
  const [userName, setUserName] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [showRoleMenu, setShowRoleMenu] = useState(false);
  const [showScopeEditor, setShowScopeEditor] = useState(false);
  const [scopeSelection, setScopeSelection] = useState<string[]>(membership.ministry_scope || []);
  const [scopeAll, setScopeAll] = useState(!membership.ministry_scope?.length);

  useEffect(() => {
    // Prefer server-enriched data (from /api/people-data or /api/memberships)
    const m = membership as unknown as Record<string, unknown>;
    if (m._user_display_name !== undefined || m._user_email !== undefined) {
      setUserName((m._user_display_name as string) || "");
      setUserEmail((m._user_email as string) || "");
      setLoaded(true);
      return;
    }
    // Fallback: client-side fetch (for contexts without enrichment)
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
