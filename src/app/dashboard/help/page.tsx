"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";

interface HelpSection {
  title: string;
  content: string;
}

const gettingStarted: HelpSection[] = [
  {
    title: "1. Create your organization",
    content:
      "After registering, the setup wizard walks you through naming your organization, choosing your type (church, nonprofit, or other), and selecting a scheduling workflow. You can always change these later in Organization Settings.",
  },
  {
    title: "2. Add your volunteers",
    content:
      "Go to the People page to add volunteers one by one, or use CSV Import to upload your entire roster at once. Each volunteer can have a name, email, phone, preferred frequency, and availability notes.",
  },
  {
    title: "3. Create teams and roles",
    content:
      "In Services & Events, create your recurring services (e.g., Sunday Morning) and define roles within each team (e.g., Lead Vocalist, Sound Tech). Assign volunteers to teams based on their skills and interests.",
  },
  {
    title: "4. Generate a schedule",
    content:
      "From the Scheduling Dashboard, create a new schedule covering 4–8 weeks. The auto-draft algorithm generates a fair rotation respecting availability, household connections, and preferred frequency limits.",
  },
  {
    title: "5. Review and approve",
    content:
      "The draft schedule appears in the Schedule Matrix where you can review assignments, make manual swaps, and resolve any conflicts. Once satisfied, approve and publish the schedule.",
  },
  {
    title: "6. Notify volunteers",
    content:
      "Published schedules trigger notifications to assigned volunteers via their preferred channel (email or SMS). Volunteers confirm or decline directly from the notification or their My Schedule page.",
  },
];

const featureGuides: { title: string; content: string }[] = [
  {
    title: "Understanding Volunteer Health",
    content:
      "The Volunteer Health dashboard classifies each volunteer based on their scheduling patterns:\n\n• Healthy — Regular participation, no concerning patterns.\n• At Risk (Burnout) — Scheduled more often than their preferred frequency. Consider reducing their assignments.\n• Declining — Three or more declined assignments recently. Their availability may have changed — reach out to check in.\n• No-Show Pattern — Two or more unexcused no-shows. A personal conversation may be more effective than another notification.\n• Inactive — 60+ days since last service, or never scheduled. May need re-engagement or removal from the active roster.\n\nClassifications update automatically based on scheduling data. Use the outreach tools to send a thoughtful check-in email directly from the dashboard.",
  },
  {
    title: "How Auto-Scheduling Works",
    content:
      "The scheduling algorithm builds fair rotations by considering:\n\n• Volunteer availability and blackout dates\n• Preferred scheduling frequency (weekly, biweekly, monthly)\n• Household connections — linked members won't be scheduled for conflicting slots\n• Role qualifications — only qualified volunteers are assigned to specialized roles\n• Recent history — the algorithm avoids scheduling the same person repeatedly while others are underutilized\n\nThe result is a draft that you review before anyone is notified. You always have the final say.",
  },
  {
    title: "Calendar Feeds",
    content:
      "Each volunteer gets a personal iCal feed URL that syncs their assignments to any calendar app.\n\nGoogle Calendar: Settings → Add calendar → From URL → paste the feed link.\nApple Calendar: File → New Calendar Subscription → paste the feed link.\nOutlook: Settings → Calendar → Shared calendars → Subscribe from web → paste the feed link.\n\nCalendar feeds update automatically when schedules change. Volunteers can find their feed URL on the My Schedule page.",
  },
  {
    title: "QR Check-In",
    content:
      "Generate a QR code for any service date from the Scheduling Dashboard. Display it on a screen or print it out. Volunteers scan the code on their phone, confirm their identity, and attendance is logged automatically.\n\nThis replaces paper sign-in sheets and gives you real-time attendance data that feeds into Volunteer Health classifications.",
  },
  {
    title: "Shift Swaps",
    content:
      "When a volunteer can't make their assigned date, they can request a shift swap from their My Schedule page. The system identifies eligible replacements based on availability and qualifications. Once a replacement accepts, the scheduler reviews and approves the swap.\n\nThe original volunteer, the replacement, and the scheduler all receive notifications at each step. No group texts or email chains needed.",
  },
  {
    title: "Onboarding Pipeline",
    content:
      "Set up prerequisite steps that volunteers must complete before being scheduled for a team — things like background checks, training classes, or orientation sessions.\n\nCreate pipeline stages in the Onboarding page, then track each volunteer's progress. Volunteers won't appear as available for scheduling until they've completed all required prerequisites for that team.",
  },
  {
    title: "Installing VolunteerCal as an App",
    content:
      "VolunteerCal is a Progressive Web App (PWA) — you can install it on any device for quick access and a native app experience.\n\nChrome (Android/Desktop): Look for the \"Install\" prompt in the address bar, or open the browser menu and select \"Install app\" or \"Add to Home Screen.\"\n\niPhone/iPad (Safari): Tap the Share button (square with arrow), then tap \"Add to Home Screen.\"\n\nOnce installed, VolunteerCal opens in its own window with an app icon on your home screen — no app store download required.",
  },
];

function AccordionItem({ title, content, isOpen, onToggle }: {
  title: string;
  content: string;
  isOpen: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="border-b border-vc-border-light last:border-b-0">
      <button
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-4 py-4 text-left"
        aria-expanded={isOpen}
      >
        <span className="text-base font-medium text-vc-indigo">{title}</span>
        <motion.span
          animate={{ rotate: isOpen ? 45 : 0 }}
          transition={{ duration: 0.2 }}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-vc-bg-warm text-vc-text-muted"
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
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
            <div className="pb-4 text-sm leading-relaxed text-vc-text-secondary whitespace-pre-line">
              {content}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function HelpPage() {
  const [openGettingStarted, setOpenGettingStarted] = useState<number | null>(null);
  const [openGuide, setOpenGuide] = useState<number | null>(null);

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-8">
        <h1 className="font-display text-3xl text-vc-indigo">Help Center</h1>
        <p className="mt-1 text-vc-text-secondary">
          Guides and answers to help you get the most out of VolunteerCal.
        </p>
      </div>

      {/* Getting Started */}
      <section className="mb-8">
        <h2 className="mb-4 font-display text-xl text-vc-indigo">Getting Started</h2>
        <div className="rounded-xl border border-vc-border-light bg-white px-5">
          {gettingStarted.map((item, i) => (
            <AccordionItem
              key={i}
              title={item.title}
              content={item.content}
              isOpen={openGettingStarted === i}
              onToggle={() => setOpenGettingStarted(openGettingStarted === i ? null : i)}
            />
          ))}
        </div>
      </section>

      {/* Feature Guides */}
      <section className="mb-8">
        <h2 className="mb-4 font-display text-xl text-vc-indigo">Feature Guides</h2>
        <div className="rounded-xl border border-vc-border-light bg-white px-5">
          {featureGuides.map((item, i) => (
            <AccordionItem
              key={i}
              title={item.title}
              content={item.content}
              isOpen={openGuide === i}
              onToggle={() => setOpenGuide(openGuide === i ? null : i)}
            />
          ))}
        </div>
      </section>

      {/* Contact */}
      <section className="rounded-xl border border-vc-border-light bg-vc-bg-warm p-6">
        <h2 className="font-display text-xl text-vc-indigo">Need more help?</h2>
        <p className="mt-2 text-sm text-vc-text-secondary">
          We&apos;re here to help you get the most out of VolunteerCal. Reach out anytime.
        </p>
        <a
          href="mailto:hello@volunteercal.com"
          className="mt-4 inline-flex items-center gap-2 rounded-full bg-vc-coral px-5 py-2.5 text-sm font-semibold text-white transition-all hover:bg-vc-coral-dark active:scale-[0.98]"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" />
          </svg>
          Email Us
        </a>
      </section>
    </div>
  );
}
