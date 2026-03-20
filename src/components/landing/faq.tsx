"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { AnimateIn } from "./animate-in";

const faqs = [
  {
    question: "Is VolunteerCal only for churches?",
    answer:
      "Churches are our primary focus, but VolunteerCal works for any organization that coordinates volunteers across multiple teams — nonprofits, community groups, service organizations, and more. The scheduling logic is the same whether you're coordinating a worship team or a food pantry crew.",
  },
  {
    question: "What if we already use Planning Center, Breeze, or Rock RMS?",
    answer:
      "VolunteerCal is designed to complement your existing tools. You can import your volunteer roster via CSV, and we're building direct integrations with Planning Center, Breeze, and Rock RMS. Many organizations use a ChMS for membership and VolunteerCal specifically for scheduling.",
  },
  {
    question: "Is there really a free tier?",
    answer:
      "Yes — the Starter plan is free forever. It includes up to 25 volunteers, 2 teams, and core scheduling features like auto-draft, calendar feeds, and email reminders. No credit card required, no trial period.",
  },
  {
    question: "How does auto-draft scheduling work?",
    answer:
      "You define your teams, roles, and service times. VolunteerCal generates a fair rotation across 4–8 weeks, respecting each volunteer's availability, preferred frequency, and household connections. The draft goes to team leaders for review before anyone is notified.",
  },
  {
    question: "Can volunteers see only their own schedule?",
    answer:
      "Yes. Volunteers log in to see their upcoming assignments, confirm or decline, request shift swaps, and subscribe to a personal calendar feed. They only see what's relevant to them — admins and schedulers see the full picture.",
  },
  {
    question: "Does it work on phones?",
    answer:
      "Absolutely. VolunteerCal is built mobile-first and can be installed as an app on any device — iPhone, Android, tablet, or desktop. Volunteers get a native app experience without downloading anything from an app store.",
  },
  {
    question: "What happens when a volunteer can't make it?",
    answer:
      "Volunteers can decline an assignment or request a shift swap directly from their schedule. The system finds eligible replacements based on availability and qualifications. A replacement accepts, the scheduler approves, and the swap is done — no group texts required.",
  },
  {
    question: "How is my data protected?",
    answer:
      "VolunteerCal runs on Google Cloud (Firebase) with enterprise-grade security. Data is encrypted in transit and at rest. Each organization's data is fully isolated. We never sell or share your information. You can review our privacy policy and terms of service at the bottom of this page.",
  },
];

function FAQItem({ question, answer, isOpen, onToggle }: {
  question: string;
  answer: string;
  isOpen: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="border-b border-vc-border-light last:border-b-0">
      <button
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-4 py-5 text-left transition-colors hover:text-vc-coral"
        aria-expanded={isOpen}
      >
        <span className="text-base font-semibold text-vc-indigo sm:text-lg">
          {question}
        </span>
        <motion.span
          animate={{ rotate: isOpen ? 45 : 0 }}
          transition={{ duration: 0.2 }}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-vc-bg-warm text-vc-text-muted"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
        </motion.span>
      </button>
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <p className="pb-5 text-base leading-relaxed text-vc-text-secondary">
              {answer}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function FAQ() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <section id="faq" className="relative bg-vc-bg px-6 py-24 bg-noise">
      <div className="mx-auto max-w-3xl">
        <AnimateIn>
          <p className="text-center text-sm font-semibold uppercase tracking-[0.2em] text-vc-coral">
            FAQ
          </p>
          <h2 className="mt-3 text-center font-display text-4xl text-vc-indigo sm:text-5xl">
            Common questions
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-center text-lg text-vc-text-secondary">
            Everything you need to know about getting started with VolunteerCal.
          </p>
        </AnimateIn>

        <AnimateIn delay={0.2}>
          <div className="mt-14 rounded-2xl border border-vc-border-light bg-white px-6 sm:px-8">
            {faqs.map((faq, i) => (
              <FAQItem
                key={i}
                question={faq.question}
                answer={faq.answer}
                isOpen={openIndex === i}
                onToggle={() => setOpenIndex(openIndex === i ? null : i)}
              />
            ))}
          </div>
        </AnimateIn>
      </div>
    </section>
  );
}
