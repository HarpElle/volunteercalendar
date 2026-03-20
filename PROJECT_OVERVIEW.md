# VolunteerCal — Project Overview

| | |
|---|---|
| **Project** | VolunteerCal.org |
| **Location** | `HarpElleIncubator/VolunteerCal/` |
| **Status** | Phase 31 complete. Preparing for beta. |
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
│   │   │   ├── my-schedule/
│   │   │   │   └── page.tsx        # Volunteer view (Upcoming | Past | Availability | Team tabs)
│   │   │   ├── my-orgs/
│   │   │   │   └── page.tsx        # Multi-org management (invites, reminders, switch)
│   │   │   ├── organization/
│   │   │   │   └── page.tsx        # Org settings, ministries/teams, campuses, billing (stacked sections)
│   │   │   ├── account/
│   │   │   │   └── page.tsx        # User profile, password, calendar feeds, danger zone
│   │   │   ├── notifications/
│   │   │   │   └── page.tsx        # Admin notification center (send + history)
│   │   │   ├── volunteer-health/
│   │   │   │   └── page.tsx        # Volunteer health monitoring (at-risk, declining, inactive classification)
│   │   │   ├── onboarding/
│   │   │   │   └── page.tsx        # Volunteer onboarding: prerequisite management (org-wide + team-specific) and volunteer progress pipeline
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
│   │       ├── notify/
│   │       │   ├── route.ts                # Publish → send confirmation emails (Resend)
│   │       │   ├── membership-approved/
│   │       │   │   └── route.ts            # Send approval notification email
│   │       │   ├── role-change/
│   │       │   │   └── route.ts            # Send role promotion notification email
│   │       │   ├── welcome-to-org/
│   │       │   │   └── route.ts            # Send welcome email on self-registration
│   │       │   ├── org-created/
│   │       │   │   └── route.ts            # Send org creation confirmation email
│   │       │   └── absence/
│   │       │       └── route.ts            # Volunteer absence alert to schedulers/admins
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
│   │       └── billing/
│   │           ├── checkout/
│   │           │   └── route.ts    # Stripe checkout session creation
│   │           ├── portal/
│   │           │   └── route.ts    # Stripe customer portal
│   │           └── webhook/
│   │               └── route.ts    # Stripe webhook handler
│   ├── components/
│   │   ├── ui/                 # Hand-built: button, input, card, badge, spinner, modal, skeleton, toast, confirm-dialog, check-in-qr, short-link-creator, share-menu, info-tooltip, pwa-install-banner, prerequisite-editor, smart-check-in-banner, address-autocomplete
│   │   ├── layout/             # Headers, footers, sidebar
│   │   ├── landing/            # Landing page sections (hero, features, pain-points, how-it-works, pricing, faq, waitlist-form, footer, navbar, animate-in)
│   │   └── scheduling/         # Schedule matrix, draft view, approval cards, ministry-review-panel, event-roster, service-roster, team-schedule-view, calendar-feed-cta, self-remove-modal, attendance-toggle, cant-make-it-modal
│   └── lib/
│       ├── firebase/           # config.ts, auth.ts, firestore.ts, admin.ts, messaging.ts
│       ├── context/            # auth-context.tsx, schedule-context.tsx
│       ├── hooks/              # Custom React hooks (use-service-worker.ts)
│       ├── types/              # TypeScript interfaces (incl. InviteQueueItem, Campus, SwapRequest, OnboardingStep, VolunteerJourneyStep)
│       ├── constants/          # Workflow modes, reminder channels, pricing tiers, tier limits, scheduler notification defaults
│       ├── stripe.ts           # Stripe client, price mappings
│       ├── utils/              # ical.ts, org-terms.ts, permissions.ts, download-slide.ts, org-cascade-delete.ts, rate-limit.ts, safe-compare.ts, phone.ts, service-helpers.ts, print-flyer.ts, geolocation.ts, scheduler-notification-check.ts
│       │   ├── emails/         # 26 email templates + base-layout.ts (barrel: index.ts re-exports; incl. absence-alert)
│       │   ├── print-roster.ts # Document-style roster printout utility (new-window print)
│       ├── integrations/       # ChMS adapters: types, config, planning-center, breeze, rock-rms
│       └── services/           # Scheduling algorithm, auto-reschedule, SMS service
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
