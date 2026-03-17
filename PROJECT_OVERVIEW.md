# VolunteerCal — Project Overview

| | |
|---|---|
| **Project** | VolunteerCal.org |
| **Location** | `HarpElleIncubator/VolunteerCal/` |
| **Status** | Phase 11 — Beta hardening (in progress) |
| **Stack** | Next.js 16 + TypeScript + Tailwind v4 + Firebase |
| **Deploy** | Vercel (volunteercal.com) |
| **Backend** | Firebase Auth + Firestore + Cloud Functions |

## What It Does

Multi-tenant SaaS for volunteer scheduling — built for churches, nonprofits, and volunteer-driven organizations. Auto-generates fair, conflict-free schedules across teams. Team leaders review and approve. Volunteers confirm via email. Calendar feeds sync to Google/Outlook. Works standalone (CSV/manual) or with Planning Center/Breeze/Rock.

## File Structure

```
VolunteerCal/
├── .StartupIdeas/              # Planning documents (strategy, prompts, research)
├── CLAUDE.md                   # Claude Code conventions
├── PROJECT_OVERVIEW.md         # This file
├── README.md                   # Public-facing README
├── package.json
├── tsconfig.json
├── next.config.ts
├── postcss.config.mjs
├── eslint.config.mjs
├── .env.example                # Environment variable template
├── .gitignore
├── public/
│   ├── fonts/
│   └── images/
├── src/
│   ├── app/
│   │   ├── layout.tsx          # Root layout (fonts, metadata, providers)
│   │   ├── globals.css         # Tailwind v4 + VC brand tokens
│   │   ├── page.tsx            # Landing page (public)
│   │   ├── waitlist/
│   │   │   └── page.tsx        # Waitlist confirmation
│   │   ├── login/
│   │   │   └── page.tsx        # Login (email/password)
│   │   ├── register/
│   │   │   └── page.tsx        # Registration (creates user + Firestore profile)
│   │   ├── password-reset/
│   │   │   └── page.tsx        # Password reset (sends email link)
│   │   ├── dashboard/          # Auth-guarded routes (redirects to /login)
│   │   │   ├── layout.tsx      # Sidebar nav + auth guard + mobile drawer
│   │   │   ├── page.tsx        # Dashboard home (stats + getting started)
│   │   │   ├── setup/
│   │   │   │   └── page.tsx        # Church setup wizard (name, timezone, workflow)
│   │   │   ├── volunteers/
│   │   │   │   └── page.tsx        # Volunteer list, manual add, CSV import
│   │   │   ├── ministries/
│   │   │   │   └── page.tsx        # Ministry CRUD with color picker
│   │   │   ├── services/
│   │   │   │   └── page.tsx        # Service config (day, time, roles)
│   │   │   ├── schedules/
│   │   │   │   └── page.tsx        # Schedule list, generate draft, matrix view, CSV/PDF export
│   │   │   ├── billing/
│   │   │   │   └── page.tsx        # Subscription management, plan comparison, usage meters
│   │   │   ├── members/
│   │   │   │   └── page.tsx        # Member management (invite, approve, roles)
│   │   │   ├── my-schedule/
│   │   │   │   └── page.tsx        # Volunteer schedule view (all orgs, per-role times)
│   │   │   ├── my-availability/
│   │   │   │   └── page.tsx        # Blockout dates + weekly unavailable days
│   │   │   ├── my-orgs/
│   │   │   │   └── page.tsx        # Multi-org management (invites, reminders, switch)
│   │   │   ├── events/
│   │   │   │   └── page.tsx        # Event CRUD (one-time/recurring, open signup config)
│   │   │   ├── import/
│   │   │   │   └── page.tsx        # ChMS import (PCO, Breeze, Rock RMS)
│   │   │   ├── notifications/
│   │   │   │   └── page.tsx        # Admin notification center (send + history)
│   │   │   └── settings/
│   │   │       └── page.tsx        # Calendar feeds, church config
│   │   ├── events/
│   │   │   └── [eventId]/
│   │   │       └── signup/
│   │   │           └── page.tsx    # Public event signup page (role selection)
│   │   ├── join/
│   │   │   └── [churchId]/
│   │   │       └── page.tsx        # Public volunteer self-registration
│   │   ├── invites/
│   │   │   └── [membershipId]/
│   │   │       └── page.tsx        # Accept/decline invitation
│   │   ├── confirm/
│   │   │   └── [token]/
│   │   │       └── page.tsx        # Public volunteer confirm/decline (no auth)
│   │   └── api/
│   │       ├── waitlist/
│   │       │   └── route.ts    # Waitlist form handler
│   │       ├── confirm/
│   │       │   └── route.ts    # Token-based assignment confirm/decline API
│   │       ├── notify/
│   │       │   └── route.ts    # Publish → send confirmation emails (Resend)
│   │       ├── calendar/
│   │       │   └── route.ts    # iCal (.ics) feed generation
│   │       ├── export/
│   │       │   └── route.ts    # CSV/JSON schedule export
│   │       ├── welcome/
│   │       │   └── route.ts    # Welcome email on signup (Resend)
│   │       ├── lifecycle-emails/
│   │       │   └── route.ts    # Lifecycle emails: purchase thank-you, re-engagement, upsell
│   │       ├── invite/
│   │       │   └── route.ts    # Send invitation email + create pending membership
│   │       ├── signup/
│   │       │   └── route.ts    # Event signup API (GET event data, POST signup)
│   │       ├── import/
│   │       │   └── route.ts    # ChMS import API (test, save creds, import volunteers)
│   │       ├── reminders/
│   │       │   └── route.ts    # Scheduled reminder API (48h/24h, email + SMS)
│   │       ├── cron/
│   │       │   └── reminders/
│   │       │       └── route.ts    # Vercel Cron → triggers reminders for all churches
│   │       └── billing/
│   │           ├── checkout/
│   │           │   └── route.ts    # Stripe checkout session creation
│   │           ├── portal/
│   │           │   └── route.ts    # Stripe customer portal
│   │           └── webhook/
│   │               └── route.ts    # Stripe webhook handler
│   ├── components/
│   │   ├── ui/                 # Hand-built: button, input, card, badge, spinner, modal
│   │   ├── layout/             # Headers, footers, sidebar
│   │   ├── landing/            # Landing page sections
│   │   └── scheduling/         # Schedule matrix, draft view, approval cards
│   └── lib/
│       ├── firebase/           # config.ts, auth.ts, firestore.ts, admin.ts
│       ├── context/            # auth-context.tsx, schedule-context.tsx
│       ├── hooks/              # Custom React hooks
│       ├── types/              # TypeScript interfaces
│       ├── constants/          # Workflow modes, reminder channels, pricing tiers, tier limits
│       ├── stripe.ts           # Stripe client, price mappings
│       ├── utils/              # ical.ts, email-templates.ts, org-terms.ts, permissions.ts
│       ├── integrations/       # ChMS adapters: types, config, planning-center, breeze, rock-rms
│       └── services/           # Scheduling algorithm, SMS service
└── docs/                       # Research outputs, architecture decisions
```

## Implementation Phases

| Phase | Scope | Status |
|-------|-------|--------|
| 1 | Scaffolding, landing page, waitlist, Firebase auth, login/register, dashboard shell | Complete |
| 2 | Data model, volunteer import, ministry/service config | Complete |
| 3 | Scheduling algorithm, draft matrix, conflict detection | Complete |
| 4 | Review/approval workflow (Centralized mode) | Complete |
| 5 | Publish, volunteer confirmations, calendar feeds | Complete |
| 6 | Dashboard analytics, Stripe billing, exports | Complete |
| 7a | Membership data model, permissions, role-conditional nav, org switcher | Complete |
| 7b | Two-way approval (invite/accept, self-register/approve) | Complete |
| 7c | Volunteer self-service portal, per-role time scheduling, all-day events | Complete |
| 7d | Events system, RoleSlots, open signup | Complete |
| 8 | Landing page content refresh (inclusive language, brand voice) | Complete |
| 9 | Integration connectors (Planning Center, Breeze, Rock RMS) + import UI | Complete |
| 10 | Notifications & reminders (48h/24h email + SMS, Twilio, preferences, admin center) | Complete |
| 11 | Beta hardening (favicon/PWA, cron automation, error boundaries, 404 page) | Complete |
