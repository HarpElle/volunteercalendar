"use client";

import { AnimateIn } from "./animate-in";
import { PRICING_TIERS } from "@/lib/constants";

export function Pricing() {
  return (
    <section id="pricing" className="relative bg-vc-bg px-6 py-24">
      <div className="mx-auto max-w-6xl">
        <AnimateIn>
          <p className="text-center text-sm font-semibold uppercase tracking-[0.2em] text-vc-coral">
            Pricing
          </p>
          <h2 className="mt-3 text-center font-display text-4xl text-vc-indigo sm:text-5xl">
            Start free, grow at your pace
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-center text-lg text-vc-text-secondary">
            Generous free plan for small teams. Upgrade when you need more.
          </p>
        </AnimateIn>

        <div className="mt-16 grid gap-5 sm:grid-cols-2 lg:grid-cols-5">
          {PRICING_TIERS.map((tier, i) => (
            <AnimateIn key={tier.tier} delay={0.05 + i * 0.08}>
              <div
                className={`relative flex h-full flex-col rounded-2xl border p-6 transition-all duration-300 hover:-translate-y-0.5 ${
                  tier.highlighted
                    ? "border-vc-coral bg-white shadow-xl shadow-vc-coral/10 ring-1 ring-vc-coral/20"
                    : "border-vc-border-light bg-white hover:shadow-lg hover:shadow-black/[0.03]"
                }`}
              >
                {tier.highlighted && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-vc-coral px-4 py-1 text-xs font-semibold text-white shadow-md">
                    Most Popular
                  </div>
                )}

                <div className="mb-1 text-sm font-semibold uppercase tracking-wider text-vc-text-muted">
                  {tier.name}
                </div>

                <div className="mb-5">
                  {tier.price === "Custom" ? (
                    <span className="font-display text-3xl text-vc-indigo">Custom</span>
                  ) : tier.price === "$0" ? (
                    <span className="font-display text-3xl text-vc-indigo">Free</span>
                  ) : (
                    <>
                      <span className="font-display text-3xl text-vc-indigo">
                        {tier.price.split("/")[0]}
                      </span>
                      <span className="text-sm text-vc-text-muted">/mo</span>
                    </>
                  )}
                </div>

                <ul className="mb-6 flex-1 space-y-2.5">
                  {tier.features.map((feature) => (
                    <li
                      key={feature}
                      className="flex items-start gap-2 text-sm text-vc-text-secondary"
                    >
                      <svg
                        className="mt-0.5 h-4 w-4 shrink-0 text-vc-sage"
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth={2.5}
                        stroke="currentColor"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                      </svg>
                      {feature}
                    </li>
                  ))}
                </ul>

                <a
                  href={tier.tier === "enterprise" ? "mailto:info@volunteercal.com" : "/register"}
                  className={`rounded-full px-4 py-2.5 text-center text-sm font-semibold transition-all active:scale-[0.98] ${
                    tier.highlighted
                      ? "bg-vc-coral text-white shadow-sm hover:bg-vc-coral-dark hover:shadow-md"
                      : "border border-vc-border text-vc-indigo hover:border-vc-indigo/20 hover:bg-vc-bg-cream/50"
                  }`}
                >
                  {tier.tier === "free"
                    ? "Start Free"
                    : tier.tier === "enterprise"
                      ? "Contact Us"
                      : "Try Free for 14 Days"}
                </a>
              </div>
            </AnimateIn>
          ))}
        </div>

        <AnimateIn delay={0.5}>
          <p className="mt-8 text-center text-sm text-vc-text-muted">
            All paid plans include a 14-day free trial. No surprise charges.
          </p>
        </AnimateIn>
      </div>
    </section>
  );
}
