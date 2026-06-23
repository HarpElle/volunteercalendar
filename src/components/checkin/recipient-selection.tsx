"use client";

/**
 * <RecipientSelection> — Wave 10 W10-1 sub-PR B.
 *
 * Kiosk screen between allergy confirmation and final check-in
 * submit. Lets the operator/parent indicate WHICH authorized
 * contacts are present today; only those get the security-code SMS
 * (along with the primary guardian, always).
 *
 * Layout:
 *   - Top: "Always notified" badge for the primary guardian
 *   - Middle: scrollable list of toggleable recipient cards. Each
 *     card shows name, phone (last 4 masked), source label
 *     ("Household" / "Authorized for Sarah" / etc.), and a checkmark
 *     when selected.
 *   - Bottom: "Add someone not listed" inline form (name + phone)
 *   - Footer: Back / Continue buttons
 *
 * On Continue, the parent component (kiosk) submits the check-in
 * with the selected recipients in the body. The server-side fan-out
 * (foundation sub-PR A) handles the SMS dedup and recipient-list
 * embedding.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { kioskFetch } from "@/lib/kiosk-client";
import { formatPhone } from "@/lib/utils/phone";

interface AvailableRecipient {
  id: string;
  name: string;
  phone: string | null;
  source: "household_adult" | "authorized_pickup";
  ref_id: string;
  child_id?: string;
  photo_url?: string | null;
}

interface PrimaryGuardian {
  name: string;
  phone_masked: string | null;
}

interface SelectedRecipient {
  id: string;
  name: string;
  phone: string | null;
  source: "household_adult" | "authorized_pickup" | "manual";
  ref_id?: string;
}

interface RecipientSelectionProps {
  churchId: string;
  householdId: string;
  childIds: string[];
  childNameById: Record<string, string>;
  onBack: () => void;
  onConfirm: (recipients: SelectedRecipient[]) => void;
  onActivity: () => void;
}

export function RecipientSelection({
  churchId,
  householdId,
  childIds,
  childNameById,
  onBack,
  onConfirm,
  onActivity,
}: RecipientSelectionProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [primary, setPrimary] = useState<PrimaryGuardian | null>(null);
  const [available, setAvailable] = useState<AvailableRecipient[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [manualEntries, setManualEntries] = useState<SelectedRecipient[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [draftPhone, setDraftPhone] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await kioskFetch("/api/checkin/recipients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          church_id: churchId,
          household_id: householdId,
          child_ids: childIds,
        }),
      });
      if (!res.ok) throw new Error("Could not load recipients");
      const data = (await res.json()) as {
        primary_guardian: PrimaryGuardian | null;
        recipients: AvailableRecipient[];
      };
      setPrimary(data.primary_guardian);
      setAvailable(data.recipients);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setLoading(false);
    }
  }, [churchId, householdId, childIds]);

  useEffect(() => {
    void load();
  }, [load]);

  function toggleRecipient(id: string) {
    onActivity();
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function addManual() {
    onActivity();
    const name = draftName.trim();
    if (!name) return;
    const phone = draftPhone.trim() || null;
    const id = `manual:${manualEntries.length + Date.now()}`;
    setManualEntries((prev) => [
      ...prev,
      { id, name, phone, source: "manual" },
    ]);
    setDraftName("");
    setDraftPhone("");
    setShowAddForm(false);
  }

  function removeManual(id: string) {
    onActivity();
    setManualEntries((prev) => prev.filter((m) => m.id !== id));
  }

  const totalSelected = selectedIds.size + manualEntries.length;

  // Group authorized_pickup entries by the child they belong to.
  const sourceLabel = useMemo(() => {
    return (r: AvailableRecipient): string => {
      if (r.source === "household_adult") return "Household";
      if (r.child_id && childNameById[r.child_id]) {
        return `Authorized for ${childNameById[r.child_id]}`;
      }
      return "Authorized pickup";
    };
  }, [childNameById]);

  function handleConfirm() {
    onActivity();
    const selected: SelectedRecipient[] = [];
    for (const r of available) {
      if (!selectedIds.has(r.id)) continue;
      selected.push({
        id: r.id,
        name: r.name,
        phone: r.phone,
        source: r.source,
        ref_id: r.ref_id,
      });
    }
    selected.push(...manualEntries);
    onConfirm(selected);
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-vc-bg-warm">
        <p className="text-xl text-vc-text-muted">Loading…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-vc-bg-warm">
      {/* Header */}
      <div className="bg-white border-b border-vc-border-light p-6 text-center">
        <h2 className="text-2xl font-display font-bold text-vc-indigo">
          Who&rsquo;s picking up today?
        </h2>
        <p className="text-sm text-vc-text-secondary mt-1">
          Tap each person who&rsquo;s here for pickup. They&rsquo;ll each get
          the security code by text.
        </p>
      </div>

      {error && (
        <div className="bg-vc-danger/10 text-vc-danger p-3 text-sm text-center">
          {error}
        </div>
      )}

      {/* Scrollable middle */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Always-notified primary guardian */}
        {primary && (
          <div className="rounded-2xl border-2 border-vc-sage bg-vc-sage/5 p-4 flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-vc-sage text-white flex items-center justify-center text-lg font-bold">
              {primary.name.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1">
              <p className="font-medium text-vc-indigo">{primary.name}</p>
              <p className="text-xs text-vc-text-muted">
                Primary guardian · always notified
              </p>
            </div>
            <span className="text-xs font-bold text-vc-sage uppercase tracking-wider">
              ✓ Auto
            </span>
          </div>
        )}

        {/* Available recipients */}
        {available.length === 0 ? (
          <div className="text-center text-vc-text-muted text-sm py-6">
            No saved pickup contacts. Use &ldquo;Add someone&rdquo; below to
            include a one-time pickup person.
          </div>
        ) : (
          available.map((r) => {
            const selected = selectedIds.has(r.id);
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => toggleRecipient(r.id)}
                className={`w-full rounded-2xl p-4 flex items-center gap-3 text-left transition-all min-h-[44px] ${
                  selected
                    ? "bg-vc-coral text-white shadow-lg"
                    : "bg-white border border-vc-border-light hover:border-vc-coral/40"
                }`}
              >
                {r.photo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={r.photo_url}
                    alt=""
                    className="w-12 h-12 rounded-full object-cover"
                  />
                ) : (
                  <div
                    className={`w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold ${
                      selected ? "bg-white/20" : "bg-vc-indigo/10 text-vc-indigo"
                    }`}
                  >
                    {r.name.charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{r.name}</p>
                  <p
                    className={`text-xs truncate ${
                      selected ? "opacity-80" : "text-vc-text-muted"
                    }`}
                  >
                    {sourceLabel(r)}
                    {r.phone ? ` · ***${r.phone.slice(-4)}` : ""}
                  </p>
                </div>
                {selected && (
                  <span className="text-2xl flex-shrink-0">✓</span>
                )}
              </button>
            );
          })
        )}

        {/* Manual entries */}
        {manualEntries.map((m) => (
          <div
            key={m.id}
            className="rounded-2xl bg-vc-coral/10 border border-vc-coral/30 p-4 flex items-center gap-3"
          >
            <div className="w-12 h-12 rounded-full bg-vc-coral text-white flex items-center justify-center text-lg font-bold">
              {m.name.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-vc-indigo">{m.name}</p>
              <p className="text-xs text-vc-text-muted">
                One-time entry
                {m.phone ? ` · ${formatPhone(m.phone)}` : " · no phone"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => removeManual(m.id)}
              className="text-vc-coral text-sm font-medium hover:underline"
            >
              Remove
            </button>
          </div>
        ))}

        {/* Add someone form */}
        {!showAddForm ? (
          <button
            type="button"
            onClick={() => {
              onActivity();
              setShowAddForm(true);
            }}
            className="w-full rounded-2xl border-2 border-dashed border-vc-border-light p-4 text-vc-text-muted hover:border-vc-coral hover:text-vc-coral transition-colors min-h-[44px]"
          >
            + Add someone not listed
          </button>
        ) : (
          <div className="rounded-2xl border border-vc-border-light bg-white p-4 space-y-3">
            <p className="text-sm font-medium text-vc-indigo">
              One-time pickup contact
            </p>
            <p className="text-xs text-vc-text-muted">
              Not saved to your family&rsquo;s authorized list. To add
              someone permanently, use Account → Family Pickups.
            </p>
            <input
              type="text"
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              placeholder="Name"
              maxLength={200}
              className="w-full px-3 py-2 rounded-lg border border-vc-border-light focus:border-vc-coral focus:ring-1 focus:ring-vc-coral/30 outline-none min-h-[44px]"
            />
            <input
              type="tel"
              value={draftPhone}
              onChange={(e) => setDraftPhone(e.target.value)}
              placeholder="Phone (optional)"
              maxLength={30}
              className="w-full px-3 py-2 rounded-lg border border-vc-border-light focus:border-vc-coral focus:ring-1 focus:ring-vc-coral/30 outline-none min-h-[44px]"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={addManual}
                disabled={!draftName.trim()}
                className="flex-1 px-4 py-2 rounded-lg bg-vc-coral text-white font-medium disabled:opacity-40 disabled:cursor-not-allowed min-h-[44px]"
              >
                Add
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowAddForm(false);
                  setDraftName("");
                  setDraftPhone("");
                }}
                className="px-4 py-2 rounded-lg border border-vc-border-light text-vc-text-secondary min-h-[44px]"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="bg-white border-t border-vc-border-light p-4 grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={onBack}
          className="px-4 py-3 rounded-lg text-sm font-medium text-vc-text-secondary border border-vc-border-light min-h-[44px]"
        >
          Back
        </button>
        <button
          type="button"
          onClick={handleConfirm}
          className="px-4 py-3 rounded-lg text-sm font-bold text-white bg-vc-coral hover:bg-vc-coral/90 min-h-[44px]"
        >
          {totalSelected > 0
            ? `Continue with ${totalSelected} selected`
            : "Continue (primary only)"}
        </button>
      </div>
    </div>
  );
}
