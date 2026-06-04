"use client";

/**
 * <AuthorizedPickupPanel> — Wave 9 P0-2 sub-PR D + 2026-06-03 scope ext.
 *
 * Management UI for the authorized-pickup list. Two mount modes via the
 * `scope` prop:
 *
 *   - scope="child"     → manages contacts specific to one child;
 *                          reads/writes Person.child_profile.authorized_pickups
 *                          via the per-child API. Mirrors BlockedPickupPanel
 *                          scope="child".
 *   - scope="household" → manages contacts that apply to every child in
 *                          the household (e.g. "Grandma can pick up any
 *                          of the Smith kids"). Reads/writes
 *                          Household.authorized_pickups via the same API
 *                          with scope=household.
 *
 * Uses the server routes (scope passed in body/query):
 *   POST   /api/admin/checkin/authorized-pickups
 *   PATCH  /api/admin/checkin/authorized-pickups/[id]
 *   DELETE /api/admin/checkin/authorized-pickups/[id]?church_id=...&scope=...&(child_id|household_id)=...
 *   POST   /api/admin/checkin/authorized-pickups/[id]/photo   (multipart)
 *   DELETE /api/admin/checkin/authorized-pickups/[id]/photo?church_id=...&scope=...&(child_id|household_id)=...
 */

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/context/auth-context";
import { Button } from "@/components/ui/button";
import { PhotoCapture } from "./photo-capture";
import { PhotoThumbnail } from "./photo-thumbnail";
import type { PersonAuthorizedPickup } from "@/lib/types";
import { formatPhone } from "@/lib/utils/phone";

interface AuthorizedPickupPanelChildProps {
  scope: "child";
  childPersonId: string;
  childDisplayName: string;
  initialPickups: PersonAuthorizedPickup[];
  /** Household-wide entries surfaced read-only on the per-child panel
   *  so the operator sees the full picture for this child (mirrors
   *  what BlockedPickupPanel already does). Edit/remove for these
   *  lives on the household panel. */
  householdInheritedPickups?: PersonAuthorizedPickup[];
  onChanged?: () => void;
}

interface AuthorizedPickupPanelHouseholdProps {
  scope: "household";
  householdId: string;
  householdDisplayName: string;
  initialPickups: PersonAuthorizedPickup[];
  onChanged?: () => void;
}

type AuthorizedPickupPanelProps =
  | AuthorizedPickupPanelChildProps
  | AuthorizedPickupPanelHouseholdProps;

type ModalState =
  | { mode: "closed" }
  | { mode: "add" }
  | { mode: "edit"; pickup: PersonAuthorizedPickup };

export function AuthorizedPickupPanel(props: AuthorizedPickupPanelProps) {
  const { user, activeMembership } = useAuth();
  const churchId = activeMembership?.church_id;
  const [pickups, setPickups] = useState<PersonAuthorizedPickup[]>(
    props.initialPickups,
  );
  const [modal, setModal] = useState<ModalState>({ mode: "closed" });
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setPickups(props.initialPickups);
  }, [props.initialPickups]);

  const getIdToken = useCallback(async () => {
    if (!user) throw new Error("Not signed in");
    return await user.getIdToken();
  }, [user]);

  // Voice unified with BlockedPickupPanel — same heading template
  // ("Authorized" / "Not authorized" for {Name} | for any child) and
  // matching sub-copy structure so the two panels read as siblings
  // instead of two unrelated components.
  const headerTitle =
    props.scope === "child"
      ? `Authorized for ${props.childDisplayName}`
      : "Authorized for any child";
  const headerSubcopy =
    props.scope === "child"
      ? `Anyone here can pick ${props.childDisplayName} up — in addition to the household-wide list above.`
      : "Anyone here can pick up any child in this household — saves re-adding them per child.";
  const emptyCopy =
    props.scope === "child"
      ? `No per-child overrides for ${props.childDisplayName}. Add a contact here only if they should pick up ${props.childDisplayName} but NOT the other kids.`
      : "Nobody added yet. Add grandparents, regular family friends, or anyone else who's allowed to pick up every child.";
  const confirmRemoveCopy =
    props.scope === "child"
      ? `Remove this authorized contact for ${props.childDisplayName}?`
      : "Remove this household-wide authorized contact?";

  const bodyTargetParams = () =>
    props.scope === "child"
      ? { scope: "child", child_id: props.childPersonId }
      : { scope: "household", household_id: props.householdId };

  const queryTargetParams = () =>
    props.scope === "child"
      ? `scope=child&child_id=${encodeURIComponent(props.childPersonId)}`
      : `scope=household&household_id=${encodeURIComponent(props.householdId)}`;

  const photoExtraFields: Record<string, string> = {
    church_id: churchId ?? "",
    scope: props.scope,
    ...(props.scope === "child"
      ? { child_id: props.childPersonId }
      : { household_id: props.householdId }),
  };

  const refetchChild = useCallback(async () => {
    if (props.scope !== "child") return;
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
      const me = data.children.find((c) => c.id === props.childPersonId);
      if (me?.authorized_pickups) setPickups(me.authorized_pickups);
    } catch {
      // silent
    }
  }, [user, churchId, props]);

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
      const res = await fetch(`/api/admin/checkin/authorized-pickups`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          church_id: churchId,
          ...bodyTargetParams(),
          name: input.name,
          phone: input.phone || null,
          relationship: input.relationship || null,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? "Failed to add contact");
      }
      const { pickup } = (await res.json()) as { pickup: PersonAuthorizedPickup };
      setPickups((prev) => [...prev, pickup]);
      setModal({ mode: "closed" });
      props.onChanged?.();
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
        `/api/admin/checkin/authorized-pickups/${pickupId}`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${token}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            church_id: churchId,
            ...bodyTargetParams(),
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
      props.onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update contact");
    } finally {
      setBusy(null);
    }
  };

  const handleDelete = async (pickupId: string) => {
    if (!user || !churchId) return;
    if (!window.confirm(confirmRemoveCopy)) return;
    setBusy(pickupId);
    setError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch(
        `/api/admin/checkin/authorized-pickups/${pickupId}?church_id=${churchId}&${queryTargetParams()}`,
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
      props.onChanged?.();
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
    props.onChanged?.();
  };

  const handlePhotoRemove = async (pickupId: string) => {
    if (!user || !churchId) return;
    if (!window.confirm("Remove this contact's photo?")) return;
    setBusy(pickupId);
    setError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch(
        `/api/admin/checkin/authorized-pickups/${pickupId}/photo?church_id=${churchId}&${queryTargetParams()}`,
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
      props.onChanged?.();
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
            {headerTitle}
          </h3>
          <p className="text-sm text-vc-text-secondary mt-1">{headerSubcopy}</p>
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

      {(() => {
        const nowMs = Date.now();
        // Filter elapsed pending-removals out of both lists.
        const ownVisible = pickups.filter((p) => {
          if (!p.pending_remove_at) return true;
          return Date.parse(p.pending_remove_at) > nowMs;
        });
        // Household-wide cascade entries (per-child mode only). Tag
        // them so the renderer can show the read-only badge + hide
        // controls. Editing these lives on the household panel —
        // mirrors how BlockedPickupPanel handles its cascade.
        const inherited =
          props.scope === "child"
            ? (props.householdInheritedPickups ?? []).filter((p) => {
                if (!p.pending_remove_at) return true;
                return Date.parse(p.pending_remove_at) > nowMs;
              })
            : [];
        const visible: Array<{
          pickup: PersonAuthorizedPickup;
          source: "own" | "inherited";
        }> = [
          ...inherited.map((p) => ({ pickup: p, source: "inherited" as const })),
          ...ownVisible.map((p) => ({ pickup: p, source: "own" as const })),
        ];
        if (visible.length === 0) {
          return (
            <div className="rounded-lg border border-dashed border-vc-border-light bg-vc-bg-warm px-4 py-6 text-center text-sm text-vc-text-secondary">
              {emptyCopy}
            </div>
          );
        }
        return (
          <ul className="space-y-3">
            {visible.map(({ pickup: p, source }) => {
              const pendingRemoval =
                p.pending_remove_at &&
                Date.parse(p.pending_remove_at) > nowMs;
              const isInherited = source === "inherited";
              return (
                <li
                  key={`${source}:${p.id ?? `${p.name}|${p.phone ?? ""}`}`}
                  className="flex items-start gap-3 rounded-lg border border-vc-border-light bg-vc-bg-warm p-3"
                >
                  <PhotoThumbnail
                    path={p.photo_url}
                    alt={`${p.name} pickup photo`}
                    className="w-16 h-16 flex-shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium text-vc-indigo">{p.name}</p>
                      {isInherited && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-vc-indigo/10 text-vc-indigo/70">
                          Household-wide
                        </span>
                      )}
                      {pendingRemoval && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-vc-coral/10 text-vc-coral font-medium">
                          Pending removal{" "}
                          {new Date(p.pending_remove_at!).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                    {p.relationship && (
                      <p className="text-sm text-vc-text-secondary">
                        {p.relationship}
                      </p>
                    )}
                    {p.phone && (
                      <p className="text-sm text-vc-text-secondary">
                        {formatPhone(p.phone)}
                      </p>
                    )}
                    {!isInherited && (
                    <div className="flex flex-wrap gap-2 mt-2">
                      {p.id && (
                        <PhotoCapture
                          uploadUrl={`/api/admin/checkin/authorized-pickups/${p.id}/photo`}
                          extraFields={photoExtraFields}
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
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        );
      })()}

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
        className="bg-vc-bg rounded-2xl shadow-xl max-w-md w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto"
      >
        <h2 className="text-xl font-display font-semibold text-vc-indigo">
          {initial ? "Edit contact" : "Add pickup contact"}
        </h2>
        <div>
          <label
            htmlFor="ap-name"
            className="block text-sm font-medium text-vc-indigo mb-1"
          >
            Name *
          </label>
          <input
            id="ap-name"
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
            htmlFor="ap-relationship"
            className="block text-sm font-medium text-vc-indigo mb-1"
          >
            Relationship
          </label>
          <input
            id="ap-relationship"
            type="text"
            value={relationship}
            onChange={(e) => setRelationship(e.target.value)}
            placeholder="Grandparent, Aunt, Family friend…"
            maxLength={100}
            className="w-full px-3 py-2 rounded-lg border border-vc-border-light focus:border-vc-coral focus:ring-1 focus:ring-vc-coral min-h-[44px]"
          />
        </div>
        <div>
          <label
            htmlFor="ap-phone"
            className="block text-sm font-medium text-vc-indigo mb-1"
          >
            Phone
          </label>
          <input
            id="ap-phone"
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
