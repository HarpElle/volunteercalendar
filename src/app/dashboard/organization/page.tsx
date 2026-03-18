"use client";

import { Suspense, useEffect, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/context/auth-context";
import {
  addChurchDocument,
  getChurchDocuments,
  updateChurchDocument,
  removeChurchDocument,
  updateDocument,
} from "@/lib/firebase/firestore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { isAdmin, isOwner } from "@/lib/utils/permissions";
import { getOrgTerms } from "@/lib/utils/org-terms";
import { WORKFLOW_MODES, PRICING_TIERS, TIER_LIMITS } from "@/lib/constants";
import { db } from "@/lib/firebase/config";
import { getAuth } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import type { Ministry, OrgType, WorkflowMode, Church, Volunteer } from "@/lib/types";

const TIMEZONE_OPTIONS = [
  { value: "America/New_York", label: "Eastern (ET)" },
  { value: "America/Chicago", label: "Central (CT)" },
  { value: "America/Denver", label: "Mountain (MT)" },
  { value: "America/Los_Angeles", label: "Pacific (PT)" },
  { value: "America/Anchorage", label: "Alaska (AKT)" },
  { value: "Pacific/Honolulu", label: "Hawaii (HT)" },
];

const PRESET_COLORS = [
  { hex: "#E07A5F", name: "Coral" },
  { hex: "#2D3047", name: "Indigo" },
  { hex: "#81B29A", name: "Sage" },
  { hex: "#F2CC8F", name: "Sand" },
  { hex: "#7B68EE", name: "Purple" },
  { hex: "#E84855", name: "Red" },
  { hex: "#3D8BF2", name: "Blue" },
  { hex: "#F29E4C", name: "Orange" },
];

export default function OrganizationPage() {
  return (
    <Suspense>
      <OrganizationContent />
    </Suspense>
  );
}

function OrganizationContent() {
  const { user, profile, activeMembership } = useAuth();
  const searchParams = useSearchParams();
  const churchId = activeMembership?.church_id || profile?.church_id;

  // Church data
  const [church, setChurch] = useState<Church | null>(null);
  const [loading, setLoading] = useState(true);

  // General settings state
  const [orgName, setOrgName] = useState("");
  const [orgType, setOrgType] = useState<OrgType>("church");
  const [orgTimezone, setOrgTimezone] = useState("America/New_York");
  const [orgWorkflowMode, setOrgWorkflowMode] = useState<WorkflowMode>("centralized");
  const [orgSaving, setOrgSaving] = useState(false);
  const [orgSuccess, setOrgSuccess] = useState("");
  const [orgError, setOrgError] = useState("");

  // Ministries state
  const [ministries, setMinistries] = useState<Ministry[]>([]);
  const [showMinistryForm, setShowMinistryForm] = useState(false);
  const [editingMinistryId, setEditingMinistryId] = useState<string | null>(null);
  const [ministrySaving, setMinistrySaving] = useState(false);
  const [deletingMinistry, setDeletingMinistry] = useState<string | null>(null);
  const [ministryName, setMinistryName] = useState("");
  const [ministryColor, setMinistryColor] = useState(PRESET_COLORS[0].hex);
  const [ministryDescription, setMinistryDescription] = useState("");

  // Billing state
  const [volunteerCount, setVolunteerCount] = useState(0);
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);

  const billingSuccess = searchParams.get("success") === "true";
  const billingCanceled = searchParams.get("canceled") === "true";

  // Load all data
  useEffect(() => {
    if (!churchId) {
      setLoading(false);
      return;
    }
    async function load() {
      try {
        const [churchSnap, minDocs, volDocs] = await Promise.all([
          getDoc(doc(db, "churches", churchId!)),
          getChurchDocuments(churchId!, "ministries"),
          getChurchDocuments(churchId!, "volunteers"),
        ]);
        if (churchSnap.exists()) {
          const data = churchSnap.data();
          const ch = { id: churchSnap.id, ...data } as unknown as Church;
          setChurch(ch);
          setOrgName(data.name || "");
          setOrgType((data.org_type as OrgType) || "church");
          setOrgTimezone(data.timezone || "America/New_York");
          setOrgWorkflowMode((data.workflow_mode as WorkflowMode) || "centralized");
        }
        setMinistries(minDocs as unknown as Ministry[]);
        setVolunteerCount((volDocs as unknown as Volunteer[]).length);
      } catch {
        // silent
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [churchId]);

  const terms = getOrgTerms(orgType);
  const currentTier = church?.subscription_tier || "free";
  const limits = TIER_LIMITS[currentTier] || TIER_LIMITS.free;
  const workflowLabel = WORKFLOW_MODES.find((m) => m.value === orgWorkflowMode)?.label || orgWorkflowMode;
  const volNearLimit = limits.volunteers !== Infinity && volunteerCount >= limits.volunteers * 0.8;
  const minNearLimit = limits.ministries !== Infinity && ministries.length >= limits.ministries * 0.8;

  // --- General settings handler ---

  async function handleOrgSave(e: FormEvent) {
    e.preventDefault();
    if (!churchId) return;
    setOrgSaving(true);
    setOrgError("");
    setOrgSuccess("");
    try {
      const slug = orgName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
      await updateDocument("churches", churchId, {
        name: orgName,
        slug,
        org_type: orgType,
        timezone: orgTimezone,
      });
      setOrgSuccess("Organization settings updated.");
      setTimeout(() => setOrgSuccess(""), 3000);
    } catch (err) {
      setOrgError((err as Error).message || "Failed to update organization.");
    } finally {
      setOrgSaving(false);
    }
  }

  // --- Ministry handlers ---

  function resetMinistryForm() {
    setMinistryName("");
    setMinistryColor(PRESET_COLORS[0].hex);
    setMinistryDescription("");
    setEditingMinistryId(null);
    setShowMinistryForm(false);
  }

  function startEditMinistry(m: Ministry) {
    setMinistryName(m.name);
    setMinistryColor(m.color);
    setMinistryDescription(m.description);
    setEditingMinistryId(m.id);
    setShowMinistryForm(true);
  }

  async function handleMinistrySubmit(e: FormEvent) {
    e.preventDefault();
    if (!churchId || !user) return;
    setMinistrySaving(true);
    try {
      const data = {
        name: ministryName,
        color: ministryColor,
        description: ministryDescription,
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
        const ref = await addChurchDocument(churchId, "ministries", data);
        setMinistries((prev) => [...prev, { id: ref.id, ...data } as Ministry]);
      }
      resetMinistryForm();
    } catch {
      // silent
    } finally {
      setMinistrySaving(false);
    }
  }

  async function handleDeleteMinistry(id: string) {
    if (!churchId) return;
    setDeletingMinistry(id);
    try {
      await removeChurchDocument(churchId, "ministries", id);
      setMinistries((prev) => prev.filter((m) => m.id !== id));
    } catch {
      // silent
    } finally {
      setDeletingMinistry(null);
    }
  }

  // --- Billing handlers ---

  async function handleCheckout(tier: string) {
    setCheckoutLoading(tier);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ church_id: churchId, tier }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } catch {
      // silent
    } finally {
      setCheckoutLoading(null);
    }
  }

  async function handlePortal() {
    setPortalLoading(true);
    try {
      const res = await fetch("/api/billing/portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ church_id: churchId }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } catch {
      // silent
    } finally {
      setPortalLoading(false);
    }
  }

  if (loading) {
    return <div className="py-16 text-center text-vc-text-muted">Loading...</div>;
  }

  const ministryLimitReached = limits.ministries !== Infinity && ministries.length >= limits.ministries;

  return (
    <div>
      <div className="mb-8">
        <h1 className="font-display text-3xl text-vc-indigo">Organization</h1>
        <p className="mt-1 text-vc-text-secondary">
          Manage your {orgType === "church" ? "church" : "organization"} settings, {terms.pluralLower}, and billing.
        </p>
      </div>

      {/* Billing banners */}
      {billingSuccess && (
        <div className="mb-6 rounded-lg bg-vc-sage/10 border border-vc-sage/30 px-4 py-3 text-sm text-vc-sage font-medium">
          Subscription activated! Your plan has been updated.
        </div>
      )}
      {billingCanceled && (
        <div className="mb-6 rounded-lg bg-vc-sand/20 border border-vc-sand/30 px-4 py-3 text-sm text-vc-text-secondary">
          Checkout was canceled. You can try again anytime.
        </div>
      )}

      {/* ── Ministries / Teams ── */}
      <section className="mb-8">
        <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-lg font-semibold text-vc-indigo">{terms.plural}</h2>
          {!showMinistryForm && (
            ministryLimitReached ? (
              <Button variant="outline" size="sm" onClick={() => {
                const el = document.getElementById("billing-section");
                el?.scrollIntoView({ behavior: "smooth" });
              }}>
                Upgrade to Add More {terms.plural}
              </Button>
            ) : (
              <Button size="sm" onClick={() => setShowMinistryForm(true)}>
                Add {terms.singular}
              </Button>
            )
          )}
        </div>

        {/* Add / Edit form */}
        {showMinistryForm && (
          <div className="mb-6 rounded-2xl border border-vc-border-light bg-white p-6">
            <h3 className="mb-4 font-medium text-vc-indigo">
              {editingMinistryId ? "Edit " + terms.singular : "New " + terms.singular}
            </h3>
            <form onSubmit={handleMinistrySubmit} className="space-y-4">
              <Input
                label={terms.singular + " Name"}
                required
                placeholder={orgType === "church" ? "e.g., Worship, Kids, Tech" : "e.g., Events, Marketing, Outreach"}
                value={ministryName}
                onChange={(e) => setMinistryName(e.target.value)}
              />
              <Input
                label="Description"
                placeholder={"Brief description of this " + terms.singularLower}
                value={ministryDescription}
                onChange={(e) => setMinistryDescription(e.target.value)}
              />
              <div>
                <label className="mb-1.5 block text-sm font-medium text-vc-text">Color</label>
                <div className="flex flex-wrap gap-3">
                  {PRESET_COLORS.map((c) => (
                    <button
                      key={c.hex}
                      type="button"
                      onClick={() => setMinistryColor(c.hex)}
                      className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-sm transition-all ${
                        ministryColor === c.hex
                          ? "ring-2 ring-offset-2 ring-vc-indigo bg-vc-bg-warm font-medium"
                          : "hover:bg-vc-bg-warm/50"
                      }`}
                    >
                      <span
                        className="h-5 w-5 shrink-0 rounded-full"
                        style={{ backgroundColor: c.hex }}
                      />
                      <span className="text-vc-text-secondary">{c.name}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex gap-3">
                <Button type="submit" loading={ministrySaving}>
                  {editingMinistryId ? "Save Changes" : "Create " + terms.singular}
                </Button>
                <Button type="button" variant="ghost" onClick={resetMinistryForm}>
                  Cancel
                </Button>
              </div>
            </form>
          </div>
        )}

        {/* Ministry list */}
        {ministries.length === 0 && !showMinistryForm ? (
          <div className="rounded-2xl border border-dashed border-vc-border bg-white p-12 text-center">
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
                className="group relative rounded-2xl border border-vc-border-light bg-white p-5 transition-shadow hover:shadow-md"
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
                  </div>
                </div>
                <div className="mt-4 flex gap-2 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => startEditMinistry(m)}
                    className="text-xs font-medium text-vc-text-secondary hover:text-vc-coral transition-colors"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDeleteMinistry(m.id)}
                    disabled={deletingMinistry === m.id}
                    className="text-xs font-medium text-vc-text-muted hover:text-vc-danger transition-colors"
                  >
                    {deletingMinistry === m.id ? "Deleting..." : "Delete"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Short Links ── */}
      {isAdmin(activeMembership) && churchId && (
        <ShortLinksSection
          churchId={churchId}
          currentTier={currentTier}
          shortLinksLimit={limits.short_links}
        />
      )}

      {/* ── Billing & Plan ── */}
      {isOwner(activeMembership) && (
        <section className="mb-8" id="billing-section">
          <h2 className="mb-4 text-lg font-semibold text-vc-indigo">Billing & Plan</h2>

          {/* Current plan card */}
          <div className="mb-6 rounded-2xl border border-vc-border-light bg-white p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <h3 className="font-semibold text-vc-indigo">Current Plan</h3>
                  <Badge variant={currentTier === "free" ? "default" : "success"}>
                    {currentTier.charAt(0).toUpperCase() + currentTier.slice(1)}
                  </Badge>
                </div>
                <p className="text-sm text-vc-text-secondary">
                  {PRICING_TIERS.find((t) => t.tier === currentTier)?.price || "$0"}{" "}
                  {currentTier !== "free" && "· Billed monthly"}
                </p>
              </div>
              {currentTier !== "free" && (
                <Button variant="outline" size="sm" onClick={handlePortal} loading={portalLoading}>
                  Manage Subscription
                </Button>
              )}
            </div>

            {/* Usage meters */}
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <div className="rounded-lg bg-vc-bg-warm p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-vc-text-secondary">Volunteers</span>
                  <span className="text-sm font-semibold text-vc-indigo">
                    {volunteerCount} / {limits.volunteers === Infinity ? "\u221E" : limits.volunteers}
                  </span>
                </div>
                <div className="h-2 rounded-full bg-vc-border overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${volNearLimit ? "bg-vc-coral" : "bg-vc-sage"}`}
                    style={{
                      width: limits.volunteers === Infinity
                        ? "10%"
                        : `${Math.min((volunteerCount / limits.volunteers) * 100, 100)}%`,
                    }}
                  />
                </div>
                {volNearLimit && <p className="mt-1 text-xs text-vc-coral">Approaching volunteer limit</p>}
              </div>
              <div className="rounded-lg bg-vc-bg-warm p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-vc-text-secondary">{terms.plural}</span>
                  <span className="text-sm font-semibold text-vc-indigo">
                    {ministries.length} / {limits.ministries === Infinity ? "\u221E" : limits.ministries}
                  </span>
                </div>
                <div className="h-2 rounded-full bg-vc-border overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${minNearLimit ? "bg-vc-coral" : "bg-vc-sage"}`}
                    style={{
                      width: limits.ministries === Infinity
                        ? "10%"
                        : `${Math.min((ministries.length / limits.ministries) * 100, 100)}%`,
                    }}
                  />
                </div>
                {minNearLimit && <p className="mt-1 text-xs text-vc-coral">Approaching {terms.singularLower} limit</p>}
              </div>
            </div>
          </div>

          {/* Plan comparison */}
          <h3 className="mb-4 font-semibold text-vc-indigo">
            {currentTier === "free" ? "Upgrade Your Plan" : "All Plans"}
          </h3>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {PRICING_TIERS.map((plan) => {
              const isCurrent = plan.tier === currentTier;
              const isDowngrade =
                PRICING_TIERS.findIndex((t) => t.tier === currentTier) >
                PRICING_TIERS.findIndex((t) => t.tier === plan.tier);
              const canCheckout = !isCurrent && !isDowngrade && plan.tier !== "free" && plan.tier !== "enterprise";

              return (
                <div
                  key={plan.tier}
                  className={`rounded-xl border p-5 transition-shadow ${
                    plan.highlighted && !isCurrent
                      ? "border-vc-coral/40 bg-vc-coral/5 shadow-sm"
                      : isCurrent
                        ? "border-vc-sage/40 bg-vc-sage/5"
                        : "border-vc-border-light bg-white"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="font-semibold text-vc-indigo">{plan.name}</h4>
                    {isCurrent && <Badge variant="success">Current</Badge>}
                    {plan.highlighted && !isCurrent && <Badge variant="warning">Popular</Badge>}
                  </div>
                  <p className="text-2xl font-bold text-vc-indigo mb-1">{plan.price}</p>
                  <p className="text-xs text-vc-text-muted mb-4">
                    {plan.volunteers} volunteers · {plan.ministries}{" "}
                    {plan.ministries === "1" ? "team" : "teams"}
                  </p>
                  <ul className="space-y-1.5 mb-5">
                    {plan.features.map((f, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-vc-text-secondary">
                        <svg className="mt-0.5 h-4 w-4 shrink-0 text-vc-sage" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                        </svg>
                        {f}
                      </li>
                    ))}
                  </ul>
                  {canCheckout ? (
                    <Button
                      size="sm"
                      variant={plan.highlighted ? "primary" : "outline"}
                      className="w-full"
                      loading={checkoutLoading === plan.tier}
                      onClick={() => handleCheckout(plan.tier)}
                    >
                      {currentTier === "free" ? "Start Free Trial" : "Upgrade"}
                    </Button>
                  ) : plan.tier === "enterprise" ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="w-full"
                      onClick={() => (window.location.href = "mailto:info@volunteercal.com")}
                    >
                      Contact Us
                    </Button>
                  ) : isCurrent ? (
                    <Button size="sm" variant="ghost" className="w-full" disabled>
                      Current Plan
                    </Button>
                  ) : null}
                </div>
              );
            })}
          </div>

          <p className="mt-6 text-center text-xs text-vc-text-muted">
            All paid plans include a 14-day free trial. Annual billing saves 20%.
            Questions?{" "}
            <a href="mailto:info@volunteercal.com" className="text-vc-coral hover:underline">
              Contact us
            </a>
          </p>
        </section>
      )}

      {/* ── General Settings ── */}
      <section className="mb-8">
        <h2 className="mb-4 text-lg font-semibold text-vc-indigo">General</h2>
        <div className="rounded-2xl border border-vc-border-light bg-white p-6">
          <form onSubmit={handleOrgSave} className="space-y-5">
            <div className="space-y-2">
              <label className="text-sm font-medium text-vc-text">Organization Type</label>
              <div className="grid grid-cols-3 gap-3">
                {([
                  { value: "church" as const, label: "Church" },
                  { value: "nonprofit" as const, label: "Nonprofit" },
                  { value: "other" as const, label: "Other" },
                ]).map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setOrgType(opt.value)}
                    className={`rounded-xl border px-4 py-3 text-sm font-medium transition-all ${
                      orgType === opt.value
                        ? "border-vc-coral bg-vc-coral/5 text-vc-indigo ring-1 ring-vc-coral"
                        : "border-vc-border text-vc-text-secondary hover:border-vc-indigo/20 hover:bg-vc-bg-warm"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <Input
              label={orgType === "church" ? "Church Name" : "Organization Name"}
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              required
            />

            <Select
              label="Timezone"
              options={TIMEZONE_OPTIONS}
              value={orgTimezone}
              onChange={(e) => setOrgTimezone(e.target.value)}
            />

            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-vc-text">Scheduling Workflow</label>
              <div className="flex items-center gap-2">
                <span className="inline-flex rounded-full bg-vc-indigo/10 px-3 py-1 text-sm font-medium text-vc-indigo">
                  {workflowLabel}
                </span>
                <span className="text-xs text-vc-text-muted">
                  Contact support to change workflow mode.
                </span>
              </div>
            </div>

            {orgError && <p className="text-sm text-vc-danger">{orgError}</p>}
            {orgSuccess && <p className="text-sm text-vc-sage">{orgSuccess}</p>}
            <Button type="submit" loading={orgSaving} size="sm">
              Save Organization
            </Button>
          </form>
        </div>
      </section>

      {/* ── Danger Zone ── */}
      {isOwner(activeMembership) && (
        <DeleteOrgSection churchId={churchId!} orgName={orgName} user={user} />
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
  const [links, setLinks] = useState<Array<{
    id: string;
    slug: string;
    target_url: string;
    label: string;
    created_by: string;
    created_at: string;
    expires_at: string;
  }>>([]);
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
    <section className="mb-8">
      <h2 className="mb-4 text-lg font-semibold text-vc-indigo">Short Links</h2>
      <div className="rounded-2xl border border-vc-border-light bg-white p-6">
        {/* Usage meter */}
        <div className="mb-5 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-vc-text">
              {activeLinks.length} of {shortLinksLimit === 0 ? "0" : shortLinksLimit} active short links
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
                  style={{ width: `${Math.min(100, (activeLinks.length / shortLinksLimit) * 100)}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {loading && (
          <div className="flex justify-center py-8">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-vc-border border-t-vc-coral" />
          </div>
        )}

        {!loading && links.length === 0 && shortLinksLimit > 0 && (
          <p className="text-sm text-vc-text-muted py-4 text-center">
            No short links yet. Create one from the share options on any event or your volunteer join link.
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
                    <svg className="h-4 w-4 text-vc-coral" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244" />
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
                    <p className="text-xs text-vc-text-muted truncate">{link.label}</p>
                  </div>

                  <div className="shrink-0 text-right">
                    <p className={`text-xs font-medium ${
                      days <= 3 ? "text-vc-danger" : days <= 7 ? "text-vc-sand" : "text-vc-text-secondary"
                    }`}>
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
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
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
              {expiredLinks.length} expired link{expiredLinks.length !== 1 ? "s" : ""}
            </summary>
            <div className="mt-2 space-y-2">
              {expiredLinks.map((link) => (
                <div
                  key={link.id}
                  className="flex items-center gap-3 rounded-xl border border-vc-border-light bg-vc-bg-warm/50 p-3 opacity-60"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gray-100">
                    <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-vc-text-muted truncate">/s/{link.slug}</p>
                    <p className="text-xs text-vc-text-muted truncate">{link.label}</p>
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
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
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

// ---------------------------------------------------------------------------
// Delete Organization
// ---------------------------------------------------------------------------

function DeleteOrgSection({
  churchId,
  orgName,
  user,
}: {
  churchId: string;
  orgName: string;
  user: ReturnType<typeof useAuth>["user"];
}) {
  const [showConfirm, setShowConfirm] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  async function handleDelete() {
    if (!user || confirmText !== orgName) return;
    setDeleting(true);
    setError("");

    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/organization", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ church_id: churchId, confirm_name: confirmText }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Deletion failed" }));
        setError(data.error || "Failed to delete organization.");
        return;
      }

      // Redirect to home after successful deletion
      window.location.href = "/";
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <section className="mb-8">
      <h2 className="mb-4 text-lg font-semibold text-vc-danger">Danger Zone</h2>
      <div className="rounded-2xl border border-vc-danger/30 bg-white p-6">
        <h3 className="font-medium text-vc-indigo">Delete Organization</h3>
        <p className="mt-1 text-sm text-vc-text-muted">
          Permanently deleting an organization removes all its data including volunteers,
          schedules, memberships, and billing. This cannot be undone.
        </p>

        {!showConfirm ? (
          <Button
            variant="outline"
            className="mt-4 border-vc-danger/30 text-vc-danger hover:bg-vc-danger/5"
            onClick={() => setShowConfirm(true)}
          >
            Delete this organization
          </Button>
        ) : (
          <div className="mt-4 rounded-xl border border-vc-danger/20 bg-vc-danger/5 p-4">
            <p className="text-sm font-medium text-vc-danger mb-3">
              Type <strong>&quot;{orgName}&quot;</strong> to confirm deletion:
            </p>
            <Input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={orgName}
            />
            {error && (
              <p className="mt-2 text-sm text-vc-danger">{error}</p>
            )}
            <div className="mt-3 flex gap-2">
              <Button
                onClick={handleDelete}
                loading={deleting}
                disabled={confirmText !== orgName}
                className="bg-vc-danger hover:bg-vc-danger/90 text-white"
              >
                Permanently delete
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setShowConfirm(false);
                  setConfirmText("");
                  setError("");
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
