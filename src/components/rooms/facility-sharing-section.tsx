"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/context/auth-context";
import {
  getChurchFacilityGroups,
  getFacilityGroupMembers,
  createFacilityGroup,
  inviteToFacilityGroup,
  acceptFacilityInvite,
  leaveFacilityGroup,
} from "@/lib/firebase/firestore";
import { Spinner } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TIER_LIMITS } from "@/lib/constants";
import { db } from "@/lib/firebase/config";
import { doc, getDoc } from "firebase/firestore";
import type { FacilityGroup, FacilityGroupMember } from "@/lib/types";

/**
 * FacilitySharingSection — cross-org facility groups (shared building/site
 * scheduling). Hosts a Setup Code panel, pending-invite acceptance, active
 * group list with invite + leave actions, and host-only create-group form.
 *
 * Extracted from /dashboard/org/campuses (Phase 3c-ii). Now mounted at
 * /dashboard/rooms/facility as the Rooms → Facility Groups landing.
 *
 * Renders on every tier so Free invitees can accept invites and see their
 * own Setup Code; the create-group capability is internally gated by
 * tierLimits.facility_sharing.
 */
export function FacilitySharingSection({
  churchId,
  tierLimits,
}: {
  churchId: string;
  tierLimits: (typeof TIER_LIMITS)[keyof typeof TIER_LIMITS];
}) {
  const { user } = useAuth();
  // `facility_sharing` gates the HOST-side capability — creating a group and
  // sending invites. Invitees can be on any tier (they just need to accept).
  // The Setup Code panel below also renders on every tier so a Free invitee
  // can read their code aloud to a Growth+ partner org's admin.
  const canHostFacilityGroups = !!tierLimits?.facility_sharing;

  const [groups, setGroups] = useState<
    Array<FacilityGroup & { membership: FacilityGroupMember; members?: FacilityGroupMember[] }>
  >([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [inviteGroupId, setInviteGroupId] = useState<string | null>(null);
  const [inviteChurchId, setInviteChurchId] = useState("");
  const [inviting, setInviting] = useState(false);
  const [error, setError] = useState("");
  const [myShortCode, setMyShortCode] = useState("");
  const [copiedCode, setCopiedCode] = useState(false);
  // Expand by default — collapsing made it hard for Phase 5.9 testers to
  // even find the setup code or the pending-invite list.
  const [expanded, setExpanded] = useState(true);

  const loadGroups = useCallback(async () => {
    try {
      const facilityGroups = await getChurchFacilityGroups(churchId);
      const withMembers = await Promise.all(
        facilityGroups.map(async (g) => {
          const members = await getFacilityGroupMembers(g.id);
          return { ...g, members };
        }),
      );
      setGroups(withMembers);
    } catch {
      setError("Failed to load facility groups");
    } finally {
      setLoading(false);
    }
  }, [churchId]);

  useEffect(() => { loadGroups(); }, [loadGroups]);

  useEffect(() => {
    if (!user || !churchId) return;
    (async () => {
      try {
        const token = await user.getIdToken();
        const res = await fetch(`/api/church-info?id=${churchId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          if (data.short_code) setMyShortCode(data.short_code);
        }
      } catch { /* Non-critical */ }
    })();
  }, [user, churchId]);

  async function handleCreate() {
    if (!newGroupName.trim()) return;
    setCreating(true);
    setError("");
    try {
      const churchSnap = await getDoc(doc(db, "churches", churchId));
      const churchName = churchSnap.data()?.name || "My Organization";
      await createFacilityGroup(newGroupName.trim(), churchId, churchName);
      setNewGroupName("");
      await loadGroups();
    } catch {
      setError("Failed to create facility group");
    } finally {
      setCreating(false);
    }
  }

  async function handleInvite(groupId: string) {
    if (!inviteChurchId.trim() || !user) return;
    setInviting(true);
    setError("");
    try {
      const token = await user.getIdToken();
      const infoRes = await fetch(
        `/api/church-info?id=${encodeURIComponent(inviteChurchId.trim())}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!infoRes.ok) {
        setError(
          `Couldn't find an organization with code "${inviteChurchId.trim().toUpperCase()}". Ask the partner org's admin for their 6-letter Setup Code from their Facility Groups page (top of the Shared Facility section).`,
        );
        setInviting(false);
        return;
      }
      const targetInfo = await infoRes.json();
      const targetId = targetInfo.id as string;
      const targetName = targetInfo.name as string;
      const groupData = groups.find((g) => g.id === groupId);
      await inviteToFacilityGroup(groupId, targetId, targetName, churchId);
      fetch("/api/notify/facility-invite", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          church_id: churchId,
          target_church_id: targetId,
          facility_group_id: groupId,
          facility_group_name: groupData?.name || "Shared Facility",
        }),
      });
      setInviteChurchId("");
      setInviteGroupId(null);
      await loadGroups();
    } catch {
      setError("Failed to send invitation");
    } finally {
      setInviting(false);
    }
  }

  async function handleAccept(groupId: string) {
    try { await acceptFacilityInvite(groupId, churchId); await loadGroups(); } catch { setError("Failed to accept invitation"); }
  }

  async function handleLeave(groupId: string) {
    try { await leaveFacilityGroup(groupId, churchId); await loadGroups(); } catch { setError("Failed to leave facility group"); }
  }

  const activeGroups = groups.filter((g) => g.membership.status === "active");
  const pendingInvites = groups.filter((g) => g.membership.status === "pending");

  return (
    <section className="rounded-xl border border-vc-border-light bg-vc-bg-warm p-6">
      <button type="button" onClick={() => setExpanded(!expanded)} className="flex w-full items-center justify-between text-left">
        <div>
          <h2 className="mb-1 font-display text-lg text-vc-indigo">Shared Facility</h2>
          <p className="text-sm text-vc-text-secondary">Link organizations that share the same building so everyone can see room reservations across groups.</p>
        </div>
        <svg className={`ml-4 h-5 w-5 shrink-0 text-vc-text-muted transition-transform duration-200 ${expanded ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      <div className={`overflow-hidden transition-all duration-200 ${expanded ? "max-h-[800px] opacity-100" : "max-h-0 opacity-0"}`}>
        <div className="pt-5">
          {myShortCode && (
            <div className="mb-5 flex items-center gap-3 rounded-lg bg-white px-4 py-3 ring-1 ring-vc-border-light">
              <span className="text-sm text-vc-text-secondary">Your Setup Code</span>
              <span className="font-mono text-base font-semibold tracking-widest text-vc-indigo">{myShortCode}</span>
              <button onClick={() => { navigator.clipboard.writeText(myShortCode); setCopiedCode(true); setTimeout(() => setCopiedCode(false), 2000); }} className="ml-auto flex items-center gap-1 rounded-md bg-vc-bg px-2.5 py-1 text-xs text-vc-text-secondary hover:bg-vc-sand/30">
                {copiedCode ? (
                  <><svg className="h-3.5 w-3.5 text-vc-sage" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>Copied</>
                ) : (
                  <><svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>Copy</>
                )}
              </button>
            </div>
          )}

          {error && <p className="mb-4 rounded-lg bg-vc-danger/10 px-3 py-2 text-sm text-vc-danger">{error}</p>}

          {loading ? <Spinner /> : (
            <>
              {pendingInvites.length > 0 && (
                <div className="mb-6">
                  <h3 className="mb-2 text-sm font-semibold text-vc-text">Pending Invitations</h3>
                  {pendingInvites.map((g) => (
                    <div key={g.id} className="mb-2 flex items-center justify-between rounded-lg bg-white p-4 ring-1 ring-vc-border-light">
                      <div>
                        <p className="text-sm font-medium text-vc-indigo">{g.name}</p>
                        <p className="text-xs text-vc-text-secondary">Invited by another organization</p>
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => handleAccept(g.id)}>Accept</Button>
                        <Button size="sm" variant="secondary" onClick={() => handleLeave(g.id)}>Decline</Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {activeGroups.length > 0 && (
                <div className="mb-6 space-y-3">
                  {activeGroups.map((g) => (
                    <div key={g.id} className="rounded-lg bg-white p-4 ring-1 ring-vc-border-light">
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <p className="text-sm font-semibold text-vc-indigo">{g.name}</p>
                          <p className="text-xs text-vc-text-muted">{(g.members?.filter((m) => m.status === "active").length || 0)} organization{(g.members?.filter((m) => m.status === "active").length || 0) !== 1 ? "s" : ""}</p>
                        </div>
                        <div className="flex gap-2 flex-wrap">
                          <Link
                            href={`/dashboard/rooms/facility/${g.id}`}
                            className="inline-flex items-center gap-1 rounded-md border border-vc-coral text-vc-coral px-3 py-1.5 text-xs font-medium hover:bg-vc-coral/5 transition-colors"
                          >
                            View shared calendar →
                          </Link>
                          <Button size="sm" variant="secondary" onClick={() => setInviteGroupId(inviteGroupId === g.id ? null : g.id)}>Invite Org</Button>
                          <button onClick={() => handleLeave(g.id)} className="text-xs text-vc-text-muted hover:text-vc-danger">Leave</button>
                        </div>
                      </div>
                      <div className="space-y-1">
                        {g.members?.filter((m) => m.church_id !== churchId).map((m) => (
                          <div key={m.id} className="flex items-center gap-2 text-xs text-vc-text-secondary">
                            <span className="h-1.5 w-1.5 rounded-full bg-vc-sage" />{m.church_name}{m.status === "pending" && <Badge variant="warning">Pending</Badge>}
                          </div>
                        ))}
                      </div>
                      {inviteGroupId === g.id && (
                        <div className="mt-3 space-y-2">
                          <p className="text-xs text-vc-text-muted">
                            Ask the partner organization&apos;s admin for their
                            6-letter Setup Code (visible at the top of this
                            section on their Facility Groups page).
                          </p>
                          <div className="flex gap-2">
                            <input
                              type="text"
                              value={inviteChurchId}
                              onChange={(e) => setInviteChurchId(e.target.value.toUpperCase())}
                              placeholder="Partner org's Setup Code (e.g. ABC123)"
                              maxLength={8}
                              className="min-h-[36px] flex-1 rounded-lg border border-vc-border-light bg-white px-3 py-1.5 text-sm font-mono uppercase tracking-widest outline-none focus:border-vc-coral focus:ring-1 focus:ring-vc-coral/30"
                            />
                            <Button size="sm" onClick={() => handleInvite(g.id)} loading={inviting}>Send Invite</Button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Host-only: create new group. Requires facility_sharing tier. */}
              {canHostFacilityGroups ? (
                <div className="flex gap-2">
                  <input type="text" value={newGroupName} onChange={(e) => setNewGroupName(e.target.value)} placeholder="New facility group name" className="min-h-[44px] flex-1 rounded-lg border border-vc-border-light bg-white px-3 py-2 text-sm outline-none focus:border-vc-coral focus:ring-1 focus:ring-vc-coral/30" />
                  <Button onClick={handleCreate} loading={creating}>Create Group</Button>
                </div>
              ) : (
                <div className="rounded-lg border border-vc-warning/30 bg-vc-warning/5 px-4 py-3 text-sm text-vc-text-secondary">
                  <p className="font-medium text-vc-indigo mb-1">
                    Creating shared facility groups requires Growth+.
                  </p>
                  <p>
                    Free and Starter orgs can still accept invitations from a
                    partner org on a paid tier — your Setup Code above is
                    valid. Upgrade in{" "}
                    <a href="/dashboard/settings/billing" className="text-vc-coral underline">
                      Settings &rarr; Billing
                    </a>{" "}
                    to host your own groups.
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  );
}
