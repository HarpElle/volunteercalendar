"use client";

import { motion } from "motion/react";

export function Hero() {
  return (
    <section className="relative min-h-[90vh] overflow-hidden bg-vc-bg-warm pt-24 pb-20 sm:pt-32 sm:pb-28">
      {/* Subtle calendar grid background */}
      <div className="absolute inset-0 bg-calendar-grid opacity-40" />

      {/* Warm gradient orbs */}
      <div className="absolute -top-32 right-1/4 h-[500px] w-[500px] rounded-full bg-vc-coral-glow blur-[120px]" />
      <div className="absolute bottom-0 left-1/4 h-[400px] w-[400px] rounded-full bg-vc-sage-glow blur-[100px]" />
      <div className="absolute top-1/2 right-0 h-[300px] w-[300px] rounded-full bg-vc-sand-glow blur-[80px]" />

      <div className="relative mx-auto max-w-5xl px-6">
        {/* Badge */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="mb-8 flex justify-center"
        >
          <span className="inline-flex items-center gap-2 rounded-full border border-vc-coral/20 bg-vc-coral-glow px-4 py-2 text-sm font-medium text-vc-coral-dark">
            <span className="h-1.5 w-1.5 rounded-full bg-vc-coral animate-pulse" />
            Now accepting early access signups
          </span>
        </motion.div>

        {/* Headline — editorial serif */}
        <motion.h1
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
          className="text-center font-display text-5xl leading-[1.1] tracking-tight text-vc-indigo sm:text-6xl lg:text-7xl"
        >
          Scheduling that serves{" "}
          <br className="hidden sm:block" />
          <span className="relative inline-block">
            <span className="relative z-10">your whole church</span>
            {/* Hand-drawn underline effect */}
            <svg
              className="absolute -bottom-2 left-0 w-full"
              viewBox="0 0 300 12"
              fill="none"
              preserveAspectRatio="none"
            >
              <path
                d="M2 8.5C50 3.5 100 2 150 4.5C200 7 250 3 298 6"
                stroke="var(--vc-coral)"
                strokeWidth="3"
                strokeLinecap="round"
                opacity="0.6"
              />
            </svg>
          </span>
        </motion.h1>

        {/* Subheadline */}
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.5 }}
          className="mx-auto mt-8 max-w-2xl text-center text-lg leading-relaxed text-vc-text-secondary sm:text-xl"
        >
          Auto-generate fair rosters across worship, kids, tech, and greeters.
          Team leaders review in a shared draft. Volunteers confirm and sync to
          their personal calendar.
        </motion.p>

        {/* CTAs */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.7 }}
          className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center"
        >
          <a
            href="#waitlist"
            className="group relative inline-flex items-center gap-2 rounded-full bg-vc-coral px-8 py-3.5 text-base font-semibold text-white shadow-lg shadow-vc-coral/20 transition-all hover:bg-vc-coral-dark hover:shadow-xl hover:shadow-vc-coral/30 active:scale-[0.98]"
          >
            Start Free Today
            <svg
              className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2.5}
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
            </svg>
          </a>
          <a
            href="#how-it-works"
            className="inline-flex items-center gap-2 rounded-full border border-vc-border px-8 py-3.5 text-base font-medium text-vc-indigo transition-all hover:border-vc-indigo/20 hover:bg-vc-bg-cream/50"
          >
            See How It Works
          </a>
        </motion.div>

        {/* Social proof strip */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, delay: 1.0 }}
          className="mt-16 flex flex-col items-center gap-3"
        >
          <p className="text-sm font-medium text-vc-text-muted">
            Built for churches like yours
          </p>
          <div className="flex items-center gap-6 text-sm text-vc-text-muted">
            <span className="flex items-center gap-1.5">
              <svg className="h-4 w-4 text-vc-sage" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clipRule="evenodd" />
              </svg>
              No credit card required
            </span>
            <span className="hidden sm:flex items-center gap-1.5">
              <svg className="h-4 w-4 text-vc-sage" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clipRule="evenodd" />
              </svg>
              Free tier forever
            </span>
            <span className="hidden sm:flex items-center gap-1.5">
              <svg className="h-4 w-4 text-vc-sage" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clipRule="evenodd" />
              </svg>
              Works standalone
            </span>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
