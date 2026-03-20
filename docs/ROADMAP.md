# VolunteerCal — Roadmap

_Last updated: March 2026 (after Phase 31)_

## 1. Blocked by External Dependencies

These items require LLC/bank account, Twilio approval, or DNS verification before they can be completed.

### Stripe Live Mode
- [ ] LLC formation + EIN + bank account open
- [ ] Switch Stripe from test mode to live mode
- [ ] Create live Stripe products/prices (monthly plans only — annual is a future feature)
- [ ] Create live webhook endpoint in Stripe dashboard
- [ ] Update `.env` / Vercel env vars: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
- [ ] End-to-end payment test with a real card (create checkout → pay → verify Firestore `subscription_tier` updated → access Stripe customer portal)

### Twilio SMS
- [ ] Toll-free number verification approved
- [ ] Test SMS reminder delivery (trigger `/api/reminders` with `channels: ["sms"]`)
- [ ] Verify SMS opt-out handling

### Resend Email
- [ ] Verify `volunteercal.com` domain in Resend (currently sending from `harpelle.com`)
- [ ] Update `from` address in all email-sending API routes once verified
- [ ] Test deliverability to Gmail, Outlook, Yahoo

---

## 2. Pre-Launch Checklist (Manual Testing)

Items Jason should test before inviting beta users. See `docs/TEST_PLAN.md` for the full checklist.

- [ ] Full walkthrough: register → setup wizard → add volunteers (manual + CSV) → create services → generate schedule → review matrix → approve → publish → volunteer confirms via email → calendar feed
- [ ] Test Stripe checkout flow in test mode (all 5 tiers)
- [ ] Test CSV import with real volunteer list (Anchor Falls)
- [ ] Test calendar feed subscription in Google Calendar and Apple Calendar
- [ ] Test on mobile (iPhone Safari, Android Chrome)
- [ ] Test public pages: landing, pricing, join page, event signup, short link resolver, privacy, terms
- [ ] Test invite flow: admin sends invite → recipient receives email → clicks accept → appears in People
- [ ] Test event lifecycle: create event → add role slots → publish signup link → volunteer signs up → view roster → mark attendance
- [ ] Test service roster: Services & Events → Services tab → click "Roster & Attendance" → modal opens for next service date → view assignments → toggle attendance (present/no-show/excused/not marked)
- [ ] Test absence alert: My Schedule → upcoming item → "Can't Make It" → add note → submit → scheduler receives email (+ SMS on Starter+ with SMS enabled)
- [ ] Test scheduler notification preferences: Account → Scheduler Notifications → toggle types/channels → save → verify alerts respect preferences
- [ ] Test QR check-in: generate code from scheduling dashboard → scan on phone → check-in page → confirm → attendance marked
- [ ] Test smart check-in: create assignment for today → open dashboard within time window → banner appears → tap "Check In" → attendance marked with method "self"
- [ ] Test proximity check-in: enable proximity in org settings → add campus with coordinates → visit app near campus → banner shows proximity copy → check in → method "proximity"
- [ ] Test campus address autocomplete: edit campus → type address → Google Places dropdown → select → lat/lng saved to campus document
- [ ] Test check-in settings: toggle self-check-in on/off → adjust time windows → save → verify banner respects settings
- [ ] Test shift swap: volunteer requests swap → eligible replacements listed → replacement accepts → admin approves
- [ ] Test volunteer health dashboard: verify classification logic against known test data
- [ ] Test onboarding pipeline: create org-wide + team-specific prerequisites → track volunteer progress through pipeline → verify scheduler gates on incomplete prerequisites
- [ ] Set up Firestore daily backup (Google Cloud Console → Firestore → Backups)
- [ ] Review Firestore security rules in production console

---

## 3. Post-Launch Development Priorities

### High Priority (before 10 paying orgs)

| Item | Notes |
|------|-------|
| Firebase App Check | Prevent API abuse from non-app clients |
| Error monitoring (Sentry) | Catch production errors before users report them |
| Add role validation to notification routes | `api/notify`, `api/welcome`, `api/notify/org-created`, `api/notify/role-change`, `api/notify/membership-approved`, `api/notify/welcome-to-org` — verify Bearer token but don't check membership role |
| Annual billing option | Create annual Stripe Price objects, billing interval toggle UI, discount logic — then re-add "save 20%" copy |
| Household linking UI | Algorithm already handles household constraints; needs UI for admins to define household groups |

### Medium Priority (before 50 paying orgs)

| Item | Notes |
|------|-------|
| Additional workflow modes | Ministry-first, hybrid, self-service (defined in constants, setup wizard saves choice, but only centralized is active) |
| Overage pricing / usage-based billing | Enforce tier limits on API side, auto-prompt upgrade |
| Pagination for large collections | Volunteers list, events list, assignment history — currently loads all |
| Denormalize signup counts | Write `active_signup_count` on Event docs via Cloud Function trigger |
| Push notification content | FCM infrastructure is in place (Phase 23); need to wire it into reminder delivery and shift swap notifications |

### Lower Priority (before 200 paying orgs)

| Item | Notes |
|------|-------|
| Server-side API routes for heavy reads | Move scheduling dashboard multi-collection load to a single API route |
| Firestore COUNT aggregation | Use `getCountFromServer()` for dashboard stats |
| Real-time listeners | `onSnapshot` for pages that stay open (scheduling dashboard during a service) |
| CDN/edge caching for public pages | Event pages, join pages — read-heavy, low write frequency |

---

## 4. Infrastructure Scaling Triggers

See `docs/SCALING_ASSESSMENT.md` for full capacity analysis.

| Trigger | Action |
|---------|--------|
| Any org exceeds 200 volunteers | Add pagination to People page |
| Any org exceeds 100 events | Add lazy loading to Events tab |
| 50+ active organizations | Monitor Firestore daily reads; consider server-side aggregation |
| API p95 response time > 2s | Profile and optimize the slow route; consider server-side caching |
| Monthly Firestore cost > $50 | Review query patterns, add server-side routes for heavy reads |
| 500+ concurrent Sunday morning users | Evaluate real-time listeners vs one-shot reads |

---

## 5. Known Limitations (Beta)

These are things beta users should be aware of:

- **Monthly billing only** — Annual billing is planned but not yet available
- **Centralized scheduling only** — Ministry-first, hybrid, and self-service workflow modes are defined but not active. The setup wizard saves the choice for when they're built.
- **No push notification content yet** — FCM infrastructure is wired up (token registration, service worker) but reminders and swap notifications don't send push yet (email + SMS only)
- **English only** — No i18n/localization
- **Single timezone per org** — All services/events use the org's configured timezone (campuses can override)
- **Rate limiting is in-memory** — Resets on serverless cold starts (Vercel). Sufficient for beta; consider Redis-backed rate limiting at scale.

---

## 6. Recently Completed (Phases 23–31)

Items previously on this roadmap that are now built:

| Item | Phase | Notes |
|------|-------|-------|
| Shift swap / substitution engine | 24 | Full workflow: volunteer requests → eligible replacements → accept → admin approve |
| Multi-site / campus support | 24 | Campus model with geolocation, per-campus services, timezone overrides |
| Volunteer health monitoring | 24 | At-risk, declining, inactive, no-show, healthy classification with email outreach |
| Onboarding pipeline | 24 | Prerequisite tracking (class, background check, tenure), pipeline stage management |
| QR check-in | 24 | Code generation, self-check-in page, attendance marking |
| Auto-reschedule | 24 | Service in lib/services for automatic rescheduling |
| PWA + push infrastructure | 23 | Service worker, offline page, FCM token management |
| Privacy policy + Terms | 23 | Legal pages at /privacy and /terms |
| OG images + sitemap | 23 | Social sharing + SEO |
| Account linking | 23 | Guest signup → registered user resolution |
| Design system hardening | 25 | Brand token fixes, skeleton/toast/confirm-dialog components, ARIA, touch targets |
| Admin SDK migration | 22 | All server API routes use Admin SDK (previously noted as incomplete — now done) |
| Content, copy & user guidance | 26 | Landing page rewrite, features 6→9, FAQ section, Help Center, InfoTooltip, PWA install banner |
| Org-wide prerequisites | 27 | Shared PrerequisiteEditor, onboarding two-tab layout, scheduler eligibility checks |
| Smart check-in & address autocomplete | 28 | Time-aware self-check-in banner, proximity check-in, Google Places, check-in settings |
| Service roster access parity | 29 | Roster button on service cards, attendance tab accessible for future dates |
| Attendance overhaul & absence alerts | 30 | AttendanceStatus enum (present/no_show/excused), shared toggle component, "Can't Make It" flow, absence alert email+SMS, scheduler notification preferences |
| UI/UX consistency audit | 31 | Tappable card patterns, 44px touch targets across all pages, hover-only interactions eliminated, input sizing, heading consistency |
