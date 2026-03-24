"use client";

import { useState, useEffect } from "react";
import {
  addChurchDocument,
  updateChurchDocument,
  removeChurchDocument,
} from "@/lib/firebase/firestore";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { isAdmin } from "@/lib/utils/permissions";
import { getAuth } from "firebase/auth";
import type { Ministry, Membership } from "@/lib/types";
import {
  MinistryFormModal,
  type MinistryFormData,
} from "@/components/forms/ministry-form-modal";
import type { User } from "firebase/auth";
import { TIER_LIMITS } from "@/lib/constants";
import { OverLimitBanner } from "@/components/ui/over-limit-banner";

interface TeamsSettingsProps {
  churchId: string;
  ministries: Ministry[];
  setMinistries: React.Dispatch<React.SetStateAction<Ministry[]>>;
  ministryLimitReached: boolean;
  terms: {
    singular: string;
    plural: string;
    singularLower: string;
    pluralLower: string;
  };
  currentTier: string;
  shortLinksLimit: number;
  mutationError: string;
  setMutationError: (error: string) => void;
  user: User | null;
  activeMembership: Membership | null;
}

export function TeamsSettings({
  churchId,
  ministries,
  setMinistries,
  ministryLimitReached,
  terms,
  currentTier,
  shortLinksLimit,
  mutationError,
  setMutationError,
  user,
  activeMembership,
}: TeamsSettingsProps) {
  const [showMinistryForm, setShowMinistryForm] = useState(false);
  const [editingMinistryId, setEditingMinistryId] = useState<string | null>(null);
  const [ministrySaving, setMinistrySaving] = useState(false);
  const [deletingMinistry, setDeletingMinistry] = useState<string | null>(null);

  function closeMinistryForm() {
    setEditingMinistryId(null);
    setShowMinistryForm(false);
  }

  function startEditMinistry(m: Ministry) {
    setEditingMinistryId(m.id);
    setShowMinistryForm(true);
  }

  async function handleMinistrySubmit(formData: MinistryFormData) {
    if (!user) return;
    setMinistrySaving(true);
    try {
      const data = {
        name: formData.name,
        color: formData.color,
        description: formData.description,
        requires_background_check: formData.requiresBgCheck,
        prerequisites: formData.prereqs.filter((p) => p.label.trim()),
        church_id: churchId,
        lead_user_id: user.uid,
        lead_email: user.email || "",
        ...(editingMinistryId ? {} : { created_at: new Date().toISOString() }),
      };
      if (editingMinistryId) {
        await updateChurchDocument(churchId, "ministries", editingMinistryId, data);
        setMinistries((prev) =>
          prev.map((m) => (m.id === editingMinistryId ? { ...m, ...data } : m))
        );
      } else {
        // Server-side tier limit check before creating
        const token = await user.getIdToken();
        const checkRes = await fetch("/api/tier-check", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ church_id: churchId, resource: "ministries" }),
        });
        if (checkRes.ok) {
          const check = await checkRes.json();
          if (!check.allowed) {
            setMutationError(
              `Your plan allows ${check.limit} ${terms.pluralLower}. Remove a ${terms.singularLower} or upgrade to add more.`,
            );
            setMinistrySaving(false);
            return;
          }
        }

        const ref = await addChurchDocument(churchId, "ministries", data);
        setMinistries((prev) => [...prev, { id: ref.id, ...data } as Ministry]);
      }
      closeMinistryForm();
      setMutationError("");
    } catch {
      setMutationError("Failed to save ministry. Please try again.");
    } finally {
      setMinistrySaving(false);
    }
  }

  async function handleDeleteMinistry(id: string) {
    setDeletingMinistry(id);
    try {
      await removeChurchDocument(churchId, "ministries", id);
      setMinistries((prev) => prev.filter((m) => m.id !== id));
      setMutationError("");
    } catch {
      setMutationError("Failed to delete ministry. Please try again.");
    } finally {
      setDeletingMinistry(null);
    }
  }

  return (
    <div className="space-y-8">
      {/* ── Ministries / Teams ── */}
      <section>
        <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-lg font-semibold text-vc-indigo">{terms.plural}</h2>
          {ministryLimitReached ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const el = document.getElementById("billing-section");
                el?.scrollIntoView({ behavior: "smooth" });
              }}
            >
              Upgrade to Add More {terms.plural}
            </Button>
          ) : (
            <Button size="sm" onClick={() => setShowMinistryForm(true)}>
              Add {terms.singular}
            </Button>
          )}
        </div>

        <OverLimitBanner
          resourceLabel={terms.pluralLower}
          currentCount={ministries.length}
          limit={(TIER_LIMITS[currentTier] || TIER_LIMITS.free).ministries}
        />

        <MinistryFormModal
          open={showMinistryForm}
          onClose={closeMinistryForm}
          onSubmit={handleMinistrySubmit}
          onDelete={
            editingMinistryId
              ? () => handleDeleteMinistry(editingMinistryId)
              : undefined
          }
          saving={ministrySaving}
          deleting={deletingMinistry === editingMinistryId}
          isEditing={!!editingMinistryId}
          terms={terms}
          initialValues={(() => {
            const m = editingMinistryId
              ? ministries.find((x) => x.id === editingMinistryId)
              : null;
            return m
              ? {
                  name: m.name,
                  color: m.color,
                  description: m.description,
                  requiresBgCheck: m.requires_background_check || false,
                  prereqs: m.prerequisites || [],
                }
              : undefined;
          })()}
          showTemplatePicker={!editingMinistryId}
          existingMinistryNames={ministries.map((m) => m.name)}
        />

        {/* Ministry list */}
        {ministries.length === 0 && !showMinistryForm ? (
          <div className="rounded-xl border border-dashed border-vc-border bg-white p-12 text-center">
            <p className="text-vc-text-secondary">No {terms.pluralLower} yet.</p>
            <p className="mt-1 text-sm text-vc-text-muted">
              Add your first {terms.singularLower} to start organizing volunteers.
            </p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {ministries.map((m) => (
              <div
                key={m.id}
                role="button"
                tabIndex={0}
                onClick={() => startEditMinistry(m)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    startEditMinistry(m);
                  }
                }}
                className="relative rounded-xl border border-vc-border-light bg-white p-5 cursor-pointer transition-all hover:shadow-md hover:-translate-y-0.5 active:scale-[0.99]"
              >
                <div className="flex items-start gap-3">
                  <div
                    className="mt-0.5 h-4 w-4 shrink-0 rounded-full"
                    style={{ backgroundColor: m.color }}
                  />
                  <div className="flex-1">
                    <h3 className="font-semibold text-vc-indigo">{m.name}</h3>
                    {m.description && (
                      <p className="mt-1 text-sm text-vc-text-muted">{m.description}</p>
                    )}
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {m.requires_background_check && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-vc-sand/20 px-2 py-0.5 text-[10px] font-medium text-vc-text-secondary">
                          <svg
                            className="h-3 w-3"
                            fill="none"
                            viewBox="0 0 24 24"
                            strokeWidth={1.5}
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z"
                            />
                          </svg>
                          Background check required
                        </span>
                      )}
                      {m.prerequisites && m.prerequisites.length > 0 && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-vc-indigo/10 px-2 py-0.5 text-[10px] font-medium text-vc-indigo/70">
                          <svg
                            className="h-3 w-3"
                            fill="none"
                            viewBox="0 0 24 24"
                            strokeWidth={1.5}
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M4.26 10.147a60.438 60.438 0 0 0-.491 6.347A48.62 48.62 0 0 1 12 20.904a48.62 48.62 0 0 1 8.232-4.41 60.46 60.46 0 0 0-.491-6.347m-15.482 0a50.636 50.636 0 0 0-2.658-.813A59.906 59.906 0 0 1 12 3.493a59.903 59.903 0 0 1 10.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.717 50.717 0 0 1 12 13.489a50.702 50.702 0 0 1 7.74-3.342"
                            />
                          </svg>
                          {m.prerequisites.length} prerequisite
                          {m.prerequisites.length !== 1 ? "s" : ""}
                        </span>
                      )}
                    </div>
                  </div>
                  {/* Chevron affordance */}
                  <svg
                    className="mt-0.5 h-4 w-4 shrink-0 text-vc-text-muted"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={1.5}
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="m8.25 4.5 7.5 7.5-7.5 7.5"
                    />
                  </svg>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Short Links ── */}
      {isAdmin(activeMembership) && (
        <ShortLinksSection
          churchId={churchId}
          currentTier={currentTier}
          shortLinksLimit={shortLinksLimit}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Short Links Management
// ---------------------------------------------------------------------------

function ShortLinksSection({
  churchId,
  currentTier,
  shortLinksLimit,
}: {
  churchId: string;
  currentTier: string;
  shortLinksLimit: number;
}) {
  const [links, setLinks] = useState<
    Array<{
      id: string;
      slug: string;
      target_url: string;
      label: string;
      created_by: string;
      created_at: string;
      expires_at: string;
    }>
  >([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const token = await getAuth().currentUser?.getIdToken();
        if (!token) return;
        const res = await fetch(`/api/short-links?church_id=${churchId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setLinks(data.links || []);
        }
      } catch {
        // silent
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [churchId]);

  async function handleDelete(linkId: string) {
    setDeleting(linkId);
    try {
      const token = await getAuth().currentUser?.getIdToken();
      if (!token) return;
      const res = await fetch("/api/short-links", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ church_id: churchId, link_id: linkId }),
      });
      if (res.ok) {
        setLinks((prev) => prev.filter((l) => l.id !== linkId));
      }
    } catch {
      // silent
    } finally {
      setDeleting(null);
    }
  }

  const now = new Date().toISOString();
  const activeLinks = links.filter((l) => l.expires_at > now);
  const expiredLinks = links.filter((l) => l.expires_at <= now);

  function daysRemaining(expiresAt: string) {
    const diff = new Date(expiresAt).getTime() - Date.now();
    const days = Math.ceil(diff / 86400000);
    return days;
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  function getLinkTypeLabel(targetUrl: string) {
    if (targetUrl.includes("/join/")) return "Volunteer signup";
    if (targetUrl.includes("/events/")) return "Event signup";
    return "Link";
  }

  return (
    <section>
      <h2 className="mb-4 text-lg font-semibold text-vc-indigo">Short Links</h2>
      <div className="rounded-xl border border-vc-border-light bg-white p-6">
        {/* Usage meter */}
        <div className="mb-5 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-vc-text">
              {activeLinks.length} of{" "}
              {shortLinksLimit === 0 ? "0" : shortLinksLimit} active short links
            </p>
            <p className="text-xs text-vc-text-muted">
              {shortLinksLimit === 0
                ? "Upgrade to a paid plan to create short links"
                : `${currentTier.charAt(0).toUpperCase() + currentTier.slice(1)} plan`}
            </p>
          </div>
          {shortLinksLimit > 0 && (
            <div className="flex items-center gap-2">
              <div className="h-2 w-24 rounded-full bg-vc-bg-warm overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    activeLinks.length >= shortLinksLimit
                      ? "bg-vc-danger"
                      : activeLinks.length >= shortLinksLimit * 0.8
                        ? "bg-vc-sand"
                        : "bg-vc-sage"
                  }`}
                  style={{
                    width: `${Math.min(100, (activeLinks.length / shortLinksLimit) * 100)}%`,
                  }}
                />
              </div>
            </div>
          )}
        </div>

        {loading && (
          <div className="flex justify-center py-8">
            <Spinner />
          </div>
        )}

        {!loading && links.length === 0 && shortLinksLimit > 0 && (
          <p className="text-sm text-vc-text-muted py-4 text-center">
            No short links yet. Create one from the share options on any event or
            your volunteer join link.
          </p>
        )}

        {/* Active links */}
        {activeLinks.length > 0 && (
          <div className="space-y-2">
            {activeLinks.map((link) => {
              const days = daysRemaining(link.expires_at);
              return (
                <div
                  key={link.id}
                  className="flex items-center gap-3 rounded-xl border border-vc-border-light p-3"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-vc-coral/10">
                    <svg
                      className="h-4 w-4 text-vc-coral"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={1.5}
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244"
                      />
                    </svg>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-vc-indigo truncate">
                        /s/{link.slug}
                      </p>
                      <span className="shrink-0 rounded-full bg-vc-indigo/5 px-2 py-0.5 text-[10px] font-medium text-vc-text-secondary">
                        {getLinkTypeLabel(link.target_url)}
                      </span>
                    </div>
                    <p className="text-xs text-vc-text-muted truncate">
                      {link.label}
                    </p>
                  </div>

                  <div className="shrink-0 text-right">
                    <p
                      className={`text-xs font-medium ${
                        days <= 3
                          ? "text-vc-danger"
                          : days <= 7
                            ? "text-vc-sand"
                            : "text-vc-text-secondary"
                      }`}
                    >
                      {days <= 0 ? "Expiring today" : `${days}d remaining`}
                    </p>
                    <p className="text-[10px] text-vc-text-muted">
                      Expires {formatDate(link.expires_at)}
                    </p>
                  </div>

                  <button
                    onClick={() => handleDelete(link.id)}
                    disabled={deleting === link.id}
                    className="shrink-0 rounded-lg p-1.5 text-vc-text-muted hover:bg-vc-danger/5 hover:text-vc-danger transition-colors"
                    title="Delete short link"
                  >
                    {deleting === link.id ? (
                      <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-vc-border border-t-vc-danger" />
                    ) : (
                      <svg
                        className="h-3.5 w-3.5"
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth={1.5}
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0"
                        />
                      </svg>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* Expired links */}
        {expiredLinks.length > 0 && (
          <details className="mt-4">
            <summary className="cursor-pointer text-xs font-medium text-vc-text-muted hover:text-vc-text-secondary transition-colors">
              {expiredLinks.length} expired link
              {expiredLinks.length !== 1 ? "s" : ""}
            </summary>
            <div className="mt-2 space-y-2">
              {expiredLinks.map((link) => (
                <div
                  key={link.id}
                  className="flex items-center gap-3 rounded-xl border border-vc-border-light bg-vc-bg-warm/50 p-3 opacity-60"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-vc-bg-cream">
                    <svg
                      className="h-4 w-4 text-vc-text-muted"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={1.5}
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244"
                      />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-vc-text-muted truncate">
                      /s/{link.slug}
                    </p>
                    <p className="text-xs text-vc-text-muted truncate">
                      {link.label}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-xs text-vc-text-muted">
                      Expired {formatDate(link.expires_at)}
                    </p>
                  </div>
                  <button
                    onClick={() => handleDelete(link.id)}
                    disabled={deleting === link.id}
                    className="shrink-0 rounded-lg p-1.5 text-vc-text-muted hover:bg-vc-danger/5 hover:text-vc-danger transition-colors"
                    title="Delete"
                  >
                    <svg
                      className="h-3.5 w-3.5"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={1.5}
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0"
                      />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          </details>
        )}
      </div>
    </section>
  );
}
