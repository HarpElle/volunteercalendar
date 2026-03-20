# VolunteerCal — Project Overview

| | |
|---|---|
| **Project** | VolunteerCal.org |
| **Location** | `HarpElleIncubator/VolunteerCal/` |
| **Status** | Phase 19 — Dashboard fixes, print rosters, roster modifications, feed permissions, iCal aggregation, volunteer self-removal (complete) |
| **Stack** | Next.js 16 + TypeScript + Tailwind v4 + Firebase |
| **Deploy** | Vercel (volunteercal.com) |
| **Backend** | Firebase Auth + Firestore + Cloud Functions |

## What It Does

Multi-tenant SaaS for volunteer scheduling — built for churches, nonprofits, and volunteer-driven organizations. Auto-generates fair, conflict-free schedules across teams. Team leaders review and approve. Volunteers confirm via email. Calendar feeds sync to Google/Outlook. Works standalone (CSV/manual) or with Planning Center/Breeze/Rock.

## File Structure

```
VolunteerCal/
├── .StartupIdeas/              # Planning documents (strategy, prompts, research)
├── middleware.ts                # Centralized route redirects (old URLs → new pages)
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
│   │   │   ├── people/
│   │   │   │   └── page.tsx        # Unified people management (roster, invites, CSV/ChMS import)
│   │   │   ├── services-events/
│   │   │   │   └── page.tsx        # Combined services + events (tabbed: Services | Events)
│   │   │   ├── schedules/
│   │   │   │   └── page.tsx        # Schedule list, generate draft, matrix view, CSV/PDF export
│   │   │   ├── scheduling-dashboard/
│   │   │   │   └── page.tsx        # Scheduling ops dashboard (stats, rosters, attendance)
│   │   │   ├── my-schedule/
│   │   │   │   └── page.tsx        # Volunteer view (Upcoming | Past | Availability | Team tabs)
│   │   │   ├── my-orgs/
│   │   │   │   └── page.tsx        # Multi-org management (invites, reminders, switch)
│   │   │   ├── organization/
│   │   │   │   └── page.tsx        # Org settings, ministries/teams, billing (stacked sections)
│   │   │   ├── account/
│   │   │   │   └── page.tsx        # User profile, password, calendar feeds, danger zone
│   │   │   ├── notifications/
│   │   │   │   └── page.tsx        # Admin notification center (send + history)
│   │   ├── s/
│   │   │   └── [slug]/
│   │   │       └── page.tsx        # Short link resolver (server redirect)
│   │   ├── events/
│   │   │   ├── [churchId]/
│   │   │   │   └── [eventId]/
│   │   │   │       └── page.tsx    # Public event detail page (signup link target)
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
│   │       │   ├── route.ts                # Publish → send confirmation emails (Resend)
│   │       │   ├── membership-approved/
│   │       │   │   └── route.ts            # Send approval notification email
│   │       │   ├── role-change/
│   │       │   │   └── route.ts            # Send role promotion notification email
│   │       │   ├── welcome-to-org/
│   │       │   │   └── route.ts            # Send welcome email on self-registration
│   │       │   └── org-created/
│   │       │       └── route.ts            # Send org creation confirmation email
│   │       ├── attendance/
│   │       │   └── route.ts    # Batch attendance updates (event signups + assignments)
│   │       ├── calendar/
│   │       │   └── route.ts    # iCal (.ics) feed generation (personal, team, ministry, org)
│   │       ├── export/
│   │       │   └── route.ts    # CSV/JSON schedule export
│   │       ├── welcome/
│   │       │   └── route.ts    # Welcome email on signup (Resend)
│   │       ├── lifecycle-emails/
│   │       │   └── route.ts    # Lifecycle emails: purchase thank-you, re-engagement, upsell
│   │       ├── invite/
│   │       │   ├── route.ts    # Send invitation email + create pending membership
│   │       │   └── batch/
│   │       │       └── route.ts    # Batch invite sender (process approved queue items)
│   │       ├── signup/
│   │       │   └── route.ts    # Event signup API (GET event data, POST signup)
│   │       ├── import/
│   │       │   └── route.ts    # ChMS import API (test, save creds, preview, import to queue)
│   │       ├── reminders/
│   │       │   └── route.ts    # Scheduled reminder API (48h/24h, email + SMS)
│   │       ├── cron/
│   │       │   └── reminders/
│   │       │       └── route.ts    # Vercel Cron → triggers reminders for all churches
│   │       ├── short-links/
│   │       │   ├── route.ts        # Short links CRUD API (GET list, POST create, DELETE)
│   │       │   └── check/
│   │       │       └── route.ts    # Public slug availability check
│   │       ├── event-invite/
│   │       │   └── route.ts        # Send event invite emails (batch, admin+)
│   │       ├── organization/
│   │       │   └── route.ts        # Org management API (cascading delete + member notification)
│   │       ├── roster/
│   │       │   ├── modify/
│   │       │   │   └── route.ts    # Admin/scheduler roster modification (remove/move) + volunteer notification
│   │       │   └── self-remove/
│   │       │       └── route.ts    # Volunteer self-removal API + scheduler/admin notification
│   │       ├── account/
│   │       │   └── delete/
│   │       │       └── route.ts    # Server-side account deletion (sole-admin detection, cascade)
│   │       └── billing/
│   │           ├── checkout/
│   │           │   └── route.ts    # Stripe checkout session creation
│   │           ├── portal/
│   │           │   └── route.ts    # Stripe customer portal
│   │           └── webhook/
│   │               └── route.ts    # Stripe webhook handler
│   ├── components/
│   │   ├── ui/                 # Hand-built: button, input, card, badge, spinner, modal, short-link-creator, share-menu
│   │   ├── layout/             # Headers, footers, sidebar
│   │   ├── landing/            # Landing page sections
│   │   └── scheduling/         # Schedule matrix, draft view, approval cards, event-roster, service-roster, team-schedule-view, calendar-feed-cta, self-remove-modal
│   └── lib/
│       ├── firebase/           # config.ts, auth.ts, firestore.ts, admin.ts
│       ├── context/            # auth-context.tsx, schedule-context.tsx
│       ├── hooks/              # Custom React hooks
│       ├── types/              # TypeScript interfaces (incl. InviteQueueItem)
│       ├── constants/          # Workflow modes, reminder channels, pricing tiers, tier limits
│       ├── stripe.ts           # Stripe client, price mappings
│       ├── utils/              # ical.ts, org-terms.ts, permissions.ts, download-slide.ts, org-cascade-delete.ts
│       │   ├── emails/         # 20 email templates + base-layout.ts (barrel: email-templates.ts re-exports)
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
| 12 | Dashboard UI/UX reorganization (grouped nav, avatar menu, People/Organization/Account/Services&Events pages, middleware redirects) | Complete |
| 13 | Sharing & invite features: short links (create/resolve/manage, tier-gated), downloadable QR slides (1920×1080 Canvas), email event invites (batch send via Resend), multi-ministry scheduler migration | Complete |
| 14 | Lifecycle workflows: account deletion for all users (sole-admin detection, server-side API), email template refactor (17 files + shared base layout), scheduler team scoping UI, lifecycle email notifications (approval, promotion, welcome-to-org, org deletion to members) | Complete |
| 15 | Import/invite queue: CSV and ChMS imports write to review queue instead of directly creating volunteers, ChMS preview step with team selection, invite queue review UI (approve/skip/send), batch invite API, Firestore rules for invite_queue | Complete |
| 16 | UX polish & tier enforcement: unicode rendering fixes, logout redirect to landing, email autofocus, custom time defaults, mobile layout for role times, org-creation confirmation email, print flyer/download slide redesign (one-page, bottom branding, short URLs only, stats), short link tier gate, persistent setup guide (6-step, collapsible, dismissible), tier enforcement for roles/events (roles_per_service, active_events, roles_per_event limits), usage meters on organization page | Complete |
| 17 | Login fix, layout polish, share menu: fix login/register redirect race condition (useEffect-based navigation), setup guide sidebar dot indicator, dismiss confirmation dialog, event date formatting for print/slide ("Thursday, March 19th at..."), tighter print margins (one-page fit), input width constraints (max-w-3xl forms, max-w-xs ministry select, max-w-sm role inputs), unified ShareMenu dropdown component for events | Complete |
| 18 | Roster viewers, attendance tracking, team schedule visibility, calendar feed enhancements: event roster modal (signup list + attendance toggles), service roster modal (team/org-level ministry pill filtering + attendance), batch attendance API (no-show stat sync), Team tab on My Schedule (ministry-grouped roster with own-row highlight, scheduler-aware links), TeamScheduleView component, CalendarFeedCta quick-subscribe card (personal/team toggle), "team" feed type in calendar API (filter by volunteer's ministry_ids), "team" option in Account feed creator, Firestore composite index for service assignment queries | Complete |
| 19 | Dashboard fixes, print rosters, roster modifications, feed permissions, iCal aggregation, volunteer self-removal: dashboard stats include event signups (awaiting/confirmed/active counts), print button on event + service rosters (@media print CSS), admin/scheduler roster modify API (remove/move assignments + event signups with volunteer email notification), role-based calendar feed permissions (volunteers see self only, schedulers see scoped ministries, admins see all), aggregated iCal feeds for team/ministry/org (one entry per service with role→volunteer roster in description), volunteer self-removal modal with optional note to schedulers, self-remove API with multi-recipient scheduler/admin notification, self-removal from My Schedule + Team tab | Complete |
