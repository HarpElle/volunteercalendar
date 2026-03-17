"use client";

import { AnimateIn } from "./animate-in";

const painPoints = [
  {
    borderColor: "border-vc-coral/10",
    iconBg: "bg-vc-coral/10",
    iconColor: "text-vc-coral",
    bgGlow: "bg-vc-coral-glow",
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
      </svg>
    ),
    title: "Siloed tools cause double-books & burnout",
    quote: "Our volunteers were scheduled in both worship AND kids on the same Sunday. We had no visibility across teams.",
    attribution: "Sarah M., Worship Coordinator",
  },
  {
    borderColor: "border-vc-sand/20",
    iconBg: "bg-vc-warning/10",
    iconColor: "text-vc-warning",
    bgGlow: "bg-vc-sand-glow",
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
      </svg>
    ),
    title: "Manual rotations waste 5-10 hours weekly",
    quote: "I was copying spreadsheets, emailing people manually, chasing down confirmations. No one was happy.",
    attribution: "Mike D., Volunteer Coordinator",
  },
  {
    borderColor: "border-vc-indigo/5",
    iconBg: "bg-vc-indigo/10",
    iconColor: "text-vc-indigo",
    bgGlow: "bg-vc-indigo/5",
    icon: (
      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z" />
      </svg>
    ),
    title: "No-shows scramble your Sundays",
    quote: "We had a 30% no-show rate. Finally found a tool that tracks and alerts us before it\u2019s too late.",
    attribution: "Pastor Rebecca L.",
  },
];

export function PainPoints() {
  return (
    <section className="relative bg-vc-bg px-6 py-24 bg-noise">
      <div className="mx-auto max-w-5xl">
        <AnimateIn>
          <p className="text-center text-sm font-semibold uppercase tracking-[0.2em] text-vc-coral">
            The Problem
          </p>
          <h2 className="mt-3 text-center font-display text-4xl text-vc-indigo sm:text-5xl">
            Sound familiar?
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-center text-lg text-vc-text-secondary">
            Churches with multiple volunteer teams face the same scheduling challenges every week.
          </p>
        </AnimateIn>

        <div className="mt-16 grid gap-6 sm:grid-cols-3">
          {painPoints.map((point, i) => (
            <AnimateIn key={point.title} delay={0.1 + i * 0.15}>
              <div
                className={`group relative overflow-hidden rounded-2xl border ${point.borderColor} bg-white p-7 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-black/5`}
              >
                <div className={`absolute -right-8 -top-8 h-24 w-24 rounded-full ${point.bgGlow} opacity-0 blur-2xl transition-opacity group-hover:opacity-100`} />

                <div className={`relative mb-5 inline-flex h-11 w-11 items-center justify-center rounded-xl ${point.iconBg} ${point.iconColor}`}>
                  {point.icon}
                </div>

                <h3 className="relative mb-4 text-lg font-semibold leading-snug text-vc-indigo">
                  {point.title}
                </h3>

                <div className="pull-quote relative">
                  <p className="text-sm leading-relaxed text-vc-text-secondary italic">
                    &ldquo;{point.quote}&rdquo;
                  </p>
                </div>

                <p className="relative mt-4 text-xs font-medium text-vc-text-muted">
                  — {point.attribution}
                </p>
              </div>
            </AnimateIn>
          ))}
        </div>
      </div>
    </section>
  );
}
