# VolunteerCalendar — Project Overview

| | |
|---|---|
| **Project** | VolunteerCalendar.org |
| **Location** | `HarpElleIncubator/VolunteerCalendar/` |
| **Status** | Phase 6 — Dashboard Analytics, Billing & Exports Complete |
| **Stack** | Next.js 16 + TypeScript + Tailwind v4 + Firebase |
| **Deploy** | Vercel (volunteercalendar.org) |
| **Backend** | Firebase Auth + Firestore + Cloud Functions |

## What It Does

Multi-tenant SaaS for church volunteer scheduling. Auto-generates fair, conflict-free schedules across ministries. Team leaders review and approve. Volunteers confirm via email. Calendar feeds sync to Google/Outlook. Works standalone (CSV/manual) or with Planning Center/Breeze/Rock.

## File Structure

```
VolunteerCalendar/
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
│   │   │   └── settings/
│   │   │       └── page.tsx        # Calendar feeds, church config
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
│       ├── firebase/           # config.ts, auth.ts, firestore.ts
│       ├── context/            # auth-context.tsx, schedule-context.tsx
│       ├── hooks/              # Custom React hooks
│       ├── types/              # TypeScript interfaces
│       ├── constants/          # Workflow modes, reminder channels, pricing tiers, tier limits
│       ├── stripe.ts           # Stripe client, price mappings
│       ├── utils/              # ical.ts, email-templates.ts
│       └── services/           # Scheduling algorithm, reminder service
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
