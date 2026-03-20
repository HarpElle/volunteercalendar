"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/lib/context/auth-context";
import {
  updateMembershipStatus,
  updateMembershipReminders,
  deleteMembership,
} from "@/lib/firebase/firestore";
import { db } from "@/lib/firebase/config";
import { doc, getDoc } from "firebase/firestore";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type { Membership, ReminderChannel } from "@/lib/types";

interface OrgInfo {
  name: string;
  orgType: string;
}

const ROLE_DISPLAY: Record<string, string> = {
  owner: "Owner",
  admin: "Admin",
  scheduler: "Scheduler",
  volunteer: "Volunteer",
};

export default function MyOrgsPage() {
  const { memberships, activeMembership, switchOrg, refreshMemberships, user } = useAuth();
  const [orgInfo, setOrgInfo] = useState<Map<string, OrgInfo>>(new Map());
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    async function loadOrgs() {
      const info = new Map<string, OrgInfo>();
      for (const m of memberships) {
        try {
          const snap = await getDoc(doc(db, "churches", m.church_id));
          if (snap.exists()) {
            info.set(m.church_id, {
              name: snap.data().name || "Unknown",
              orgType: snap.data().org_type || "church",
            });
          }
        } catch {
          // skip
        }
      }
      setOrgInfo(info);
      setLoading(false);
    }
    loadOrgs();
  }, [memberships]);

  const activeMems = memberships.filter((m) => m.status === "active");
  const pendingInvites = memberships.filter((m) => m.status === "pending_volunteer_approval");
  const pendingApprovals = memberships.filter((m) => m.status === "pending_org_approval");

  async function handleAcceptInvite(m: Membership) {
    setActionLoading(m.id);
    try {
      await updateMembershipStatus(m.id, "active");
      await refreshMemberships();
    } catch {
      // silent
    } finally {
      setActionLoading(null);
    }
  }

  async function handleDeclineInvite(m: Membership) {
    setActionLoading(m.id);
    try {
      await updateMembershipStatus(m.id, "inactive");
      await refreshMemberships();
    } catch {
      // silent
    } finally {
      setActionLoading(null);
    }
  }

  async function handleLeaveOrg(m: Membership) {
    if (!confirm(`Leave ${orgInfo.get(m.church_id)?.name || "this organization"}? This can't be undone.`)) return;
    setActionLoading(m.id);
    try {
      await deleteMembership(m.id);
      await refreshMemberships();
    } catch {
      // silent
    } finally {
      setActionLoading(null);
    }
  }

  async function toggleReminder(m: Membership, channel: ReminderChannel) {
    const current = m.reminder_preferences.channels;
    const updated = current.includes(channel)
      ? current.filter((c) => c !== channel)
      : [...current, channel];
    await updateMembershipReminders(m.id, updated);
    await refreshMemberships();
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-8">
        <h1 className="font-display text-3xl text-vc-indigo">My Organizations</h1>
        <p className="mt-1 text-vc-text-secondary">
          Manage your memberships, reminders, and switch between organizations.
        </p>
      </div>

      {/* Pending Invites */}
      {pendingInvites.length > 0 && (
        <div className="mb-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-vc-text-muted mb-3">
            Pending Invitations
          </h2>
          <div className="space-y-2">
            {pendingInvites.map((m) => {
              const info = orgInfo.get(m.church_id);
              return (
                <div key={m.id} className="rounded-xl border border-vc-coral/30 bg-vc-coral/5 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-vc-indigo">{info?.name || m.church_id}</p>
                      <p className="text-sm text-vc-text-muted">
                        Invited as {ROLE_DISPLAY[m.role] || m.role}
                      </p>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <button
                        onClick={() => handleAcceptInvite(m)}
                        disabled={actionLoading === m.id}
                        className="rounded-lg bg-vc-sage px-3 py-1.5 text-xs font-medium text-white hover:bg-vc-sage/90 transition-colors disabled:opacity-50"
                      >
                        Accept
                      </button>
                      <button
                        onClick={() => handleDeclineInvite(m)}
                        disabled={actionLoading === m.id}
                        className="rounded-lg border border-vc-border px-3 py-1.5 text-xs font-medium text-vc-text-secondary hover:bg-vc-bg-warm transition-colors disabled:opacity-50"
                      >
                        Decline
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Pending Approvals */}
      {pendingApprovals.length > 0 && (
        <div className="mb-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-vc-text-muted mb-3">
            Awaiting Approval
          </h2>
          <div className="space-y-2">
            {pendingApprovals.map((m) => {
              const info = orgInfo.get(m.church_id);
              return (
                <div key={m.id} className="rounded-xl border border-vc-sand/40 bg-vc-sand/10 p-4">
                  <p className="font-semibold text-vc-indigo">{info?.name || m.church_id}</p>
                  <p className="text-sm text-vc-text-muted">
                    Your request is waiting for admin approval.
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Active Orgs */}
      <h2 className="text-sm font-semibold uppercase tracking-wide text-vc-text-muted mb-3">
        Active Memberships
      </h2>

      {activeMems.length === 0 ? (
        <div className="rounded-xl border border-dashed border-vc-border bg-white p-8 text-center">
          <p className="text-vc-text-secondary">You're not a member of any organizations yet.</p>
          <p className="mt-1 text-sm text-vc-text-muted">
            Ask your admin for an invite link, or create a new organization.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {activeMems.map((m) => {
            const info = orgInfo.get(m.church_id);
            const isActive = activeMembership?.id === m.id;
            const isOwner = m.role === "owner";

            return (
              <div
                key={m.id}
                className={`rounded-xl border bg-white p-5 transition-shadow hover:shadow-md ${
                  isActive ? "border-vc-coral shadow-sm" : "border-vc-border-light"
                }`}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-vc-indigo">{info?.name || m.church_id}</p>
                      {isActive && (
                        <span className="rounded-full bg-vc-coral/10 px-2 py-0.5 text-[10px] font-semibold text-vc-coral uppercase tracking-wide">
                          Active
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-sm text-vc-text-muted">
                      {ROLE_DISPLAY[m.role] || m.role}
                      {info?.orgType && info.orgType !== "church" && ` · ${info.orgType}`}
                    </p>
                  </div>
                  {!isActive && (
                    <button
                      onClick={() => switchOrg(m.church_id)}
                      className="rounded-lg border border-vc-coral px-3 py-1.5 text-xs font-medium text-vc-coral hover:bg-vc-coral/5 transition-colors"
                    >
                      Switch to
                    </button>
                  )}
                </div>

                {/* Reminder preferences */}
                <div className="mt-3 flex items-center gap-3 flex-wrap">
                  <span className="text-xs text-vc-text-muted">Reminders:</span>
                  {(["email", "sms", "calendar"] as ReminderChannel[]).map((ch) => {
                    const isOn = m.reminder_preferences.channels.includes(ch);
                    return (
                      <button
                        key={ch}
                        onClick={() => toggleReminder(m, ch)}
                        className={`rounded-md border px-2 py-1 text-xs font-medium transition-all ${
                          isOn
                            ? "border-vc-sage/40 bg-vc-sage/10 text-vc-sage"
                            : "border-vc-border text-vc-text-muted hover:border-vc-indigo/20"
                        }`}
                      >
                        {ch === "sms" ? "SMS" : ch.charAt(0).toUpperCase() + ch.slice(1)}
                      </button>
                    );
                  })}
                </div>

                {/* Leave org */}
                {!isOwner && (
                  <div className="mt-3 border-t border-vc-border-light pt-3">
                    <button
                      onClick={() => handleLeaveOrg(m)}
                      disabled={actionLoading === m.id}
                      className="text-xs text-vc-text-muted hover:text-vc-danger transition-colors disabled:opacity-50"
                    >
                      Leave organization
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
