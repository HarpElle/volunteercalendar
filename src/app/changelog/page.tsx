import type { Metadata } from "next";
import Link from "next/link";
import { CHANGELOG, type ChangelogCategory } from "@/lib/data/changelog";

export const metadata: Metadata = {
  title: "Changelog — VolunteerCal",
  description:
    "What's new in VolunteerCal. Feature releases, improvements, and fixes — published as they ship.",
};

function formatDate(iso: string): string {
  return new Date(iso + "T12:00:00").toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

const CATEGORY_STYLES: Record<ChangelogCategory, { pill: string; dot: string }> = {
  Feature: { pill: "bg-vc-sage/15 text-vc-sage-dark", dot: "bg-vc-sage" },
  Improvement: { pill: "bg-vc-indigo/10 text-vc-indigo", dot: "bg-vc-indigo" },
  Fix: { pill: "bg-vc-coral/15 text-vc-coral-dark", dot: "bg-vc-coral" },
  Infra: { pill: "bg-vc-sand/30 text-vc-text-secondary", dot: "bg-vc-text-muted" },
};

export default function ChangelogPage() {
  // Group entries by month for a more scannable layout. Iteration order
  // matches CHANGELOG (newest first); Map preserves insertion order.
  const byMonth = new Map<string, typeof CHANGELOG>();
  for (const entry of CHANGELOG) {
    const monthKey = entry.date.slice(0, 7); // "YYYY-MM"
    const bucket = byMonth.get(monthKey) ?? [];
    bucket.push(entry);
    byMonth.set(monthKey, bucket);
  }

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
          Changelog
        </h1>
        <p className="mt-3 max-w-2xl text-vc-text-secondary">
          What&apos;s shipping in VolunteerCal. New entries appear at the top.
          Subscribe to{" "}
          <Link href="/status" className="underline hover:text-vc-indigo">
            /status
          </Link>{" "}
          for live operational health.
        </p>

        <div className="mt-12 space-y-12">
          {[...byMonth.entries()].map(([monthKey, entries]) => {
            const monthLabel = new Date(monthKey + "-01T12:00:00").toLocaleDateString(
              "en-US",
              { month: "long", year: "numeric" },
            );
            return (
              <section key={monthKey} aria-labelledby={`month-${monthKey}`}>
                <h2
                  id={`month-${monthKey}`}
                  className="font-display text-sm font-semibold uppercase tracking-wider text-vc-text-muted"
                >
                  {monthLabel}
                </h2>

                <ol className="mt-4 space-y-6">
                  {entries.map((entry, idx) => {
                    const styles = CATEGORY_STYLES[entry.category];
                    return (
                      <li
                        key={`${monthKey}-${idx}`}
                        className="rounded-2xl border border-vc-border-light bg-white p-6"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${styles.pill}`}
                          >
                            <span className={`h-1.5 w-1.5 rounded-full ${styles.dot}`} />
                            {entry.category}
                          </span>
                          <span className="text-xs text-vc-text-muted">
                            {formatDate(entry.date)}
                          </span>
                          {entry.prs?.map((pr) => (
                            <a
                              key={pr}
                              href={`https://github.com/HarpElle/volunteercalendar/pull/${pr}`}
                              target="_blank"
                              rel="noreferrer noopener"
                              className="rounded-full bg-vc-bg-warm px-2 py-0.5 text-[11px] font-mono text-vc-text-muted hover:text-vc-indigo"
                            >
                              #{pr}
                            </a>
                          ))}
                        </div>
                        <h3 className="font-display mt-3 text-lg font-semibold text-vc-indigo">
                          {entry.title}
                        </h3>
                        <p className="mt-2 text-vc-text-secondary leading-relaxed">
                          {entry.summary}
                        </p>
                      </li>
                    );
                  })}
                </ol>
              </section>
            );
          })}
        </div>

        <p className="mt-16 text-xs text-vc-text-muted">
          Want to suggest something?{" "}
          <a
            href="mailto:info@volunteercal.com"
            className="underline hover:text-vc-indigo"
          >
            info@volunteercal.com
          </a>
        </p>
      </article>
    </main>
  );
}
