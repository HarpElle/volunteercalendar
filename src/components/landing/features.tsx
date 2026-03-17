"use client";

import { AnimateIn } from "./animate-in";

const features = [
  {
    title: "Flexible Workflows",
    description:
      "Centralized approval, team-independent, or self-service signups. Every organization works differently.",
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 1 1-3 0m3 0a1.5 1.5 0 1 0-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-9.75 0h9.75" />
      </svg>
    ),
    accent: "bg-vc-coral/10 text-vc-coral",
  },
  {
    title: "Cross-Team Coordination",
    description:
      "See and prevent conflicts across every team — worship, events, outreach, and operations — all in one view.",
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
      </svg>
    ),
    accent: "bg-vc-sage/10 text-vc-sage-dark",
  },
  {
    title: "Household Awareness",
    description:
      "Never schedule a parent and child at the same time in different teams. Families stay in sync.",
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 12 8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
      </svg>
    ),
    accent: "bg-vc-sand/20 text-vc-warning",
  },
  {
    title: "Self-Contained or Integrated",
    description:
      "Works standalone with CSV or manual entry. Or sync with Planning Center, Breeze, and Rock RMS.",
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244" />
      </svg>
    ),
    accent: "bg-vc-indigo/10 text-vc-indigo",
  },
  {
    title: "Calendar Feeds",
    description:
      "Personal and team iCal subscriptions that auto-sync to Google Calendar, Outlook, and Apple Calendar.",
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182" />
      </svg>
    ),
    accent: "bg-vc-coral/10 text-vc-coral",
  },
  {
    title: "Reminders Your Way",
    description:
      "Each volunteer picks their channel: email, SMS, calendar invite, or none. Fully configurable per person.",
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0" />
      </svg>
    ),
    accent: "bg-vc-sage/10 text-vc-sage-dark",
  },
];

export function Features() {
  return (
    <section id="features" className="relative bg-vc-bg-warm px-6 py-24 bg-noise">
      <div className="mx-auto max-w-5xl">
        <AnimateIn>
          <p className="text-center text-sm font-semibold uppercase tracking-[0.2em] text-vc-sage-dark">
            Features
          </p>
          <h2 className="mt-3 text-center font-display text-4xl text-vc-indigo sm:text-5xl">
            Everything you need,{" "}
            <span className="font-display italic text-vc-coral">nothing you don&apos;t</span>
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-center text-lg text-vc-text-secondary">
            Built for churches, nonprofits, and organizations with multiple volunteer teams who need reliable, cross-team scheduling.
          </p>
        </AnimateIn>

        <div className="mt-16 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature, i) => (
            <AnimateIn key={feature.title} delay={0.05 + i * 0.08}>
              <div className="group flex h-full flex-col rounded-2xl border border-vc-border-light bg-white p-7 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/[0.03]">
                <div className={`mb-5 inline-flex h-10 w-10 items-center justify-center rounded-xl ${feature.accent}`}>
                  {feature.icon}
                </div>
                <h3 className="mb-2 text-base font-semibold text-vc-indigo">
                  {feature.title}
                </h3>
                <p className="text-sm leading-relaxed text-vc-text-secondary">
                  {feature.description}
                </p>
              </div>
            </AnimateIn>
          ))}
        </div>
      </div>
    </section>
  );
}
