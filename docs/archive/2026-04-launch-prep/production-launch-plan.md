# VolunteerCal — Production Launch Plan

**Status:** Awaiting your review and approval. Nothing executes until you give the go-ahead.
**Owner:** Jason (primary dev) + Claude (paired execution).
**Context:** Your team is using the app. Two unknown churches have already signed up for free accounts — they may be sitting on the kiosk PII surface and broad Firestore rules right now. Stripe is linked to your bank but not yet exercised end-to-end in live mode. Goal: get to a real production posture fast, without rewriting the product.

---

## 0. Day-zero triage (run *immediately* on approval — before any other work)

These four steps neutralize the highest-impact exposures while we build the durable fixes. Total time: under one hour.

| # | Action | Why now | Done when |
|---|---|---|---|
| 0.1 | Add a hard `requireKioskToken` stub that rejects `/api/checkin/lookup`, `/checkin`, `/register`, `/checkout`, `/room`, `/room-checkout`, `/services`, `/print`, `/printer-config`, `/vcard` with 401 unless `X-Kiosk-Token` header is present | The two free-signup churches almost certainly have not enabled check-in yet, so a 401 is harmless. If either has, you'll see it in Sentry within minutes and we issue them a kiosk token immediately. | Routes return 401 without token; no caller broken in production logs |
| 0.2 | Patch `firestore.rules` to remove the catch-all `match /{subcollection}/{docId}` and replace with explicit per-collection rules, defaulting sensitive ones (`children`, `households`, `feedback`, `audit_logs`, `billing`) to Admin-SDK-only | Single rule that today exposes child/household PII to any active volunteer | `firebase deploy --only firestore:rules` succeeds; emulator tests (added in track A) confirm denial |
| 0.3 | Disable `/api/welcome` (return 410 Gone) and move welcome-email send into the post-registration server flow | Open Resend relay; sender-reputation timebomb | Endpoint returns 410; signup still receives welcome email |
| 0.4 | Rotate Stripe (live + test), Resend, Twilio, `CRON_SECRET`, and the Firebase Admin private key. Re-issue via Vercel env vars, scoped Production / Preview / Development | Even if `.env.local` is not in git history, secrets that have ever been in dev environments should be rotated before production launch. Cheap insurance. | All four providers' dashboards show new keys; Vercel envs updated; deploy passes; webhooks reverify |

These four are the ones I will do first, in this order, the moment you approve. Nothing in tracks A–H below depends on them being skipped.

---

## 1. Track A — Security & tenant isolation lockdown

**Goal:** every multi-tenant boundary enforced at the database, not the API or UI.

| # | Task | Files | Done when |
|---|---|---|---|
| A.1 | Rewrite `firestore.rules` collection-by-collection with default-deny. Sensitive collections (`children`, `households`, `attendance`, `feedback`, `audit_logs`, `billing`, `kiosk_tokens`, `notification_outbox`) become Admin-SDK-only. Volunteer-readable only: `service_plans`, `ministries`, own `assignments`. Admin-readable: `people` directory, `reservations`, `settings` | `firestore.rules` | Emulator tests pass |
| A.2 | Add Firestore emulator unit tests via `@firebase/rules-unit-testing` covering: volunteer cannot read children, volunteer cannot read other-tenant data, volunteer reads only own assignments, admin reads all but billing, owner-only billing, kiosk_tokens admin-only | `tests/firestore.rules.test.ts`, `package.json` | `npm test` passes |
| A.3 | Tighten `facility_groups`, `stage_sync_live`, `waitlist`, `members` rules: scope to membership; route `waitlist` writes through a server route with Cloudflare Turnstile | `firestore.rules`, new `/api/waitlist/route.ts` | Anonymous write fails; Turnstile gate works |
| A.4 | Add security headers in `next.config.ts`: HSTS, X-Content-Type-Options, Referrer-Policy, Permissions-Policy, CSP-Report-Only initially | `next.config.ts` | `curl -I` shows headers; CSP reports collected for one week before enforcement |
| A.5 | Lock down `/api/short-links`: relative paths only by default, optional per-org external allowlist, audit-log external creations, interstitial warning page for external destinations | `src/app/api/short-links/route.ts`, `src/app/s/[slug]/page.tsx` | External URL stored without allowlist returns 400; allowlisted URL shows interstitial |
| A.6 | Stop service worker caching authenticated nav: remove `/dashboard` from `STATIC_ASSETS`, drop the navigation cache write, clear caches on logout | `public/sw.js`, `src/lib/context/auth-context.tsx` | After logout, hard reload offline shows offline page, not stale dashboard |

---

## 2. Track B — Kiosk trust model (children's check-in)

**Goal:** check-in becomes an authenticated subsystem with revocable, scoped device tokens. This is the highest-liability surface in the product.

| # | Task | Done when |
|---|---|---|
| B.1 | Define `KioskToken` type + `kiosk_tokens` Firestore collection (Admin-SDK-only). Fields: `token_id`, `token_hash`, `church_id`, `station_id`, `created_by_uid`, `scope[]`, `created_at`, `last_used_at`, `revoked_at`, `expires_at` | Type added; collection rule denies client access |
| B.2 | Build kiosk activation: admin Settings → Check-in → Stations creates a station + one-time activation code (10 min TTL). Kiosk page consumes the code once, receives a long-lived token + device id, stores it in localStorage. Token presented as `X-Kiosk-Token` header on every request | Admin can enroll a kiosk and revoke it from Settings; revoked kiosk fails next request |
| B.3 | Add `requireKioskToken(req, scope)` to `src/lib/server/authz.ts`. Apply to all `/api/checkin/*` routes (lookup, checkin, checkout, register, room, room-checkout, services, print, printer-config, vcard). Server uses kiosk's bound `church_id`; **ignores any client-supplied `church_id`** | All check-in routes 401 without a valid kiosk token; kiosk only operates against its own church |
| B.4 | Lookup response hygiene: never return allergies or medical notes from `/lookup`. Reveal them only after operator has selected a specific child via `/checkin` (which audits the access). Tighten `phone_last4` to require last-4 + first-name initial; add per-(kiosk, identifier) Upstash rate-limiting | Lookup returns name + room only; medical/allergy data only served by `/checkin` and audit-logged |
| B.5 | Move household/child writes through a "pending" workflow: `/api/checkin/register` writes to `pending_visitor_registrations` (kiosk-token-scoped). Operator confirms/promotes from a queue inside the dashboard. Add duplicate detection (normalized phone + name) | Walk-up family registration is reviewable before becoming durable child/household records |
| B.6 | Wrap session creation, capacity check, security code generation, and checkout in Firestore transactions. Add per-(kiosk, child, service_date) idempotency keys. Stop swallowing partial failures; surface them to operator UI | Concurrent check-in test produces exactly one session per child |
| B.7 | Audit-log every kiosk action: enrollment, token rotation, lookup, checkin, checkout, register, sensitive-field reveal, security-code failure. Build admin Activity view filtering on church/kiosk/action | Admin can answer "who checked Sarah in at 9:08am, on which kiosk" |

**Migration safety:** the two existing churches almost certainly have not stood up kiosks yet. Add a one-line note in the admin onboarding when check-in features are first opened explaining the new station enrollment.

---

## 3. Track C — Stripe live-mode readiness

**Goal:** real customers can subscribe, manage, and be billed reliably. Bank is already linked; we need the rest of the chain to be production-grade.

| # | Task | Done when |
|---|---|---|
| C.1 | Mirror all test-mode Products + Prices in **live mode**. Confirm tier names, monthly+annual prices, free tier metadata. Lock prices using Stripe's Recommended Lookup Keys so code references keys, not price IDs | Live dashboard shows the same tier matrix as test |
| C.2 | Live-mode webhook endpoint: register `/api/billing/webhook` in Stripe live dashboard. Capture the **live** signing secret (different from test). Add `STRIPE_WEBHOOK_SECRET_LIVE` to Vercel Production env. Code selects the correct secret by `process.env.NODE_ENV` or by matching event signature | Webhook test event from Stripe live dashboard reaches handler with valid signature |
| C.3 | Idempotency on every Stripe-triggered side effect (subscription create/update/cancel, invoice paid/failed). Store `event.id` in `stripe_processed_events` with TTL; refuse duplicate processing. Stripe retries are common — this prevents double-applied tier upgrades | Replaying a webhook event 5x changes nothing on the second hit |
| C.4 | Customer Portal configured in live mode: enabled actions (update payment method, cancel, switch plan, see invoices). Branded with VolunteerCal logo + colors. Configurable cancellation reason capture | Owner can self-serve cancel from portal; cancellation triggers the in-app downgrade flow |
| C.5 | Tier enforcement audit. Every paid feature checks `church.tier` server-side via a single `assertTierAtLeast(churchId, tier)` helper. Document the tier matrix (free vs. paid vs. enterprise) explicitly in `src/lib/billing/tiers.ts`. Free-tier churches (the two that already signed up) get no paid features by default | Test suite: a free-tier church creating a paid-only resource gets 403 |
| C.6 | Dunning + grace period: on `invoice.payment_failed`, send templated email and start a 7-day grace; on day 8, downgrade to free tier (don't delete data). Use `notification_outbox` (track E) for delivery | Simulating a failed-card scenario in test mode walks through the grace + downgrade |
| C.7 | Tax: enable Stripe Tax in live mode. For US SaaS, configure tax behavior on Prices and customer address collection in Checkout. (If you're not ready to collect sales tax across states yet, document in your Terms that prices are tax-exclusive and revisit at $X/month MRR threshold.) | Checkout collects address; invoices show tax line where applicable |
| C.8 | Receipt + invoice email enabled in Stripe live settings. Confirm `from`, `reply-to`, and that they pass SPF/DKIM through Stripe's domain (separate from your Resend reputation) | Test purchase produces a Stripe receipt + invoice PDF |
| C.9 | Live-mode end-to-end smoke test: create a fresh church, upgrade to paid via real card (refund yourself), confirm webhook firing, confirm tier enforcement flips on, downgrade via portal, confirm tier flips off, confirm `audit_logs` entry on each transition | Manual run-through documented in `docs/stripe-runbook.md` |
| C.10 | Disputes/chargeback hook: on `charge.dispute.created`, log to `audit_logs`, email you, and freeze paid features for that org pending review (don't auto-cancel — let humans decide) | Simulated dispute event triggers freeze + alert |

---

## 4. Track D — Authorization, validation, rate-limiting library

**Goal:** the same enforcement layer everywhere, so feature work in month 2+ doesn't reintroduce the holes month 1 fixed.

| # | Task | Done when |
|---|---|---|
| D.1 | Create `src/lib/server/authz.ts` with: `requireUser`, `requireMembership(req, churchId, minRole)`, `requirePlatformAdmin`, `requireCronSecret` (fail-closed), `requireKioskToken`, `requireStripeWebhook`. All return `NextResponse | AuthedX`; consistent 401/403 shapes | Library compiles; unit tests pass |
| D.2 | Migrate the high-risk routes first (in this order): all `/api/checkin/*`, `/api/billing/*`, `/api/cron/*`, `/api/invites/*`, `/api/memberships/*`, `/api/orgs/[id]/delete`, `/api/platform/*`, `/api/schedules/[id]/publish`, `/api/reservations/*`, `/api/short-links/*`, `/api/welcome` (or its replacement) | These ~30 routes use only library helpers, no inline `verifyIdToken` |
| D.3 | Sweep remaining ~100 routes route-by-route over one focused week. Each PR replaces inline auth with library calls and includes a checklist comment (auth ✓, authz ✓, schema ✓, rate-limit ✓, audit ✓) | Inline `verifyIdToken` count = 0 outside the library |
| D.4 | Adopt `zod`. Add `parseBody(req, schema)` and `parseQuery(req, schema)` helpers. Define schemas in `src/lib/schemas/*.ts` (one file per domain). Migrate the 30 high-risk routes from D.2 to use schemas first; sweep the rest with the route-by-route migration | Untyped `await req.json()` count drops to <10 |
| D.5 | Replace in-memory rate limiter with **Upstash Redis** (free tier covers our needs). Composite keys: `(IP, uid|kiosk_id, route, identifier)`. Tightest buckets on `/api/checkin/*`, `/api/welcome` replacement, login, password reset, calendar token misses | `src/lib/utils/rate-limit.ts` deleted; `src/lib/server/rate-limit.ts` used everywhere |
| D.6 | Centralize cron protection with `requireCronSecret` (fail-closed: missing env returns 503; mismatch returns 401; uses `timingSafeEqual`). Migrate all `/api/cron/*` routes. Remove or implement the `/api/cron/songselect-sync` referenced in `vercel.json:12` | Cron route returns 503 with no `CRON_SECRET`; vercel.json has no dangling references |
| D.7 | Fix the lint hook-order errors that are blocking us from making lint a CI gate. Add CI workflow: `tsc --noEmit`, `eslint --max-warnings=0`, `npm test`, `firebase emulators:exec ... rules tests`. Vercel "Ignored Build Step" enforces the same | Failing lint blocks PR merge |

---

## 5. Track E — Reliability (outbox, transactions, crons)

**Goal:** message delivery, scheduled work, and conflict-prone writes become retry-safe.

| # | Task | Done when |
|---|---|---|
| E.1 | **Transactional outbox.** Add `notification_outbox` collection (Admin-only). Schedule publish, invite, reminder cron, billing-state changes, kiosk-related notifications all write to the outbox in the same Firestore batch as the business write. A separate cron drains every minute, marks `sent` / `failed` (with `attempts` counter and exponential backoff), dead-letters after 5 failures | Killing Resend mid-publish does not lose any volunteer notification once Resend recovers |
| E.2 | Reservation transactions. Wrap `findConflicts` + write in `adminDb.runTransaction`. For recurring reservations, write a parent `reservation_groups` doc and atomically commit all occurrences or roll back. Add idempotency key support via `Idempotency-Key` header | Concurrent booking test produces exactly one reservation; recurring rollback restores zero rows |
| E.3 | Cron hardening. Add `export const maxDuration = 300` to all cron routes (confirm Vercel plan supports it). Bound all collection scans with `limit()` + cursor. Process churches in parallel chunks via `p-limit(8)`. Persist progress in a `cron_runs` collection (started_at, completed_at, status, processed, failed) for visibility | Stats refresh on a 50-church simulation finishes inside 5 min and shows a `cron_runs` record |
| E.4 | Reminder idempotency. Replace the `reminder_sent_at` array-append pattern with per-(assignment, kind, channel) boolean flags written inside a Firestore transaction *after* a successful outbox enqueue. A retried cron invocation no-ops on already-sent flags | Replaying the reminder cron twice in a row sends zero duplicate emails |
| E.5 | Move repair logic out of `GET /api/people-data`. GETs become read-only. Repair logic moves to either an explicit `POST /api/people-data/repair` (admin-only) or a daily background cron | GET handler does no writes; explicit repair endpoint exists |
| E.6 | Email-template HTML escape. Single `escapeHtml(value)` helper applied at every interpolation in `src/lib/utils/emails/`. Enforced by ESLint rule: `no-restricted-syntax` flagging `${...}` inside `.html` template strings without `escapeHtml` | All email templates pass the lint rule |

---

## 6. Track F — Observability, audit, comms

**Goal:** when something goes wrong, you find out within minutes and can answer "what happened" with data.

| # | Task | Done when |
|---|---|---|
| F.1 | Install Sentry (`@sentry/nextjs`). Wrap `src/lib/server/authz.ts` errors with `Sentry.captureException`. Add `Sentry.checkIn` start/end pings to every cron route, with monitor IDs in Sentry's Cron Monitoring UI. Slack/email alerts on missed runs and on any critical error | Sentry dashboard shows live errors; missed cron pages on Slack |
| F.2 | `src/lib/audit.ts` writing append-only to `audit_logs`. Hooks at: schedule publish/unpublish, role change, member invite/approve/remove, billing tier change, exports, platform-admin tier override, kiosk enrollment/revocation, kiosk lookup with sensitive-data reveal, child/household edit, short-link external creation, org delete | `audit_logs` populated by all 12 hooks |
| F.3 | Owner-visible Activity page in Settings: paginated, filterable on actor / action / target / date. Uses `audit_logs` with admin-only Firestore rule. (This also becomes a sales asset for procurement conversations.) | Owner can view the last 90 days of org activity |
| F.4 | Replace `console.*` with `src/lib/log.ts` thin wrapper that emits structured JSON and (in production) routes errors through Sentry. Mass-edit can happen incrementally; new code uses the wrapper | New PRs forbid `console.*` via lint rule |
| F.5 | **Communication to existing free-tier churches.** Draft + send: short email explaining "VolunteerCal is in early access; we're rolling out a security-hardening update over the next 2 weeks. You may see new check-in setup steps if you use that feature. Email Jason with any concerns." Sent from `info@volunteercal.com`, individually | Two emails sent; replies tracked |
| F.6 | Add a status / changelog page (`/status` or `/changelog`) that Owner-role users see linked from Settings. Use it to publish the security improvements as they land — turns hardening into customer-facing confidence | Page deployed; entries dated |

---

## 7. Track G — Functional verification matrix

**Goal:** explicitly walk every planned feature end-to-end in live mode and document pass/fail. This is the "all functionality fully and reliably operational" gate from your brief.

For each row: run the happy path + one failure path on the **production deployment** with a throwaway live church. Mark pass only when both work and an `audit_logs` entry was written where applicable.

| Feature | Happy path | Failure path | Owner |
|---|---|---|---|
| Sign up + email/pw login | Create org, receive welcome email | Wrong pw, password reset, magic-link join via invite | Jason |
| Volunteer invite + join | Admin invites; volunteer accepts; lands in correct org | Expired invite, wrong-email join | Jason |
| Schedule create → publish → notify | Generate schedule; publish; emails arrive | Mid-publish Resend outage (manual block) — outbox recovers | Jason |
| Volunteer self-service availability | Set unavailability; scheduler sees it during draft | Concurrent edit conflict | Jason |
| Children's check-in (kiosk) | Enroll station; lookup; check in; print label; check out | Concurrent check-in same child; kiosk token revoked mid-session | Jason |
| Room reservation | Create, recurring, conflict prevention | Two admins booking same room same time | Jason |
| Calendar feed (iCal) | Subscribe in Apple Cal / Google Cal; updates show within revalidation window | Token rotation invalidates old subscriptions | Jason |
| Short links | Internal redirect works; external requires allowlist + interstitial | Disallowed external URL rejected | Jason |
| Stripe checkout → upgrade | Free → paid; tier enforcement flips on | Card declined; dunning grace; auto-downgrade at day 8 | Jason |
| Stripe customer portal | Update payment method; cancel | Canceled mid-cycle; tier persists until period end | Jason |
| Stripe webhook idempotency | Replay event; nothing changes | Webhook signature mismatch | Jason |
| Notifications inbox | New event creates inbox entry; mark-as-read works | High-volume churn (50 notifications) doesn't break UI | Jason |
| Reminders cron | Scheduled volunteer receives 48h + 24h reminder | Cron retried mid-run; zero duplicate sends | Jason |
| Stats refresh cron | Daily run completes inside 5 min for 50 simulated churches | One church's data corrupted — others still complete | Jason |
| Worship planning + ProPresenter export | Cron exports plan; file delivered | Export failure flagged in `cron_runs` | Jason |
| Audit log | Sensitive ops appear with correct actor | Owner-only access enforced | Jason |
| Account / org deletion | Owner deletes org; all collections + Storage purged; Stripe canceled; receipts retained | Owner with active subscription must cancel first | Jason |

The matrix lives in `docs/launch-verification.md` and is signed off by you before public messaging changes.

---

## 8. Track H — UX / a11y / performance polish

These don't gate launch but should land in the same window because they materially improve perceived quality and reduce future support load.

| # | Task | Done when |
|---|---|---|
| H.1 | a11y on form primitives: `Input`, `Select`, `Textarea` link errors via `aria-describedby` + set `aria-invalid` + stable error IDs | axe-core finds zero `aria-invalid` violations on login/register/settings |
| H.2 | Restore visible focus on every interactive element (no naked `focus:outline-none`); add focus trap to `Drawer` and any modal | Keyboard-only walkthrough of dashboard works |
| H.3 | Contrast pass on coral-on-warm-bg: introduce a `vc-coral-deep` token and use it for text on warm backgrounds | All text passes WCAG AA |
| H.4 | Bottom-nav icon-only links get `aria-label`s; one h1 per page (fix dashboard double-h1) | Lighthouse a11y ≥ 95 on dashboard home |
| H.5 | Server Components for dashboard home + 4 most-trafficked admin pages. Initial data load is server-side; interactive widgets stay as `"use client"` islands. Aggregations come from `church_stats` summary docs maintained by writes (or `count()` queries where cheap) | Dashboard home initial JS payload reduced ≥40%; Firestore reads per dashboard load drop ≥70% |
| H.6 | Replace raw `<img>` for uploaded photos with `next/image`; configure Firebase Storage bucket in `images.remotePatterns`. Lazy-load Recharts and `react-easy-crop` via `dynamic()` | LCP on dashboard ≤ 2.5s on simulated 4G |
| H.7 | Auto-dismiss the dashboard setup guide after `allDone` or after 3 sessions; warmer "no organization" empty state | Returning admins on day 10 don't see "2/7" |
| H.8 | Resolve terminology: pick "Teams" or "Ministries" user-facing; document in `CLAUDE.md` that DB collection name `ministries` ↔ UI term [chosen]. Same for Service / Event | One-page glossary added to `CLAUDE.md` |

---

## 9. Definition of "Production Ready" — acceptance gate

We declare launch-ready when *all* of these are true. This is the green-light checklist:

- [ ] All P0 items in §0–§3 complete (security, kiosk, Stripe live).
- [ ] Authz library used by every non-public route (D.2 + D.3 sweep complete).
- [ ] Firestore emulator rule tests passing in CI; lint passing in CI; tsc passing in CI.
- [ ] Sentry receiving events; one cron monitor active per cron route; on-call alerting goes somewhere a human reads.
- [ ] `audit_logs` collection populated by at least 12 critical hooks (F.2).
- [ ] Stripe live-mode end-to-end run documented in `docs/stripe-runbook.md` with successful upgrade, downgrade, dunning, dispute hook.
- [ ] All 17 rows in §7 verification matrix marked pass.
- [ ] Two existing free-tier churches notified (F.5) and unbroken by the rollout.
- [ ] `next.config.ts` security headers deployed; CSP report-only running for ≥ 7 days with reports reviewed before flipping to enforcing.
- [ ] Backups verified: Firestore exports scheduled (Cloud Scheduler → Firestore export to Storage daily, retained 30 days); restore procedure exercised once.
- [ ] Privacy/Terms updated to reflect: data retention, sub-processors (Stripe, Resend, Twilio, Firebase, Vercel, Upstash, Sentry), child-data handling under COPPA/equivalent. (This is a one-page legal task — share draft, then we plug it in.)

---

## 10. Sequencing & ownership

I'll execute in this order, fastest path to production-ready:

1. **§0 day-zero triage** (1 hour) — first 4 commits
2. **Track A.1 + A.2** Firestore rules + emulator tests (1 day)
3. **Track D.1 + D.6** authz library skeleton + cron hardening (1 day)
4. **Track B.1–B.4** kiosk model + lockdown (2–3 days)
5. **Track F.1 + F.2** Sentry + audit log primitive (1 day)
6. **Track C.1–C.10** Stripe live readiness (2 days, parallelizable with D.5/E.1)
7. **Track D.5 + E.1** Upstash + outbox (2 days)
8. **Track D.4 + E.2–E.6** Zod + reservation tx + cron polish (2–3 days)
9. **Track B.5–B.7** kiosk pending registration + transactions + audit (2 days)
10. **Track A.3–A.6** remaining security items (1 day)
11. **Track D.2 + D.3** authz route migration (3–4 days, can interleave)
12. **Track G** functional verification matrix (1 day with you walking through it)
13. **Track H** polish (2–3 days, parallel with verification)
14. **Track F.5** customer comms once we're feature-frozen on the rollout

Whole window is roughly **3 weeks of focused work**. I will surface blockers daily via short status updates so you can redirect priority.

---

## What I need from you to proceed

1. **Approve this plan** (or redline anything you want to change).
2. **Confirm Stripe access:** I'll need you to add me (or run alongside me) for live-mode dashboard configuration in track C, since I shouldn't have those credentials.
3. **Confirm UX terminology choices** that need a human call: Teams vs. Ministries (H.8), and the Free-tier feature matrix (C.5).
4. **Confirm the customer comms tone** (F.5) — do you want me to draft, or do you write that one yourself?
5. **A throwaway bank-test transaction budget** (~$20) for the live-mode end-to-end smoke test in C.9. We'll refund yourself; Stripe will keep ~$0.30 in fees per round-trip.

Everything else is mine to execute on your go-ahead.
