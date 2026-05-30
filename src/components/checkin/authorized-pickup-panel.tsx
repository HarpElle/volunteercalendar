"use client";

/**
 * <AuthorizedPickupPanel> — Wave 9 P0-2 sub-PR D.
 *
 * Per-child management UI for the authorized-pickup list. Mounted on
 * the household detail page once per child in the household. Handles:
 *   - Listing existing contacts with name / phone / relationship / photo
 *   - Adding new contacts (modal)
 *   - Editing existing contacts (modal)
 *   - Removing contacts
 *   - Adding / replacing / removing the per-contact photo
 *
 * Uses the new server routes:
 *   POST/PATCH/DELETE /api/admin/checkin/children/[personId]/authorized-pickups[/[pickupId]]
 *   POST/DELETE /api/admin/checkin/children/[personId]/authorized-pickups/[pickupId]/photo
 *
 * Visual identity: matches the existing household-page card / form
 * conventions (`vc-bg`, `vc-border-light`, `font-display`, coral
 * primary CTA, 44x44 touch targets).
 */

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/context/auth-context";
import { Button } from "@/components/ui/button";
import { PhotoCapture } from "./photo-capture";
import { PhotoThumbnail } from "./photo-thumbnail";
import type { PersonAuthorizedPickup } from "@/lib/types";

interface AuthorizedPickupPanelProps {
  /** Person ID of the child this panel manages. */
  childPersonId: string;
  /** Display name (e.g. "Sam") used in panel header + dialog copy. */
  childDisplayName: string;
  /** Initial list from the parent fetch. */
  initialPickups: PersonAuthorizedPickup[];
  /** Bubbles up after a mutation so the parent can refresh its store
   *  (parent may also re-fetch the household; we use this for optimistic
   *  state). */
  onChanged?: () => void;
}

type ModalState =
  | { mode: "closed" }
  | { mode: "add" }
  | { mode: "edit"; pickup: PersonAuthorizedPickup };

export function AuthorizedPickupPanel({
  childPersonId,
  childDisplayName,
  initialPickups,
  onChanged,
}: AuthorizedPickupPanelProps) {
  const { user, activeMembership } = useAuth();
  const churchId = activeMembership?.church_id;
  const [pickups, setPickups] = useState<PersonAuthorizedPickup[]>(initialPickups);
  const [modal, setModal] = useState<ModalState>({ mode: "closed" });
  const [busy, setBusy] = useState<string | null>(null); // pickup id currently mutating
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setPickups(initialPickups);
  }, [initialPickups]);

  const getIdToken = useCallback(async () => {
    if (!user) throw new Error("Not signed in");
    return await user.getIdToken();
  }, [user]);

  const refetchChild = useCallback(async () => {
    if (!user || !churchId) return;
    try {
      const token = await user.getIdToken();
      const res = await fetch(
        `/api/admin/checkin/children?church_id=${churchId}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!res.ok) return;
      const data = (await res.json()) as {
        children: Array<{
          id: string;
          authorized_pickups?: PersonAuthorizedPickup[];
        }>;
      };
      const me = data.children.find((c) => c.id === childPersonId);
      if (me?.authorized_pickups) setPickups(me.authorized_pickups);
    } catch {
      // silent
    }
  }, [user, churchId, childPersonId]);

  const handleAdd = async (input: {
    name: string;
    phone: string;
    relationship: string;
  }) => {
    if (!user || !churchId) return;
    setBusy("__new");
    setError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch(
        `/api/admin/checkin/children/${childPersonId}/authorized-pickups`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            church_id: churchId,
            name: input.name,
            phone: input.phone || null,
            relationship: input.relationship || null,
          }),
        },
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? "Failed to add contact");
      }
      const { pickup } = (await res.json()) as { pickup: PersonAuthorizedPickup };
      setPickups((prev) => [...prev, pickup]);
      setModal({ mode: "closed" });
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add contact");
    } finally {
      setBusy(null);
    }
  };

  const handleEdit = async (
    pickupId: string,
    input: { name: string; phone: string; relationship: string },
  ) => {
    if (!user || !churchId) return;
    setBusy(pickupId);
    setError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch(
        `/api/admin/checkin/children/${childPersonId}/authorized-pickups/${pickupId}`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${token}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            church_id: churchId,
            name: input.name,
            phone: input.phone || null,
            relationship: input.relationship || null,
          }),
        },
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? "Failed to update contact");
      }
      const { pickup } = (await res.json()) as { pickup: PersonAuthorizedPickup };
      setPickups((prev) => prev.map((p) => (p.id === pickup.id ? pickup : p)));
      setModal({ mode: "closed" });
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update contact");
    } finally {
      setBusy(null);
    }
  };

  const handleDelete = async (pickupId: string) => {
    if (!user || !churchId) return;
    if (
      !window.confirm(
        `Remove this authorized pickup contact for ${childDisplayName}?`,
      )
    )
      return;
    setBusy(pickupId);
    setError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch(
        `/api/admin/checkin/children/${childPersonId}/authorized-pickups/${pickupId}?church_id=${churchId}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      if (!res.ok && res.status !== 204) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? "Failed to remove contact");
      }
      setPickups((prev) => prev.filter((p) => p.id !== pickupId));
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove contact");
    } finally {
      setBusy(null);
    }
  };

  const handlePhotoSuccess = (pickupId: string, storagePath: string) => {
    setPickups((prev) =>
      prev.map((p) => (p.id === pickupId ? { ...p, photo_url: storagePath } : p)),
    );
    onChanged?.();
  };

  const handlePhotoRemove = async (pickupId: string) => {
    if (!user || !churchId) return;
    if (!window.confirm("Remove this contact's photo?")) return;
    setBusy(pickupId);
    setError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch(
        `/api/admin/checkin/children/${childPersonId}/authorized-pickups/${pickupId}/photo?church_id=${churchId}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      if (!res.ok && res.status !== 204) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? "Failed to remove photo");
      }
      setPickups((prev) =>
        prev.map((p) => (p.id === pickupId ? { ...p, photo_url: null } : p)),
      );
      onChanged?.();
      // PhotoThumbnail also has its own cached URL; the parent re-render
      // with path: null will clear it. Re-fetching child data is belt-and-
      // suspenders for the case where the parent reloads anyway.
      void refetchChild();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove photo");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="rounded-xl border border-vc-border-light bg-vc-bg p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-display font-semibold text-vc-indigo">
            Authorized for pickup
          </h3>
          <p className="text-sm text-vc-text-secondary mt-1">
            People allowed to take {childDisplayName} home.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          type="button"
          onClick={() => setModal({ mode: "add" })}
          className="min-h-[44px]"
        >
          Add contact
        </Button>
      </div>

      {error && (
        <div className="text-sm text-vc-danger bg-vc-danger/5 border border-vc-danger/20 rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      {pickups.length === 0 ? (
        <div className="rounded-lg border border-dashed border-vc-border-light bg-vc-bg-warm px-4 py-6 text-center text-sm text-vc-text-secondary">
          No authorized contacts yet. Add the people allowed to pick{" "}
          {childDisplayName} up from check-in.
        </div>
      ) : (
        <ul className="space-y-3">
          {pickups.map((p) => (
            <li
              key={p.id ?? `${p.name}|${p.phone ?? ""}`}
              className="flex items-start gap-3 rounded-lg border border-vc-border-light bg-vc-bg-warm p-3"
            >
              <PhotoThumbnail
                path={p.photo_url}
                alt={`${p.name} pickup photo`}
                className="w-16 h-16 flex-shrink-0"
              />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-vc-indigo">{p.name}</p>
                {p.relationship && (
                  <p className="text-sm text-vc-text-secondary">
                    {p.relationship}
                  </p>
                )}
                {p.phone && (
                  <p className="text-sm text-vc-text-secondary">{p.phone}</p>
                )}
                <div className="flex flex-wrap gap-2 mt-2">
                  {p.id && (
                    <PhotoCapture
                      uploadUrl={`/api/admin/checkin/children/${childPersonId}/authorized-pickups/${p.id}/photo`}
                      extraFields={{ church_id: churchId ?? "" }}
                      getIdToken={getIdToken}
                      onSuccess={(path) => handlePhotoSuccess(p.id!, path)}
                      triggerLabel={p.photo_url ? "Replace photo" : "Add photo"}
                    />
                  )}
                  {p.id && p.photo_url && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => handlePhotoRemove(p.id!)}
                      disabled={busy === p.id}
                      className="min-h-[44px]"
                    >
                      Remove photo
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setModal({ mode: "edit", pickup: p })}
                    disabled={busy === p.id}
                    className="min-h-[44px]"
                  >
                    Edit
                  </Button>
                  {p.id && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(p.id!)}
                      disabled={busy === p.id}
                      className="min-h-[44px] text-vc-danger hover:bg-vc-danger/5"
                    >
                      Remove
                    </Button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {modal.mode !== "closed" && (
        <PickupFormModal
          initial={modal.mode === "edit" ? modal.pickup : undefined}
          onCancel={() => setModal({ mode: "closed" })}
          onSubmit={(input) => {
            if (modal.mode === "edit" && modal.pickup.id) {
              return handleEdit(modal.pickup.id, input);
            }
            return handleAdd(input);
          }}
          busy={busy !== null}
        />
      )}
    </div>
  );
}

interface PickupFormModalProps {
  initial?: PersonAuthorizedPickup;
  onCancel: () => void;
  onSubmit: (input: {
    name: string;
    phone: string;
    relationship: string;
  }) => void | Promise<void>;
  busy: boolean;
}

function PickupFormModal({
  initial,
  onCancel,
  onSubmit,
  busy,
}: PickupFormModalProps) {
  const [name, setName] = useState(initial?.name ?? "");
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [relationship, setRelationship] = useState(initial?.relationship ?? "");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    void onSubmit({
      name: name.trim(),
      phone: phone.trim(),
      relationship: relationship.trim(),
    });
  };

  return (
    <div
      className="fixed inset-0 z-40 bg-black/50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={initial ? "Edit pickup contact" : "Add pickup contact"}
    >
      <form
        onSubmit={submit}
        className="bg-vc-bg rounded-2xl shadow-xl max-w-md w-full p-6 space-y-4"
      >
        <h2 className="text-xl font-display font-semibold text-vc-indigo">
          {initial ? "Edit contact" : "Add authorized contact"}
        </h2>
        <div>
          <label
            htmlFor="pickup-name"
            className="block text-sm font-medium text-vc-indigo mb-1"
          >
            Name *
          </label>
          <input
            id="pickup-name"
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
            htmlFor="pickup-relationship"
            className="block text-sm font-medium text-vc-indigo mb-1"
          >
            Relationship
          </label>
          <input
            id="pickup-relationship"
            type="text"
            value={relationship}
            onChange={(e) => setRelationship(e.target.value)}
            placeholder="grandmother, neighbor, etc."
            maxLength={100}
            className="w-full px-3 py-2 rounded-lg border border-vc-border-light focus:border-vc-coral focus:ring-1 focus:ring-vc-coral min-h-[44px]"
          />
        </div>
        <div>
          <label
            htmlFor="pickup-phone"
            className="block text-sm font-medium text-vc-indigo mb-1"
          >
            Phone
          </label>
          <input
            id="pickup-phone"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+1 555 555 0100"
            maxLength={30}
            className="w-full px-3 py-2 rounded-lg border border-vc-border-light focus:border-vc-coral focus:ring-1 focus:ring-vc-coral min-h-[44px]"
          />
        </div>
        <div className="flex gap-2 pt-2">
          <Button
            type="submit"
            variant="primary"
            disabled={busy || !name.trim()}
            className="flex-1 min-h-[44px]"
          >
            {busy ? "Saving…" : initial ? "Save changes" : "Add contact"}
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
