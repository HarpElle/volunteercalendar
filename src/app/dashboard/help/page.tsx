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
    title: "Check-In Methods",
    content:
      "VolunteerCal offers three ways for volunteers to check in:\n\n**QR Code** — Generate a QR code for any service date from the Scheduling Dashboard. Display it on a screen or print it out. Volunteers scan the code, confirm their identity, and attendance logs automatically.\n\n**Smart Check-In** — When a volunteer opens the app near a scheduled service time, a banner prompts them to check in with one tap. The time window is configurable (default: 60 minutes before, 30 minutes after service start).\n\n**Proximity Check-In** — If a campus has a street address with coordinates (entered via address autocomplete), volunteers near the venue receive a location-aware prompt. This requires the proximity setting to be enabled and the volunteer to allow location access.\n\nAll three methods log attendance automatically and feed into Volunteer Health classifications. Admins can configure check-in settings (self-check-in toggle, time windows, proximity radius) in Organization Settings.\n\n**Admin/Scheduler Attendance** — Schedulers and Admins can also mark attendance manually. On the Services & Events page, click the Roster button on any service or event card to open the roster modal. Switch to the Attendance tab to mark individuals present or use 'Mark all present.' The Attendance tab is available for both past and upcoming dates, so you can familiarize yourself with the interface before the service day.",
  },
  {
    title: "Shift Swaps",
    content:
      "When a volunteer can't make their assigned date, they can request a shift swap from their My Schedule page. The system identifies eligible replacements based on availability and qualifications. Once a replacement accepts, the scheduler reviews and approves the swap.\n\nThe original volunteer, the replacement, and the scheduler all receive notifications at each step. No group texts or email chains needed.",
  },
  {
    title: "Onboarding Pipeline",
    content:
      "Define the requirements volunteers must complete before serving — things like background checks, training classes, or orientation sessions.\n\nOn the Onboarding page, use the \"Manage Prerequisites\" tab to set up organization-wide requirements (applied to every team) and team-specific requirements. Then switch to the \"Volunteer Progress\" tab to track each volunteer's status through the pipeline. Volunteers won't appear as available for scheduling until they've completed all required prerequisites — both org-wide and team-specific.",
  },
  {
    title: "Absence Alerts",
    content:
      "When a volunteer can't make a scheduled assignment, they can tap \"Can't Make It\" on their My Schedule page. They can optionally add a note explaining why.\n\nSchedulers and admins for that team are automatically notified via their preferred channels (email and/or SMS). This gives schedulers immediate visibility into gaps so they can find a replacement or adjust plans.\n\nThe volunteer's assignment is flagged but not removed — the scheduler decides next steps. If the volunteer's situation changes, the scheduler can clear the flag.",
  },
  {
    title: "Scheduler Notification Preferences",
    content:
      "Schedulers and admins can customize which notifications they receive and how.\n\nGo to Account Settings → Scheduler Notifications to configure:\n\n**Notification Types** — Toggle on/off for each type: absence alerts, self-removals, swap requests, and swap completions. Types marked \"Urgent\" (like absence alerts) use the urgent channel; others use the standard channel.\n\n**Standard Channel** — Choose Email or None for routine notifications like completed swaps.\n\n**Urgent Channel** — Choose Email, SMS, or None for time-sensitive notifications like last-minute absences. SMS is available on Starter plans and above.\n\n**Ministry Scope** — Optionally limit notifications to specific teams. Leave empty to receive alerts for all teams you manage.\n\nPreferences are per-organization, so if you're a scheduler in multiple orgs, each has its own settings.",
  },
  {
    title: "Installing VolunteerCal as an App",
    content:
      "VolunteerCal is a Progressive Web App (PWA) — you can install it on any device for quick access and a native app experience.\n\nChrome (Android/Desktop): Look for the \"Install\" prompt in the address bar, or open the browser menu and select \"Install app\" or \"Add to Home Screen.\"\n\niPhone/iPad (Safari): Tap the Share button (square with arrow), then tap \"Add to Home Screen.\"\n\nOnce installed, VolunteerCal opens in its own window with an app icon on your home screen — no app store download required.",
  },
  {
    title: "Workflow Modes",
    content:
      "VolunteerCal supports four scheduling workflow modes. Choose the one that fits how your organization operates:\n\n**Centralized** — Admin drafts the full schedule. Team leads review and approve. Admin publishes globally. Best for smaller orgs or those that want tight control.\n\n**Team-First** — Each team lead generates and publishes their own schedule independently. Admin monitors for cross-team conflicts. Best for organizations with autonomous ministry teams.\n\n**Hybrid** — Auto-draft creates templates. Leaders tweak their sections independently. Admin sees cross-team alerts. Best for mid-size organizations that want structure with flexibility.\n\n**Self-Service** — Volunteers sign up for open slots directly. No approval workflow. Best for events or low-stakes roles.\n\nFree tier is limited to Centralized. Starter and above have access to all four modes. You can change your workflow mode when creating each new schedule.",
  },
  {
    title: "Availability Campaigns",
    content:
      "Before generating a schedule, you can request availability from your volunteers.\n\nWhen creating a new schedule, set an availability due date in Step 2 of the wizard. Optionally add a custom message. After generating the draft, click \"Send Availability Request\" to email all active volunteers.\n\nVolunteers see a banner on their dashboard with the coverage period and a link to submit their availability. You can track response rates on the Scheduling Dashboard.\n\nThis ensures your auto-generated schedule reflects real availability rather than assumptions.",
  },
  {
    title: "Multi-Stage Approval",
    content:
      "For organizations with multiple teams, multi-stage approval ensures every team lead signs off before a schedule goes live.\n\nThe workflow:\n1. Admin generates a draft schedule\n2. Admin submits the schedule for review\n3. Each team lead reviews their team's assignments and clicks Approve\n4. Once all teams have approved, the admin can publish\n\nThe approval countdown shows how many teams have approved (e.g., \"2 of 3 teams approved\"). You can also use the cross-team coordination modal to see shared volunteers and resolve conflicts before publishing.\n\nMulti-stage approval is available on Growth tier and above.",
  },
  {
    title: "Household Scheduling",
    content:
      "Link family members so the scheduler respects real-life connections.\n\nGo to People → Families tab → Add Family. Give the household a name, select members, and set constraints:\n\n**Never same service** — Family members won't be scheduled to the same service on the same date. Useful when one parent needs to be free for childcare.\n\n**Never same time** — Family members won't be scheduled to ANY service on the same date. For families that attend together.\n\n**Prefer same service** — The scheduler tries to place family members on the same service when possible. For families that like to serve together.\n\nConstraint violations are flagged during schedule review with household conflict cards. You can add notes to each household for context (e.g., \"Dad travels every other weekend\").",
  },
  {
    title: "Song Library & Service Plans",
    content:
      "The worship module (Growth tier and above) lets you manage songs and build service plans.\n\n**Song Library** — Navigate to Worship → Songs. Add songs with title, CCLI number, default key, available keys, artist/writer credits, copyright, tags, and lyrics. Filter by status (active, archived), rotation status, or search by title. Songs track usage count and last-used date automatically.\n\n**Service Plans** — Navigate to Worship → Service Plans. Create a plan for a specific service and date. Add items: songs (with key overrides), prayers, announcements, sermons, offerings, videos, or custom items. Reorder items with drag-and-drop. Add arrangement notes per item.\n\n**Publishing** — When you publish a plan, VolunteerCal automatically creates song usage records for CCLI compliance. Each song's use count and last-used date update in real time.\n\nThe Reports page (Worship → Reports) shows song usage over time for CCLI reporting.",
  },
  {
    title: "SongSelect Integration",
    content:
      "Connect your CCLI SongSelect account to import songs directly into your library.\n\n**Connecting** — Navigate to Worship → Songs and click \"Connect SongSelect.\" Enter your CCLI credentials and save. Once connected, the import option becomes available.\n\n**Searching & Importing** — Click \"Import from SongSelect\" to search the SongSelect catalog by title. Select a song from the results and click Import. The song is added to your library with CCLI metadata (number, publisher, copyright) pre-filled. All imported songs are fully editable — you can adjust keys, add tags, or update notes after import.\n\n**Duplicate Detection** — If you try to import a song that already exists in your library (matched by CCLI number), VolunteerCal flags it so you don't create duplicates.\n\n**Auto-Sync** — A weekly background sync checks for updated metadata on songs you've previously imported and keeps your library current. You don't need to do anything — it runs automatically.\n\n**Disconnecting** — To remove your SongSelect connection, click \"Disconnect SongSelect\" on the Songs page. Your imported songs remain in your library; only the connection is removed.",
  },
  {
    title: "Stage Sync",
    content:
      "Stage Sync lets you broadcast your order of service in real time so your worship team can follow along on any device.\n\n**Starting a Session** — Open a published service plan and click \"Start Stage Sync.\" A share modal appears with a QR code and a direct URL. Share either with your team members.\n\n**Conductor View** — The conductor page shows your full order of service with the current item highlighted. Use the Next and Previous buttons to advance through the plan, or use keyboard shortcuts: Right Arrow or Space to advance, Left Arrow to go back.\n\n**Participant View** — Team members open the shared link or scan the QR code on their phone, tablet, or laptop. The current item displays in a clear, large format that updates in real time as the conductor advances.\n\n**Reconnection** — If a participant loses their connection briefly (e.g., switching between apps), the view automatically resumes at the current item when they reconnect. No manual refresh needed.\n\nStage Sync is available on Growth tier and above.",
  },
  {
    title: "Song Usage Reports",
    content:
      "Track which songs your church uses and how often — built for CCLI compliance reporting.\n\n**Viewing Reports** — Navigate to Worship → Reports. The page shows a table of songs used across your published service plans, with use counts and date information.\n\n**Date Range Filtering** — Use the date range picker to narrow results to a specific period. This is especially helpful for quarterly or annual CCLI reporting windows.\n\n**Aggregation** — Each song's use count reflects the number of published service plans containing that song within your selected date range.\n\n**CSV Export** — Click \"Export CSV\" to download a spreadsheet with song titles, CCLI numbers, use counts, and dates. You can upload this directly to your CCLI reporting portal or keep it for your records.\n\nSong usage reports are available on Growth tier and above.",
  },
  {
    title: "ProPresenter Export",
    content:
      "Export your service plans in a format compatible with ProPresenter, the popular worship presentation software.\n\n**Manual Export** — Open any service plan and click \"Export for ProPresenter.\" A JSON file downloads containing your plan items in ProPresenter-compatible format. Import this file into ProPresenter to set up your slides for the service.\n\n**Auto-Email Delivery** — A daily background process can automatically email ProPresenter exports to your designated recipients (e.g., your media team lead). This ensures the presentation team always has the latest plan without needing to log in and export manually.\n\nProPresenter export is available on Growth tier and above.",
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
