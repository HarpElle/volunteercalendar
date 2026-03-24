"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/context/auth-context";
import {
  getChurchDocuments,
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
import { isAdmin } from "@/lib/utils/permissions";
import { TIER_LIMITS } from "@/lib/constants";
import { db } from "@/lib/firebase/config";
import { doc, getDoc } from "firebase/firestore";
import type { Church, Campus, FacilityGroup, FacilityGroupMember } from "@/lib/types";
import { CampusesSettings } from "@/components/settings/campuses-settings";

export default function CampusesPage() {
  return (
    <Suspense>
      <CampusesContent />
    </Suspense>
  );
}

function CampusesContent() {
  const { user, profile, activeMembership } = useAuth();
  const churchId = activeMembership?.church_id || profile?.church_id;

  const [church, setChurch] = useState<Church | null>(null);
  const [campuses, setCampuses] = useState<Campus[]>([]);
  const [loading, setLoading] = useState(true);
  const [mutationError, setMutationError] = useState("");

  useEffect(() => {
    if (!churchId) { setLoading(false); return; }
    async function load() {
      try {
        const [churchSnap, campusDocs] = await Promise.all([
          getDoc(doc(db, "churches", churchId!)),
          getChurchDocuments(churchId!, "campuses"),
        ]);
        if (churchSnap.exists()) {
          setChurch({ id: churchSnap.id, ...churchSnap.data() } as unknown as Church);
        }
        setCampuses(campusDocs as unknown as Campus[]);
      } catch {
        // silent
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [churchId]);

  if (!isAdmin(activeMembership)) return null;

  const currentTier = church?.subscription_tier || "free";
  const limits = TIER_LIMITS[currentTier] || TIER_LIMITS.free;
  const roomsEnabled = limits.rooms_enabled ?? false;

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-8">
        <h1 className="font-display text-3xl text-vc-indigo">Campuses</h1>
        <p className="mt-1 text-vc-text-secondary">
          Manage campus locations and room settings.
        </p>
      </div>

      {mutationError && (
        <div className="mb-6 rounded-xl border border-vc-danger/20 bg-vc-danger/5 px-4 py-3 text-sm text-vc-danger">
          {mutationError}
        </div>
      )}

      <CampusesSettings
        churchId={churchId!}
        campuses={campuses}
        setCampuses={setCampuses}
        mutationError={mutationError}
        setMutationError={setMutationError}
      />

      {roomsEnabled && (
        <div className="mt-10">
          <RoomsSettingsSection churchId={churchId!} />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Rooms Settings (moved from settings/page.tsx inline RoomsSettingsTab)
// ---------------------------------------------------------------------------

interface RoomSettings {
  equipment_tags: string[];
  require_approval: boolean;
  max_advance_days: number;
  default_setup_minutes: number;
  default_teardown_minutes: number;
  public_calendar_enabled: boolean;
  public_calendar_token: string;
}

const DEFAULT_ROOM_SETTINGS: RoomSettings = {
  equipment_tags: [],
  require_approval: false,
  max_advance_days: 90,
  default_setup_minutes: 15,
  default_teardown_minutes: 15,
  public_calendar_enabled: false,
  public_calendar_token: "",
};

function RoomsSettingsSection({ churchId }: { churchId: string }) {
  const { user } = useAuth();
  const [settings, setSettings] = useState<RoomSettings>(DEFAULT_ROOM_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [newTag, setNewTag] = useState("");
  const savedTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!user) return;
    async function load() {
      try {
        const token = await user!.getIdToken();
        const res = await fetch(
          `/api/rooms/settings?church_id=${churchId}`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        if (res.ok) {
          const data = await res.json();
          setSettings({ ...DEFAULT_ROOM_SETTINGS, ...data });
        }
      } catch {
        // silent
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [user, churchId]);

  const handleSave = useCallback(async () => {
    if (!user) return;
    setSaving(true);
    setSaved(false);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/rooms/settings", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ church_id: churchId, ...settings }),
      });
      if (res.ok) {
        setSaved(true);
        if (savedTimeout.current) clearTimeout(savedTimeout.current);
        savedTimeout.current = setTimeout(() => setSaved(false), 3000);
      }
    } catch {
      // silent
    } finally {
      setSaving(false);
    }
  }, [user, churchId, settings]);

  function addTag() {
    const tag = newTag.trim();
    if (!tag || settings.equipment_tags.includes(tag)) return;
    setSettings((s) => ({ ...s, equipment_tags: [...s.equipment_tags, tag] }));
    setNewTag("");
  }

  function removeTag(tag: string) {
    setSettings((s) => ({ ...s, equipment_tags: s.equipment_tags.filter((t) => t !== tag) }));
  }

  if (loading) {
    return <div className="flex justify-center py-8"><Spinner /></div>;
  }

  return (
    <div className="space-y-6">
      <h2 className="font-display text-xl text-vc-indigo">Room Settings</h2>

      {/* Equipment Tags */}
      <section className="rounded-xl border border-vc-border-light bg-vc-bg-warm p-6">
        <h3 className="mb-1 font-display text-lg text-vc-indigo">Equipment Tags</h3>
        <p className="mb-4 text-sm text-vc-text-secondary">Tags that can be assigned to rooms for filtering.</p>
        <div className="mb-3 flex flex-wrap gap-2">
          {settings.equipment_tags.map((tag) => (
            <span key={tag} className="inline-flex items-center gap-1.5 rounded-full bg-vc-sand/25 px-3 py-1 text-sm text-vc-text">
              {tag}
              <button onClick={() => removeTag(tag)} className="text-vc-text-muted hover:text-vc-danger" aria-label={`Remove ${tag}`}>
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
              </button>
            </span>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <input type="text" value={newTag} onChange={(e) => setNewTag(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addTag()} placeholder="Projector, Whiteboard, Sound System..." className="min-h-[44px] w-full max-w-xs rounded-lg border border-vc-border-light bg-white px-3 py-2 text-sm outline-none focus:border-vc-coral focus:ring-1 focus:ring-vc-coral/30" />
          <Button size="sm" variant="outline" onClick={addTag} disabled={!newTag.trim()}>Add</Button>
        </div>
      </section>

      {/* Booking Defaults */}
      <section className="rounded-xl border border-vc-border-light bg-vc-bg-warm p-6">
        <h3 className="mb-1 font-display text-lg text-vc-indigo">Booking Defaults</h3>
        <p className="mb-4 text-sm text-vc-text-secondary">Default values for new room reservations.</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="flex items-center gap-3 text-sm font-medium text-vc-text">
              <input type="checkbox" checked={settings.require_approval} onChange={(e) => setSettings((s) => ({ ...s, require_approval: e.target.checked }))} className="h-4 w-4 rounded border-vc-border-light text-vc-coral accent-vc-coral" />
              Require approval for all reservations
            </label>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-vc-text-secondary">Max advance booking (days)</label>
            <input type="number" min={1} value={settings.max_advance_days} onChange={(e) => setSettings((s) => ({ ...s, max_advance_days: parseInt(e.target.value, 10) || 90 }))} className="min-h-[44px] w-full rounded-lg border border-vc-border-light bg-white px-3 py-2 text-sm outline-none focus:border-vc-coral focus:ring-1 focus:ring-vc-coral/30" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-vc-text-secondary">Default setup time (minutes)</label>
            <input type="number" min={0} value={settings.default_setup_minutes} onChange={(e) => setSettings((s) => ({ ...s, default_setup_minutes: parseInt(e.target.value, 10) || 0 }))} className="min-h-[44px] w-full rounded-lg border border-vc-border-light bg-white px-3 py-2 text-sm outline-none focus:border-vc-coral focus:ring-1 focus:ring-vc-coral/30" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-vc-text-secondary">Default teardown time (minutes)</label>
            <input type="number" min={0} value={settings.default_teardown_minutes} onChange={(e) => setSettings((s) => ({ ...s, default_teardown_minutes: parseInt(e.target.value, 10) || 0 }))} className="min-h-[44px] w-full rounded-lg border border-vc-border-light bg-white px-3 py-2 text-sm outline-none focus:border-vc-coral focus:ring-1 focus:ring-vc-coral/30" />
          </div>
        </div>
      </section>

      {/* Public Calendar */}
      <section className="rounded-xl border border-vc-border-light bg-vc-bg-warm p-6">
        <h3 className="mb-1 font-display text-lg text-vc-indigo">Public Calendar</h3>
        <p className="mb-4 text-sm text-vc-text-secondary">Expose room availability via an iCal feed.</p>
        <label className="flex items-center gap-3 text-sm font-medium text-vc-text">
          <input type="checkbox" checked={settings.public_calendar_enabled} onChange={(e) => setSettings((s) => ({ ...s, public_calendar_enabled: e.target.checked }))} className="h-4 w-4 rounded border-vc-border-light text-vc-coral accent-vc-coral" />
          Enable public calendar feed
        </label>
        {settings.public_calendar_enabled && settings.public_calendar_token && (
          <p className="mt-3 rounded-lg bg-white px-3 py-2 text-xs break-all text-vc-text-muted">
            {`/api/calendar/church/${churchId}/${settings.public_calendar_token}`}
          </p>
        )}
      </section>

      <div className="flex items-center gap-3">
        <Button onClick={handleSave} loading={saving}>Save Room Settings</Button>
        {saved && <Badge variant="success">Saved</Badge>}
      </div>

      {/* Facility Sharing */}
      <FacilitySharingSection churchId={churchId} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Facility Sharing Section (moved from settings/page.tsx)
// ---------------------------------------------------------------------------

function FacilitySharingSection({ churchId }: { churchId: string }) {
  const { user, activeMembership } = useAuth();
  const church = activeMembership;
  const tierLimits = TIER_LIMITS[church?.church_id ? "growth" : "free"];

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
  const [expanded, setExpanded] = useState(false);

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
        setError("Organization not found. Check the code and try again.");
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
    <section className="mt-8 rounded-xl border border-vc-border-light bg-vc-bg-warm p-6">
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
                        <div className="flex gap-2">
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
                        <div className="mt-3 flex gap-2">
                          <input type="text" value={inviteChurchId} onChange={(e) => setInviteChurchId(e.target.value)} placeholder="Setup code" className="min-h-[36px] flex-1 rounded-lg border border-vc-border-light bg-white px-3 py-1.5 text-sm outline-none focus:border-vc-coral focus:ring-1 focus:ring-vc-coral/30" />
                          <Button size="sm" onClick={() => handleInvite(g.id)} loading={inviting}>Send Invite</Button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <div className="flex gap-2">
                <input type="text" value={newGroupName} onChange={(e) => setNewGroupName(e.target.value)} placeholder="New facility group name" className="min-h-[44px] flex-1 rounded-lg border border-vc-border-light bg-white px-3 py-2 text-sm outline-none focus:border-vc-coral focus:ring-1 focus:ring-vc-coral/30" />
                <Button onClick={handleCreate} loading={creating}>Create Group</Button>
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
