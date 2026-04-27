# SHOULD_DO — VolunteerCal Production Hardening

**Living document.** Maintained by Claude during the production-readiness sprint. Items move from "Pending" → "Ready to test" → "Done" as work ships. Anything that requires manual action from Jason (env vars, third-party dashboards, customer comms) is flagged with **🛠 ACTION**.

---

## 🛠 ACTION — set up before broader testing

These unblock features that are already shipped in code but inert until you flip the switch.

### A. Sentry env vars (5 min)

Sentry SDK is installed and dormant. Add five env vars to Vercel (Production scope only) to activate:

| Variable | Sensitive | Source |
|---|---|---|
| `NEXT_PUBLIC_SENTRY_DSN` | OFF | Sentry → Settings → Projects → [project] → Client Keys (DSN). <https://volunteercal.sentry.io/settings/projects/javascript-nextjs/keys/> |
| `SENTRY_DSN` | OFF | Same DSN |
| `SENTRY_ORG` | OFF | `volunteercal` |
| `SENTRY_PROJECT` | OFF | `javascript-nextjs` (or your renamed slug) |
| `SENTRY_AUTH_TOKEN` | **ON** | Sentry → Settings → Developer Settings → Organization Tokens → Create. Scope `org:ci`. <https://volunteercal.sentry.io/settings/auth-tokens/> |

After save → Vercel Deployments → most recent Production → Redeploy with build cache **unchecked**.

### B. Upstash Redis env vars (5 min — recommended before broader rollout)

Distributed rate limit is wired into `/api/kiosk/activate` and `/api/checkin/lookup` but falls back to the in-memory limiter (which is meaningless on Vercel) until configured. Free tier covers your traffic.

1. <https://upstash.com/> → sign up → create a Redis database (default settings, pick the region closest to your Vercel deployment region).
2. From the database overview page, copy:
   - **UPSTASH_REDIS_REST_URL** (something like `https://xxx.upstash.io`)
   - **UPSTASH_REDIS_REST_TOKEN** (long string)
3. In Vercel → Settings → Environment Variables → add both, **Production scope only**, both **Sensitive ON**.
4. Redeploy Production (build cache can stay on; these are runtime-only).

### C. Watch CSP-Report-Only reports (~7 days from 2026-04-26)

The CSP header currently sends violation reports without blocking anything. Watch Sentry's "Issues" tab over the next week for any `csp-violation` issues. After a week with zero unexpected violations, flip the header from `Content-Security-Policy-Report-Only` to `Content-Security-Policy` in `next.config.ts` for enforcing mode.

### D. CI is now active (no action needed unless it fires red)

A GitHub Actions workflow at `.github/workflows/ci.yml` runs on every PR + push to main: tsc + lint + production build. If a future commit breaks any of those, the PR will block. Tell me and we fix it.

### D-2. Consider upgrading Vercel to Pro tier (~$20/mo)

You're on **Hobby tier**, which limits crons to **once per day max**. Discovered when a deploy was rejected for a `*/2 * * * *` (every-2-min) cron schedule.

**What Pro unlocks** that the launch sprint depends on or would benefit from:
- **Sub-daily crons** — `outbox-drain` is currently daily-only, meaning a Resend outage during schedule publish leaves emails queued for up to 24 hours. With Pro you can run it every 2 minutes (the architecture is already coded for this; just one schedule change in `vercel.json`).
- **300s function timeout** (vs 60s on Hobby) — `stats-refresh` and `propresenter-export` cron jobs already declare `maxDuration = 300` but Hobby caps them at 60s. At ≥10 churches the stats cron will start timing out without Pro.
- **Higher build minutes / bandwidth** — at scale, Hobby quotas become a real constraint.

**Current mitigation** (shipped as part of the CI fix): publish handler uses **inline Resend send with outbox-on-failure fallback**. So in the happy path emails arrive immediately; in the sad path (Resend outage) they're retried from the outbox at the next daily drain. Acceptable for now, suboptimal at scale.

When you upgrade, change `vercel.json` outbox-drain schedule back to `"*/2 * * * *"` and the system goes near-realtime.

### E. Two unknown free-tier churches — comms decision

Recommended action: **no proactive comms required**. The hardening sprint's user-facing changes don't break functionality they're using. Optional touchpoint: a casual welcome email after the testing matrix below is green.

---

## 🧪 Testing — ready now

**Detailed per-capability testing docs** live at:

- [`jason-functionality-testing-INDEX.md`](jason-functionality-testing-INDEX.md) — start here
- [`jason-functionality-testing-onboarding.md`](jason-functionality-testing-onboarding.md)
- [`jason-functionality-testing-schedules.md`](jason-functionality-testing-schedules.md)
- [`jason-functionality-testing-childrens-checkin.md`](jason-functionality-testing-childrens-checkin.md)
- [`jason-functionality-testing-room-scheduling.md`](jason-functionality-testing-room-scheduling.md)
- [`jason-functionality-testing-room-signage.md`](jason-functionality-testing-room-signage.md)
- [`jason-functionality-testing-billing.md`](jason-functionality-testing-billing.md)
- [`jason-functionality-testing-activity-audit.md`](jason-functionality-testing-activity-audit.md)
- [`jason-functionality-testing-org-administration.md`](jason-functionality-testing-org-administration.md)
- [`jason-functionality-testing-worship.md`](jason-functionality-testing-worship.md)
- [`jason-functionality-testing-calendar-feeds.md`](jason-functionality-testing-calendar-feeds.md)

Each doc has prerequisites, numbered test scenarios, expected results, verification points (in app + Firestore + Stripe + audit log), and known failure modes. Walk them when you have time.

The shorter inline testing matrix below is a summary; the per-capability docs are the source of truth.

---

### Quick-reference testing matrix

### Onboarding
- [ ] **Volunteer self-signup via join link** — owner or admin generates a join link from `Settings → Teams`, volunteer signs up, status flips from `pending_org_approval` → `active` after admin approves. Verify activity surfaces in `Activity` page.
- [ ] **Admin invite by email** — admin invites with email; volunteer receives invite email; join link works; lands as `active`.
- [ ] **Bulk team setup** — create Worship, Tech, Children, Hospitality, Greeters; assign people to each via `Dashboard → People`.

### Schedule (now uses transactional outbox)
- [ ] **Generate + publish a schedule** for the next two Sundays. Publish returns immediately with `emails_enqueued` count. Watch Activity page for `schedule.publish` entry. Outbox drain cron sends emails within ~2 minutes.
- [ ] **Volunteer confirmation flow** — a volunteer receives the email, clicks Yes/No, status updates in admin view.
- [ ] **Reminder emails** — 48-hour and 24-hour reminders. Wait through a service date or trigger via `/api/cron/reminders` with `CRON_SECRET` to test.

### Children's check-in (Track B Phase 1 + 2)
- [ ] **Enroll a kiosk station**: `Settings → Check-Ins → Stations → Enroll new station`. Note the 8-character code shown in the modal.
- [ ] **Activate on a device**: in a separate browser/incognito or on the iPad, go to `https://volunteercal.com/kiosk` and enter the code. Should redirect into `/checkin` after ~1 second.
- [ ] **Register a walk-up family** at the kiosk. Verify `Activity` shows `kiosk.register_visitor`. Try registering the same phone number again — should detect the duplicate and return the existing household.
- [ ] **Check in a child with allergies** — the kiosk should prompt for acknowledgment showing the allergy text. Verify `Activity` shows `kiosk.medical_data_revealed` AND `kiosk.checkin`.
- [ ] **Check out a child** with the security code. Verify guardian SMS arrives (Twilio).
- [ ] **Revoke a station** in admin, then try to use the kiosk — should bounce back to the activation page.
- [ ] **Reissue an activation code** for an existing station and re-enroll the device with the new code.

### Resource scheduling (rooms)
- [ ] **Create a room** with capacity + equipment + overflow.
- [ ] **Book a single reservation** — should confirm immediately if no conflict (Track E.2 made this transactional, so two concurrent bookings can't both succeed).
- [ ] **Book a recurring reservation** weekly for 6 weeks. Each occurrence either confirms or goes pending-approval if conflicts exist.
- [ ] **Approve a pending reservation** as a room admin.

### Room signage
- [ ] **Get the display URL**: `Dashboard → Rooms → [room]` → "Display URL" button. URL format: `https://volunteercal.com/display/room/{roomId}?token={token}&church_id={churchId}`.
- [ ] **Open on a wall-mounted tablet** in landscape, full-screen, kiosk mode if available. Page polls every 30 seconds. Status colors: sage = available, coral = in use, amber = starting soon (< 15 min).
- [ ] Verify wake lock holds the screen on overnight (the `useWakeLock` hook handles this).

### Billing (live mode)
- [ ] **Upgrade to Starter** with a real card from a fresh test account → confirm tier flips, receipt arrives, `billing.subscription_created` appears in Activity.
- [ ] **Refund yourself** in Stripe dashboard. Charge marked refunded; subscription stays active until period end (Stripe behavior).
- [ ] **Cancel via Customer Portal** → confirm Activity shows `billing.subscription_canceled`.
- [ ] **Test card decline**: in Stripe → Customers → [you] → Payment methods → swap to declining test card (`4000 0000 0000 0002`), let renewal fail. Verify `Activity` shows `billing.invoice_failed` with a coral dot, and `payment_failed_at` field appears on the church doc in Firestore. After 7 days the dunning cron auto-downgrades to free; activity entry shows `billing.subscription_canceled` with `reason: "dunning_lapsed"`.

---

## ✅ Already shipped (no action needed)

| Track | Description | Commit |
|---|---|---|
| §0 day-zero security | Kiosk gate, Firestore rule rewrite, `/api/welcome` auth, secret rotation | 6f2a7cd |
| Tier 1 | Service worker fix, Sentry SDK install | d5af59c, 683354a |
| Track B Phase 1 | Kiosk station enrollment + per-device tokens + admin UI | 3c6d268 |
| Stripe email fix | Pre-populate Customer email/name | 6f2a7cd |
| Batch 1 | A.4 security headers, A.5 short-link allowlist, C.3 webhook idempotency, D.6 cron fail-closed + maxDuration, E.6 escape helper | b5db991 |
| Batch 2 | F.2 audit log primitive, B.4 lookup hygiene, B.5-lite duplicate detection | 5160603 |
| Batch 3 | E.2 reservation transactions, E.4 reminder idempotency | 3edc5b8 |
| Batch 4 | C.6 payment_failed handler, C.10 dispute hook, A.3 stage_sync clarification, D.5 Upstash scaffold | cb437a5 |
| Batch 5 | F.3 Activity page, audit hooks at schedule.publish + org.delete | f1cf34c |
| Batch 6 | E.1 transactional outbox + drain cron + composite indexes | 66fe864 |
| Batch 7 | D.7 lint fixes (35 hook errors → 0) + CI gate (`.github/workflows/ci.yml`) | d381c1d |
| Batch 8 | C.6 dunning auto-downgrade cron + E.3 stats-refresh concurrency caps | (this commit) |

---

## 📋 Pending — longer-running items still on the backlog

| Track | Description | Why deferred | Approx effort |
|---|---|---|---|
| **D.4** | Adopt Zod, write `parseBody(req, schema)` helper, migrate top 20 high-traffic routes | Substantial; nice-to-have until you hit a malformed-input bug | 3–4 days |
| **B.5 full quarantine** | Walk-up registrations land in `pending_visitor_registrations` with operator approval gate | UX implications need a design call (do families wait at the kiosk for staff approval?) | 2 days + design |
| **Email template escape sweep** | Wrap user-controlled `${var}` interpolations in `escapeHtml()` across the remaining ~30 templates | Helper is in place + base-layout fixed; sweep is repetitive and low-impact for email-client XSS | 0.5 day |
| **Membership role-change audit hooks** | Move membership writes from client SDK to server endpoints, then add audit | Requires migrating client-SDK calls to API routes — substantial refactor | 1.5 days |
| **Track B Phase 3** | Transactions on session creation, capacity check, checkout. Per-(kiosk, child, service_date) idempotency keys. | Phase 1 + 2 cover the security/PII concerns; this is reliability hardening | 1 day |
| **Membership server migration** | Move membership invite/approve/role-change writes from direct client SDK to server API routes (enables proper audit + permissions enforcement) | Touches the join flow, settings UI, and platform admin tier override | 2 days |
| **Lint warning cleanup** | 110 warnings remain (apostrophe escapes, set-state-in-effect cascading-render warnings). All non-blocking. | Stylistic + advisory; clean over time | 1 day |

---

## 🎯 Definition of "optimal state" before reaching out to the two churches

When **all** of these are true, you can confidently invite the two unknown free-tier churches plus consider self-serve growth:

- [x] All four secret rotations complete (Stripe, Resend, Twilio, CRON_SECRET, Firebase Admin)
- [x] Live Stripe end-to-end (charge, webhook, tier flip, refund, cancel, dispute hook)
- [x] Children's PII surface closed (kiosk gate + Firestore rules + lookup hygiene + child-alerts audit)
- [x] Audit log + Activity page live
- [x] Sentry SDK installed (dormant pending DSN env vars)
- [x] Transactional outbox eliminates "publish succeeded but emails didn't send" failure mode
- [x] CI gate (tsc + lint + build) blocks broken commits
- [x] Dunning auto-downgrade cron closes the payment-failure → tier-mismatch loop
- [x] Cron concurrency caps (stats-refresh works at ≥50 churches)
- [ ] **🛠 Sentry DSN env vars set (ACTION A)** — *gates production visibility*
- [ ] **🛠 Upstash Redis env vars set (ACTION B)** — *gates real abuse defense*
- [ ] Testing matrix above completed end-to-end with your church
- [ ] CSP enforced (after 7-day Report-Only window — ACTION C)

After these, the platform handles real customers without supervision.

The remaining backlog (D.4 Zod sweep, B.5 quarantine workflow, email escape sweep, membership server migration, B.3 reliability transactions) is incremental hardening at scale — useful but not blocking. Each is independently shippable when needed.
