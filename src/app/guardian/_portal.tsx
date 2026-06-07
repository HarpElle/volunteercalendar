"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import QRCode from "qrcode";
import { OrgLogoOrBadge } from "@/components/ui/org-logo-or-badge";
import { formatHouseholdDisplay } from "@/lib/utils/name";

interface GuardianChild {
  id: string;
  first_name: string;
  last_name: string;
  preferred_name?: string;
  grade?: string;
  allergies?: string | null;
  medical_notes?: string | null;
  has_alerts?: boolean;
}

const VALID_GRADES = [
  { value: "", label: "—" },
  { value: "nursery", label: "Nursery" },
  { value: "toddler", label: "Toddler" },
  { value: "pre-k", label: "Pre-K" },
  { value: "kindergarten", label: "Kindergarten" },
  { value: "1st", label: "1st Grade" },
  { value: "2nd", label: "2nd Grade" },
  { value: "3rd", label: "3rd Grade" },
  { value: "4th", label: "4th Grade" },
  { value: "5th", label: "5th Grade" },
  { value: "6th", label: "6th Grade" },
  { value: "7th", label: "7th Grade" },
] as const;

type ChildEditorState =
  | { mode: "closed" }
  | { mode: "add" }
  | { mode: "edit"; child: GuardianChild }
  | { mode: "remove"; child: GuardianChild };

interface CheckInSession {
  id: string;
  child_id: string;
  service_date: string;
  room_name: string;
  checked_in_at: string;
  checked_out_at: string | null;
}

interface HouseholdInfo {
  id: string;
  primary_guardian_name: string;
  primary_guardian_phone: string | null;
  secondary_guardian_name: string | null;
  secondary_guardian_phone: string | null;
}

export default function GuardianPortalPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-20">
          <div className="animate-pulse text-vc-text-muted">Loading...</div>
        </div>
      }
    >
      <GuardianPortalInner />
    </Suspense>
  );
}

function GuardianPortalInner() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";
  const churchId = searchParams.get("church_id") || "";

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [churchName, setChurchName] = useState("");
  const [churchLogoUrl, setChurchLogoUrl] = useState<string | null>(null);
  const [household, setHousehold] = useState<HouseholdInfo | null>(null);
  const [children, setChildren] = useState<GuardianChild[]>([]);
  const [sessions, setSessions] = useState<CheckInSession[]>([]);
  const [qrDataUrl, setQrDataUrl] = useState("");

  // Editing state
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editSecName, setEditSecName] = useState("");
  const [editSecPhone, setEditSecPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");

  // Wave 10 W10-5A-UI A: Add to Apple Wallet button state.
  // Fetches a fresh signed URL on click (URLs are 10 min TTL — too
  // short to mint at portal-load and just sit waiting), then
  // navigates the browser to the URL so iOS Safari can show the
  // Wallet sheet.
  const [walletLoading, setWalletLoading] = useState(false);
  const [walletError, setWalletError] = useState<string | null>(null);

  // Child editor state (2026-06-03 Family Portal self-service).
  const [childEditor, setChildEditor] = useState<ChildEditorState>({ mode: "closed" });
  const [childBusy, setChildBusy] = useState(false);
  const [childError, setChildError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!token || !churchId) return;
    setLoading(true);
    setError("");

    try {
      const res = await fetch(
        `/api/guardian/household?token=${encodeURIComponent(token)}&church_id=${encodeURIComponent(churchId)}`,
      );
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to load");
        return;
      }

      const data = await res.json();
      setChurchName(data.church_name);
      setChurchLogoUrl(data.church_logo_url ?? null);
      setHousehold(data.household);
      setChildren(data.children);
      setSessions(data.sessions);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [token, churchId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Generate QR code
  useEffect(() => {
    if (!token || !churchId) return;
    const url = `${window.location.origin}/checkin?church_id=${churchId}&token=${token}`;
    QRCode.toDataURL(url, {
      width: 180,
      margin: 2,
      color: { dark: "#2D3047", light: "#FEFCF9" },
    })
      .then(setQrDataUrl)
      .catch(() => {});
  }, [token, churchId]);

  const handleAddToWallet = async () => {
    if (!token || !churchId) return;
    setWalletLoading(true);
    setWalletError(null);
    try {
      const res = await fetch("/api/guardian/wallet-pass-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, church_id: churchId }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(body.error ?? "Could not get pass URL");
      }
      const data = (await res.json()) as { url: string };
      // Navigate to the signed URL — on iOS Safari, the
      // application/vnd.apple.pkpass response triggers the
      // "Add to Apple Wallet" sheet. On other browsers, it
      // downloads a .pkpass file.
      window.location.href = data.url;
    } catch (err) {
      setWalletError(err instanceof Error ? err.message : "Failed to load");
      setWalletLoading(false);
    }
  };

  const startEditing = () => {
    if (!household) return;
    setEditName(household.primary_guardian_name);
    setEditPhone("");
    setEditSecName(household.secondary_guardian_name || "");
    setEditSecPhone("");
    setEditing(true);
    setSaveMessage("");
  };

  const handleSave = async () => {
    if (!token || !churchId) return;
    setSaving(true);
    setSaveMessage("");

    try {
      const payload: Record<string, string> = {
        token,
        church_id: churchId,
        primary_guardian_name: editName,
        secondary_guardian_name: editSecName,
      };
      // Only send phone if user entered a new one
      if (editPhone) payload.primary_guardian_phone = editPhone;
      if (editSecPhone) payload.secondary_guardian_phone = editSecPhone;

      const res = await fetch("/api/guardian/household", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        setSaveMessage("Saved!");
        setEditing(false);
        fetchData();
      } else {
        const data = await res.json();
        setSaveMessage(data.error || "Save failed");
      }
    } catch {
      setSaveMessage("Network error");
    } finally {
      setSaving(false);
    }
  };

  // Child mutation handlers — POST/PUT/DELETE to /api/guardian/children.
  const submitChildEditor = async (input: {
    first_name: string;
    last_name: string;
    preferred_name: string;
    grade: string;
    allergies: string;
    medical_notes: string;
  }) => {
    if (!token || !churchId) return;
    setChildBusy(true);
    setChildError(null);
    try {
      const isEdit = childEditor.mode === "edit";
      const url = isEdit
        ? `/api/guardian/children/${(childEditor as { child: GuardianChild }).child.id}`
        : "/api/guardian/children";
      const res = await fetch(url, {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          church_id: churchId,
          first_name: input.first_name,
          last_name: input.last_name,
          preferred_name: input.preferred_name || null,
          grade: input.grade || null,
          allergies: input.allergies || null,
          medical_notes: input.medical_notes || null,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? "Save failed");
      }
      setChildEditor({ mode: "closed" });
      await fetchData();
    } catch (err) {
      setChildError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setChildBusy(false);
    }
  };

  const handleRemoveChild = async (child: GuardianChild) => {
    if (!token || !churchId) return;
    setChildBusy(true);
    setChildError(null);
    try {
      const res = await fetch(
        `/api/guardian/children/${child.id}?token=${encodeURIComponent(token)}&church_id=${encodeURIComponent(churchId)}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? "Remove failed");
      }
      setChildEditor({ mode: "closed" });
      await fetchData();
    } catch (err) {
      setChildError(err instanceof Error ? err.message : "Remove failed");
    } finally {
      setChildBusy(false);
    }
  };

  if (!token || !churchId) {
    return (
      <div className="text-center py-12">
        <h1 className="text-xl font-bold text-vc-indigo font-display mb-2">
          Invalid Link
        </h1>
        <p className="text-vc-text-secondary">
          This link is missing required parameters. Please use the link from
          your check-in SMS.
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-pulse text-vc-text-muted">Loading your family info...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <h1 className="text-xl font-bold text-vc-indigo font-display mb-2">
          Something went wrong
        </h1>
        <p className="text-vc-text-secondary">{error}</p>
      </div>
    );
  }

  if (!household) return null;

  // Group sessions by date
  const sessionsByDate = sessions.reduce(
    (acc, s) => {
      (acc[s.service_date] = acc[s.service_date] || []).push(s);
      return acc;
    },
    {} as Record<string, CheckInSession[]>,
  );
  const sortedDates = Object.keys(sessionsByDate).sort(
    (a, b) => b.localeCompare(a),
  );

  const childNameMap = new Map(
    children.map((c) => [c.id, c.preferred_name || c.first_name]),
  );

  return (
    <div>
      {/* Header: VolunteerCal Check-In badge + church + family name */}
      <div className="flex items-center gap-3 mb-6">
        <OrgLogoOrBadge logoUrl={churchLogoUrl} size={44} decorative />
        <div>
          <p className="text-sm text-vc-text-secondary font-medium">
            {churchName}
          </p>
          <h1 className="text-2xl font-bold text-vc-indigo font-display leading-tight">
            {formatHouseholdDisplay({
              primary_guardian_name: household.primary_guardian_name,
              secondary_guardian_name: household.secondary_guardian_name,
            })}
          </h1>
        </div>
      </div>

      {/* Guardian info */}
      <div className="bg-white rounded-xl border border-vc-border-light p-5 mb-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
            Guardians
          </h2>
          {!editing && (
            <button
              type="button"
              onClick={startEditing}
              className="text-sm text-vc-coral font-medium"
            >
              Edit
            </button>
          )}
        </div>

        {editing ? (
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-vc-text-secondary mb-1">
                Primary Guardian Name
              </label>
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="w-full min-h-[44px] rounded-lg border border-vc-border-light px-3 py-2
                  text-sm outline-none focus:border-vc-coral focus:ring-1 focus:ring-vc-coral/30"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-vc-text-secondary mb-1">
                Primary Phone (leave blank to keep current: {household.primary_guardian_phone})
              </label>
              <input
                type="tel"
                value={editPhone}
                onChange={(e) => setEditPhone(e.target.value)}
                placeholder="(555) 123-4567"
                className="w-full min-h-[44px] rounded-lg border border-vc-border-light px-3 py-2
                  text-sm outline-none focus:border-vc-coral focus:ring-1 focus:ring-vc-coral/30"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-vc-text-secondary mb-1">
                Secondary Guardian Name
              </label>
              <input
                type="text"
                value={editSecName}
                onChange={(e) => setEditSecName(e.target.value)}
                placeholder="Optional"
                className="w-full min-h-[44px] rounded-lg border border-vc-border-light px-3 py-2
                  text-sm outline-none focus:border-vc-coral focus:ring-1 focus:ring-vc-coral/30"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-vc-text-secondary mb-1">
                Secondary Phone {household.secondary_guardian_phone ? `(current: ${household.secondary_guardian_phone})` : ""}
              </label>
              <input
                type="tel"
                value={editSecPhone}
                onChange={(e) => setEditSecPhone(e.target.value)}
                placeholder="Optional"
                className="w-full min-h-[44px] rounded-lg border border-vc-border-light px-3 py-2
                  text-sm outline-none focus:border-vc-coral focus:ring-1 focus:ring-vc-coral/30"
              />
            </div>
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={handleSave}
                disabled={saving || !editName.trim()}
                className="flex-1 min-h-[44px] rounded-full bg-vc-coral text-white font-semibold
                  text-sm disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save"}
              </button>
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="flex-1 min-h-[44px] rounded-full border border-vc-border-light text-vc-text-secondary
                  font-semibold text-sm"
              >
                Cancel
              </button>
            </div>
            {saveMessage && (
              <p className="text-sm text-center text-vc-sage font-medium">
                {saveMessage}
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            <div>
              <p className="text-sm font-medium text-vc-indigo">
                {household.primary_guardian_name}
              </p>
              <p className="text-xs text-vc-text-muted">
                {household.primary_guardian_phone || "No phone"}
              </p>
            </div>
            {household.secondary_guardian_name && (
              <div>
                <p className="text-sm font-medium text-vc-indigo">
                  {household.secondary_guardian_name}
                </p>
                <p className="text-xs text-vc-text-muted">
                  {household.secondary_guardian_phone || "No phone"}
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Children — editable list (2026-06-03 self-service). */}
      <div className="bg-white rounded-xl border border-vc-border-light p-5 mb-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
            Children ({children.length})
          </h2>
          <button
            type="button"
            onClick={() => {
              setChildError(null);
              setChildEditor({ mode: "add" });
            }}
            className="text-sm text-vc-coral font-medium min-h-[32px]"
          >
            + Add child
          </button>
        </div>

        {children.length === 0 ? (
          <p className="text-sm text-vc-text-muted">
            No children on file. Tap "Add child" above to register your
            first one.
          </p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {children.map((c) => (
              <li
                key={c.id}
                className="py-3 flex items-start justify-between gap-3"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium text-vc-indigo">
                      {c.preferred_name || c.first_name} {c.last_name}
                    </p>
                    {c.grade && (
                      <span className="text-xs text-vc-text-muted bg-gray-50 px-2 py-0.5 rounded-full">
                        {c.grade}
                      </span>
                    )}
                    {c.has_alerts && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-medium">
                        Allergy / Medical
                      </span>
                    )}
                  </div>
                  {(c.allergies || c.medical_notes) && (
                    <p className="text-xs text-vc-text-secondary mt-1 truncate">
                      {[c.allergies, c.medical_notes].filter(Boolean).join(" • ")}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      setChildError(null);
                      setChildEditor({ mode: "edit", child: c });
                    }}
                    className="text-xs text-vc-coral font-medium min-h-[32px] px-2"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setChildError(null);
                      setChildEditor({ mode: "remove", child: c });
                    }}
                    className="text-xs text-vc-text-muted hover:text-red-600 font-medium min-h-[32px] px-2"
                  >
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        {/* Grade-rollover disclaimer (Jason 2026-06-03 callout).
            Until the annual auto-advance feature ships, this just
            explains that staff may bulk-update grades each year so
            parents don't get surprised. */}
        <div className="mt-4 rounded-lg bg-vc-bg-warm border border-vc-border-light px-3 py-2.5">
          <p className="text-xs text-vc-text-secondary leading-relaxed">
            <span className="font-medium text-vc-indigo">Heads up:</span>{" "}
            your church may bulk-advance everyone's grade at the start
            of each school year. If you update a grade and the church
            then runs the annual rollover, your child could end up one
            grade too high. Check with church staff if you're unsure
            when they do it.
          </p>
        </div>
      </div>

      {/* Child editor modals */}
      {(childEditor.mode === "add" || childEditor.mode === "edit") && (
        <ChildEditorModal
          initial={
            childEditor.mode === "edit"
              ? childEditor.child
              : undefined
          }
          busy={childBusy}
          error={childError}
          onCancel={() => setChildEditor({ mode: "closed" })}
          onSubmit={submitChildEditor}
        />
      )}
      {childEditor.mode === "remove" && (
        <ChildRemoveConfirm
          child={childEditor.child}
          busy={childBusy}
          error={childError}
          onCancel={() => setChildEditor({ mode: "closed" })}
          onConfirm={() => handleRemoveChild(childEditor.child)}
        />
      )}

      {/* QR Code */}
      {qrDataUrl && (
        <div className="bg-white rounded-xl border border-vc-border-light p-5 mb-4 text-center">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Your Check-In QR Code
          </h2>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={qrDataUrl}
            alt="Check-in QR code"
            className="mx-auto rounded-lg"
            width={180}
            height={180}
          />
          <p className="text-xs text-vc-text-muted mt-2">
            Show this at the kiosk for quick check-in
          </p>
        </div>
      )}

      {/* Apple Wallet family pass — Wave 10 W10-5A-UI sub-PR A */}
      <div className="bg-white rounded-xl border border-vc-border-light p-5 mb-4">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">
          Family Pass
        </h2>
        <p className="text-sm text-vc-text-secondary mb-4">
          Add your family pass to Apple Wallet for faster check-in. Scan
          the pass at the kiosk to pull up your household instantly — no
          phone number needed.
        </p>
        <button
          type="button"
          onClick={handleAddToWallet}
          disabled={walletLoading}
          className="inline-flex items-center justify-center gap-2 w-full sm:w-auto px-5 py-3 rounded-lg bg-vc-indigo text-vc-bg font-medium text-sm min-h-[44px] disabled:opacity-60"
        >
          {walletLoading ? (
            "Loading…"
          ) : (
            <>
              <svg
                className="h-4 w-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <rect x="3" y="4" width="18" height="18" rx="2" />
                <line x1="3" y1="10" x2="21" y2="10" />
                <line x1="9" y1="4" x2="9" y2="10" />
                <line x1="15" y1="4" x2="15" y2="10" />
                <polyline points="8,16.5 10.5,19 16,13.5" />
              </svg>
              Add to Apple Wallet
            </>
          )}
        </button>
        <p className="text-xs text-vc-text-muted mt-2">
          Requires iPhone or iPad. Google Wallet support coming soon.
        </p>
        {walletError && (
          <p
            role="alert"
            className="text-sm text-vc-coral mt-2"
          >
            {walletError}
          </p>
        )}
      </div>

      {/* Recent check-in history */}
      <div className="bg-white rounded-xl border border-vc-border-light p-5">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
          Recent Check-Ins
        </h2>
        {sortedDates.length === 0 ? (
          <p className="text-sm text-vc-text-muted">No recent check-ins.</p>
        ) : (
          <div className="space-y-4">
            {sortedDates.slice(0, 10).map((date) => (
              <div key={date}>
                <p className="text-xs font-semibold text-vc-text-secondary mb-1.5">
                  {formatDateLabel(date)}
                </p>
                <div className="space-y-1">
                  {sessionsByDate[date].map((s) => (
                    <div
                      key={s.id}
                      className="flex items-center justify-between text-sm"
                    >
                      <span className="text-vc-indigo">
                        {childNameMap.get(s.child_id) || "Unknown"} — {s.room_name}
                      </span>
                      <span
                        className={`text-xs font-medium ${
                          s.checked_out_at ? "text-vc-sage" : "text-vc-coral"
                        }`}
                      >
                        {s.checked_out_at ? "Checked out" : "Active"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function formatDateLabel(isoDate: string): string {
  const d = new Date(isoDate + "T12:00:00");
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  return `${days[d.getDay()]} ${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

/**
 * <ChildEditorModal> — Family Portal add/edit form for a child.
 *
 * Used for both "add new child" (initial undefined) and "edit existing"
 * (initial = the child). Fields:
 *   - First / last / preferred name
 *   - Grade dropdown
 *   - Allergies (textarea)
 *   - Medical notes (textarea)
 *
 * Server-side validation is the source of truth — this form does the
 * minimum client-side guarding (required fields, max lengths).
 */
function ChildEditorModal({
  initial,
  busy,
  error,
  onCancel,
  onSubmit,
}: {
  initial?: GuardianChild;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onSubmit: (input: {
    first_name: string;
    last_name: string;
    preferred_name: string;
    grade: string;
    allergies: string;
    medical_notes: string;
  }) => void | Promise<void>;
}) {
  const [firstName, setFirstName] = useState(initial?.first_name ?? "");
  const [lastName, setLastName] = useState(initial?.last_name ?? "");
  const [preferredName, setPreferredName] = useState(initial?.preferred_name ?? "");
  const [grade, setGrade] = useState(initial?.grade ?? "");
  const [allergies, setAllergies] = useState(initial?.allergies ?? "");
  const [medicalNotes, setMedicalNotes] = useState(initial?.medical_notes ?? "");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!firstName.trim() || !lastName.trim()) return;
    void onSubmit({
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      preferred_name: preferredName.trim(),
      grade,
      allergies: allergies.trim(),
      medical_notes: medicalNotes.trim(),
    });
  };

  return (
    <div
      className="fixed inset-0 z-40 bg-black/50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={initial ? "Edit child" : "Add child"}
    >
      <form
        onSubmit={submit}
        className="bg-vc-bg rounded-2xl shadow-xl max-w-md w-full p-6 space-y-3 max-h-[90vh] overflow-y-auto"
      >
        <h2 className="text-xl font-display font-semibold text-vc-indigo">
          {initial ? "Edit child" : "Add child"}
        </h2>
        <div>
          <label
            htmlFor="gc-first"
            className="block text-xs font-medium text-vc-text-secondary mb-1"
          >
            First name *
          </label>
          <input
            id="gc-first"
            type="text"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            required
            maxLength={100}
            autoFocus
            className="w-full px-3 py-2 rounded-lg border border-vc-border-light focus:border-vc-coral focus:ring-1 focus:ring-vc-coral min-h-[44px]"
          />
        </div>
        <div>
          <label
            htmlFor="gc-last"
            className="block text-xs font-medium text-vc-text-secondary mb-1"
          >
            Last name *
          </label>
          <input
            id="gc-last"
            type="text"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            required
            maxLength={100}
            className="w-full px-3 py-2 rounded-lg border border-vc-border-light focus:border-vc-coral focus:ring-1 focus:ring-vc-coral min-h-[44px]"
          />
        </div>
        <div>
          <label
            htmlFor="gc-pref"
            className="block text-xs font-medium text-vc-text-secondary mb-1"
          >
            Preferred name (optional)
          </label>
          <input
            id="gc-pref"
            type="text"
            value={preferredName}
            onChange={(e) => setPreferredName(e.target.value)}
            maxLength={100}
            placeholder="What they actually go by"
            className="w-full px-3 py-2 rounded-lg border border-vc-border-light focus:border-vc-coral focus:ring-1 focus:ring-vc-coral min-h-[44px]"
          />
        </div>
        <div>
          <label
            htmlFor="gc-grade"
            className="block text-xs font-medium text-vc-text-secondary mb-1"
          >
            Grade
          </label>
          <select
            id="gc-grade"
            value={grade}
            onChange={(e) => setGrade(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-vc-border-light focus:border-vc-coral focus:ring-1 focus:ring-vc-coral min-h-[44px]"
          >
            {VALID_GRADES.map((g) => (
              <option key={g.value || "none"} value={g.value}>
                {g.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label
            htmlFor="gc-allergies"
            className="block text-xs font-medium text-vc-text-secondary mb-1"
          >
            Allergies
          </label>
          <textarea
            id="gc-allergies"
            value={allergies}
            onChange={(e) => setAllergies(e.target.value)}
            rows={2}
            maxLength={2000}
            placeholder="Peanuts, tree nuts, etc."
            className="w-full px-3 py-2 rounded-lg border border-vc-border-light focus:border-vc-coral focus:ring-1 focus:ring-vc-coral resize-y"
          />
        </div>
        <div>
          <label
            htmlFor="gc-med"
            className="block text-xs font-medium text-vc-text-secondary mb-1"
          >
            Medical notes
          </label>
          <textarea
            id="gc-med"
            value={medicalNotes}
            onChange={(e) => setMedicalNotes(e.target.value)}
            rows={2}
            maxLength={2000}
            placeholder="Asthma rescue inhaler in backpack, etc."
            className="w-full px-3 py-2 rounded-lg border border-vc-border-light focus:border-vc-coral focus:ring-1 focus:ring-vc-coral resize-y"
          />
        </div>

        {error && (
          <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        <div className="flex gap-2 pt-2">
          <button
            type="submit"
            disabled={busy || !firstName.trim() || !lastName.trim()}
            className="flex-1 min-h-[44px] rounded-full bg-vc-coral text-white font-semibold text-sm disabled:opacity-50"
          >
            {busy ? "Saving…" : initial ? "Save changes" : "Add child"}
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="flex-1 min-h-[44px] rounded-full border border-vc-border-light text-vc-text-secondary font-semibold text-sm"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

/**
 * <ChildRemoveConfirm> — confirmation step before DELETE.
 *
 * Wording is intentionally "Remove from this household" rather than
 * "Delete child" — the server-side soft-delete logic keeps the
 * Person doc around (status=inactive when no households remain;
 * otherwise just drops the membership). This matches divorced /
 * blended-family realities where a child belongs to multiple
 * households.
 */
function ChildRemoveConfirm({
  child,
  busy,
  error,
  onCancel,
  onConfirm,
}: {
  child: GuardianChild;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const displayName = child.preferred_name || child.first_name;
  return (
    <div
      className="fixed inset-0 z-40 bg-black/50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`Remove ${displayName} from household`}
    >
      <div className="bg-vc-bg rounded-2xl shadow-xl max-w-md w-full p-6 space-y-4">
        <h2 className="text-xl font-display font-semibold text-vc-indigo">
          Remove {displayName} from this household?
        </h2>
        <p className="text-sm text-vc-text-secondary leading-relaxed">
          This drops {displayName} from this household's check-in roster.
          Church staff can restore them from the People tab. If{" "}
          {displayName} also belongs to another household, that
          membership stays in place.
        </p>
        {error && (
          <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {error}
          </div>
        )}
        <div className="flex gap-2 pt-2">
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="flex-1 min-h-[44px] rounded-full bg-red-600 text-white font-semibold text-sm disabled:opacity-50"
          >
            {busy ? "Removing…" : `Remove ${displayName}`}
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="flex-1 min-h-[44px] rounded-full border border-vc-border-light text-vc-text-secondary font-semibold text-sm"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
