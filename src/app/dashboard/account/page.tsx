"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/context/auth-context";
import {
  addChurchDocument,
  getChurchDocuments,
  removeChurchDocument,
  updateDocument,
} from "@/lib/firebase/firestore";
import {
  updateUserDisplayName,
  changePassword,
} from "@/lib/firebase/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatPhoneInput, normalizePhone } from "@/lib/utils/phone";
import { Spinner } from "@/components/ui/spinner";
import { isAdmin, isScheduler } from "@/lib/utils/permissions";
import type { CalendarFeed, CalendarFeedType, Ministry, Volunteer } from "@/lib/types";

export default function AccountPage() {
  const router = useRouter();
  const { user, profile, activeMembership, signOut } = useAuth();
  const churchId = activeMembership?.church_id || profile?.church_id;
  const userIsAdmin = isAdmin(activeMembership);
  const userIsScheduler = isScheduler(activeMembership);
  const myVolunteerId = activeMembership?.volunteer_id || null;
  const schedulerMinistryScope = activeMembership?.ministry_scope || [];

  // Calendar feeds state
  const [feeds, setFeeds] = useState<CalendarFeed[]>([]);
  const [volunteers, setVolunteers] = useState<Volunteer[]>([]);
  const [ministries, setMinistries] = useState<Ministry[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [feedType, setFeedType] = useState<CalendarFeedType>("personal");
  const [targetId, setTargetId] = useState("");

  // Profile state
  const [displayName, setDisplayName] = useState("");
  const [phone, setPhone] = useState("");
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileSuccess, setProfileSuccess] = useState("");
  const [profileError, setProfileError] = useState("");

  // Password state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordSuccess, setPasswordSuccess] = useState("");
  const [passwordError, setPasswordError] = useState("");

  // Delete account state
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [soleAdminOrgs, setSoleAdminOrgs] = useState<Array<{ id: string; name: string }>>([]);
  const [showSoleAdminWarning, setShowSoleAdminWarning] = useState(false);

  // Load profile data
  useEffect(() => {
    setDisplayName(profile?.display_name || "");
    setPhone(formatPhoneInput(profile?.phone));
  }, [profile]);

  // Load calendar feed data
  useEffect(() => {
    if (!churchId) {
      setLoading(false);
      return;
    }
    async function load() {
      try {
        const [feedDocs, volDocs, minDocs] = await Promise.all([
          getChurchDocuments(churchId!, "calendar_feeds"),
          getChurchDocuments(churchId!, "volunteers"),
          getChurchDocuments(churchId!, "ministries"),
        ]);
        setFeeds(feedDocs as unknown as CalendarFeed[]);
        setVolunteers(volDocs as unknown as Volunteer[]);
        setMinistries(minDocs as unknown as Ministry[]);
      } catch {
        // silent
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [churchId]);

  // --- Profile handlers ---

  async function handleProfileSave(e: FormEvent) {
    e.preventDefault();
    if (!user) return;
    setProfileSaving(true);
    setProfileError("");
    setProfileSuccess("");
    try {
      await updateUserDisplayName(displayName);
      const normalizedPhone = normalizePhone(phone);
      await updateDocument("users", user.uid, {
        display_name: displayName,
        phone: normalizedPhone || null,
      });
      // Sync profile changes to linked volunteer records across all orgs
      user.getIdToken().then((token) =>
        fetch("/api/account/sync-profile", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        }).catch(() => {}),
      );
      setProfileSuccess("Profile updated.");
      setTimeout(() => setProfileSuccess(""), 3000);
    } catch (err) {
      setProfileError((err as Error).message || "Failed to update profile.");
    } finally {
      setProfileSaving(false);
    }
  }

  async function handlePasswordChange(e: FormEvent) {
    e.preventDefault();
    if (newPassword.length < 6) {
      setPasswordError("New password must be at least 6 characters.");
      return;
    }
    setPasswordSaving(true);
    setPasswordError("");
    setPasswordSuccess("");
    try {
      await changePassword(currentPassword, newPassword);
      setCurrentPassword("");
      setNewPassword("");
      setPasswordSuccess("Password changed successfully.");
      setTimeout(() => setPasswordSuccess(""), 3000);
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === "auth/wrong-password" || code === "auth/invalid-credential") {
        setPasswordError("Current password is incorrect.");
      } else {
        setPasswordError((err as Error).message || "Failed to change password.");
      }
    } finally {
      setPasswordSaving(false);
    }
  }

  // --- Delete account handler ---

  async function handleDeleteAccount(confirmDeleteOrgs = false) {
    if (!user || deleteConfirm !== "DELETE") return;
    setDeleting(true);
    setDeleteError("");
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/account/delete", {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ confirm_delete_orgs: confirmDeleteOrgs }),
      });
      const data = await res.json();

      if (res.status === 409 && data.warning === "sole_admin") {
        // Show sole-admin warning modal
        setSoleAdminOrgs(data.orgs || []);
        setShowSoleAdminWarning(true);
        setDeleting(false);
        return;
      }

      if (!res.ok) {
        throw new Error(data.error || "Failed to delete account.");
      }

      // Account deleted server-side — redirect first, then sign out.
      // If we signOut first, onAuthChange fires → dashboard redirects to /login
      // before router.push("/") can execute.
      router.push("/");
      signOut().catch(() => {});
    } catch (err) {
      setDeleteError((err as Error).message || "Failed to delete account.");
      setDeleting(false);
    }
  }

  // --- Calendar feed handlers ---

  async function handleCreateFeed() {
    if (!churchId) return;
    if (feedType !== "org" && !targetId) return;
    setCreating(true);
    try {
      const feedData = {
        church_id: churchId,
        type: feedType,
        target_id: feedType === "org" ? churchId : targetId,
        secret_token: crypto.randomUUID(),
        created_at: new Date().toISOString(),
      };
      const ref = await addChurchDocument(churchId, "calendar_feeds", feedData);
      setFeeds((prev) => [{ id: ref.id, ...feedData }, ...prev]);
      setShowCreate(false);
      setTargetId("");
    } catch {
      // silent
    } finally {
      setCreating(false);
    }
  }

  async function handleDeleteFeed(feedId: string) {
    if (!churchId) return;
    try {
      await removeChurchDocument(churchId, "calendar_feeds", feedId);
      setFeeds((prev) => prev.filter((f) => f.id !== feedId));
    } catch {
      // silent
    }
  }

  function getFeedUrl(feed: CalendarFeed): string {
    const base = typeof window !== "undefined" ? window.location.origin : "";
    return `${base}/api/calendar?token=${feed.secret_token}&type=${feed.type}`;
  }

  function getFeedLabel(feed: CalendarFeed): string {
    if (feed.type === "org") return "All Volunteers";
    if (feed.type === "ministry") {
      const m = ministries.find((m) => m.id === feed.target_id);
      return m?.name || "Ministry";
    }
    if (feed.type === "personal") {
      const v = volunteers.find((v) => v.id === feed.target_id);
      return v?.name || "Volunteer";
    }
    return feed.type;
  }

  function handleCopy(feedId: string, url: string) {
    navigator.clipboard.writeText(url);
    setCopied(feedId);
    setTimeout(() => setCopied(null), 2000);
  }

  const feedTypeLabels: Record<CalendarFeedType, string> = {
    personal: "Personal (one volunteer)",
    ministry: "Ministry (all in one ministry)",
    team: "Team",
    org: "Organization (everyone)",
  };

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-8">
        <h1 className="font-display text-3xl text-vc-indigo">Account Settings</h1>
        <p className="mt-1 text-vc-text-secondary">
          Manage your profile, password, and calendar feeds.
        </p>
      </div>

      {/* Profile Section */}
      <section className="mb-10">
        <h2 className="mb-4 text-lg font-semibold text-vc-indigo">Profile</h2>
        <div className="rounded-xl border border-vc-border-light bg-white p-6">
          <form onSubmit={handleProfileSave} className="space-y-4">
            <Input
              label="Display Name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              required
            />
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-vc-text">Email</label>
              <input
                value={user?.email || ""}
                disabled
                className="rounded-lg border border-vc-border bg-vc-bg-warm px-3 py-2 text-base text-vc-text-muted disabled:cursor-not-allowed"
              />
            </div>
            <Input
              label="Phone"
              type="tel"
              placeholder="(555) 123-4567"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              onBlur={() => setPhone(formatPhoneInput(phone))}
            />
            <p className="text-xs text-vc-text-muted -mt-2">
              Required for SMS reminders. Include country code for international numbers.
            </p>
            {profileError && <p className="text-sm text-vc-danger">{profileError}</p>}
            {profileSuccess && <p className="text-sm text-vc-sage">{profileSuccess}</p>}
            <Button type="submit" loading={profileSaving} size="sm">
              Save Profile
            </Button>
          </form>

          {/* Change Password */}
          <div className="mt-8 border-t border-vc-border-light pt-6">
            <h3 className="mb-3 font-medium text-vc-indigo">Change Password</h3>
            <form onSubmit={handlePasswordChange} className="space-y-4">
              <Input
                label="Current Password"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
              />
              <Input
                label="New Password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
              />
              {passwordError && <p className="text-sm text-vc-danger">{passwordError}</p>}
              {passwordSuccess && <p className="text-sm text-vc-sage">{passwordSuccess}</p>}
              <Button type="submit" loading={passwordSaving} size="sm">
                Change Password
              </Button>
            </form>
          </div>
        </div>
      </section>

      {/* Calendar Feeds Section */}
      <section className="mb-10">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-vc-indigo">Calendar Feeds</h2>
            <p className="text-sm text-vc-text-muted">
              Create .ics feed URLs for Google Calendar, Outlook, or Apple Calendar.
            </p>
          </div>
          {!showCreate && (
            <Button size="sm" onClick={() => {
              setShowCreate(true);
              setFeedType("personal");
              // Auto-set target for non-admin users
              if (!userIsAdmin && myVolunteerId) {
                setTargetId(myVolunteerId);
              } else {
                setTargetId("");
              }
            }}>
              New Feed
            </Button>
          )}
        </div>

        {/* Create feed form */}
        {showCreate && (
          <div className="mb-6 rounded-xl border border-vc-border-light bg-white p-5">
            <h3 className="mb-3 font-medium text-vc-indigo">Create Calendar Feed</h3>
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-vc-text">Feed Type</label>
                <select
                  value={feedType}
                  onChange={(e) => {
                    const newType = e.target.value as CalendarFeedType;
                    setFeedType(newType);
                    // Auto-set target for non-admins on personal/team feeds
                    if ((newType === "personal" || newType === "team") && !userIsAdmin) {
                      setTargetId(myVolunteerId || "");
                    } else {
                      setTargetId("");
                    }
                  }}
                  className="w-full rounded-lg border border-vc-border bg-white px-3 py-2 text-sm text-vc-text focus:border-vc-coral focus:outline-none focus:ring-2 focus:ring-vc-coral/20"
                >
                  <option value="personal">{feedTypeLabels.personal}</option>
                  <option value="team">My Teams (all ministries for one volunteer)</option>
                  {(userIsAdmin || userIsScheduler) && (
                    <option value="ministry">{feedTypeLabels.ministry}</option>
                  )}
                  {userIsAdmin && (
                    <option value="org">{feedTypeLabels.org}</option>
                  )}
                </select>
              </div>

              {feedType === "personal" && (
                userIsAdmin ? (
                  <div>
                    <label className="mb-1 block text-sm font-medium text-vc-text">Volunteer</label>
                    <select
                      value={targetId}
                      onChange={(e) => setTargetId(e.target.value)}
                      className="w-full rounded-lg border border-vc-border bg-white px-3 py-2 text-sm text-vc-text focus:border-vc-coral focus:outline-none focus:ring-2 focus:ring-vc-coral/20"
                    >
                      <option value="">Select a volunteer...</option>
                      {volunteers
                        .sort((a, b) => a.name.localeCompare(b.name))
                        .map((v) => (
                          <option key={v.id} value={v.id}>{v.name}</option>
                        ))}
                    </select>
                  </div>
                ) : (
                  <p className="text-sm text-vc-text-muted">
                    This feed will include your personal schedule.
                  </p>
                )
              )}

              {feedType === "team" && (
                userIsAdmin ? (
                  <div>
                    <label className="mb-1 block text-sm font-medium text-vc-text">Volunteer</label>
                    <select
                      value={targetId}
                      onChange={(e) => setTargetId(e.target.value)}
                      className="w-full rounded-lg border border-vc-border bg-white px-3 py-2 text-sm text-vc-text focus:border-vc-coral focus:outline-none focus:ring-2 focus:ring-vc-coral/20"
                    >
                      <option value="">Select a volunteer...</option>
                      {volunteers
                        .sort((a, b) => a.name.localeCompare(b.name))
                        .map((v) => (
                          <option key={v.id} value={v.id}>{v.name}</option>
                        ))}
                    </select>
                    <p className="mt-1 text-xs text-vc-text-muted">
                      Feed will include all assignments for this volunteer&apos;s ministries.
                    </p>
                  </div>
                ) : (
                  <p className="text-sm text-vc-text-muted">
                    This feed will include all assignments for your teams.
                  </p>
                )
              )}

              {feedType === "ministry" && (
                <div>
                  <label className="mb-1 block text-sm font-medium text-vc-text">Ministry</label>
                  <select
                    value={targetId}
                    onChange={(e) => setTargetId(e.target.value)}
                    className="w-full rounded-lg border border-vc-border bg-white px-3 py-2 text-sm text-vc-text focus:border-vc-coral focus:outline-none focus:ring-2 focus:ring-vc-coral/20"
                  >
                    <option value="">Select a ministry...</option>
                    {ministries
                      .filter((m) => userIsAdmin || schedulerMinistryScope.length === 0 || schedulerMinistryScope.includes(m.id))
                      .map((m) => (
                        <option key={m.id} value={m.id}>{m.name}</option>
                      ))}
                  </select>
                </div>
              )}

              <div className="flex gap-3">
                <Button loading={creating} onClick={handleCreateFeed}>
                  Create Feed
                </Button>
                <Button variant="ghost" onClick={() => setShowCreate(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Feed list */}
        {loading ? (
          <div className="py-8 flex justify-center"><Spinner /></div>
        ) : feeds.length === 0 && !showCreate ? (
          <div className="rounded-xl border border-dashed border-vc-border bg-white p-8 text-center">
            <svg className="mx-auto mb-3 h-8 w-8 text-vc-text-muted" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
            </svg>
            <p className="text-vc-text-secondary">No calendar feeds yet.</p>
            <p className="mt-1 text-sm text-vc-text-muted">
              Create a feed to sync schedules to Google Calendar, Outlook, or Apple Calendar.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {feeds.map((feed) => {
              const url = getFeedUrl(feed);
              return (
                <div key={feed.id} className="rounded-xl border border-vc-border-light bg-white p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex rounded-full bg-vc-indigo/10 px-2 py-0.5 text-xs font-medium text-vc-indigo">
                          {feed.type}
                        </span>
                        <span className="font-medium text-vc-indigo">{getFeedLabel(feed)}</span>
                      </div>
                      <div className="mt-2 flex items-center gap-2">
                        <code className="block min-w-0 flex-1 truncate rounded bg-vc-bg-warm px-2 py-1 text-xs text-vc-text-muted">
                          {url}
                        </code>
                        <button
                          onClick={() => handleCopy(feed.id, url)}
                          className="shrink-0 rounded-lg border border-vc-border px-2.5 py-1 text-xs font-medium text-vc-text-secondary transition-colors hover:border-vc-coral hover:text-vc-coral"
                        >
                          {copied === feed.id ? "Copied!" : "Copy"}
                        </button>
                      </div>
                    </div>
                    <button
                      onClick={() => handleDeleteFeed(feed.id)}
                      className="shrink-0 text-vc-text-muted hover:text-vc-danger transition-colors"
                      title="Delete feed"
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                      </svg>
                    </button>
                  </div>
                  <p className="mt-2 text-xs text-vc-text-muted">
                    Add this URL to Google Calendar (Other calendars &rarr; From URL) or Outlook (Add calendar &rarr; Subscribe from web).
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Danger Zone */}
      <section className="mb-10">
        <h2 className="mb-4 text-lg font-semibold text-vc-danger">Danger Zone</h2>
        <div className="rounded-xl border border-vc-danger/30 bg-white p-6">
          <h3 className="font-medium text-vc-indigo">Delete Account</h3>
          <p className="mt-1 text-sm text-vc-text-muted">
            Permanently delete your account, profile, and all memberships.
            If you are the sole administrator of any organization, that organization
            and all its data will also be permanently deleted.
          </p>
          <p className="mt-2 text-sm font-medium text-vc-danger">
            This action cannot be undone.
          </p>
          <div className="mt-4 space-y-3">
            <Input
              label={`Type "DELETE" to confirm`}
              value={deleteConfirm}
              onChange={(e) => setDeleteConfirm(e.target.value)}
              placeholder="DELETE"
            />
            {deleteError && <p className="text-sm text-vc-danger">{deleteError}</p>}
            <Button
              variant="outline"
              onClick={() => handleDeleteAccount(false)}
              loading={deleting}
              disabled={deleteConfirm !== "DELETE"}
              className="border-vc-danger text-vc-danger hover:bg-vc-danger/5 disabled:opacity-40"
            >
              Delete My Account
            </Button>
          </div>
        </div>
      </section>

      {/* Sole-admin warning modal */}
      {showSoleAdminWarning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="mx-4 w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-vc-danger">
              You&apos;re the only administrator
            </h3>
            <p className="mt-2 text-sm text-vc-text-muted">
              Deleting your account will also permanently delete the following
              organization{soleAdminOrgs.length > 1 ? "s" : ""} and all
              {soleAdminOrgs.length > 1 ? " their" : " its"} data:
            </p>
            <ul className="mt-3 space-y-1">
              {soleAdminOrgs.map((org) => (
                <li key={org.id} className="text-sm font-medium text-vc-indigo">
                  {org.name}
                </li>
              ))}
            </ul>
            <p className="mt-3 text-sm text-vc-text-muted">
              You can avoid this by promoting someone else to admin first.
            </p>
            <div className="mt-5 flex gap-3">
              <Button
                variant="outline"
                onClick={() => {
                  setShowSoleAdminWarning(false);
                  setDeleteConfirm("");
                  router.push("/dashboard/people");
                }}
                className="flex-1"
              >
                Promote someone first
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setShowSoleAdminWarning(false);
                  handleDeleteAccount(true);
                }}
                loading={deleting}
                className="flex-1 border-vc-danger text-vc-danger hover:bg-vc-danger/5"
              >
                Delete everything
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
