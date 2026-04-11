"use client";

import { AnimateIn } from "./animate-in";

const steps = [
  {
    number: "01",
    title: "Setup",
    description:
      "Define your teams and volunteers. Import from Planning Center, upload a CSV, or add manually. Choose your workflow.",
    accent: "vc-coral",
    accentBg: "bg-vc-coral",
  },
  {
    number: "02",
    title: "Auto-Draft",
    description:
      "One click generates a fair schedule across all teams for 4–8 weeks. Respects availability, households, and frequency limits.",
    accent: "vc-sage",
    accentBg: "bg-vc-sage",
  },
  {
    number: "03",
    title: "Review",
    description:
      "Team leaders see their schedule and tweak as needed. Approve globally or let each team publish independently.",
    accent: "vc-sand",
    accentBg: "bg-vc-sand",
  },
  {
    number: "04",
    title: "Confirm",
    description:
      "Volunteers receive one clear notification with their assignment. They confirm or decline directly \u2014 no email threads, no phone tag. On service day, smart check-in prompts them when it\u2019s time. Calendar feeds sync automatically.",
    accent: "vc-indigo",
    accentBg: "bg-vc-indigo",
  },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className="relative bg-vc-indigo px-6 py-24 overflow-hidden">
      {/* Subtle grid on dark background */}
      <div className="absolute inset-0 opacity-[0.04]">
        <div className="h-full w-full bg-calendar-grid" style={{ backgroundImage: "linear-gradient(rgba(255,255,255,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.3) 1px, transparent 1px)", backgroundSize: "48px 48px" }} />
      </div>

      <div className="relative mx-auto max-w-5xl">
        <AnimateIn>
          <p className="text-center text-sm font-semibold uppercase tracking-[0.2em] text-vc-coral-light">
            How It Works
          </p>
          <h2 className="mt-3 text-center font-editorial text-4xl text-vc-text-on-dark sm:text-5xl">
            Four steps to a better schedule
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-center text-lg text-vc-indigo-muted/80">
            From setup to published schedule — no spreadsheets, no back-and-forth emails.
          </p>
        </AnimateIn>

        <div className="mt-16 grid gap-px overflow-hidden rounded-2xl bg-white/5 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((step, i) => (
            <AnimateIn key={step.number} delay={0.1 + i * 0.12}>
              <div className="group relative flex h-full flex-col bg-vc-indigo-light/30 p-7 backdrop-blur-sm transition-colors hover:bg-vc-indigo-light/50">
                {/* Step number */}
                <span className="mb-4 font-display text-3xl italic text-white/20">
                  {step.number}
                </span>

                {/* Accent bar */}
                <div className={`mb-4 h-1 w-10 rounded-full ${step.accentBg} opacity-80 transition-all group-hover:w-16`} />

                <h3 className="mb-2 text-lg font-semibold text-vc-text-on-dark">
                  {step.title}
                </h3>
                <p className="text-sm leading-relaxed text-white/60">
                  {step.description}
                </p>
              </div>
            </AnimateIn>
          ))}
        </div>
      </div>
    </section>
  );
}
