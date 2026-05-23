"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/context/auth-context";
import { getChurchDocuments } from "@/lib/firebase/firestore";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { Card } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { StageSyncShareModal } from "@/components/worship/stage-sync-share-modal";
import { formatLocalDate } from "@/lib/utils/date";
import type { ServicePlan, Service } from "@/lib/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatServiceDate(iso: string): string {
  // Use formatLocalDate so the YYYY-MM-DD calendar date renders on the
  // intended day in the user's timezone. Previously `new Date(iso)` parsed
  // as UTC midnight and rendered the prior day on US clients.
  return formatLocalDate(iso, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** True when the service date is today or in the future. Compares as
 *  calendar dates (anchored at local noon) to avoid UTC drift. */
function isUpcoming(iso: string): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(`${iso}T12:00:00`) >= today;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function PlansPage() {
  const router = useRouter();
  const { user, profile, activeMembership } = useAuth();
  const churchId = activeMembership?.church_id || profile?.church_id;

  const [plans, setPlans] = useState<ServicePlan[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [stageSyncPlanId, setStageSyncPlanId] = useState<string | null>(null);
  const [newPlanOpen, setNewPlanOpen] = useState(false);
  const [newServiceId, setNewServiceId] = useState("");
  const [newServiceDate, setNewServiceDate] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // ---- Fetch plans + services ----

  useEffect(() => {
    if (!churchId || !user) return;

    let cancelled = false;

    async function fetchData() {
      setLoading(true);
      setError(null);
      try {
        const token = await user!.getIdToken();

        const [plansRes, servicesData] = await Promise.all([
          fetch(`/api/service-plans?church_id=${churchId}`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
          getChurchDocuments(churchId!, "services"),
        ]);

        if (!plansRes.ok) {
          throw new Error(`Failed to load service plans (${plansRes.status})`);
        }

        const plansJson = await plansRes.json();
        const plansData: ServicePlan[] = Array.isArray(plansJson) ? plansJson : plansJson.plans ?? [];

        if (!cancelled) {
          setPlans(plansData);
          setServices(servicesData as Service[]);
        }
      } catch (err) {
        if (!cancelled)
          setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchData();
    return () => {
      cancelled = true;
    };
  }, [churchId, user]);

  // ---- Derived data ----

  const serviceMap = useMemo(() => {
    const map = new Map<string, Service>();
    for (const s of services) {
      map.set(s.id, s);
    }
    return map;
  }, [services]);

  const visiblePlans = useMemo(() => {
    const sorted = [...plans].sort(
      (a, b) =>
        new Date(a.service_date).getTime() - new Date(b.service_date).getTime(),
    );
    if (showAll) return sorted;
    return sorted.filter((p) => isUpcoming(p.service_date));
  }, [plans, showAll]);

  // ---- New Plan handler ----

  function openNewPlanModal() {
    setCreateError(null);
    // Default to next Sunday for convenience
    const today = new Date();
    const daysUntilSunday = (7 - today.getDay()) % 7 || 7;
    const sunday = new Date(today);
    sunday.setDate(today.getDate() + daysUntilSunday);
    setNewServiceDate(sunday.toISOString().split("T")[0]);
    setNewServiceId(services[0]?.id || "");
    setNewPlanOpen(true);
  }

  async function handleCreatePlan() {
    if (!user || !churchId || !newServiceId || !newServiceDate) return;
    setCreating(true);
    setCreateError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/service-plans", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          church_id: churchId,
          service_id: newServiceId,
          service_date: newServiceDate,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setCreateError(data.error || `Failed to create plan (${res.status})`);
        setCreating(false);
        return;
      }
      const data = await res.json();
      const plan = data.plan ?? data;
      setNewPlanOpen(false);
      router.push(`/dashboard/worship/plans/${plan.id}`);
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : "Failed to create plan");
    } finally {
      setCreating(false);
    }
  }

  // ---- Render ----

  return (
    <div className="min-h-screen bg-vc-bg px-4 py-6 sm:px-6 lg:px-8">
      {/* Action buttons — page identity ("Service Plans") is now carried by
          the Worship Prep tab strip's active tab. H1 + subtitle stripped per
          Codex Phase 2 retest Finding 3. */}
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-end">
        <div className="flex items-center gap-3">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => router.push("/dashboard/worship/reports")}
          >
            <svg className="mr-1.5 h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
            </svg>
            Song Usage Reports
          </Button>
          <Button onClick={openNewPlanModal} disabled={services.length === 0}>
            New Plan
          </Button>
        </div>
      </div>

      {/* New Plan Modal */}
      <Modal
        open={newPlanOpen}
        onClose={() => {
          setNewPlanOpen(false);
          setCreateError(null);
        }}
        title="New Service Plan"
        subtitle="Pick a service and date. You'll add songs and order-of-service items next."
        maxWidth="max-w-md"
      >
        {services.length === 0 ? (
          <div className="rounded-lg border border-vc-warning/20 bg-vc-warning/5 p-4 text-sm text-vc-text-secondary">
            You need at least one Service defined first.{" "}
            <Link
              href="/dashboard/schedules/services-events"
              className="font-medium text-vc-coral hover:underline"
            >
              Add a Service →
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-vc-indigo mb-1">
                Service <span className="text-vc-coral">*</span>
              </label>
              <select
                value={newServiceId}
                onChange={(e) => setNewServiceId(e.target.value)}
                className="w-full rounded-lg border border-vc-border-light px-3 py-2 text-sm focus:border-vc-coral focus:ring-1 focus:ring-vc-coral/30 outline-none"
              >
                {services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-vc-indigo mb-1">
                Service Date <span className="text-vc-coral">*</span>
              </label>
              <Input
                type="date"
                value={newServiceDate}
                onChange={(e) => setNewServiceDate(e.target.value)}
              />
            </div>
            {createError && (
              <div className="rounded-lg border border-vc-danger/20 bg-vc-danger/5 p-3 text-sm text-vc-danger">
                {createError}
              </div>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="ghost"
                onClick={() => {
                  setNewPlanOpen(false);
                  setCreateError(null);
                }}
                disabled={creating}
              >
                Cancel
              </Button>
              <Button
                onClick={handleCreatePlan}
                disabled={creating || !newServiceId || !newServiceDate}
              >
                {creating ? <Spinner size="sm" /> : "Create Plan"}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Filter toggle */}
      <div className="mb-6 flex items-center gap-3">
        <div className="flex gap-1 rounded-lg bg-vc-bg-warm p-1">
          <button
            onClick={() => setShowAll(false)}
            className={`min-h-[44px] min-w-[44px] rounded-md px-3 py-2 text-sm font-medium transition-colors ${
              !showAll
                ? "bg-white text-vc-indigo shadow-sm"
                : "text-vc-text-secondary hover:text-vc-text"
            }`}
          >
            Upcoming
          </button>
          <button
            onClick={() => setShowAll(true)}
            className={`min-h-[44px] min-w-[44px] rounded-md px-3 py-2 text-sm font-medium transition-colors ${
              showAll
                ? "bg-white text-vc-indigo shadow-sm"
                : "text-vc-text-secondary hover:text-vc-text"
            }`}
          >
            All
          </button>
        </div>
      </div>

      {/* Loading state */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <Spinner size="lg" />
        </div>
      )}

      {/* Error state */}
      {!loading && error && (
        <div className="rounded-lg border border-vc-danger/20 bg-vc-danger/5 p-4 text-center text-vc-danger">
          {error}
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && visiblePlans.length === 0 && (
        <div className="rounded-xl bg-vc-bg-warm p-12 text-center">
          <h2 className="font-display text-xl text-vc-indigo">
            {plans.length === 0
              ? "No service plans yet"
              : "No upcoming plans"}
          </h2>
          <p className="mt-2 text-vc-text-secondary">
            {plans.length === 0
              ? "Create your first service plan to get started."
              : "Switch to \"All\" to see past plans, or create a new one."}
          </p>
        </div>
      )}

      {/* Plan card grid */}
      {!loading && !error && visiblePlans.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visiblePlans.map((plan) => {
            const service = serviceMap.get(plan.service_id);
            const upcoming = isUpcoming(plan.service_date);

            return (
              <Card
                key={plan.id}
                variant="tappable"
                className={`flex flex-col gap-3 ${!upcoming ? "opacity-70" : ""}`}
                onClick={() =>
                  router.push(`/dashboard/worship/plans/${plan.id}`)
                }
                role="link"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    router.push(`/dashboard/worship/plans/${plan.id}`);
                  }
                }}
              >
                {/* Service name */}
                <p className="text-sm font-medium text-vc-text-secondary">
                  {service?.name || "Unknown Service"}
                </p>

                {/* Date */}
                <h3 className="font-display text-lg text-vc-indigo">
                  {formatServiceDate(plan.service_date)}
                </h3>

                {/* Meta row: published badge + item count */}
                <div className="flex items-center gap-2">
                  {plan.published ? (
                    <Badge variant="success">Published</Badge>
                  ) : (
                    <Badge variant="warning">Draft</Badge>
                  )}
                  <span className="text-xs text-vc-text-muted">
                    {plan.items.length}{" "}
                    {plan.items.length === 1 ? "item" : "items"}
                  </span>
                </div>

                {/* Theme / speaker preview */}
                {(plan.theme || plan.speaker) && (
                  <p className="line-clamp-1 text-sm text-vc-text-secondary">
                    {[plan.theme, plan.speaker].filter(Boolean).join(" -- ")}
                  </p>
                )}

                {/* Stage Sync action for published plans with items */}
                {plan.published && plan.items.length > 0 && upcoming && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-1 w-full"
                    onClick={(e) => {
                      e.stopPropagation();
                      setStageSyncPlanId(plan.id);
                    }}
                  >
                    <svg className="mr-1.5 h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 0 0 6 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0 1 18 16.5h-2.25m-7.5 0h7.5m-7.5 0-1 3m8.5-3 1 3m0 0 .5 1.5m-.5-1.5h-9.5m0 0-.5 1.5" />
                    </svg>
                    Stage Sync
                  </Button>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Stage Sync share modal */}
      {stageSyncPlanId && churchId && (
        <StageSyncShareModal
          open
          onClose={() => setStageSyncPlanId(null)}
          churchId={churchId}
          planId={stageSyncPlanId}
          planTitle={plans.find((p) => p.id === stageSyncPlanId)?.theme || undefined}
        />
      )}
    </div>
  );
}
