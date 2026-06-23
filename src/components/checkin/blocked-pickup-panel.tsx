"use client";

/**
 * <BlockedPickupPanel> — Wave 9 P0-2 sub-PR E.
 *
 * "Not Authorized" list management panel. Mirrors AuthorizedPickupPanel
 * structurally but writes to the dedicated `checkin_blocked_pickups`
 * subcollection (Admin-SDK-only privacy boundary, see foundation PR
 * #143's STATUS.md deviation note for why this lives outside
 * ChildProfile).
 *
 * Two mount modes via the `scope` prop:
 *   - scope="child"     → manages blocks specific to one child;
 *                          GET filter is child_id only (returns
 *                          child-scope blocks for this child + ALL
 *                          household-scope blocks for the child's
 *                          household(s)). Household-scope blocks are
 *                          rendered with a "household-wide" badge but
 *                          NOT editable from the per-child panel —
 *                          you edit them from the per-household panel.
 *   - scope="household" → manages household-scope blocks only.
 *                          Sibling-wide; applies to every child in
 *                          the household.
 *
 * Uses:
 *   GET    /api/admin/checkin/blocked-pickups?church_id=...&{child_id|household_id}=...
 *   POST   /api/admin/checkin/blocked-pickups
 *   PATCH  /api/admin/checkin/blocked-pickups/[id]
 *   DELETE /api/admin/checkin/blocked-pickups/[id]?church_id=...
 *   POST   /api/admin/checkin/blocked-pickups/[id]/photo (multipart, image)
 *   DELETE /api/admin/checkin/blocked-pickups/[id]/photo?church_id=...
 *   POST   /api/admin/checkin/blocked-pickups/[id]/document (multipart, PDF + image)
 *   DELETE /api/admin/checkin/blocked-pickups/[id]/document?church_id=...
 *
 * Visual identity: matches AuthorizedPickupPanel (vc-* tokens,
 * font-display headings, 44x44 touch targets, motion modals).
 */

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/context/auth-context";
import { Button } from "@/components/ui/button";
import { PhotoCapture } from "./photo-capture";
import { PhotoThumbnail } from "./photo-thumbnail";
import type { BlockedPickup } from "@/lib/types";
import { formatPhone } from "@/lib/utils/phone";

const REASON_LABELS: Record<BlockedPickup["reason"], string> = {
  court_order: "Court order",
  household_decision: "Household decision",
  other: "Other",
};

const DOC_ALLOWED_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
] as const;
const DOC_MAX_BYTES = 10 * 1024 * 1024;

interface BlockedPickupPanelChildProps {
  scope: "child";
  childPersonId: string;
  childDisplayName: string;
}

interface BlockedPickupPanelHouseholdProps {
  scope: "household";
  householdId: string;
  householdDisplayName: string;
}

type BlockedPickupPanelProps =
  | BlockedPickupPanelChildProps
  | BlockedPickupPanelHouseholdProps;

type ModalState =
  | { mode: "closed" }
  | { mode: "add" }
  | { mode: "edit"; entry: BlockedPickup };

interface FormInput {
  name: string;
  phone: string;
  reason: BlockedPickup["reason"];
  notes: string;
  expires_at: string;
}

export function BlockedPickupPanel(props: BlockedPickupPanelProps) {
  const { user, activeMembership } = useAuth();
  const churchId = activeMembership?.church_id;
  const [entries, setEntries] = useState<BlockedPickup[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [modal, setModal] = useState<ModalState>({ mode: "closed" });
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const getIdToken = useCallback(async () => {
    if (!user) throw new Error("Not signed in");
    return await user.getIdToken();
  }, [user]);

  // Fetch entries scoped to this panel.
  const fetchEntries = useCallback(async () => {
    if (!user || !churchId) return;
    try {
      const token = await user.getIdToken();
      const params = new URLSearchParams({ church_id: churchId });
      if (props.scope === "child") params.set("child_id", props.childPersonId);
      else params.set("household_id", props.householdId);
      const res = await fetch(
        `/api/admin/checkin/blocked-pickups?${params.toString()}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? "Failed to load block list");
      }
      const { blocked } = (await res.json()) as { blocked: BlockedPickup[] };
      setEntries(blocked);
      setLoaded(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load block list");
      setLoaded(true);
    }
  }, [user, churchId, props]);

  useEffect(() => {
    void fetchEntries();
  }, [fetchEntries]);

  const handleAdd = async (input: FormInput) => {
    if (!user || !churchId) return;
    setBusy("__new");
    setError(null);
    try {
      const token = await user.getIdToken();
      const body =
        props.scope === "child"
          ? {
              church_id: churchId,
              scope: "child" as const,
              child_id: props.childPersonId,
              name: input.name,
              phone: input.phone || null,
              reason: input.reason,
              notes: input.notes || null,
              expires_at: input.expires_at || null,
            }
          : {
              church_id: churchId,
              scope: "household" as const,
              household_id: props.householdId,
              name: input.name,
              phone: input.phone || null,
              reason: input.reason,
              notes: input.notes || null,
              expires_at: input.expires_at || null,
            };
      const res = await fetch(`/api/admin/checkin/blocked-pickups`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const errBody = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(errBody.error ?? "Failed to add entry");
      }
      const { blocked } = (await res.json()) as { blocked: BlockedPickup };
      setEntries((prev) => [...prev, blocked]);
      setModal({ mode: "closed" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add entry");
    } finally {
      setBusy(null);
    }
  };

  const handleEdit = async (id: string, input: FormInput) => {
    if (!user || !churchId) return;
    setBusy(id);
    setError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/admin/checkin/blocked-pickups/${id}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          church_id: churchId,
          name: input.name,
          phone: input.phone || null,
          reason: input.reason,
          notes: input.notes || null,
          expires_at: input.expires_at || null,
        }),
      });
      if (!res.ok) {
        const errBody = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(errBody.error ?? "Failed to update entry");
      }
      const { blocked } = (await res.json()) as { blocked: BlockedPickup };
      setEntries((prev) => prev.map((e) => (e.id === blocked.id ? blocked : e)));
      setModal({ mode: "closed" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update entry");
    } finally {
      setBusy(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!user || !churchId) return;
    if (
      !window.confirm(
        "Remove this entry from the block list? This is a legally material change — the audit trail will still record it.",
      )
    )
      return;
    setBusy(id);
    setError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch(
        `/api/admin/checkin/blocked-pickups/${id}?church_id=${churchId}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      if (!res.ok && res.status !== 204) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? "Failed to remove entry");
      }
      setEntries((prev) => prev.filter((e) => e.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove entry");
    } finally {
      setBusy(null);
    }
  };

  const handlePhotoSuccess = (id: string, storagePath: string) => {
    setEntries((prev) =>
      prev.map((e) => (e.id === id ? { ...e, photo_url: storagePath } : e)),
    );
  };

  const handleDocumentSuccess = (id: string, storagePath: string) => {
    setEntries((prev) =>
      prev.map((e) => (e.id === id ? { ...e, document_url: storagePath } : e)),
    );
  };

  const handlePhotoRemove = async (id: string) => {
    if (!user || !churchId) return;
    if (!window.confirm("Remove this entry's photo?")) return;
    setBusy(id);
    setError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch(
        `/api/admin/checkin/blocked-pickups/${id}/photo?church_id=${churchId}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      if (!res.ok && res.status !== 204) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? "Failed to remove photo");
      }
      setEntries((prev) =>
        prev.map((e) => (e.id === id ? { ...e, photo_url: null } : e)),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove photo");
    } finally {
      setBusy(null);
    }
  };

  const handleDocumentRemove = async (id: string) => {
    if (!user || !churchId) return;
    if (!window.confirm("Remove this entry's supporting document?")) return;
    setBusy(id);
    setError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch(
        `/api/admin/checkin/blocked-pickups/${id}/document?church_id=${churchId}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      if (!res.ok && res.status !== 204) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? "Failed to remove document");
      }
      setEntries((prev) =>
        prev.map((e) => (e.id === id ? { ...e, document_url: null } : e)),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove document");
    } finally {
      setBusy(null);
    }
  };

  const openDocument = async (path: string) => {
    if (!user || !churchId) return;
    try {
      const token = await user.getIdToken();
      const res = await fetch(
        `/api/admin/checkin/photo?church_id=${churchId}&path=${encodeURIComponent(
          path,
        )}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? "Failed to load document");
      }
      const { signed_url } = (await res.json()) as { signed_url: string };
      window.open(signed_url, "_blank", "noopener,noreferrer");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load document");
    }
  };

  // Visual scope: per-child panels also display household-wide blocks
  // that affect this child (read-only — editing them lives on the
  // per-household panel).
  // Voice unified with AuthorizedPickupPanel — matching template
  // so the two panels read as a related pair instead of independent
  // components (Jason 2026-06-03 feedback).
  const scopeHeading =
    props.scope === "child"
      ? `Not authorized for ${props.childDisplayName}`
      : "Not authorized for any child";
  const scopeSubcopy =
    props.scope === "child"
      ? `Anyone here is blocked from picking ${props.childDisplayName} up — in addition to the household-wide list above.`
      : "Anyone here is blocked from picking up any child in this household — court orders and custody-wide restrictions go here.";

  return (
    <div className="rounded-xl border border-vc-danger/20 bg-vc-danger/5 p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-display font-semibold text-vc-danger">
            {scopeHeading}
          </h3>
          <p className="text-sm text-vc-text-secondary mt-1">{scopeSubcopy}</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          type="button"
          onClick={() => setModal({ mode: "add" })}
          className="min-h-[44px]"
        >
          Add entry
        </Button>
      </div>

      {error && (
        <div className="text-sm text-vc-danger bg-white border border-vc-danger/30 rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      {!loaded ? (
        <p className="text-sm text-vc-text-secondary py-4">Loading…</p>
      ) : entries.length === 0 ? (
        <div className="rounded-lg border border-dashed border-vc-danger/30 bg-white px-4 py-6 text-center text-sm text-vc-text-secondary">
          {props.scope === "child"
            ? `No per-child blocks yet. Add an entry here only if someone should be blocked for ${props.childDisplayName} but NOT the whole household.`
            : "Nobody added yet. Add anyone who should be blocked from picking up every child (custody orders, restraining orders, etc.)."}
        </div>
      ) : (
        <ul className="space-y-3">
          {entries.map((e) => {
            const isOwnScope = e.scope === props.scope;
            return (
              <li
                key={e.id}
                className="flex items-start gap-3 rounded-lg border border-vc-danger/20 bg-white p-3"
              >
                <PhotoThumbnail
                  path={e.photo_url}
                  alt={`${e.name} blocked-pickup photo`}
                  className="w-16 h-16 flex-shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-medium text-vc-indigo">{e.name}</p>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-vc-danger/10 text-vc-danger font-medium">
                      {REASON_LABELS[e.reason]}
                    </span>
                    {!isOwnScope && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-vc-indigo/10 text-vc-indigo/70">
                        Household-wide
                      </span>
                    )}
                    {e.expires_at && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-vc-sand/40 text-vc-text-secondary">
                        Expires {e.expires_at.split("T")[0]}
                      </span>
                    )}
                  </div>
                  {e.phone && (
                    <p className="text-sm text-vc-text-secondary mt-1">
                      {formatPhone(e.phone)}
                    </p>
                  )}
                  {e.notes && (
                    <p className="text-sm text-vc-text-secondary mt-1 italic">
                      {e.notes}
                    </p>
                  )}
                  {isOwnScope && (
                    <div className="flex flex-wrap gap-2 mt-2">
                      <PhotoCapture
                        uploadUrl={`/api/admin/checkin/blocked-pickups/${e.id}/photo`}
                        extraFields={{ church_id: churchId ?? "" }}
                        getIdToken={getIdToken}
                        onSuccess={(path) => handlePhotoSuccess(e.id, path)}
                        triggerLabel={e.photo_url ? "Replace photo" : "Add photo"}
                      />
                      {e.photo_url && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => handlePhotoRemove(e.id)}
                          disabled={busy === e.id}
                          className="min-h-[44px]"
                        >
                          Remove photo
                        </Button>
                      )}
                      <PhotoCapture
                        uploadUrl={`/api/admin/checkin/blocked-pickups/${e.id}/document`}
                        extraFields={{ church_id: churchId ?? "" }}
                        getIdToken={getIdToken}
                        onSuccess={(path) => handleDocumentSuccess(e.id, path)}
                        triggerLabel={
                          e.document_url ? "Replace document" : "Add document"
                        }
                        allowedTypes={DOC_ALLOWED_TYPES}
                        maxBytes={DOC_MAX_BYTES}
                      />
                      {e.document_url && (
                        <>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => openDocument(e.document_url!)}
                            className="min-h-[44px]"
                          >
                            View document
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDocumentRemove(e.id)}
                            disabled={busy === e.id}
                            className="min-h-[44px]"
                          >
                            Remove document
                          </Button>
                        </>
                      )}
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setModal({ mode: "edit", entry: e })}
                        disabled={busy === e.id}
                        className="min-h-[44px]"
                      >
                        Edit
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(e.id)}
                        disabled={busy === e.id}
                        className="min-h-[44px] text-vc-danger hover:bg-vc-danger/5"
                      >
                        Remove
                      </Button>
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {modal.mode !== "closed" && (
        <BlockedPickupFormModal
          initial={modal.mode === "edit" ? modal.entry : undefined}
          onCancel={() => setModal({ mode: "closed" })}
          onSubmit={(input) => {
            if (modal.mode === "edit") return handleEdit(modal.entry.id, input);
            return handleAdd(input);
          }}
          busy={busy !== null}
        />
      )}
    </div>
  );
}

interface BlockedPickupFormModalProps {
  initial?: BlockedPickup;
  onCancel: () => void;
  onSubmit: (input: FormInput) => void | Promise<void>;
  busy: boolean;
}

function BlockedPickupFormModal({
  initial,
  onCancel,
  onSubmit,
  busy,
}: BlockedPickupFormModalProps) {
  const [name, setName] = useState(initial?.name ?? "");
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [reason, setReason] = useState<BlockedPickup["reason"]>(
    initial?.reason ?? "court_order",
  );
  const [notes, setNotes] = useState(initial?.notes ?? "");

  // 2026-06-03 date UX rework. Three previous problems:
  //   1. Empty <input type="date" /> in Safari Mac renders today's date
  //      as a placeholder hint — users perceived this as "today is
  //      selected" when actually the React state was empty.
  //   2. When users tried to "push it ahead" via the stepper, the
  //      partial year ended up rejected by Safari's HTML5 validation
  //      with a "needs valid date" message before submit even ran.
  //   3. No visual cue that empty = indefinite block.
  // Fix: a hasExpiry checkbox controls whether the date field renders.
  // When unchecked → indefinite (no expiry stored). When checked →
  // the date input gets a real value (defaults to +6 months) and a
  // `min` of today so the picker refuses to step backward.
  const initialIso = initial?.expires_at?.split("T")[0] ?? "";
  const [hasExpiry, setHasExpiry] = useState(Boolean(initialIso));
  const todayIso = new Date().toISOString().split("T")[0];
  // Default: 6 months out, formatted YYYY-MM-DD.
  const defaultExpiryIso = (() => {
    const d = new Date();
    d.setMonth(d.getMonth() + 6);
    return d.toISOString().split("T")[0];
  })();
  const [expiresAt, setExpiresAt] = useState(initialIso || defaultExpiryIso);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    // Guard: when hasExpiry is on, the date input has noValidate-style
    // safety via min={todayIso}, but a manually-typed value below today
    // can still slip through in some browsers. Reject explicitly.
    if (hasExpiry) {
      if (!expiresAt || expiresAt < todayIso) {
        return;
      }
    }
    void onSubmit({
      name: name.trim(),
      phone: phone.trim(),
      reason,
      notes: notes.trim(),
      expires_at:
        hasExpiry && expiresAt
          ? new Date(`${expiresAt}T00:00:00Z`).toISOString()
          : "",
    });
  };

  return (
    <div
      className="fixed inset-0 z-40 bg-black/50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={initial ? "Edit blocked-pickup entry" : "Add blocked-pickup entry"}
    >
      <form
        onSubmit={submit}
        className="bg-vc-bg rounded-2xl shadow-xl max-w-md w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto"
      >
        <h2 className="text-xl font-display font-semibold text-vc-indigo">
          {initial ? "Edit entry" : "Add to block list"}
        </h2>
        <p className="text-sm text-vc-text-secondary">
          This is a legally material action. The audit trail records the add /
          edit / remove and who made the change.
        </p>
        <div>
          <label
            htmlFor="bp-name"
            className="block text-sm font-medium text-vc-indigo mb-1"
          >
            Name *
          </label>
          <input
            id="bp-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={200}
            autoFocus
            className="w-full px-3 py-2 rounded-lg border border-vc-border-light focus:border-vc-coral focus:ring-1 focus:ring-vc-coral min-h-[44px]"
          />
        </div>
        <div>
          <label
            htmlFor="bp-phone"
            className="block text-sm font-medium text-vc-indigo mb-1"
          >
            Phone
          </label>
          <input
            id="bp-phone"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+1 555 555 0100"
            maxLength={30}
            className="w-full px-3 py-2 rounded-lg border border-vc-border-light focus:border-vc-coral focus:ring-1 focus:ring-vc-coral min-h-[44px]"
          />
        </div>
        <div>
          <label
            htmlFor="bp-reason"
            className="block text-sm font-medium text-vc-indigo mb-1"
          >
            Reason *
          </label>
          <select
            id="bp-reason"
            value={reason}
            onChange={(e) =>
              setReason(e.target.value as BlockedPickup["reason"])
            }
            className="w-full px-3 py-2 rounded-lg border border-vc-border-light focus:border-vc-coral focus:ring-1 focus:ring-vc-coral min-h-[44px]"
          >
            <option value="court_order">Court order</option>
            <option value="household_decision">Household decision</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div>
          <label
            htmlFor="bp-notes"
            className="block text-sm font-medium text-vc-indigo mb-1"
          >
            Notes
          </label>
          <textarea
            id="bp-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            maxLength={2000}
            placeholder="Brief admin context. Don't quote court orders here — attach the document file instead."
            className="w-full px-3 py-2 rounded-lg border border-vc-border-light focus:border-vc-coral focus:ring-1 focus:ring-vc-coral resize-y"
          />
        </div>
        <div>
          <span className="block text-sm font-medium text-vc-indigo mb-1">
            Expiration
          </span>
          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={!hasExpiry}
              onChange={(e) => setHasExpiry(!e.target.checked)}
              className="mt-1 h-4 w-4 rounded border-vc-border-light text-vc-coral focus:ring-vc-coral"
            />
            <span className="text-sm text-vc-indigo">
              Indefinite (no expiry) — the block stays in effect until
              an admin removes it.
            </span>
          </label>
          {hasExpiry && (
            <div className="mt-3 pl-6 space-y-2">
              <label
                htmlFor="bp-expires"
                className="block text-sm font-medium text-vc-indigo"
              >
                Expires on
              </label>
              <input
                id="bp-expires"
                type="date"
                value={expiresAt}
                min={todayIso}
                onChange={(e) => setExpiresAt(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-vc-border-light focus:border-vc-coral focus:ring-1 focus:ring-vc-coral min-h-[44px]"
              />
              <p className="text-xs text-vc-text-secondary">
                Use for time-limited orders (e.g. emergency protective
                orders). Defaults to six months out — change to match
                the order's actual end date.
              </p>
            </div>
          )}
        </div>
        <div className="flex gap-2 pt-2">
          <Button
            type="submit"
            variant="primary"
            disabled={busy || !name.trim()}
            className="flex-1 min-h-[44px]"
          >
            {busy ? "Saving…" : initial ? "Save changes" : "Add to block list"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={busy}
            className="min-h-[44px]"
          >
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}
