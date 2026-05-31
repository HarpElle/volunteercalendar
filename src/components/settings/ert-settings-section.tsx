"use client";

/**
 * <ErtSettingsSection> — Wave 9 P0-2 sub-PR E2.
 *
 * Admin UI for managing the church's Emergency Response Team — the
 * list of phone numbers that get SMS'd in parallel with the church
 * owner when a blocked-pickup attempt is detected at a staffed kiosk
 * (Sub-PR F). Without this UI, the only way to populate the list was
 * a direct Firestore write; Sub-PR F still worked (owner-only fanout
 * was the fallback) but this completes the safety primitive.
 *
 * Data path uses the existing settings endpoint:
 *   GET  /api/admin/checkin/settings?church_id=...
 *   PUT  /api/admin/checkin/settings  (body: { emergency_notification_numbers })
 *
 * Audit is emitted server-side (`checkin.ert_settings_updated`) only
 * when the list actually changes — no-op saves don't double-audit.
 * That logic was shipped in PR #156 / re-landed in #156.
 *
 * Validation:
 *   - name + phone required per entry
 *   - phone normalized client-side (strip whitespace + non-digit
 *     characters except leading +)
 *   - role optional
 * The server runs the same validation + drops malformed entries,
 * so a tampered client can't sneak garbage in.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/context/auth-context";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type { CheckInSettings } from "@/lib/types";

type ErtEntry = NonNullable<
  CheckInSettings["emergency_notification_numbers"]
>[number];

interface ErtSettingsSectionProps {
  churchId: string;
}

const E164_REGEX = /^\+[1-9]\d{6,14}$/;

function normalizePhone(input: string): string {
  // Strip spaces, parens, hyphens, etc. Keep leading + and digits.
  const cleaned = input.trim().replace(/[^\d+]/g, "");
  // Lone + or empty → empty.
  if (!cleaned || cleaned === "+") return "";
  // Normalize "+1..." or "1..." or bare digits to "+1XXXXXXXXXX" for
  // 10-digit US numbers — common church input shape.
  if (cleaned.startsWith("+")) return cleaned;
  if (cleaned.length === 10) return `+1${cleaned}`;
  if (cleaned.length === 11 && cleaned.startsWith("1")) return `+${cleaned}`;
  return cleaned.startsWith("+") ? cleaned : `+${cleaned}`;
}

function validatePhone(phone: string): string | null {
  if (!phone) return "Phone is required";
  if (!E164_REGEX.test(phone)) {
    return "Use E.164 format (e.g. +15555550100)";
  }
  return null;
}

export function ErtSettingsSection({ churchId }: ErtSettingsSectionProps) {
  const { user } = useAuth();
  const [entries, setEntries] = useState<ErtEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const savedTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Inline draft for "Add new" row.
  const [draftName, setDraftName] = useState("");
  const [draftPhone, setDraftPhone] = useState("");
  const [draftRole, setDraftRole] = useState("");
  const [draftError, setDraftError] = useState<string | null>(null);

  // Per-row edit state.
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editRole, setEditRole] = useState("");
  const [editError, setEditError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const token = await user.getIdToken();
      const res = await fetch(
        `/api/admin/checkin/settings?church_id=${churchId}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (res.ok) {
        const data = (await res.json()) as CheckInSettings;
        setEntries(data.emergency_notification_numbers ?? []);
      }
    } catch {
      // silent — the existing thresholds section also fails silently here
    } finally {
      setLoading(false);
    }
  }, [user, churchId]);

  useEffect(() => {
    void load();
  }, [load]);

  const persist = useCallback(
    async (next: ErtEntry[]) => {
      if (!user) return;
      setSaving(true);
      setError(null);
      try {
        const token = await user.getIdToken();
        const res = await fetch(`/api/admin/checkin/settings`, {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${token}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            church_id: churchId,
            emergency_notification_numbers: next,
          }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          throw new Error(body.error ?? "Failed to save");
        }
        const data = (await res.json()) as CheckInSettings;
        // Server normalizes + drops malformed entries — trust its
        // round-trip rather than our local state.
        setEntries(data.emergency_notification_numbers ?? []);
        setSaved(true);
        if (savedTimeout.current) clearTimeout(savedTimeout.current);
        savedTimeout.current = setTimeout(() => setSaved(false), 3000);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to save");
      } finally {
        setSaving(false);
      }
    },
    [user, churchId],
  );

  const handleAdd = async () => {
    setDraftError(null);
    const name = draftName.trim();
    const phone = normalizePhone(draftPhone);
    const role = draftRole.trim() || null;

    if (!name) {
      setDraftError("Name is required");
      return;
    }
    const phoneErr = validatePhone(phone);
    if (phoneErr) {
      setDraftError(phoneErr);
      return;
    }
    const next: ErtEntry[] = [...entries, { name, phone, role }];
    await persist(next);
    setDraftName("");
    setDraftPhone("");
    setDraftRole("");
  };

  const handleEditOpen = (idx: number) => {
    const e = entries[idx];
    setEditingIdx(idx);
    setEditName(e.name);
    setEditPhone(e.phone);
    setEditRole(e.role ?? "");
    setEditError(null);
  };

  const handleEditSave = async () => {
    if (editingIdx === null) return;
    setEditError(null);
    const name = editName.trim();
    const phone = normalizePhone(editPhone);
    const role = editRole.trim() || null;
    if (!name) {
      setEditError("Name is required");
      return;
    }
    const phoneErr = validatePhone(phone);
    if (phoneErr) {
      setEditError(phoneErr);
      return;
    }
    const next = entries.slice();
    next[editingIdx] = { name, phone, role };
    await persist(next);
    setEditingIdx(null);
  };

  const handleDelete = async (idx: number) => {
    if (
      !window.confirm(
        "Remove this contact from the Emergency Response Team? They will no longer receive blocked-pickup alerts.",
      )
    )
      return;
    const next = entries.filter((_, i) => i !== idx);
    await persist(next);
  };

  if (loading) {
    return (
      <div className="rounded-xl border border-vc-border-light bg-vc-bg p-5">
        <Spinner />
      </div>
    );
  }

  return (
    <section className="rounded-xl border border-vc-border-light bg-vc-bg p-5 space-y-4">
      <div>
        <h3 className="text-base font-display font-semibold text-vc-indigo">
          Emergency Response Team
        </h3>
        <p className="text-sm text-vc-text-secondary mt-1">
          These contacts receive an SMS in parallel with the church owner
          when a blocked-pickup attempt is detected at a staffed kiosk.
          Owner retains sole override authority — adding people here gives
          them awareness, not override.
        </p>
      </div>

      {error && (
        <div className="text-sm text-vc-danger bg-vc-danger/5 border border-vc-danger/20 rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      {entries.length === 0 ? (
        <div className="rounded-lg border border-dashed border-vc-border-light bg-vc-bg-warm px-4 py-6 text-sm text-vc-text-secondary text-center">
          No team members yet. Add a deacon, safety lead, or pastoral
          on-call below.
        </div>
      ) : (
        <ul className="space-y-2">
          {entries.map((e, idx) => (
            <li
              key={`${e.phone}-${idx}`}
              className="rounded-lg border border-vc-border-light bg-vc-bg-warm p-3"
            >
              {editingIdx === idx ? (
                <div className="space-y-2">
                  <div className="grid sm:grid-cols-3 gap-2">
                    <input
                      type="text"
                      value={editName}
                      onChange={(ev) => setEditName(ev.target.value)}
                      placeholder="Name"
                      maxLength={100}
                      className="px-3 py-2 rounded-lg border border-vc-border-light focus:border-vc-coral focus:ring-1 focus:ring-vc-coral min-h-[44px]"
                    />
                    <input
                      type="tel"
                      value={editPhone}
                      onChange={(ev) => setEditPhone(ev.target.value)}
                      placeholder="+1 555 555 0100"
                      maxLength={30}
                      className="px-3 py-2 rounded-lg border border-vc-border-light focus:border-vc-coral focus:ring-1 focus:ring-vc-coral min-h-[44px]"
                    />
                    <input
                      type="text"
                      value={editRole}
                      onChange={(ev) => setEditRole(ev.target.value)}
                      placeholder="Role (optional)"
                      maxLength={60}
                      className="px-3 py-2 rounded-lg border border-vc-border-light focus:border-vc-coral focus:ring-1 focus:ring-vc-coral min-h-[44px]"
                    />
                  </div>
                  {editError && (
                    <p className="text-sm text-vc-danger">{editError}</p>
                  )}
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="primary"
                      size="sm"
                      onClick={handleEditSave}
                      disabled={saving}
                      className="min-h-[44px]"
                    >
                      {saving ? "Saving…" : "Save"}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setEditingIdx(null)}
                      disabled={saving}
                      className="min-h-[44px]"
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-vc-indigo">{e.name}</p>
                    <p className="text-sm text-vc-text-secondary">
                      {e.phone}
                      {e.role && ` · ${e.role}`}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => handleEditOpen(idx)}
                      disabled={saving}
                      className="min-h-[44px]"
                    >
                      Edit
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(idx)}
                      disabled={saving}
                      className="min-h-[44px] text-vc-danger hover:bg-vc-danger/5"
                    >
                      Remove
                    </Button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="rounded-lg border border-vc-border-light bg-vc-bg-warm p-3 space-y-2">
        <p className="text-sm font-medium text-vc-indigo">Add a team member</p>
        <div className="grid sm:grid-cols-3 gap-2">
          <input
            type="text"
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            placeholder="Name"
            maxLength={100}
            className="px-3 py-2 rounded-lg border border-vc-border-light focus:border-vc-coral focus:ring-1 focus:ring-vc-coral min-h-[44px]"
          />
          <input
            type="tel"
            value={draftPhone}
            onChange={(e) => setDraftPhone(e.target.value)}
            placeholder="+1 555 555 0100"
            maxLength={30}
            className="px-3 py-2 rounded-lg border border-vc-border-light focus:border-vc-coral focus:ring-1 focus:ring-vc-coral min-h-[44px]"
          />
          <input
            type="text"
            value={draftRole}
            onChange={(e) => setDraftRole(e.target.value)}
            placeholder="Role (optional)"
            maxLength={60}
            className="px-3 py-2 rounded-lg border border-vc-border-light focus:border-vc-coral focus:ring-1 focus:ring-vc-coral min-h-[44px]"
          />
        </div>
        {draftError && (
          <p className="text-sm text-vc-danger">{draftError}</p>
        )}
        <div className="flex justify-end">
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={handleAdd}
            disabled={saving}
            className="min-h-[44px]"
          >
            {saving ? "Saving…" : "Add to team"}
          </Button>
        </div>
      </div>

      {saved && (
        <p className="text-sm text-vc-sage">✓ Saved.</p>
      )}
    </section>
  );
}
