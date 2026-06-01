import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Help & Support — VolunteerCal",
  description:
    "Get help with VolunteerCal — reach a real person at info@volunteercal.com, usually within one business day.",
};

export default function HelpPage() {
  return (
    <main className="min-h-screen bg-vc-bg px-6 py-16 sm:py-24">
      <article className="mx-auto max-w-2xl">
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
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15 19l-7-7 7-7"
            />
          </svg>
          Back to Home
        </Link>

        <h1 className="font-editorial text-3xl text-vc-indigo sm:text-4xl">
          We&rsquo;re here to help
        </h1>
        <p className="mt-4 text-lg text-vc-text-secondary leading-relaxed">
          Sunday morning shouldn&rsquo;t be the moment you discover something
          isn&rsquo;t working. If you&rsquo;re stuck, confused, or just want
          a second pair of eyes on something — reach out. A real person on
          our team will read it.
        </p>

        <section className="mt-10 rounded-2xl border border-vc-border-light bg-vc-bg-warm p-6 sm:p-8">
          <p className="text-sm font-medium uppercase tracking-wider text-vc-text-muted">
            Email us
          </p>
          <a
            href="mailto:info@volunteercal.com"
            className="mt-2 inline-block font-display text-2xl font-semibold text-vc-coral hover:text-vc-coral-dark sm:text-3xl"
          >
            info@volunteercal.com
          </a>
          <p className="mt-3 text-sm text-vc-text-secondary">
            We typically respond within one business day, often sooner.
            If your church&rsquo;s service is in the next few hours and
            something&rsquo;s broken, write &ldquo;URGENT&rdquo; in the
            subject line — we&rsquo;ll prioritize it.
          </p>
        </section>

        <section className="mt-10">
          <h2 className="font-display text-xl text-vc-indigo">
            What helps us help you faster
          </h2>
          <ul className="mt-4 space-y-3 text-vc-text-secondary leading-relaxed">
            <li className="flex gap-3">
              <span className="mt-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-vc-coral" />
              <span>
                Your church or organization name (so we can pull up your
                account)
              </span>
            </li>
            <li className="flex gap-3">
              <span className="mt-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-vc-coral" />
              <span>
                What you were trying to do, and what happened instead
              </span>
            </li>
            <li className="flex gap-3">
              <span className="mt-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-vc-coral" />
              <span>
                A screenshot if there was an error message — they&rsquo;re
                worth a thousand words
              </span>
            </li>
            <li className="flex gap-3">
              <span className="mt-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-vc-coral" />
              <span>
                The browser or device you were using (most issues are
                browser-specific quirks)
              </span>
            </li>
          </ul>
        </section>

        <section className="mt-10">
          <h2 className="font-display text-xl text-vc-indigo">
            Quick links
          </h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Link
              href="/status"
              className="rounded-xl border border-vc-border-light bg-white p-4 transition-colors hover:border-vc-coral hover:bg-vc-bg-warm"
            >
              <p className="font-medium text-vc-indigo">System status</p>
              <p className="mt-1 text-sm text-vc-text-muted">
                Live uptime + recent incident history
              </p>
            </Link>
            <Link
              href="/changelog"
              className="rounded-xl border border-vc-border-light bg-white p-4 transition-colors hover:border-vc-coral hover:bg-vc-bg-warm"
            >
              <p className="font-medium text-vc-indigo">What&rsquo;s new</p>
              <p className="mt-1 text-sm text-vc-text-muted">
                Recent features, fixes, and improvements
              </p>
            </Link>
            <Link
              href="/privacy"
              className="rounded-xl border border-vc-border-light bg-white p-4 transition-colors hover:border-vc-coral hover:bg-vc-bg-warm"
            >
              <p className="font-medium text-vc-indigo">Privacy</p>
              <p className="mt-1 text-sm text-vc-text-muted">
                How we handle your data and your volunteers&rsquo; data
              </p>
            </Link>
            <Link
              href="/terms"
              className="rounded-xl border border-vc-border-light bg-white p-4 transition-colors hover:border-vc-coral hover:bg-vc-bg-warm"
            >
              <p className="font-medium text-vc-indigo">Terms of service</p>
              <p className="mt-1 text-sm text-vc-text-muted">
                The fine print, in plain English
              </p>
            </Link>
          </div>
        </section>

        <section className="mt-10 rounded-2xl bg-vc-sand/30 p-6 sm:p-8">
          <p className="text-vc-text-secondary leading-relaxed">
            <span className="font-display text-vc-indigo">A note from us:</span>{" "}
            VolunteerCal exists because scheduling volunteers shouldn&rsquo;t be
            the hardest part of your week. If something&rsquo;s in the way of
            that — even a small thing — we want to know.
          </p>
        </section>
      </article>
    </main>
  );
}
