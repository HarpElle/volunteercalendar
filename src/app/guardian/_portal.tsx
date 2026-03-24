"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import QRCode from "qrcode";

interface GuardianChild {
  id: string;
  first_name: string;
  last_name: string;
  preferred_name?: string;
  grade?: string;
}

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
      {/* Church name */}
      <p className="text-sm text-vc-text-secondary font-medium mb-1">
        {churchName}
      </p>
      <h1 className="text-2xl font-bold text-vc-indigo font-display mb-6">
        {household.primary_guardian_name} Family
      </h1>

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

      {/* Children */}
      <div className="bg-white rounded-xl border border-vc-border-light p-5 mb-4">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
          Children ({children.length})
        </h2>
        {children.length === 0 ? (
          <p className="text-sm text-vc-text-muted">No children on file.</p>
        ) : (
          <div className="space-y-2">
            {children.map((c) => (
              <div
                key={c.id}
                className="flex items-center justify-between py-1.5"
              >
                <p className="text-sm font-medium text-vc-indigo">
                  {c.preferred_name || c.first_name} {c.last_name}
                </p>
                {c.grade && (
                  <span className="text-xs text-vc-text-muted bg-gray-50 px-2 py-0.5 rounded-full">
                    {c.grade}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
        <p className="text-xs text-vc-text-muted mt-3">
          To add or remove children, please contact church staff.
        </p>
      </div>

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
