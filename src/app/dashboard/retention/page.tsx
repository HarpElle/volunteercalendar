"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/context/auth-context";
import { getChurchDocuments } from "@/lib/firebase/firestore";
import { Spinner } from "@/components/ui/spinner";
import { Badge } from "@/components/ui/badge";
import { StatCard, StatCardGrid } from "@/components/ui/stat-card";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import type { Volunteer, Assignment, Ministry, Person } from "@/lib/types";
import { personToLegacyVolunteer } from "@/lib/compat/volunteer-compat";
import {
  calculateBurnoutRisks,
  calculateBenchDepth,
  calculateServingFrequency,
  calculateDeclineRates,
  calculateGrowth,
  calculateFairnessScore,
  type BurnoutRisk,
  type BenchDepth,
  type ServingFrequency,
  type MinistryDeclineRate,
  type GrowthMetrics,
} from "@/lib/services/retention-analytics";

// ─── Component ────────────────────────────────────────────────────────────────

export default function RetentionDashboardPage() {
  const { profile, activeMembership } = useAuth();
  const churchId = activeMembership?.church_id || profile?.church_id;

  const [loading, setLoading] = useState(true);
  const [volunteers, setVolunteers] = useState<Volunteer[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [ministries, setMinistries] = useState<Ministry[]>([]);

  // Computed analytics
  const [burnoutRisks, setBurnoutRisks] = useState<BurnoutRisk[]>([]);
  const [benchDepths, setBenchDepths] = useState<BenchDepth[]>([]);
  const [servingFreq, setServingFreq] = useState<ServingFrequency[]>([]);
  const [declineRates, setDeclineRates] = useState<MinistryDeclineRate[]>([]);
  const [growth, setGrowth] = useState<GrowthMetrics>({ last30: 0, last60: 0, last90: 0 });
  const [fairness, setFairness] = useState(1);

  useEffect(() => {
    if (!churchId) {
      setLoading(false);
      return;
    }
    async function load() {
      try {
        const [peopleDocs, volDocs, assignDocs, minDocs] = await Promise.all([
          getChurchDocuments(churchId!, "people"),
          getChurchDocuments(churchId!, "volunteers"),
          getChurchDocuments(churchId!, "assignments"),
          getChurchDocuments(churchId!, "ministries"),
        ]);

        // Prefer people collection if populated
        let vols: Volunteer[];
        if (peopleDocs.length > 0) {
          vols = (peopleDocs as unknown as Record<string, unknown>[])
            .filter((d) => d.is_volunteer === true && d.status === "active")
            .map((d) => {
              if ("person_type" in d) {
                return personToLegacyVolunteer(d as unknown as Person);
              }
              return d as unknown as Volunteer;
            });
        } else {
          vols = (volDocs as unknown as Volunteer[]).filter((v) => v.status === "active");
        }

        const assigns = assignDocs as unknown as Assignment[];
        const mins = minDocs as unknown as Ministry[];

        setVolunteers(vols);
        setAssignments(assigns);
        setMinistries(mins);

        // Run analytics
        const minList = mins.map((m) => ({ id: m.id, name: m.name }));
        setBurnoutRisks(calculateBurnoutRisks(vols, assigns));
        setBenchDepths(calculateBenchDepth(vols, assigns, minList));
        setServingFreq(calculateServingFrequency(vols, assigns));
        setDeclineRates(calculateDeclineRates(assigns, minList));
        setGrowth(calculateGrowth(vols));
        setFairness(calculateFairnessScore(vols, assigns));
      } catch {
        // silent
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [churchId]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  const activeCount = volunteers.length;
  const thinBenches = benchDepths.filter((b) => b.isThin);
  const overcommitted = servingFreq.filter((s) => s.isOvercommitted);
  const fairnessPct = Math.round(fairness * 100);

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-2">
          <h1 className="font-display text-3xl text-vc-indigo">Retention Dashboard</h1>
          <InfoTooltip text="Track volunteer health, identify burnout risk, and monitor team sustainability. Data updates daily." />
        </div>
        <p className="mt-1 text-vc-text-secondary">
          Understand your team&apos;s health and keep volunteers engaged.
        </p>
      </div>

      {/* Top-Level Stats */}
      <StatCardGrid className="mb-8">
        <StatCard
          label="Active Volunteers"
          value={activeCount}
          valueColor="text-vc-indigo"
          subtext={growth.last30 > 0 ? `+${growth.last30} this month` : undefined}
          href="/dashboard/people"
          icon={
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
            </svg>
          }
        />
        <StatCard
          label="Fairness Score"
          value={`${fairnessPct}%`}
          valueColor={fairnessPct >= 80 ? "text-vc-sage" : fairnessPct >= 60 ? "text-vc-sand" : "text-vc-coral"}
          subtext="Assignment distribution equity"
          icon={
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v17.25m0 0c-1.472 0-2.882.265-4.185.75M12 20.25c1.472 0 2.882.265 4.185.75M18.75 4.97A48.416 48.416 0 0 0 12 4.5c-2.291 0-4.545.16-6.75.47m13.5 0c1.01.143 2.01.317 3 .52m-3-.52 2.62 10.726c.122.499-.106 1.028-.589 1.202a5.988 5.988 0 0 1-2.031.352 5.988 5.988 0 0 1-2.031-.352c-.483-.174-.711-.703-.59-1.202L18.75 4.971Zm-16.5.52c.99-.203 1.99-.377 3-.52m0 0 2.62 10.726c.122.499-.106 1.028-.589 1.202a5.989 5.989 0 0 1-2.031.352 5.989 5.989 0 0 1-2.031-.352c-.483-.174-.711-.703-.59-1.202L5.25 4.971Z" />
            </svg>
          }
        />
        <StatCard
          label="Burnout Alerts"
          value={burnoutRisks.length}
          valueColor={burnoutRisks.length === 0 ? "text-vc-sage" : "text-vc-coral"}
          subtext={burnoutRisks.filter((b) => b.level === "red").length > 0 ? `${burnoutRisks.filter((b) => b.level === "red").length} critical` : "No critical risks"}
          icon={
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.362 5.214A8.252 8.252 0 0 1 12 21 8.25 8.25 0 0 1 6.038 7.047 8.287 8.287 0 0 0 9 9.601a8.983 8.983 0 0 1 3.361-6.867 8.21 8.21 0 0 0 3 2.48Z" />
            </svg>
          }
        />
        <StatCard
          label="Thin Benches"
          value={thinBenches.length}
          valueColor={thinBenches.length === 0 ? "text-vc-sage" : "text-vc-sand"}
          subtext={thinBenches.length > 0 ? `${thinBenches.length} role${thinBenches.length > 1 ? "s" : ""} below 2:1` : "All roles staffed"}
          icon={
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z" />
            </svg>
          }
        />
      </StatCardGrid>

      {/* Serving Frequency Chart */}
      <section className="mb-6 rounded-xl border border-vc-border-light bg-white shadow-sm overflow-hidden">
        <div className="border-b border-vc-border-light px-5 py-3.5 flex items-center gap-3">
          <svg className="h-5 w-5 text-vc-indigo" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
          </svg>
          <h2 className="font-semibold text-vc-indigo">Serving Frequency</h2>
          <InfoTooltip text="Times each volunteer served in the last 90 days. Coral bars indicate overcommitted volunteers." />
          <span className="ml-auto text-xs text-vc-text-muted">Last 90 days</span>
        </div>
        <div className="p-5">
          {servingFreq.length === 0 ? (
            <p className="text-sm text-vc-text-muted">No assignment data yet.</p>
          ) : (
            <div className="space-y-2.5">
              {servingFreq.slice(0, 15).map((sf) => {
                const maxCount = servingFreq[0]?.count || 1;
                const pct = Math.max(4, (sf.count / maxCount) * 100);
                return (
                  <div key={sf.volunteerId} className="flex items-center gap-3">
                    <span className="w-32 shrink-0 truncate text-sm font-medium text-vc-indigo">
                      {sf.volunteerName}
                    </span>
                    <div className="flex-1 h-6 rounded-full bg-vc-border-light/50 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          sf.isOvercommitted ? "bg-vc-coral" : "bg-vc-indigo/70"
                        }`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className={`w-8 text-right text-sm font-semibold ${
                      sf.isOvercommitted ? "text-vc-coral" : "text-vc-indigo"
                    }`}>
                      {sf.count}
                    </span>
                    <span className="w-20 text-xs text-vc-text-muted">
                      pref: {sf.preferred}/mo
                    </span>
                  </div>
                );
              })}
              {servingFreq.length > 15 && (
                <p className="text-xs text-vc-text-muted pt-1">
                  +{servingFreq.length - 15} more volunteers
                </p>
              )}
            </div>
          )}
        </div>
      </section>

      {/* Burnout Risk */}
      {burnoutRisks.length > 0 && (
        <section className="mb-6 rounded-xl border border-vc-border-light bg-white shadow-sm overflow-hidden">
          <div className="border-b border-vc-border-light px-5 py-3.5 flex items-center gap-3">
            <svg className="h-5 w-5 text-vc-coral" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.362 5.214A8.252 8.252 0 0 1 12 21 8.25 8.25 0 0 1 6.038 7.047 8.287 8.287 0 0 0 9 9.601a8.983 8.983 0 0 1 3.361-6.867 8.21 8.21 0 0 0 3 2.48Z" />
            </svg>
            <h2 className="font-semibold text-vc-indigo">Burnout Risk</h2>
            <InfoTooltip text="Volunteers serving 3+ consecutive weeks. Yellow = monitor, Red = high risk of burnout." />
            <Badge variant={burnoutRisks.some((b) => b.level === "red") ? "danger" : "warning"} className="ml-auto">
              {burnoutRisks.length}
            </Badge>
          </div>
          <div className="divide-y divide-vc-border-light">
            {burnoutRisks.map((br) => (
              <div key={br.volunteerId} className="flex items-center gap-4 px-5 py-3 hover:bg-vc-bg-warm transition-colors">
                <div className={`flex h-8 w-8 items-center justify-center rounded-full ${
                  br.level === "red" ? "bg-vc-danger/10 text-vc-danger" : "bg-vc-sand/20 text-vc-sand"
                }`}>
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-vc-indigo truncate">{br.volunteerName}</p>
                  <p className="text-xs text-vc-text-muted">
                    {br.consecutiveWeeks} consecutive weeks &middot; {br.actualLast90d} assignments in 90d &middot; max {br.maxPerMonth}/mo
                  </p>
                </div>
                <Badge variant={br.level === "red" ? "danger" : "warning"}>
                  {br.level === "red" ? "High Risk" : "Monitor"}
                </Badge>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Bench Depth */}
      <section className="mb-6 rounded-xl border border-vc-border-light bg-white shadow-sm overflow-hidden">
        <div className="border-b border-vc-border-light px-5 py-3.5 flex items-center gap-3">
          <svg className="h-5 w-5 text-vc-indigo" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z" />
          </svg>
          <h2 className="font-semibold text-vc-indigo">Bench Depth</h2>
          <InfoTooltip text="Ratio of qualified volunteers to weekly slots needed per role. Below 2:1 is flagged as thin." />
        </div>
        <div className="p-5">
          {benchDepths.length === 0 ? (
            <p className="text-sm text-vc-text-muted">
              No assignment history to calculate bench depth.{" "}
              <Link href="/dashboard/schedules" className="text-vc-coral hover:underline">
                Generate a schedule
              </Link>{" "}
              to populate this data.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs font-medium text-vc-text-muted">
                    <th className="pb-2">Ministry</th>
                    <th className="pb-2">Role</th>
                    <th className="pb-2 text-center">Qualified</th>
                    <th className="pb-2 text-center">Slots/Wk</th>
                    <th className="pb-2 text-center">Ratio</th>
                    <th className="pb-2 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-vc-border-light">
                  {benchDepths.map((bd, i) => (
                    <tr key={`${bd.ministryId}-${bd.roleTitle}-${i}`} className="hover:bg-vc-bg-warm transition-colors">
                      <td className="py-2 font-medium text-vc-indigo">{bd.ministryName}</td>
                      <td className="py-2 text-vc-text-secondary">{bd.roleTitle}</td>
                      <td className="py-2 text-center">{bd.qualifiedCount}</td>
                      <td className="py-2 text-center">{bd.weeklySlots}</td>
                      <td className="py-2 text-center font-semibold">
                        <span className={bd.isThin ? "text-vc-coral" : "text-vc-sage"}>
                          {bd.ratio}:1
                        </span>
                      </td>
                      <td className="py-2 text-center">
                        {bd.isThin ? (
                          <Badge variant="warning">Thin</Badge>
                        ) : (
                          <Badge variant="success">OK</Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      {/* Decline Rates + Growth — side by side on desktop */}
      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        {/* Decline Rates */}
        <section className="rounded-xl border border-vc-border-light bg-white shadow-sm overflow-hidden">
          <div className="border-b border-vc-border-light px-5 py-3.5 flex items-center gap-3">
            <svg className="h-5 w-5 text-vc-coral" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9.75l-4.5 4.5m0-4.5l4.5 4.5M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
            </svg>
            <h2 className="font-semibold text-vc-indigo">Decline Rate by Ministry</h2>
            <InfoTooltip text="Percentage of assignments declined per ministry in the last 90 days." />
          </div>
          <div className="p-5">
            {declineRates.length === 0 ? (
              <p className="text-sm text-vc-text-muted">No decline data yet.</p>
            ) : (
              <div className="space-y-3">
                {declineRates.map((dr) => (
                  <div key={dr.ministryId}>
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span className="font-medium text-vc-indigo">{dr.ministryName}</span>
                      <span className={`font-semibold ${dr.rate > 20 ? "text-vc-coral" : "text-vc-text-secondary"}`}>
                        {dr.rate}%
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-vc-border-light/50 overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          dr.rate > 20 ? "bg-vc-coral" : dr.rate > 10 ? "bg-vc-sand" : "bg-vc-sage"
                        }`}
                        style={{ width: `${Math.max(2, dr.rate)}%` }}
                      />
                    </div>
                    <p className="text-xs text-vc-text-muted mt-0.5">
                      {dr.declined} of {dr.total} assignments
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Volunteer Growth */}
        <section className="rounded-xl border border-vc-border-light bg-white shadow-sm overflow-hidden">
          <div className="border-b border-vc-border-light px-5 py-3.5 flex items-center gap-3">
            <svg className="h-5 w-5 text-vc-sage" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18 9 11.25l4.306 4.306a11.95 11.95 0 0 1 5.814-5.518l2.74-1.22m0 0-5.94-2.281m5.94 2.28-2.28 5.941" />
            </svg>
            <h2 className="font-semibold text-vc-indigo">Volunteer Growth</h2>
            <InfoTooltip text="New volunteers added in rolling time windows." />
          </div>
          <div className="p-5">
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-2xl font-semibold text-vc-indigo">{growth.last30}</p>
                <p className="mt-1 text-xs text-vc-text-muted">Last 30 days</p>
              </div>
              <div>
                <p className="text-2xl font-semibold text-vc-indigo">{growth.last60}</p>
                <p className="mt-1 text-xs text-vc-text-muted">Last 60 days</p>
              </div>
              <div>
                <p className="text-2xl font-semibold text-vc-indigo">{growth.last90}</p>
                <p className="mt-1 text-xs text-vc-text-muted">Last 90 days</p>
              </div>
            </div>
            {activeCount > 0 && (
              <div className="mt-4 pt-4 border-t border-vc-border-light">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-vc-text-muted">Overcommitted volunteers</span>
                  <span className={`font-semibold ${overcommitted.length > 0 ? "text-vc-coral" : "text-vc-sage"}`}>
                    {overcommitted.length}
                  </span>
                </div>
              </div>
            )}
          </div>
        </section>
      </div>

      {/* Quick Links */}
      <div className="flex flex-wrap gap-3">
        <Link
          href="/dashboard/volunteer-health"
          className="inline-flex items-center gap-2 rounded-lg border border-vc-border-light bg-white px-4 py-2.5 text-sm font-medium text-vc-indigo hover:border-vc-coral/30 hover:text-vc-coral transition-colors"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12Z" />
          </svg>
          Volunteer Health Details
        </Link>
        <Link
          href="/dashboard/people"
          className="inline-flex items-center gap-2 rounded-lg border border-vc-border-light bg-white px-4 py-2.5 text-sm font-medium text-vc-indigo hover:border-vc-coral/30 hover:text-vc-coral transition-colors"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
          </svg>
          Manage People
        </Link>
      </div>
    </div>
  );
}
