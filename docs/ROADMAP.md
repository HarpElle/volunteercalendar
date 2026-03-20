# VolunteerCal — Roadmap

_Last updated: March 2026 (after Phase 22)_

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
- [ ] Test public pages: landing, pricing, join page, event signup, short link resolver
- [ ] Test invite flow: admin sends invite → recipient receives email → clicks accept → appears in People
- [ ] Test event lifecycle: create event → add role slots → publish signup link → volunteer signs up → view roster → mark attendance
- [ ] Set up Firestore daily backup (Google Cloud Console → Firestore → Backups)
- [ ] Review Firestore security rules in production console

---

## 3. Post-Launch Development Priorities

### High Priority (before 10 paying orgs)

| Item | Notes |
|------|-------|
| Firebase App Check | Prevent API abuse from non-app clients |
| Error monitoring (Sentry) | Catch production errors before users report them |
| Migrate remaining client-SDK routes to Admin SDK | `api/export`, `api/billing/portal`, `api/billing/checkout` still use client-side `db` |
| Add role validation to notification routes | `api/notify`, `api/welcome`, `api/notify/org-created`, `api/notify/role-change`, `api/notify/membership-approved`, `api/notify/welcome-to-org` — verify Bearer token but don't check membership role |
| Annual billing option | Create annual Stripe Price objects, billing interval toggle UI, discount logic — then re-add "save 20%" copy |
| Household linking UI | Algorithm already handles household constraints; needs UI for admins to define household groups |

### Medium Priority (before 50 paying orgs)

| Item | Notes |
|------|-------|
| Substitution engine | Allow volunteers to request subs; notify eligible replacements |
| Additional workflow modes | Ministry-first, hybrid, self-service (defined in constants, setup wizard saves choice, but only centralized is active) |
| Overage pricing / usage-based billing | Enforce tier limits on API side, auto-prompt upgrade |
| Pagination for large collections | Volunteers list, events list, assignment history — currently loads all |
| Denormalize signup counts | Write `active_signup_count` on Event docs via Cloud Function trigger |

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
- **No substitution requests** — Volunteers can self-remove but can't request a substitute
- **No push notifications** — Reminders are email + SMS only
- **English only** — No i18n/localization
- **Single timezone per org** — All services/events use the org's configured timezone
- **Rate limiting is in-memory** — Resets on serverless cold starts (Vercel). Sufficient for beta; consider Redis-backed rate limiting at scale.
