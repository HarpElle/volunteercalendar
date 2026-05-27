import type { Metadata } from "next";
import Link from "next/link";
import {
  HEALTH_LABEL,
  HEALTH_STYLES,
  OVERALL_MESSAGE,
  OVERALL_STATUS,
  RECENT_INCIDENTS,
  SUBSYSTEMS,
} from "@/lib/data/system-status";

export const metadata: Metadata = {
  title: "Status — VolunteerCal",
  description:
    "Real-time operational health for VolunteerCal subsystems and recent incidents.",
};

function formatDate(iso: string): string {
  return new Date(iso + "T12:00:00").toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function incidentBadge(
  status: "resolved" | "monitoring" | "investigating",
): { label: string; classes: string } {
  switch (status) {
    case "resolved":
      return { label: "Resolved", classes: "bg-vc-sage/15 text-vc-sage-dark" };
    case "monitoring":
      return {
        label: "Monitoring",
        classes: "bg-vc-indigo/10 text-vc-indigo",
      };
    case "investigating":
      return {
        label: "Investigating",
        classes: "bg-vc-coral/15 text-vc-coral-dark",
      };
  }
}

export default function StatusPage() {
  const overall = HEALTH_STYLES[OVERALL_STATUS];

  return (
    <main className="min-h-screen bg-vc-bg px-6 py-16 sm:py-24">
      <article className="mx-auto max-w-3xl">
        <Link
          href="/"
          className="mb-8 inline-flex items-center gap-1.5 text-sm font-medium text-vc-text-secondary transition-colors hover:text-vc-indigo"
        >
          <svg
            className="h-4 w-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Back to Home
        </Link>

        <h1 className="font-editorial text-3xl text-vc-indigo sm:text-4xl">
          System Status
        </h1>
        <p className="mt-3 max-w-2xl text-vc-text-secondary">
          Operational health for the VolunteerCal platform. Past changes live
          on the{" "}
          <Link href="/changelog" className="underline hover:text-vc-indigo">
            changelog
          </Link>
          .
        </p>

        {/* Overall status banner */}
        <div
          className={`mt-10 flex flex-col gap-3 rounded-2xl border bg-white p-6 ring-1 ${overall.ring} sm:flex-row sm:items-center sm:justify-between`}
        >
          <div className="flex items-center gap-3">
            <span className={`h-3 w-3 shrink-0 rounded-full ${overall.dot}`} />
            <div>
              <p className={`font-display text-lg font-semibold ${overall.text}`}>
                {OVERALL_STATUS === "operational"
                  ? "All systems operational"
                  : HEALTH_LABEL[OVERALL_STATUS]}
              </p>
              {OVERALL_MESSAGE && (
                <p className="text-sm text-vc-text-secondary">
                  {OVERALL_MESSAGE}
                </p>
              )}
            </div>
          </div>
          <span
            className={`inline-flex w-fit items-center gap-1.5 self-start rounded-full px-3 py-1 text-xs font-semibold ${overall.pill} sm:self-auto`}
          >
            {HEALTH_LABEL[OVERALL_STATUS]}
          </span>
        </div>

        {/* Subsystems */}
        <section className="mt-12">
          <h2 className="font-display text-sm font-semibold uppercase tracking-wider text-vc-text-muted">
            Subsystems
          </h2>
          <ul className="mt-4 divide-y divide-vc-border-light overflow-hidden rounded-2xl border border-vc-border-light bg-white">
            {SUBSYSTEMS.map((sub) => {
              const styles = HEALTH_STYLES[sub.health];
              return (
                <li
                  key={sub.id}
                  id={sub.id}
                  className="flex flex-col gap-3 p-5 sm:flex-row sm:items-start sm:justify-between"
                >
                  <div className="flex items-start gap-3">
                    <span
                      className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${styles.dot}`}
                    />
                    <div>
                      <p className="font-display font-semibold text-vc-indigo">
                        {sub.name}
                      </p>
                      <p className="mt-0.5 text-sm text-vc-text-secondary">
                        {sub.description}
                      </p>
                      {sub.note && sub.health !== "operational" && (
                        <p className={`mt-2 text-sm font-medium ${styles.text}`}>
                          {sub.note}
                        </p>
                      )}
                    </div>
                  </div>
                  <span
                    className={`inline-flex w-fit shrink-0 items-center rounded-full px-3 py-1 text-xs font-semibold ${styles.pill}`}
                  >
                    {HEALTH_LABEL[sub.health]}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>

        {/* Recent incidents */}
        <section className="mt-12">
          <h2 className="font-display text-sm font-semibold uppercase tracking-wider text-vc-text-muted">
            Recent incidents
          </h2>
          {RECENT_INCIDENTS.length === 0 ? (
            <div className="mt-4 rounded-2xl border border-vc-border-light bg-white p-6">
              <p className="text-vc-text-secondary">
                No incidents reported. We post resolved + ongoing incidents
                here as they happen.
              </p>
            </div>
          ) : (
            <ol className="mt-4 space-y-4">
              {RECENT_INCIDENTS.map((incident, idx) => {
                const badge = incidentBadge(incident.status);
                return (
                  <li
                    key={`${incident.date}-${idx}`}
                    className="rounded-2xl border border-vc-border-light bg-white p-6"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${badge.classes}`}
                      >
                        {badge.label}
                      </span>
                      <span className="text-xs text-vc-text-muted">
                        {formatDate(incident.date)}
                      </span>
                      {incident.duration && (
                        <span className="text-xs text-vc-text-muted">
                          • {incident.duration}
                        </span>
                      )}
                    </div>
                    <h3 className="font-display mt-3 text-lg font-semibold text-vc-indigo">
                      {incident.title}
                    </h3>
                    <p className="mt-2 text-vc-text-secondary leading-relaxed">
                      {incident.summary}
                    </p>
                  </li>
                );
              })}
            </ol>
          )}
        </section>

        <p className="mt-16 text-xs text-vc-text-muted">
          Affecting your church? Email{" "}
          <a
            href="mailto:info@volunteercal.com"
            className="underline hover:text-vc-indigo"
          >
            info@volunteercal.com
          </a>{" "}
          with details — we&apos;ll respond within one business day.
        </p>
      </article>
    </main>
  );
}
