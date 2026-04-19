"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/context/auth-context";
import {
  addChurchDocument,
  getChurchDocuments,
  removeChurchDocument,
  updateDocument,
  getMembership,
} from "@/lib/firebase/firestore";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import {
  updateUserDisplayName,
  changePassword,
  changeEmail,
} from "@/lib/firebase/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar } from "@/components/ui/avatar";
import { ImageCropModal } from "@/components/ui/image-crop-modal";
import { formatPhoneInput, normalizePhone } from "@/lib/utils/phone";
import { Spinner } from "@/components/ui/spinner";
import { isAdmin, isScheduler } from "@/lib/utils/permissions";
import type { CalendarFeed, CalendarFeedType, Ministry, Person, SchedulerNotificationPreferences } from "@/lib/types";
import { SCHEDULER_NOTIFICATION_TYPES, DEFAULT_SCHEDULER_NOTIFICATION_PREFS } from "@/lib/constants";

export default function AccountPage() {
  const router = useRouter();
  const { user, profile, activeMembership, signOut, updateProfilePhoto } = useAuth();
  const churchId = activeMembership?.church_id || profile?.church_id;
  const userIsAdmin = isAdmin(activeMembership);
  const userIsScheduler = isScheduler(activeMembership);
  const myVolunteerId = activeMembership?.volunteer_id || null;
  const schedulerMinistryScope = activeMembership?.ministry_scope || [];

  // Calendar feeds state
  const [feeds, setFeeds] = useState<CalendarFeed[]>([]);
  const [volunteers, setVolunteers] = useState<Person[]>([]);
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
  const [passwordOpen, setPasswordOpen] = useState(false);

  // Email editing state
  const [emailEditing, setEmailEditing] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [emailPassword, setEmailPassword] = useState("");
  const [emailSaving, setEmailSaving] = useState(false);
  const [emailSuccess, setEmailSuccess] = useState("");
  const [emailError, setEmailError] = useState("");

  // Photo state
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [userPhotoUrl, setUserPhotoUrl] = useState<string | null>(profile?.photo_url || null);
  const [photoError, setPhotoError] = useState("");

  // Scheduler notification prefs state
  const [churchTier, setChurchTier] = useState("free");
  const [schedNotifPrefs, setSchedNotifPrefs] = useState<SchedulerNotificationPreferences>(
    activeMembership?.scheduler_notification_preferences ?? DEFAULT_SCHEDULER_NOTIFICATION_PREFS,
  );
  const [schedNotifSaving, setSchedNotifSaving] = useState(false);
  const [schedNotifSuccess, setSchedNotifSuccess] = useState("");

  // App integration feeds state
  const [creatingIntegration, setCreatingIntegration] = useState(false);
  const [copiedIntegration, setCopiedIntegration] = useState<string | null>(null);

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
        const [feedDocs, volDocs, minDocs, churchSnap] = await Promise.all([
          getChurchDocuments(churchId!, "calendar_feeds"),
          getChurchDocuments(churchId!, "people"),
          getChurchDocuments(churchId!, "ministries"),
          getDoc(doc(db, "churches", churchId!)),
        ]);
        setFeeds(feedDocs as unknown as CalendarFeed[]);
        setVolunteers(
          (volDocs as unknown as Person[])
            .filter((p) => p.is_volunteer),
        );
        setMinistries(minDocs as unknown as Ministry[]);
        if (churchSnap.exists()) {
          setChurchTier(churchSnap.data().subscription_tier || "free");
        }
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

  // --- Email change handler ---
  async function handleEmailChange(e: FormEvent) {
    e.preventDefault();
    if (!newEmail || !emailPassword) return;
    setEmailSaving(true);
    setEmailError("");
    setEmailSuccess("");
    try {
      await changeEmail(emailPassword, newEmail);
      setEmailSuccess(`Verification email sent to ${newEmail}. Your email will update after you click the link.`);
      setNewEmail("");
      setEmailPassword("");
      setEmailEditing(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to update email";
      if (msg.includes("wrong-password") || msg.includes("invalid-credential")) {
        setEmailError("Incorrect password.");
      } else if (msg.includes("email-already-in-use")) {
        setEmailError("This email is already in use.");
      } else {
        setEmailError(msg);
      }
    } finally {
      setEmailSaving(false);
    }
  }

  // --- Photo handlers ---
  async function handlePhotoUpload(blob: Blob) {
    if (!user) return;
    setUploadingPhoto(true);
    setPhotoError("");
    try {
      const token = await user.getIdToken();
      const form = new FormData();
      form.append("file", new File([blob], "photo.jpg", { type: blob.type || "image/jpeg" }));
      const res = await fetch("/api/account/photo", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      if (res.ok) {
        const { photo_url } = await res.json();
        setUserPhotoUrl(photo_url);
        updateProfilePhoto(photo_url);
      } else {
        const errData = await res.json().catch(() => null);
        setPhotoError(errData?.error || "Failed to upload photo. Please try again.");
      }
    } catch {
      setPhotoError("Failed to upload photo. Please try again.");
    } finally {
      setCropFile(null);
      setUploadingPhoto(false);
    }
  }

  async function handlePhotoDelete() {
    if (!user) return;
    setUploadingPhoto(true);
    setPhotoError("");
    try {
      const token = await user.getIdToken();
      await fetch("/api/account/photo", {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      setUserPhotoUrl(null);
      updateProfilePhoto(null);
    } catch {
      setPhotoError("Failed to remove photo. Please try again.");
    } finally {
      setUploadingPhoto(false);
    }
  }

  function openPhotoPicker() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/jpeg,image/png,image/webp,image/gif";
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        if (file.size > 5 * 1024 * 1024) {
          alert("File too large. Maximum size is 5 MB.");
          return;
        }
        setCropFile(file);
      }
    };
    input.click();
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

  // --- App integration feed helpers ---

  function getIntegrationFeeds(): CalendarFeed[] {
    return feeds.filter((f) => f.label === "app_integration");
  }

  function getIntegrationUrl(feed: CalendarFeed): string {
    const base = typeof window !== "undefined"
      ? window.location.origin.replace(/^http:\/\//, "https://")
      : "https://volunteercal.com";
    return `${base}/api/volunteers?token=${feed.secret_token}`;
  }

  async function handleCreateIntegrationFeed() {
    if (!churchId) return;
    setCreatingIntegration(true);
    try {
      const feedData: Omit<CalendarFeed, "id"> = {
        church_id: churchId,
        type: "org",
        target_id: churchId,
        secret_token: crypto.randomUUID(),
        created_at: new Date().toISOString(),
        label: "app_integration",
      };
      const ref = await addChurchDocument(churchId, "calendar_feeds", feedData);
      setFeeds((prev) => [{ id: ref.id, ...feedData }, ...prev]);
    } catch {
      // silent
    } finally {
      setCreatingIntegration(false);
    }
  }

  function handleCopyIntegration(feedId: string, url: string) {
    navigator.clipboard.writeText(url);
    setCopiedIntegration(feedId);
    setTimeout(() => setCopiedIntegration(null), 2000);
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
    const base = typeof window !== "undefined"
      ? window.location.origin.replace(/^http:\/\//, "https://")
      : "https://volunteercal.com";
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

  // --- Scheduler notification preferences handler ---

  async function handleSchedNotifSave() {
    if (!activeMembership) return;
    setSchedNotifSaving(true);
    setSchedNotifSuccess("");
    try {
      await updateDocument("memberships", activeMembership.id, {
        scheduler_notification_preferences: schedNotifPrefs,
        updated_at: new Date().toISOString(),
      });
      setSchedNotifSuccess("Notification preferences saved.");
      setTimeout(() => setSchedNotifSuccess(""), 3000);
    } catch {
      // silent
    } finally {
      setSchedNotifSaving(false);
    }
  }

  function toggleNotifType(type: string) {
    setSchedNotifPrefs((prev) => {
      const enabled = prev.enabled_types.includes(type as import("@/lib/types").SchedulerNotificationType);
      return {
        ...prev,
        enabled_types: enabled
          ? prev.enabled_types.filter((t) => t !== type)
          : [...prev.enabled_types, type as import("@/lib/types").SchedulerNotificationType],
      };
    });
  }

  function toggleChannel(urgency: "standard" | "urgent", channel: "email" | "sms") {
    setSchedNotifPrefs((prev) => {
      if (urgency === "standard") {
        // Standard only supports "email" | "none"
        if (channel === "sms") return prev;
        const current = prev.channels.standard;
        const has = current.includes(channel);
        return {
          ...prev,
          channels: {
            ...prev.channels,
            standard: has ? current.filter((c) => c !== channel) : [...current, channel],
          },
        };
      }
      // Urgent supports "email" | "sms" | "none"
      const current = prev.channels.urgent;
      const has = current.includes(channel);
      return {
        ...prev,
        channels: {
          ...prev.channels,
          urgent: has ? current.filter((c) => c !== channel) : [...current, channel],
        },
      };
    });
  }

  const smsEligible = churchTier !== "free";

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

      {/* My Journey link */}
      <Link
        href="/dashboard/my-journey"
        className="mb-8 flex items-center gap-4 rounded-xl border border-vc-border-light bg-vc-bg-warm p-4 transition-colors hover:border-vc-coral/30"
      >
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-vc-coral/10 text-vc-coral">
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 0 1-1.043 3.296 3.745 3.745 0 0 1-3.296 1.043A3.745 3.745 0 0 1 12 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 0 1-3.296-1.043 3.745 3.745 0 0 1-1.043-3.296A3.745 3.745 0 0 1 3 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 0 1 1.043-3.296 3.746 3.746 0 0 1 3.296-1.043A3.746 3.746 0 0 1 12 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 0 1 3.296 1.043 3.745 3.745 0 0 1 1.043 3.296A3.745 3.745 0 0 1 21 12Z" />
          </svg>
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-vc-indigo">My Journey</p>
          <p className="text-xs text-vc-text-secondary">Track your onboarding progress and prerequisites</p>
        </div>
        <svg className="h-4 w-4 text-vc-text-muted" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
        </svg>
      </Link>

      {/* Profile Section */}
      <section className="mb-10">
        <h2 className="mb-4 text-lg font-semibold text-vc-indigo">General</h2>
        <p className="mb-4 -mt-2 text-sm text-vc-text-secondary">Manage your account information.</p>
        <div className="rounded-xl border border-vc-border-light bg-white p-6 space-y-6">

          {/* Profile picture */}
          <div>
            <label className="mb-2 block text-sm font-medium text-vc-text">Profile picture</label>
            <div className="flex items-center gap-4">
              <div className="relative">
                <Avatar
                  name={displayName || user?.email || "?"}
                  photoUrl={userPhotoUrl}
                  size="xl"
                  onClick={openPhotoPicker}
                  showUploadOverlay
                />
                {uploadingPhoto && (
                  <div className="absolute inset-0 flex items-center justify-center rounded-full bg-white/70">
                    <div className="h-5 w-5 animate-spin rounded-full border-2 border-vc-coral border-t-transparent" />
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={openPhotoPicker} disabled={uploadingPhoto}>
                  Upload
                </Button>
                {userPhotoUrl && (
                  <button
                    onClick={handlePhotoDelete}
                    disabled={uploadingPhoto}
                    className="rounded-lg p-2 text-vc-text-muted transition-colors hover:bg-vc-bg-warm hover:text-vc-danger"
                    title="Remove photo"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
            {photoError && <p className="mt-2 text-sm text-vc-danger">{photoError}</p>}
          </div>

          <div className="border-t border-vc-border-light" />

          {/* Full name */}
          <form onSubmit={handleProfileSave} className="space-y-4">
            <Input
              label="Full name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              required
            />
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

          <div className="border-t border-vc-border-light" />

          {/* Email address */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-vc-text">Email address</label>
            {!emailEditing ? (
              <div className="flex items-center gap-2">
                <span className="flex-1 rounded-lg border border-vc-border bg-vc-bg-warm px-3 py-2 text-base text-vc-text">
                  {user?.email || ""}
                </span>
                <button
                  onClick={() => setEmailEditing(true)}
                  className="rounded-lg p-2 text-vc-text-muted transition-colors hover:bg-vc-bg-warm hover:text-vc-indigo"
                  title="Change email"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" />
                  </svg>
                </button>
              </div>
            ) : (
              <form onSubmit={handleEmailChange} className="space-y-3">
                <Input
                  label="New email"
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  required
                />
                <Input
                  label="Current password"
                  type="password"
                  value={emailPassword}
                  onChange={(e) => setEmailPassword(e.target.value)}
                  required
                />
                <div className="flex items-center gap-2">
                  <Button type="submit" size="sm" loading={emailSaving}>
                    Update Email
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => { setEmailEditing(false); setEmailError(""); }}>
                    Cancel
                  </Button>
                </div>
              </form>
            )}
            {emailError && <p className="mt-1 text-sm text-vc-danger">{emailError}</p>}
            {emailSuccess && <p className="mt-1 text-sm text-vc-sage">{emailSuccess}</p>}
          </div>

          <div className="border-t border-vc-border-light" />

          {/* Password */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-vc-text">Password</label>
            {!passwordOpen ? (
              <Button size="sm" variant="outline" onClick={() => setPasswordOpen(true)}>
                <span className="flex items-center gap-1.5">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 0 1 3 3m3 0a6 6 0 0 1-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1 1 21.75 8.25Z" />
                  </svg>
                  Change password
                </span>
              </Button>
            ) : (
              <form onSubmit={handlePasswordChange} className="space-y-3">
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
                <div className="flex items-center gap-2">
                  <Button type="submit" loading={passwordSaving} size="sm">
                    Change Password
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setPasswordOpen(false)}>
                    Cancel
                  </Button>
                </div>
              </form>
            )}
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
        ) : feeds.filter((f) => f.label !== "app_integration").length === 0 && !showCreate ? (
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
            {feeds.filter((f) => f.label !== "app_integration").map((feed) => {
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
                      <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
                        <code className="block min-w-0 w-full truncate rounded bg-vc-bg-warm px-2 py-1.5 text-xs text-vc-text-muted sm:flex-1">
                          {url}
                        </code>
                        <div className="flex shrink-0 items-center gap-2">
                          <button
                            onClick={() => handleCopy(feed.id, url)}
                            className="flex-1 sm:flex-none rounded-lg border border-vc-border px-2.5 py-1 text-xs font-medium text-vc-text-secondary transition-colors hover:border-vc-coral hover:text-vc-coral"
                          >
                            {copied === feed.id ? "Copied!" : "Copy"}
                          </button>
                          <a
                            href={url.replace(/^https:\/\//, "webcal://")}
                            className="flex-1 sm:flex-none text-center rounded-lg bg-vc-coral px-2.5 py-1 text-xs font-medium text-white hover:bg-vc-coral-dark transition-colors"
                          >
                            Subscribe
                          </a>
                        </div>
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
                    Subscribe opens Apple Calendar directly. For Google Calendar or Outlook, paste the copied URL.
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* App Integrations Section — admin only */}
      {userIsAdmin && (
        <section className="mb-10">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-vc-indigo">App Integrations</h2>
              <p className="text-sm text-vc-text-muted">
                Generate a JSON API URL to connect third-party apps and dashboards to your volunteer schedule data.
              </p>
            </div>
            {!creatingIntegration && (
              <Button size="sm" onClick={handleCreateIntegrationFeed} loading={creatingIntegration}>
                Generate Integration URL
              </Button>
            )}
          </div>

          {loading ? (
            <div className="py-8 flex justify-center"><Spinner /></div>
          ) : getIntegrationFeeds().length === 0 ? (
            <div className="rounded-xl border border-dashed border-vc-border bg-white p-8 text-center">
              <svg className="mx-auto mb-3 h-8 w-8 text-vc-text-muted" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75 22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3-4.5 16.5" />
              </svg>
              <p className="text-vc-text-secondary">No integration URLs yet.</p>
              <p className="mt-1 text-sm text-vc-text-muted">
                Generate a URL to connect apps that need structured volunteer roster data.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {getIntegrationFeeds().map((feed) => {
                const url = getIntegrationUrl(feed);
                return (
                  <div key={feed.id} className="rounded-xl border border-vc-border-light bg-white p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="inline-flex rounded-full bg-vc-sage/10 px-2 py-0.5 text-xs font-medium text-vc-sage">
                            JSON API
                          </span>
                          <span className="font-medium text-vc-indigo">Volunteer Schedule API</span>
                        </div>
                        <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
                          <code className="block min-w-0 w-full truncate rounded bg-vc-bg-warm px-2 py-1.5 text-xs text-vc-text-muted sm:flex-1">
                            {url}
                          </code>
                          <button
                            onClick={() => handleCopyIntegration(feed.id, url)}
                            className="shrink-0 rounded-lg border border-vc-border px-2.5 py-1 text-xs font-medium text-vc-text-secondary transition-colors hover:border-vc-coral hover:text-vc-coral"
                          >
                            {copiedIntegration === feed.id ? "Copied!" : "Copy"}
                          </button>
                        </div>
                        <p className="mt-2 text-xs text-vc-text-muted">
                          Append <code className="rounded bg-vc-bg-warm px-1 py-0.5">?date=YYYY-MM-DD</code> to request a specific date. Omit to get the next upcoming service.
                        </p>
                      </div>
                      <button
                        onClick={() => handleDeleteFeed(feed.id)}
                        className="shrink-0 text-vc-text-muted hover:text-vc-danger transition-colors"
                        title="Revoke integration URL"
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                        </svg>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* Scheduler Notification Preferences — visible to scheduler+ roles */}
      {(userIsScheduler || userIsAdmin) && (
        <section className="mb-10">
          <h2 className="mb-4 text-lg font-semibold text-vc-indigo">Scheduler Notifications</h2>
          <div className="rounded-xl border border-vc-border-light bg-white p-6 space-y-6">
            <p className="text-sm text-vc-text-secondary">
              Choose which notifications you receive and how they&apos;re delivered.
            </p>

            {/* Notification types */}
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-vc-indigo">Notification Types</h3>
              {SCHEDULER_NOTIFICATION_TYPES.map((nt) => (
                <label key={nt.value} className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={schedNotifPrefs.enabled_types.includes(nt.value)}
                    onChange={() => toggleNotifType(nt.value)}
                    className="mt-0.5 h-4 w-4 rounded border-vc-border text-vc-coral accent-vc-coral"
                  />
                  <div className="min-w-0">
                    <span className="text-sm font-medium text-vc-text">{nt.label}</span>
                    {nt.urgency === "urgent" && (
                      <span className="ml-2 inline-flex rounded-full bg-vc-coral/10 px-1.5 py-0.5 text-[10px] font-semibold text-vc-coral uppercase tracking-wide">
                        Urgent
                      </span>
                    )}
                    <p className="text-xs text-vc-text-muted">{nt.description}</p>
                  </div>
                </label>
              ))}
            </div>

            {/* Channel preferences */}
            <div className="space-y-4 border-t border-vc-border-light pt-4">
              <h3 className="text-sm font-medium text-vc-indigo">Delivery Channels</h3>

              <div className="grid gap-4 sm:grid-cols-2">
                {/* Standard notifications */}
                <div className="rounded-lg border border-vc-border-light p-4">
                  <p className="text-sm font-medium text-vc-text mb-2">Standard Notifications</p>
                  <p className="text-xs text-vc-text-muted mb-3">Assignment changes, schedule published</p>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={schedNotifPrefs.channels.standard.includes("email")}
                      onChange={() => toggleChannel("standard", "email")}
                      className="h-4 w-4 rounded border-vc-border text-vc-coral accent-vc-coral"
                    />
                    <span className="text-sm text-vc-text">Email</span>
                  </label>
                </div>

                {/* Urgent notifications */}
                <div className="rounded-lg border border-vc-border-light p-4">
                  <p className="text-sm font-medium text-vc-text mb-2">Urgent Notifications</p>
                  <p className="text-xs text-vc-text-muted mb-3">Absences, self-removals, swap requests</p>
                  <div className="space-y-2">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={schedNotifPrefs.channels.urgent.includes("email")}
                        onChange={() => toggleChannel("urgent", "email")}
                        className="h-4 w-4 rounded border-vc-border text-vc-coral accent-vc-coral"
                      />
                      <span className="text-sm text-vc-text">Email</span>
                    </label>
                    <label className={`flex items-center gap-2 ${smsEligible ? "cursor-pointer" : "cursor-not-allowed opacity-50"}`}>
                      <input
                        type="checkbox"
                        checked={schedNotifPrefs.channels.urgent.includes("sms")}
                        onChange={() => smsEligible && toggleChannel("urgent", "sms")}
                        disabled={!smsEligible}
                        className="h-4 w-4 rounded border-vc-border text-vc-coral accent-vc-coral"
                      />
                      <span className="text-sm text-vc-text">SMS</span>
                      {!smsEligible && (
                        <span className="text-[10px] text-vc-text-muted bg-vc-bg-warm rounded px-1.5 py-0.5">
                          Starter+ plan
                        </span>
                      )}
                    </label>
                  </div>
                </div>
              </div>
              {schedNotifPrefs.channels.urgent.includes("sms") && (
                <div className="rounded-lg border border-vc-border-light bg-vc-bg-warm px-4 py-3">
                  <p className="text-xs text-vc-text-muted leading-relaxed">
                    By enabling SMS notifications, you agree to receive text messages from VolunteerCal
                    for urgent scheduling alerts. Msg frequency varies. Msg &amp; data rates may apply.
                    Reply STOP to opt out, HELP for assistance. See our{" "}
                    <a href="/privacy" className="font-medium text-vc-coral hover:text-vc-coral-dark transition-colors">
                      Privacy Policy
                    </a>{" "}
                    and{" "}
                    <a href="/terms" className="font-medium text-vc-coral hover:text-vc-coral-dark transition-colors">
                      Terms of Service
                    </a>.
                  </p>
                </div>
              )}
            </div>

            {/* Ministry scope (optional) */}
            {ministries.length > 1 && (
              <div className="space-y-3 border-t border-vc-border-light pt-4">
                <div>
                  <h3 className="text-sm font-medium text-vc-indigo">Ministry Scope</h3>
                  <p className="text-xs text-vc-text-muted">
                    Limit notifications to specific ministries. Leave all unchecked to receive notifications for all ministries.
                  </p>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {ministries
                    .filter((m) => userIsAdmin || schedulerMinistryScope.length === 0 || schedulerMinistryScope.includes(m.id))
                    .sort((a, b) => a.name.localeCompare(b.name))
                    .map((m) => (
                      <label key={m.id} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={schedNotifPrefs.ministry_scope.includes(m.id)}
                          onChange={() => {
                            setSchedNotifPrefs((prev) => ({
                              ...prev,
                              ministry_scope: prev.ministry_scope.includes(m.id)
                                ? prev.ministry_scope.filter((id) => id !== m.id)
                                : [...prev.ministry_scope, m.id],
                            }));
                          }}
                          className="h-4 w-4 rounded border-vc-border text-vc-coral accent-vc-coral"
                        />
                        <span className="text-sm text-vc-text">{m.name}</span>
                      </label>
                    ))}
                </div>
              </div>
            )}

            {/* Save */}
            {schedNotifSuccess && <p className="text-sm text-vc-sage">{schedNotifSuccess}</p>}
            <Button size="sm" loading={schedNotifSaving} onClick={handleSchedNotifSave}>
              Save Notification Preferences
            </Button>
          </div>
        </section>
      )}

      {/* Danger Zone */}
      <section className="mb-10">
        <h2 className="mb-4 text-lg font-semibold text-vc-coral">Danger zone</h2>
        <div className="rounded-xl border border-vc-coral/30 bg-white p-6">
          <h3 className="font-medium text-vc-indigo">Delete account</h3>
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

      {/* HarpElle sub-brand attribution */}
      <p className="mt-12 text-center text-[11px] text-vc-text-muted">
        a HarpElle app
      </p>

      {/* Photo crop modal */}
      {cropFile && (
        <ImageCropModal
          file={cropFile}
          onCrop={(blob) => {
            setCropFile(null);
            handlePhotoUpload(blob);
          }}
          onCancel={() => setCropFile(null)}
        />
      )}
    </div>
  );
}
