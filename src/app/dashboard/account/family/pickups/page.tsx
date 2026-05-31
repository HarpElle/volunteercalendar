"use client";

/**
 * /dashboard/account/family/pickups — Wave 9 P0-2 sub-PR G.
 *
 * Parent self-service surface. Guardians manage their own authorized-
 * pickup list. The differentiator vs. PCO/Breeze, which keep this
 * admin-only.
 *
 * Cooling-off semantics:
 *   - Adds take effect immediately (parents can't grant kiosk access
 *     anyway — the security code is the actual gate)
 *   - Removals enter a 24-hour cooling-off window — the entry stays
 *     visible with a "Pending removal" badge so the other guardian
 *     has time to push back. Either guardian can cancel during the
 *     window via the "Cancel" affordance on the badge.
 *
 * Email notifications fire on every change to the OTHER adult
 * guardians in the household; the initiator is excluded.
 *
 * Server-rendered data flows from /api/account/family/pickups.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/context/auth-context";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type { PersonAuthorizedPickup } from "@/lib/types";

interface Child {
  id: string;
  first_name: string;
  preferred_name: string | null;
  last_name: string;
  authorized_pickups: PersonAuthorizedPickup[];
}
interface Household {
  id: string;
  name: string;
  children: Child[];
}

export default function FamilyPickupsPage() {
  const { user, activeMembership } = useAuth();
  const churchId = activeMembership?.church_id;

  const [households, setHouseholds] = useState<Household[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Add-form state, scoped to the currently-active child (managed
  // inside each child card; pulled up to here for clarity).
  const [addingForChild, setAddingForChild] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [draftPhone, setDraftPhone] = useState("");
  const [draftRelationship, setDraftRelationship] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!user || !churchId) return;
    setError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch(
        `/api/account/family/pickups?church_id=${encodeURIComponent(churchId)}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? "Could not load family pickup list");
      }
      const data = (await res.json()) as { households: Household[] };
      setHouseholds(data.households);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [user, churchId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleAdd = async (childId: string) => {
    if (!user || !churchId) return;
    if (!draftName.trim()) {
      setError("Name is required");
      return;
    }
    setBusy("__add");
    setError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/account/family/pickups`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          church_id: churchId,
          child_id: childId,
          name: draftName.trim(),
          phone: draftPhone.trim() || null,
          relationship: draftRelationship.trim() || null,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? "Could not add contact");
      }
      setDraftName("");
      setDraftPhone("");
      setDraftRelationship("");
      setAddingForChild(null);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add contact");
    } finally {
      setBusy(null);
    }
  };

  const handleRequestRemoval = async (childId: string, pickupId: string) => {
    if (!user || !churchId) return;
    if (
      !window.confirm(
        "Request removal? This contact will stay on the list for 24 hours so the other guardian(s) can push back. They will receive an email. You can cancel the removal at any point during that window.",
      )
    )
      return;
    setBusy(pickupId);
    setError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch(
        `/api/account/family/pickups/${pickupId}/request-removal`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({ church_id: churchId, child_id: childId }),
        },
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? "Could not request removal");
      }
      await refresh();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to request removal",
      );
    } finally {
      setBusy(null);
    }
  };

  const handleCancelRemoval = async (childId: string, pickupId: string) => {
    if (!user || !churchId) return;
    setBusy(pickupId);
    setError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch(
        `/api/account/family/pickups/${pickupId}/cancel-removal`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({ church_id: churchId, child_id: childId }),
        },
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? "Could not cancel removal");
      }
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to cancel");
    } finally {
      setBusy(null);
    }
  };

  if (loading) {
    return (
      <div className="p-8">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div>
        <Link
          href="/dashboard/account"
          className="text-sm text-vc-coral font-medium mb-2 inline-block"
        >
          ← Back to Account
        </Link>
        <h1 className="text-2xl font-display font-bold text-vc-indigo">
          Family pickup contacts
        </h1>
        <p className="text-sm text-vc-text-secondary mt-1 max-w-2xl">
          Manage the people who are authorized to pick up your children
          from check-in. Adds take effect immediately. <strong>Removals
          have a 24-hour cooling-off window</strong> so the other guardian(s)
          on the household have time to push back if they disagree. Email
          notifications go to everyone on the household whenever you make
          a change.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-vc-danger/30 bg-vc-danger/5 px-4 py-3 text-sm text-vc-danger">
          {error}
        </div>
      )}

      {households.length === 0 ? (
        <div className="rounded-xl border border-dashed border-vc-border-light bg-vc-bg-warm p-8 text-center text-vc-text-secondary">
          <p>
            You aren&rsquo;t linked to a household yet, or your church
            hasn&rsquo;t enabled children&rsquo;s check-in.
          </p>
          <p className="mt-2 text-sm">
            Contact your church admin to get set up.
          </p>
        </div>
      ) : (
        households.map((hh) => (
          <section
            key={hh.id}
            className="space-y-3 rounded-2xl border border-vc-border-light bg-vc-bg p-5"
          >
            <h2 className="text-lg font-display font-semibold text-vc-indigo">
              {hh.name}
            </h2>

            {hh.children.length === 0 ? (
              <p className="text-sm text-vc-text-secondary">
                No children registered for check-in in this household yet.
              </p>
            ) : (
              hh.children.map((child) => {
                const childDisplay =
                  child.preferred_name || child.first_name;
                return (
                  <div
                    key={child.id}
                    className="rounded-xl border border-vc-border-light bg-vc-bg-warm p-4 space-y-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-medium text-vc-indigo">
                        {childDisplay} {child.last_name}
                      </p>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          setAddingForChild(
                            addingForChild === child.id ? null : child.id,
                          )
                        }
                        className="min-h-[44px]"
                      >
                        {addingForChild === child.id
                          ? "Cancel"
                          : "Add contact"}
                      </Button>
                    </div>

                    {child.authorized_pickups.length === 0 ? (
                      <p className="text-sm text-vc-text-secondary">
                        No authorized pickup contacts yet.
                      </p>
                    ) : (
                      <ul className="space-y-2">
                        {child.authorized_pickups.map((p) => {
                          const pending =
                            p.pending_remove_at &&
                            Date.parse(p.pending_remove_at) > Date.now();
                          return (
                            <li
                              key={p.id ?? `${p.name}-${p.phone}`}
                              className="rounded-lg bg-white border border-vc-border-light p-3 flex items-start gap-3"
                            >
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <p className="font-medium text-vc-indigo">
                                    {p.name}
                                  </p>
                                  {p.relationship && (
                                    <span className="text-xs text-vc-text-secondary">
                                      ({p.relationship})
                                    </span>
                                  )}
                                  {pending && (
                                    <span className="text-xs px-2 py-0.5 rounded-full bg-vc-coral/10 text-vc-coral font-medium">
                                      Pending removal{" "}
                                      {new Date(
                                        p.pending_remove_at!,
                                      ).toLocaleDateString()}
                                    </span>
                                  )}
                                </div>
                                {p.phone && (
                                  <p className="text-sm text-vc-text-secondary">
                                    {p.phone}
                                  </p>
                                )}
                              </div>
                              <div className="flex gap-2 flex-shrink-0">
                                {p.id && pending ? (
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() =>
                                      handleCancelRemoval(child.id, p.id!)
                                    }
                                    disabled={busy === p.id}
                                    className="min-h-[44px]"
                                  >
                                    Cancel removal
                                  </Button>
                                ) : p.id ? (
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() =>
                                      handleRequestRemoval(child.id, p.id!)
                                    }
                                    disabled={busy === p.id}
                                    className="min-h-[44px] text-vc-danger hover:bg-vc-danger/5"
                                  >
                                    Request removal
                                  </Button>
                                ) : null}
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    )}

                    {addingForChild === child.id && (
                      <div className="rounded-lg bg-white border border-vc-border-light p-3 space-y-2">
                        <p className="text-sm font-medium text-vc-indigo">
                          Add an authorized contact for {childDisplay}
                        </p>
                        <input
                          type="text"
                          value={draftName}
                          onChange={(e) => setDraftName(e.target.value)}
                          placeholder="Name *"
                          maxLength={200}
                          className="w-full px-3 py-2 rounded-lg border border-vc-border-light focus:border-vc-coral focus:ring-1 focus:ring-vc-coral min-h-[44px]"
                        />
                        <input
                          type="text"
                          value={draftRelationship}
                          onChange={(e) =>
                            setDraftRelationship(e.target.value)
                          }
                          placeholder="Relationship (e.g. grandmother)"
                          maxLength={100}
                          className="w-full px-3 py-2 rounded-lg border border-vc-border-light focus:border-vc-coral focus:ring-1 focus:ring-vc-coral min-h-[44px]"
                        />
                        <input
                          type="tel"
                          value={draftPhone}
                          onChange={(e) => setDraftPhone(e.target.value)}
                          placeholder="Phone (optional)"
                          maxLength={30}
                          className="w-full px-3 py-2 rounded-lg border border-vc-border-light focus:border-vc-coral focus:ring-1 focus:ring-vc-coral min-h-[44px]"
                        />
                        <Button
                          type="button"
                          variant="primary"
                          onClick={() => handleAdd(child.id)}
                          disabled={busy === "__add" || !draftName.trim()}
                          className="min-h-[44px]"
                        >
                          {busy === "__add" ? "Saving…" : "Add contact"}
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </section>
        ))
      )}
    </div>
  );
}
