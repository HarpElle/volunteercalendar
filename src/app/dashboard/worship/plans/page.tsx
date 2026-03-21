"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/context/auth-context";
import { getChurchDocuments } from "@/lib/firebase/firestore";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { Card } from "@/components/ui/card";
import type { ServicePlan, Service } from "@/lib/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatServiceDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** True when the service date is today or in the future. */
function isUpcoming(iso: string): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(iso) >= today;
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

  // ---- Render ----

  return (
    <div className="min-h-screen bg-vc-bg px-4 py-6 sm:px-6 lg:px-8">
      {/* Page header */}
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-3xl text-vc-indigo">
            Service Plans
          </h1>
          <p className="mt-1 text-vc-text-secondary">
            Build and manage your order of service for each week.
          </p>
        </div>
        <Button>New Plan</Button>
      </div>

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
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
