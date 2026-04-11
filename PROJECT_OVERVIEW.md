# VolunteerCal — Project Overview

| | |
|---|---|
| **Project** | VolunteerCal.org |
| **Location** | `HarpElleIncubator/VolunteerCal/` |
| **Status** | Phase 32 + Expansion Phases 4–11 + Phase G + Part 3 + Onboarding Enhancements + User Notification Center complete. |
| **Stack** | Next.js 16 + TypeScript + Tailwind v4 + Firebase |
| **Deploy** | Vercel (volunteercal.com) |
| **Backend** | Firebase Auth + Firestore + Cloud Functions |

## What It Does

Multi-tenant SaaS for volunteer scheduling — built for churches, nonprofits, and volunteer-driven organizations. Auto-generates fair, conflict-free schedules across teams. Team leaders review and approve. Volunteers confirm via email. Calendar feeds sync to Google/Outlook. Works standalone (CSV/manual) or with Planning Center/Breeze/Rock.

## File Structure

```
VolunteerCal/
├── docs/                       # Scaling assessment, roadmap, test plan
├── middleware.ts                # Centralized route redirects (old URLs → new pages)
├── CLAUDE.md                   # Claude Code conventions
├── PROJECT_OVERVIEW.md         # This file
├── README.md                   # Public-facing README
├── package.json
├── tsconfig.json
├── next.config.ts
├── postcss.config.mjs
├── eslint.config.mjs
├── firebase.json                # Firebase project configuration
├── firestore.indexes.json       # Firestore composite index definitions
├── vercel.json                  # Vercel deployment configuration
├── .env.example                # Environment variable template
├── .gitignore
├── public/
│   ├── fonts/
│   ├── images/
│   ├── manifest.json            # PWA manifest
│   └── sw.js                    # Service worker (offline caching + FCM push)
├── src/
│   ├── app/
│   │   ├── layout.tsx          # Root layout (fonts, metadata, providers)
│   │   ├── globals.css         # Tailwind v4 + VC brand tokens
│   │   ├── page.tsx            # Landing page (public)
│   │   ├── error.tsx           # Global error boundary
│   │   ├── not-found.tsx       # 404 page
│   │   ├── opengraph-image.tsx # OG image generation (Edge runtime)
│   │   ├── sitemap.ts          # Dynamic XML sitemap
│   │   ├── waitlist/
│   │   │   └── page.tsx        # Waitlist confirmation
│   │   ├── login/
│   │   │   └── page.tsx        # Login (email/password)
│   │   ├── register/
│   │   │   └── page.tsx        # Registration (creates user + Firestore profile)
│   │   ├── password-reset/
│   │   │   └── page.tsx        # Password reset (sends email link)
│   │   ├── privacy/
│   │   │   └── page.tsx        # Privacy policy
│   │   ├── terms/
│   │   │   └── page.tsx        # Terms of service
│   │   ├── offline/
│   │   │   └── page.tsx        # PWA offline fallback
│   │   ├── dashboard/          # Auth-guarded routes (redirects to /login)
│   │   │   ├── layout.tsx      # Sidebar nav + auth guard + mobile drawer
│   │   │   ├── page.tsx        # Dashboard home (stats + getting started)
│   │   │   ├── error.tsx       # Dashboard-scoped error boundary
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
│   │   │   ├── my-journey/
│   │   │   │   └── page.tsx        # Volunteer prerequisite progress (org-wide + per-ministry steps)
│   │   │   ├── my-schedule/
│   │   │   │   └── page.tsx        # Volunteer view (Upcoming | Past | Availability | Team tabs)
│   │   │   ├── my-availability/
│   │   │   │   └── page.tsx        # Volunteer self-service availability (blockouts, recurring days, preferences)
│   │   │   ├── my-orgs/
│   │   │   │   └── page.tsx        # Multi-org management (invites, reminders, switch)
│   │   │   ├── settings/
│   │   │   │   └── page.tsx        # Unified settings hub (General, Teams, Campuses, Check-In, Rooms, Billing tabs)
│   │   │   ├── organization/
│   │   │   │   └── page.tsx        # Redirect → /dashboard/settings
│   │   │   ├── account/
│   │   │   │   └── page.tsx        # User profile, password, calendar feeds, danger zone
│   │   │   ├── notifications/
│   │   │   │   └── page.tsx        # Admin notification center (send + history)
│   │   │   ├── volunteer-health/
│   │   │   │   └── page.tsx        # Volunteer health monitoring (at-risk, declining, inactive classification)
│   │   │   ├── onboarding/
│   │   │   │   └── page.tsx        # Volunteer onboarding: prerequisite management (org-wide + team-specific) and volunteer progress pipeline
│   │   │   ├── worship/
│   │   │   │   ├── songs/
│   │   │   │   │   └── page.tsx    # Song library (search, filter, add/edit/archive)
│   │   │   │   ├── plans/
│   │   │   │   │   ├── page.tsx    # Service plans list (upcoming, create, navigate to editor)
│   │   │   │   │   └── [id]/
│   │   │   │   │       └── page.tsx # Service plan editor (items, header type, inline notes, reorder, publish)
│   │   │   │   └── reports/
│   │   │   │       └── page.tsx    # Song usage reports (CCLI compliance)
│   │   │   └── checkin/
│   │   │       ├── page.tsx        # Check-in dashboard (today's stats, quick actions)
│   │   │       ├── households/
│   │   │       │   ├── page.tsx    # Household list (searchable)
│   │   │       │   └── [id]/
│   │   │       │       └── page.tsx    # Household detail (guardians, children, QR)
│   │   │       ├── rooms/
│   │   │       │   └── page.tsx    # Room grade/capacity assignment for check-in
│   │   │       ├── reports/
│   │   │       │   └── page.tsx    # Attendance reports (daily, room, trends, CSV)
│   │   │       ├── settings/
│   │   │       │   └── page.tsx    # Service times, thresholds, printer config, pre-check-in SMS
│   │   │       └── import/
│   │   │           └── page.tsx    # Breeze CSV import wizard
│   │   │   └── rooms/
│   │   │       ├── page.tsx        # Room grid (list, create, equipment badges)
│   │   │       ├── [roomId]/
│   │   │       │   └── page.tsx    # Room detail (timeline, reservations, settings tabs)
│   │   │       ├── requests/
│   │   │       │   └── page.tsx    # Reservation approval queue (approve/deny)
│   │   │       └── settings/
│   │   │           └── page.tsx    # Room settings (equipment tags, defaults, public calendar)
│   │   ├── checkin/               # Children's check-in kiosk (unauthenticated)
│   │   │   ├── layout.tsx         # Blank full-screen layout (no nav/sidebar)
│   │   │   ├── page.tsx           # 4-screen kiosk state machine
│   │   │   └── room/
│   │   │       └── [roomId]/
│   │   │           └── page.tsx   # Teacher room view (token auth, 5s polling)
│   │   ├── guardian/               # Token-based guardian self-service portal (no auth)
│   │   │   ├── layout.tsx         # Minimal layout (no sidebar, brand mark only)
│   │   │   └── page.tsx           # Household info, children, check-in history, QR code
│   │   ├── display/               # Room display signage (wall-mounted tablets)
│   │   │   ├── layout.tsx         # Blank full-screen layout
│   │   │   └── room/
│   │   │       └── [roomId]/
│   │   │           └── page.tsx   # Room status display (30s polling, status colors)
│   │   ├── calendar/              # Room calendar views
│   │   │   ├── layout.tsx         # Authenticated calendar layout
│   │   │   ├── page.tsx           # Authenticated room calendar + booking
│   │   │   └── public/
│   │   │       └── page.tsx       # Public calendar (token auth, embed mode)
│   │   ├── stage-sync/
│   │   │   ├── conductor/
│   │   │   │   └── [churchId]/
│   │   │   │       └── [planId]/
│   │   │   │           └── page.tsx    # Stage Sync conductor view (advance items, keyboard shortcuts)
│   │   │   └── view/
│   │   │       └── [churchId]/
│   │   │           └── [planId]/
│   │   │               └── page.tsx    # Stage Sync participant view (real-time follow-along)
│   │   ├── check-in/
│   │   │   └── [code]/
│   │   │       └── page.tsx        # QR code self-check-in (auto-redirect on success)
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
│   │       ├── my-availability/
│   │       │   └── route.ts    # Volunteer self-service availability (GET own, PATCH update)
│   │       ├── notify/
│   │       │   ├── route.ts                # Publish → batched confirmation emails per volunteer (Resend)
│   │       │   ├── membership-approved/
│   │       │   │   └── route.ts            # Send approval notification email
│   │       │   ├── role-change/
│   │       │   │   └── route.ts            # Send role promotion notification email
│   │       │   ├── welcome-to-org/
│   │       │   │   └── route.ts            # Send welcome email on self-registration
│   │       │   ├── org-created/
│   │       │   │   └── route.ts            # Send org creation confirmation email
│   │       │   ├── absence/
│   │       │   │   └── route.ts            # Volunteer absence alert to schedulers/admins
│   │       │   ├── prerequisite/
│   │       │   │   └── route.ts            # Prerequisite milestone notifications (step/all completed, scheduler eligible)
│   │       │   └── facility-invite/
│   │       │       └── route.ts            # Facility group invitation email to target org admins
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
│   │       │   ├── reminders/
│   │       │   │   └── route.ts    # Vercel Cron → triggers reminders for all churches
│   │       │   ├── propresenter-export/
│   │       │   │   └── route.ts    # Vercel Cron → daily ProPresenter export auto-email
│   │       │   └── prerequisite-check/
│   │       │       └── route.ts    # Vercel Cron → daily expiry warnings + stalled progress nudges
│   │       ├── training-sessions/
│   │       │   ├── route.ts                # Training session CRUD (GET list, POST create)
│   │       │   └── [sessionId]/
│   │       │       ├── route.ts            # GET detail, PUT update, DELETE cancel
│   │       │       ├── rsvp/
│   │       │       │   └── route.ts        # Volunteer RSVP (accept/decline)
│   │       │       ├── complete/
│   │       │       │   └── route.ts        # Mark session completed + auto-complete prereq steps
│   │       │       └── invite/
│   │       │           └── route.ts        # Send invitations to volunteers with pending prereq
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
│   │       │   ├── delete/
│   │       │   │   └── route.ts    # Server-side account deletion (sole-admin detection, cascade)
│   │       │   └── sync-profile/
│   │       │       └── route.ts    # Sync user profile to all volunteer records across orgs
│   │       ├── check-in/
│   │       │   ├── route.ts        # QR check-in API (POST attendance, GET code generation)
│   │       │   └── self/
│   │       │       └── route.ts    # Self/proximity check-in API (time-window validated)
│   │       ├── church-info/
│   │       │   └── route.ts        # Public church info endpoint (name, type for join/invite pages)
│   │       ├── link-account/
│   │       │   └── route.ts        # Guest-to-volunteer account linking (orphan signup resolution)
│   │       ├── push/
│   │       │   └── subscribe/
│   │       │       └── route.ts    # FCM token registration & management (POST/DELETE)
│   │       ├── swap/
│   │       │   └── route.ts        # Shift swap engine (POST create, GET eligible, PATCH accept/approve)
│   │       ├── test-email/
│   │       │   └── route.ts        # Admin email template preview (dev only)
│   │       ├── services/
│   │       │   └── [id]/
│   │       │       └── route.ts    # Service profile PATCH (timeline changes, effective-from dates)
│   │       ├── schedules/
│   │       │   └── [id]/
│   │       │       ├── approve/
│   │       │       │   └── route.ts        # Ministry-level schedule approval (PATCH)
│   │       │       ├── publish/
│   │       │       │   └── route.ts        # Schedule publish + confirmation emails (POST)
│   │       │       ├── coordination/
│   │       │       │   └── route.ts        # Cross-team shared volunteer analysis (GET)
│   │       │       └── availability-window/
│   │       │           └── route.ts        # Availability broadcast to volunteers (POST)
│   │       ├── songs/
│   │       │   ├── route.ts        # Song CRUD (POST create, GET list with filters)
│   │       │   └── [id]/
│   │       │       └── route.ts    # Song update/archive (PATCH, DELETE)
│   │       ├── service-plans/
│   │       │   ├── route.ts        # Service plan CRUD (POST create, GET list)
│   │       │   └── [id]/
│   │       │       ├── route.ts    # Plan GET/update/delete (GET single, PATCH items, DELETE)
│   │       │       ├── publish/
│   │       │       │   └── route.ts    # Publish plan + create song usage records
│   │       │       └── export-propresenter/
│   │       │           └── route.ts    # ProPresenter JSON export for a plan
│   │       ├── songs/
│   │       │   └── [id]/
│   │       │       └── route.ts    # Single song PATCH/GET/DELETE
│   │       ├── arrangements/
│   │       │   ├── route.ts        # List/create arrangements (GET, POST)
│   │       │   └── [id]/
│   │       │       └── route.ts    # Update/delete arrangement (PATCH, DELETE)
│   │       ├── songselect/
│   │       │   ├── import/
│   │       │   │   └── route.ts    # Import parsed songs from uploaded SongSelect files
│   │       │   ├── convert-pdf/
│   │       │   │   └── route.ts    # PDF chord chart → SongChartData via Claude Vision
│   │       │   └── upload/
│   │       │       └── route.ts    # Upload original file + create song + default arrangement
│   │       ├── stage-sync/
│   │       │   ├── enable/
│   │       │   │   └── route.ts    # Enable Stage Sync session for a service plan
│   │       │   ├── advance/
│   │       │   │   └── route.ts    # Advance current item in Stage Sync session
│   │       │   └── status/
│   │       │       └── route.ts    # Get Stage Sync session status
│   │       ├── reports/
│   │       │   └── song-usage/
│   │       │       ├── route.ts    # Song usage report with date range/filters
│   │       │       └── export/
│   │       │           └── route.ts    # CSV export of song usage data
│   │       ├── billing/
│   │       │   ├── checkout/
│   │       │   │   └── route.ts    # Stripe checkout session creation
│   │       │   ├── portal/
│   │       │   │   └── route.ts    # Stripe customer portal
│   │       │   └── webhook/
│   │       │       └── route.ts    # Stripe webhook handler
│   │       ├── checkin/            # Children's check-in kiosk API (unauthenticated, rate-limited)
│   │       │   ├── lookup/
│   │       │   │   └── route.ts    # POST family lookup (QR token, phone last-4, full phone)
│   │       │   ├── checkin/
│   │       │   │   └── route.ts    # POST check-in children + generate label payloads
│   │       │   ├── checkout/
│   │       │   │   └── route.ts    # POST secure pickup (timing-safe code verification)
│   │       │   ├── print/
│   │       │   │   └── route.ts    # POST reprint labels for existing sessions
│   │       │   ├── register/
│   │       │   │   └── route.ts    # POST first-time visitor registration (10 req/min)
│   │       │   ├── services/
│   │       │   │   └── route.ts    # GET today's service times + church name
│   │       │   ├── vcard/
│   │       │   │   └── route.ts    # GET downloadable vCard for SMS contact saving
│   │       │   └── room/
│   │       │       └── [roomId]/
│   │       │           └── route.ts    # GET teacher room view (token auth)
│   │       ├── guardian/             # Token-based guardian self-service API (no auth)
│   │       │   └── household/
│   │       │       └── route.ts      # GET household info + history, PUT update guardian contact
│   │       ├── admin/
│   │       │   ├── tier-override/
│   │       │   │   └── route.ts    # Platform admin tier override (POST)
│   │       │   └── checkin/        # Children's check-in admin API (Bearer auth)
│   │       │       ├── household/
│   │       │       │   ├── route.ts            # POST create household
│   │       │       │   └── [householdId]/
│   │       │       │       ├── route.ts        # GET/PUT household detail
│   │       │       │       └── regenerate-qr/
│   │       │       │           └── route.ts    # POST regenerate QR token
│   │       │       ├── children/
│   │       │       │   ├── route.ts            # GET list / POST create child
│   │       │       │   └── [childId]/
│   │       │       │       └── route.ts        # GET/PUT child detail
│   │       │       ├── printer/
│   │       │       │   ├── route.ts            # POST upsert printer config
│   │       │       │   └── test/
│   │       │       │       └── route.ts        # POST generate test label
│   │       │       ├── settings/
│   │       │       │   └── route.ts            # GET/PUT check-in settings
│   │       │       ├── rooms/
│   │       │       │   └── route.ts            # GET list / PUT update check-in fields
│   │       │       ├── sms/
│   │       │       │   └── pre-checkin/
│   │       │       │       └── route.ts        # POST send pre-check-in SMS (Pro+)
│   │       │       ├── report/
│   │       │       │   └── route.ts            # GET reports (6 types + CSV)
│   │       │       ├── import/
│   │       │       │   ├── breeze/
│   │       │       │   │   └── route.ts        # POST Breeze CSV import
│   │       │       │   ├── pco/
│   │       │       │   │   └── route.ts        # POST Planning Center CSV import
│   │       │       │   └── generic/
│   │       │       │       └── route.ts        # POST generic CSV import with column mapping
│   │       │       ├── checkout/
│   │       │       │   └── route.ts            # POST admin checkout (no security code)
│   │       │       └── households/
│   │       │           └── [householdId]/
│   │       │               └── send-qr/
│   │       │                   └── route.ts    # POST send QR link via SMS to guardian
│   │       ├── rooms/                 # Room & reservation scheduling API
│   │       │   ├── route.ts           # Room list (GET) + create (POST, tier-gated)
│   │       │   ├── [roomId]/
│   │       │   │   ├── route.ts       # Room detail (GET) + update (PUT) + soft-delete (DELETE)
│   │       │   │   └── regenerate-token/
│   │       │   │       └── route.ts   # Regenerate calendar token (POST)
│   │       │   └── settings/
│   │       │       └── route.ts       # Room settings CRUD (GET, PUT)
│   │       ├── reservations/          # Reservation scheduling API
│   │       │   ├── route.ts           # List (GET) + create with conflict detection (POST)
│   │       │   ├── [reservationId]/
│   │       │   │   └── route.ts       # Detail (GET) + update (PUT) + cancel (DELETE)
│   │       │   └── requests/
│   │       │       ├── route.ts       # Pending approval queue (GET)
│   │       │       └── [requestId]/
│   │       │           ├── approve/
│   │       │           │   └── route.ts   # Approve request + SMS (POST)
│   │       │           └── deny/
│   │       │               └── route.ts   # Deny request + SMS (POST)
│   │       ├── facility/              # Shared facility scheduling
│   │       │   └── reservations/
│   │       │       └── route.ts       # Cross-org reservation fetch for linked facility groups
│   │       ├── display/               # Room display signage API
│   │       │   └── room/
│   │       │       └── [roomId]/
│   │       │           └── route.ts   # Public room status (GET, token auth, wake-lock indicator)
│   │       ├── calendar/              # iCal feed routes (existing + new room feeds)
│   │       │   ├── route.ts           # Existing volunteer iCal feed
│   │       │   ├── room/
│   │       │   │   └── [roomId]/
│   │       │   │       └── [calendarToken]/
│   │       │   │           └── route.ts   # Per-room iCal feed
│   │       │   ├── church/
│   │       │   │   └── [churchId]/
│   │       │   │       └── [calendarToken]/
│   │       │   │           └── route.ts   # Church-wide room iCal feed
│   │       │   └── ministry/
│   │       │       └── [ministryId]/
│   │       │           └── [calendarToken]/
│   │       │               └── route.ts   # Per-ministry room iCal feed
│   │       └── volunteers/
│   │           └── [id]/
│   │               ├── archive/
│   │               │   └── route.ts    # Archive/restore volunteer (PATCH)
│   │               └── remove/
│   │                   └── route.ts    # Remove volunteer from organization (DELETE)
│   ├── components/
│   │   ├── ui/                 # Hand-built: button, input, card, badge, spinner, modal, drawer, skeleton, toast, confirm-dialog, check-in-qr, short-link-creator, share-menu, info-tooltip, pwa-install-banner, prerequisite-editor, smart-check-in-banner, address-autocomplete, select, step-type-icon, tab-bar, stat-card, data-list, empty-state
│   │   ├── forms/              # Modal/drawer-wrapped forms: service-form-modal (effective-from UI), ministry-form-modal, campus-form-modal, create-schedule-modal (step wizard), volunteer-edit-modal, csv-import-modal, chms-import-modal, invite-queue-drawer, household-form-modal
│   │   ├── layout/             # Headers, footers, sidebar
│   │   ├── landing/            # Landing page sections (hero, features, pain-points, how-it-works, pricing, faq, waitlist-form, footer, navbar, animate-in)
│   │   ├── dashboard/           # sidebar (desktop-only, warm vc-bg-warm, collapsible Check-In/Rooms), mobile-header (slim branding bar), bottom-nav (mobile tab bar: volunteer 4-tab / admin 5-tab), more-menu (mobile admin slide-up sheet)
│   │   ├── people/             # Person card, person detail drawer, add-people-menu, invite-form, member-row, household-card, filter-bar (extracted from people/page.tsx)
│   │   ├── services/           # services-list, event-list (extracted from services-events/page.tsx)
│   │   ├── settings/           # general-settings, teams-settings, campuses-settings, billing-settings (extracted from organization/page.tsx)
│   │   ├── scheduling/         # Schedule matrix, draft view, approval cards, ministry-review-panel, event-roster, service-roster, service-date-tile, team-schedule-view, calendar-feed-cta, self-remove-modal, attendance-toggle, cant-make-it-modal, cross-team-modal, approval-countdown, availability-campaign-banner, household-conflict-card
│   │   ├── worship/            # Song library table, song form modal, service plan editor, song-import-modal (ChordPro/PDF upload), chord-chart-renderer, chord-chart-viewer, song-editor, arrangements-panel, stage-sync-conductor, stage-sync-viewer, stage-sync-share-modal
│   │   ├── rooms/              # Room booking: room-booking-form (5-step wizard), recurrence-rule-picker, reservation-conflict-modal, room-calendar-view (month/week), room-timeline (horizontal time strip)
│   │   └── checkin/            # Kiosk UI: family-lookup (QR+phone), child-selection (multi-select cards), allergy-confirm, checkin-success (security code display), numeric-keypad, child-card, room-picker-modal, room-child-card, allergy-detail-modal, visitor-registration (first-time family self-registration), checkout-entry, checkout-success, kiosk-install-prompt (PWA install banner)
│   └── lib/
│       ├── firebase/           # config.ts, auth.ts, firestore.ts, admin.ts, messaging.ts
│       ├── context/            # auth-context.tsx, schedule-context.tsx
│       ├── hooks/              # Custom React hooks (use-service-worker.ts, use-notifications.ts)
│       ├── types/              # TypeScript interfaces (incl. InviteQueueItem, Campus, SwapRequest, OnboardingStep, VolunteerJourneyStep, MinistryAssignment, Song, ServicePlan, StageSyncState, SongUsageRecord, CheckInHousehold, Child, CheckInSession, CheckInSettings, PrinterConfig, LabelJob, Room, Reservation, ReservationRequest, RoomSettings, RecurrenceRule, UserNotification, UserNotificationType)
│       ├── constants/          # Workflow modes, reminder channels, pricing tiers (updated: Starter $29, Growth $69, Pro $119), tier limits (worship_enabled, workflow_modes_all, multi_stage_approval, ccli_csv_export), scheduler notification defaults
│       ├── stripe.ts           # Stripe client, price mappings
│       ├── utils/              # ical.ts, org-terms.ts, permissions.ts, download-slide.ts, org-cascade-delete.ts, rate-limit.ts, safe-compare.ts, phone.ts, service-helpers.ts, print-flyer.ts, geolocation.ts, scheduler-notification-check.ts, eligibility.ts, security-code.ts, recurrence.ts (recurring reservation materialization), base-url.ts (canonical base URL resolution for outbound emails)
│       │   ├── emails/         # 37 email templates + base-layout.ts (barrel: index.ts re-exports; incl. batch-confirmation, absence-alert, availability-window, approval-request, approval-reminder, household-conflict, propresenter-export)
│       │   ├── validate-ministry-assignments.ts  # Validates non-overlapping effective date ranges for service profile timeline changes
│       │   ├── print-roster.ts # Document-style roster printout utility (new-window print)
│       ├── integrations/       # ChMS adapters: types, config, planning-center, breeze, rock-rms, songselect (ChordPro/PDF parser)
│       ├── music/              # ChordPro parser, transposition engine, chord notation converters
│       └── services/           # Scheduling algorithm, auto-reschedule, SMS service, printing/ (label adapters: Brother QL, Zebra ZD, Dymo)
├── print-server/               # Companion print service (Python/Flask, runs on church LAN)
│   ├── server.py               # Flask app: POST /print (Brother QL PNG, Zebra ZPL via TCP)
│   ├── requirements.txt        # flask, flask-cors, brother-ql
│   ├── Dockerfile              # Containerized deployment option
│   └── README.md               # Setup guide for church IT
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
| 20 | UI fixes, document-style print, performance optimization, scaling assessment: account settings max-w-3xl constraint, document-style roster printout utility (new-window HTML table, system fonts, no website styling), click-outside handler for roster action menus, batch event signup query (getEventSignupsBatch replaces N+1 per-event reads), parallel short-links + signup loading on Events tab, scaling assessment document (capacity estimates, optimization roadmap, cost projections) | Complete |
| 21 | Frontend design polish: rounded-xl consistency across all cards/inputs/modals, Spinner loading states replacing inline "Loading…" text, max-w-5xl container constraints, scheduling dashboard visual overhaul (stats cards, progress bars, attendance section) | Complete |
| 22 | Security hardening & optimization: Admin SDK migration for all server API routes (billing webhook, reminders), Firestore rules audit (removed world-readable assignment rule), rate limiting on public endpoints (waitlist, signup, confirm, short-links/check), timing-safe cron secret comparison, Stripe webhook metadata validation, client-side TTL cache (60s) for Firestore reads with write-through invalidation, batch reads in attendance + invite APIs (adminDb.getAll), silent error catch audit (mutation error banners on schedules/org/services pages) | Complete |
| 23 | Infrastructure & compliance: PWA hardening (service worker with offline caching + FCM background push), Firebase Cloud Messaging integration (token registration API, background message handling), privacy policy + terms of service pages, OG image generation (Edge runtime), dynamic XML sitemap, dashboard-scoped error boundary, guest-to-volunteer account linking API (orphan signup resolution), profile sync API (propagate name/email/phone changes to all volunteer records across orgs), public church-info endpoint, phone number formatting utility, email template preview endpoint | Complete |
| 24 | Feature expansion: volunteer health monitoring dashboard (at-risk/declining/inactive/no-show/healthy classification), onboarding pipeline (prerequisite tracking: class, background check, minimum service, ministry tenure, custom steps; pipeline stage management), QR code check-in system (code generation with expiration, self-check-in page, attendance marking), shift swap engine (volunteer-initiated requests, replacement acceptance, admin approval workflow), multi-site/campus support (campus model with geolocation, per-campus services, timezone overrides), auto-reschedule service, ministry-level review panel for schedule approval, additional email templates (admin departure, assignment change alerts, vacancy notifications), service multi-ministry normalization helpers | Complete |
| 25 | UI/UX polish & design system hardening: 7 missing CSS color tokens added to globals.css, Badge/Spinner/Input/Select/Button brand token fixes, off-brand Tailwind color sweep across ~15 files (gray→vc-bg-cream, red→vc-danger, amber→vc-sand, green→vc-sage), new Skeleton/Toast/ConfirmDialog components, skeleton loaders replacing full-page spinners (scheduling-dashboard, my-schedule), toast provider with auto-dismiss + undo action, branded confirm dialog replacing window.confirm(), empty state cards (scheduling-dashboard), CheckInQR refactored to shared Modal, volunteer check-in auto-redirect countdown, calendar feed optimistic state update, setup page workflow mode disabled states, ARIA labels on icon-only buttons, 44px touch targets, responsive overflow fixes, form required indicators + inline validation (register page) | Complete |
| 26 | Content, copy & user guidance: landing page hero rewrite (outcome-focused subheadline), features expanded from 6→9 cards (QR check-in, shift swap, volunteer health), new FAQ section (8-question accordion), waitlist form reframed as contact form ("Talk to a real person"), pain points replaced fabricated quotes with scenario descriptions, How It Works Step 4 removed unsubstantiated metric, footer enhanced (FAQ link, HarpElle attribution, contact email), navbar FAQ link, pricing tiers updated with Phase 23-24 features, new InfoTooltip component, contextual tooltips on volunteer health + onboarding pages, Help Center page (/dashboard/help) with getting-started + feature guides, Help link in sidebar nav, post-setup "What's Next?" tips, PWA install banner (Chrome/iOS detection, localStorage dismissal), offline page enhanced (logo, warmer copy), manifest.json polished, dashboard "church's" → "organization's", Household Awareness feature reframed for inclusivity, empty state copy improvements | Complete |
| 27 | Prerequisites & onboarding enhancement: org-wide prerequisites (stored on Church document, apply to all teams), shared PrerequisiteEditor component extracted from org settings, Onboarding page upgraded with two-tab layout (Volunteer Progress + Manage Prerequisites), org-wide + team-specific prerequisite CRUD on Onboarding page, pipeline logic merges org-wide and team prerequisites for progress tracking, Organization Settings simplified to use shared component with link to Onboarding, scheduler threads org-wide prerequisites through eligibility checks (generateDraftSchedule + findBestVolunteer + isEligible + hasCompletedPrerequisites), auto-reschedule loads org prerequisites, Schedules page loads church doc for org prerequisites, Dashboard setup guide adds optional "Set up onboarding prerequisites" step with Optional badge | Complete |
| 28 | Smart check-in & address autocomplete: time-aware self-check-in (SmartCheckInBanner prompts volunteers near scheduled service times), self-check-in API (POST /api/check-in/self with time window validation), Google Places address autocomplete on campus form (captures lat/lng), proximity-based check-in (geolocation detects volunteers near a campus), geolocation utilities (haversine distance, getCurrentPosition), check-in settings in Organization page (self-check-in toggle, window before/after, proximity toggle + radius), ChurchSettings extended with 5 check-in fields, Assignment.check_in_method field, existing QR check-in records method as "qr" | Complete |
| 29 | Service roster & attendance access parity: Roster button added to service cards on Services & Events page (matches event card parity), ServiceRoster modal opens for next upcoming service date, Attendance tab on both service and event rosters now accessible for future dates (not gated to past/today), allows admins/schedulers to familiarize with attendance UI before service day | Complete |
| 30 | Attendance enhancement, absence alerts & scheduler notifications: AttendanceStatus type overhaul (boolean→string enum: present/no_show/excused/null with backward-compat normalizer), shared AttendanceToggle component extracted from duplicate inline toggles, four-state toggle cycle (null→present→no_show→excused→null), "Roster & Attendance" button rename, layout shift fixes (reserved stats bar + save button space), "Can't Make It" volunteer self-service absence notification (modal + API + email template + SMS for paid tiers), scheduler/admin granular notification preferences (per-type toggles, standard/urgent channel selection, ministry scope, SMS tier-gated to Starter+), shouldNotifyScheduler utility wired into absence + self-removal API routes | Complete |
| 31 | UI/UX consistency audit: modal close button touch target fix (28px→45px), confirm dialog buttons sm→md, Card tappable variant (hover-lift + active-press), Organization page ministry/campus cards converted from hover-reveal to tappable card pattern (chevron affordance, keyboard accessible, delete moved into edit form), check-in number inputs right-sized (max-w-[120px]), People page roster Edit/Delete + Approve/Reject touch targets to 44px minimum, My Orgs page Accept/Decline/Switch/reminder toggle touch targets to 44px, schedules page hover-reveal actions made always-visible, dashboard sub-heading size standardization, zero hover-only interaction patterns remaining | Complete |
| 32 | Expansion: scheduling enhancements + worship module — **Service profiles with timeline changes** (MinistryAssignment with effective_from/effective_until, EditScope, temporal filtering in service-helpers/scheduler, validate-ministry-assignments utility, service PATCH API, service form effective-from UI), **Scheduling workflow modes** (step-based create-schedule wizard, workflow mode picker, all 3 modes active), **Availability campaigns** (broadcast API, availability-campaign-banner, email template), **Multi-stage approval** (approve/publish/coordination APIs, approval-countdown component, cross-team-modal, approval-request + approval-reminder email templates), **Household UI** (household-form-modal, household-conflict-card, Families tab on People page, never_same_time + prefer_same_service scheduler enhancements), **Worship module** (Song/ServicePlan/SongUsageRecord/StageSyncState types, song CRUD API, service-plans CRUD + publish API with song usage tracking, Songs page, Service Plans page, Reports page, worship nav section gated by tier), **Pricing update** (Starter $19→$29, Growth $49→$69, Pro $99→$119, new tier gates: worship_enabled, workflow_modes_all, multi_stage_approval, ccli_csv_export) | Complete |
| Exp. 4 | SongSelect file import — songselect file parser for ChordPro exports (src/lib/integrations/songselect.ts), import API route (src/app/api/songselect/import/), drag-and-drop import modal with ChordPro + PDF support (src/components/worship/songselect-import-modal.tsx), duplicate detection by CCLI number. Note: SongSelect has no public API; users download files from songselect.ccli.com and upload them. | Complete |
| Exp. 9 | ChordPro & PDF Import + Chord Chart Viewer — custom ChordPro parser (src/lib/music/chordpro-parser.ts), transposition engine with Nashville/Solfege support (src/lib/music/transposition.ts), PDF conversion via Claude Vision API (src/app/api/songselect/convert-pdf/), file upload with Firebase Storage (src/app/api/songselect/upload/), chord chart renderer + viewer with transpose/chart-type/columns/scale/fit-to-pages (src/components/worship/chord-chart-renderer.tsx, chord-chart-viewer.tsx), song detail page (/dashboard/worship/songs/[id]), song editor with section management (src/components/worship/song-editor.tsx), arrangements system (src/app/api/arrangements/, src/components/worship/arrangements-panel.tsx), StageSync chart integration, CCLI compliance (license number + attestation in settings, CSV export). Dropped .usr/.txt parsers (discontinued formats). | Complete |
| Exp. 5 | Stage Sync — conductor page (src/app/stage-sync/conductor/[churchId]/[planId]/), participant page (src/app/stage-sync/view/[churchId]/[planId]/), enable/advance/status API routes (src/app/api/stage-sync/), conductor component with keyboard shortcuts, participant viewer with real-time Firestore onSnapshot, share modal with QR code, Firestore rules for stage_sync_live and stage_sync_tokens collections | Complete |
| Exp. 6 | Song usage reports & ProPresenter export — reports page with date range/filters/CSV export (src/app/api/reports/song-usage/), ProPresenter JSON export API (src/app/api/service-plans/[id]/export-propresenter/), daily auto-email cron (src/app/api/cron/propresenter-export/), propresenter-export email template, Firestore composite indexes for song_usage, songs, and service_plans | Complete |
| Exp. 7 | Platform admin tier override & ministry templates — SubscriptionSource type on Church interface, platform-admin utility (src/lib/utils/platform-admin.ts), tier-override API (src/app/api/admin/tier-override/), Stripe webhook guard for manual overrides, Platform Admin UI card in organization settings, free tier updated to 2 ministries, 23 church ministry templates with 6 categories (src/lib/constants/), setup wizard converted to stepped form with ministry picker (step 4 for churches), inline name editing, background-check indicators | Complete |
| Exp. 8 | Volunteer archive & status system — "archived" added to VolunteerStatus type, scheduler isEligible() safety check rejects non-active volunteers, schedules page pre-filters archived before generating drafts, archive/restore API (src/app/api/volunteers/[id]/archive/), remove-from-organization API (src/app/api/volunteers/[id]/remove/) deletes volunteer + membership, People page status filter (Active/Archived/All) and team filter (On a Team/Not on Any Team), kebab action menu with Archive/Restore/Remove from Organization, archived row visual indicators (faded + badge), contextual info banners for archived and no-team filter states | Complete |
| Exp. 10 | Native Children's Check-In — CheckInHousehold/Child/CheckInSession/CheckInSettings/CheckInAlert/Room types + 5 Firestore composite indexes, security code generator (safe charset), label printing system (PrinterAdapter interface, BrotherQLAdapter PNG via @napi-rs/canvas, ZebraZDAdapter ZPL, DymoAdapter XML), companion print server (Python/Flask on church LAN), 6 kiosk API routes (lookup, checkin, checkout, print, register, room view — unauthenticated, rate-limited), 10 admin API routes (household CRUD, children CRUD, printer config/test, settings, 6-type report engine with CSV export, Breeze CSV import with grade mapping), 4-screen kiosk UI (QR scan via jsQR + phone keypad lookup → multi-select child cards → allergy acknowledgment → success with security code + auto-print), teacher room view (token auth, 5s polling, late arrival detection), admin dashboard (overview stats, households, reports, settings, import wizard), sidebar nav (Check-In section gated by checkin_enabled tier), tier gating (checkin_enabled at Growth+, pre_checkin_sms/advanced_reports/multi_station at Pro+) | Complete |
| Exp. 11 | Room & Resource Scheduling — Reservation/ReservationRequest/RoomSettings/RecurrenceRule types, rooms_enabled/rooms_max/rooms_recurring/rooms_public_calendar tier gates, recurrence utility (generateOccurrenceDates, materializeRecurringReservation, cancelRecurrenceGroup), room CRUD API (list/create/detail/update/soft-delete/regenerate-token), room settings API (equipment tags, require_approval, public calendar toggle), reservation API with conflict detection (time overlap formula, pending_approval flow), recurring reservation materialization (batched Firestore writes, recurrence_group_id, edit_scope: single/from_date/all), approval queue API (approve/deny with SMS notification), room display page for wall-mounted tablets (30s polling, Available/In Use/Starting Soon status with color-coded full-screen display), 3 iCal feed routes (per-room, church-wide, per-ministry with 90-day window), admin dashboard (room grid with cards, room detail with timeline/reservations/settings tabs, approval queue, equipment tag palette + booking defaults), 5-step booking form wizard (room picker → date/time → details/equipment → recurrence rule picker → review with conflict modal), room calendar view (month/week toggle, room/ministry filters), public calendar page (token auth, embed mode via ?embed=true), sidebar Rooms nav section (conditional on roomsEnabled tier gate), 4 Firestore composite indexes for reservations collection | Complete |
| Part 3 | WorshipTools UX Improvements — "header" ServicePlanItemType for section dividers in service plans, service plan editor page (src/app/dashboard/worship/plans/[id]/page.tsx) with item list, inline collapsible notes, add/edit/reorder/remove, publish action, Stage Sync launch, song picker with artist credit, GET /api/service-plans/[id] endpoint, volunteer availability indicators in schedule matrix person-picker (blockout dates, recurring unavailable, max roles per month, sorted available-first with disabled unavailable), volunteer self-service availability page (src/app/dashboard/my-availability/page.tsx) with blockout date management, recurring day-of-week toggles, scheduling preferences, self-serve PATCH API (src/app/api/my-availability/route.ts), sidebar "My Availability" link, batched notification emails (batch-confirmation.ts template bundles all assignments per volunteer into single email), schedule matrix ministry group collapse/expand in by-date view (collapsible headers with chevron + ministry color dot + count), multi-service compare view (new "Compare" tab in schedule matrix showing services as columns, volunteers as rows, availability check/x indicators, date selector, role assignment badges) | Complete |
| Phase G | People page overhaul — table→card grid→table redesign. **Phase G2:** Replaced card grid with scalable table layout (PeopleTable desktop + PeopleList mobile, using DataList components), TeamSidebar with desktop sidebar + mobile chip bar for team filtering, shared Avatar component (photo/initials/eligibility dot/upload overlay), PersonDetailDrawer redesigned with read-only default + edit toggle for Profile & Contact, sections reorganized (Hero with Avatar, Profile & Contact, Teams & Roles always-interactive, Eligibility with prereqs + background check combined, Access & Permissions with useConfirm for admin promotion, collapsible danger zone for Archive/Remove), photo upload API (POST/DELETE /api/volunteers/[id]/photo with Firebase Storage), storage.rules for volunteer_photos, FilterBar simplified (ministry toggles removed — sidebar handles team filtering), person-card.tsx deleted. Prerequisite scope system (PrerequisiteScope: all/teams/events/specific_roles on OnboardingStep, scope-aware scheduler, scope selector + role picker in PrerequisiteEditor), shared eligibility utility (getOrgEligibility, getVolunteerStage, getApplicablePrereqs), org_prerequisites in people-data API, StepTypeIcon extracted to shared component, org role + eligibility filters on Roster tab, share join link moved to header button with modal, inline components extracted to src/components/people/, warm editorial design polish | Complete |
| Onboarding Enhancements | Role validation on 5 notification routes (api/notify/, org-created, role-change, membership-approved, welcome-to-org — Bearer token + admin/scheduler membership checks, notify/route.ts migrated from client Firestore to adminDb), prerequisite notifications (5 email templates: step-completed with progress bar, eligible-notify to schedulers, expiry-warning with 30-day countdown, nudge for stalled progress, training-session-invite with RSVP), prerequisite notification API (POST /api/notify/prerequisite for step_completed/all_completed types), daily cron (/api/cron/prerequisite-check for expiry warnings + stalled nudges), expires_at field on VolunteerJourneyStep, training session system (TrainingSession/TrainingSessionRsvp types, CRUD API /api/training-sessions/, RSVP endpoint, complete endpoint with auto-complete of prereq steps for attendees, invite endpoint sends to volunteers with pending class prereqs), trainee assignment type (AssignmentType: "regular" \| "trainee", dashed border + "Shadowing" badge in service roster, "(shadow)" label in schedule matrix + compare view, "Shadowing" badge in My Schedule, trainees excluded from assigned count) | Complete |
| User Notification Center | In-app notification inbox for all users — UserNotificationType (12 types) + UserNotification interface in types, server-side createUserNotification/createUserNotificationBatch helper (src/lib/services/user-notifications.ts) with resolveUserId for volunteer→user mapping, Firestore security rules (read own + update read field only), 2 composite indexes (inbox list + unread badge), GET /api/user/notifications (paginated, cursor-based, Bearer auth), PATCH /api/user/notifications/read (single or mark-all), real-time useNotifications hook (onSnapshot limit(1) for cheap unread detection), layout integration (hasUnread wired to Sidebar/BottomNav/MoreMenu), 11 trigger points wired (schedule_assignment, reminder, assignment_change, replacement_assignment, swap_request, swap_resolved, membership_approved, role_promotion, prerequisite_milestone, prerequisite_expiry, absence_alert, self_removal_alert), volunteer bottom nav "Reminders" renamed to "Inbox" (href /dashboard/inbox), sidebar Inbox link + separate Send Reminders for scheduler+, More menu split (Inbox + Send Reminders), Inbox page (src/app/dashboard/inbox/page.tsx) with date grouping (Today/Yesterday/Earlier), type-specific icons/colors, optimistic mark-as-read + navigate, mark-all-read, empty state, cursor pagination, weekly cleanup cron (src/app/api/cron/notification-cleanup/, Sundays 4am UTC, deletes expired 90-day notifications) | Complete |
| Data Model Migration & Cleanup | Complete Volunteer→Person migration: eliminated legacy `Volunteer` type and `src/lib/compat/volunteer-compat.ts` compat layer — **Types deleted:** `Volunteer`, `VolunteerAvailability`, `VolunteerStatus`, `SchedulableVolunteer` from `src/lib/types/index.ts`; `Assignment.person_id` made required (was optional). **Scheduler refactored** (`src/lib/services/scheduler.ts`, `auto-reschedule.ts`, `retention-analytics.ts`) to operate on `Person` directly, mapping `scheduling_profile` fields in place of legacy `availability.*`. **personToLegacyVolunteer() removed** from 12 UI pages + components + API routes (all now consume `Person` directly). **Dual-lookup patterns removed** — all `(a.person_id \|\| a.volunteer_id)` → `a.person_id` across 20+ API routes. **Data remediation** (scripts/fix-legacy-ids.ts): 7 memberships with null `volunteer_id` linked to correct Person doc, 13 assignments normalized (`volunteer_id = person_id`), legacy `churches/{id}/volunteers` subcollections deleted from both orgs. **My Schedule performance fix**: two-phase load — fetch person first, then query assignments by `person_id` using Firestore composite index (eliminates full-church scan). **Auth context hardened**: membership bootstrap now looks up Person by `user_id` to set `volunteer_id` on creation. | Complete |
