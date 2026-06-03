# VolunteerCal — Feature Status (codebase-driven)

Last updated: 2026-06-02 (Jason corrections + Check-In feedback batch)

> **Single source of truth.** Every entry is verified against actual
> code, not against `docs/ROADMAP.md` or any other markdown. When
> something ships, this doc gets updated in the same PR.
>
> **Statuses:**
> - ✅ **Shipped** — code is in `main`, behavior is live in prod
> - 🟡 **Partial** — some code exists but the feature isn't complete; what's missing is listed
> - ⬜ **Not started** — no code path exists yet
> - 🔒 **Blocked external** — code-ready (or N/A) but waiting on a third party

---

## Billing & Payments (Stripe)

| Status | Item | Evidence |
|---|---|---|
| ✅ | Live mode wiring (env + lazy SDK init) | `src/lib/stripe.ts:20-51` |
| ✅ | Monthly billing | `src/lib/stripe.ts:67-71`, `/api/billing/checkout` |
| ✅ | **Annual billing tier** (lookup keys `starter_annual` etc.) | commit `42d085c`, `src/lib/stripe.ts:67-71` |
| ✅ | Customer portal | `/api/billing/portal` |
| ✅ | 14-day free trial | `/api/billing/checkout` lines 72-77 |
| ⬜ | Overage / usage-based billing | post-launch, trigger when usage patterns emerge |

**Live mode is on.** HarpElle LLC + business bank account were set up over a month ago. Stripe live keys are in env. The 20% annual discount copy is wired. **Do NOT relist LLC/bank/live-mode as blockers.**

---

## SMS (Twilio)

| Status | Item | Evidence |
|---|---|---|
| ✅ | `sendSms()` helper wired to Twilio API | `src/lib/services/sms.ts:23-83` (live calls, not stubbed) |
| ✅ | `TWILIO_FROM_NUMBER` env validation | `src/lib/services/sms.ts:26-34` |
| ✅ | Phone normalization | `src/lib/utils/normalize-phone.ts` |
| ✅ | Reminder cron uses SMS | `/api/cron/reminders` → `/api/reminders` |
| ✅ | Absence + swap urgent paths use SMS | `/api/notify/absence`, swap routes |
| 🟡 | Opt-out compliance table | Validation in place; no STOP-keyword storage table. Twilio handles native STOP/UNSUBSCRIBE — verify in their console |

---

## Email (Resend)

| Status | Item | Evidence |
|---|---|---|
| ✅ | All sends use `from: "... via VolunteerCal <noreply@harpelle.com>"` | Resend Free plan = one verified domain; harpelle.com is the verified one. Recipients still see the **church name** as the sender label, so the volunteercal.com brand isn't required in the from address. Decision logged here so we stop revisiting it |
| ✅ | All 23 transactional templates exist | `src/lib/utils/emails/*.ts` |
| ✅ | W11-C church-logo header (high-priority callers) | `src/lib/utils/emails/base-layout.ts`, 6 callers wired |
| ⬜ | W11-C remaining callers (welcome, invite, role-promotion, etc.) | Template interfaces wired; callers still pass nothing → render text-only headers. ~10 routes to wire |
| 🔒 | volunteercal.com domain verification | Would require paid Resend plan; no business reason to switch |

---

## Authentication (Firebase Auth)

| Status | Item | Evidence |
|---|---|---|
| ✅ | Email/password sign-in only | `src/lib/firebase/auth.ts` (`signInWithEmailAndPassword`) — no OAuth providers |
| ✅ | Safari ITP fix — Firestore long-polling fallback | `src/lib/firebase/config.ts:28-51` (commit `1695848`, `experimentalAutoDetectLongPolling`) — **this IS the canonical Firebase fix** |
| 🟡 | Auth-state circuit-breaker (watchdog timeout) | In progress this turn — surfaces an error instead of infinite spinner if `onAuthStateChanged` never fires |
| ❌ | ~~Custom auth domain `auth.volunteercal.com`~~ | **Tried and discarded** — custom auth domain helps OAuth redirects; we're on email/password where it doesn't apply. Don't re-suggest this |

---

## Wave 10 — Check-in / Family Pass

| Status | Item | Evidence |
|---|---|---|
| ✅ | Apple Wallet family pass — generation + signed URL + branded strip | `/api/wallet/family-pass`, `src/lib/server/wallet-pass/*` |
| ✅ | W10-5A-UI: parent + kiosk surfaces consume the pass | Wave 10 sub-PRs (#208 etc.) |
| ✅ | Kiosk QR scan accepts wallet pass | W10-5A-UI C, PR #210 |
| ✅ | **Wallet pass IS persistent per household** (Jason confirmed 2026-06-02) | Stable `serialNumber = household_id` (`src/lib/server/wallet-pass/builder.ts:257`), stable `auth_token` cached in `wallet_passes` collection. Security code rotates per check-in but isn't on the pass. |
| 🔒 | **Google Wallet pass** | Code-ready; waiting on Google Issuer approval (your application is in) |
| ✅ | **Wallet pass location-aware** (geofence: pass auto-appears on iPhone lock screen when parent pulls into the church parking lot) | Shipped — `/api/wallet/family-pass/route.ts` now threads each Campus's stored `location.lat/lng` (already captured via Google AddressAutocomplete) into the Apple Wallet `locations` array. Up to 10 campuses (Apple's hard limit, well above any real church). relevant_text reads "Check in at {campus name}". |
| ⬜ | **Wallet pass auto-update on household changes** (name change, grade change, new child) | Currently passes are static — parent must re-download to refresh. To implement: PassKit web service endpoints + APNs push + device-token Firestore schema. Rough scope: 3-4 days. Worth queuing as a real feature; not blocking. |
| 🟡 | **Remote child check-in** (parent initiates pre-arrival) | Current portal is **post**-check-in only (`/api/checkin/guardian-portal-url`). A pre-arrival deep-link flow is the missing piece. Could partially happen as a side effect of the location-aware pass + a one-tap "Pre-check us in" button on the parent's phone |

---

## Wave 11 — Org Branding

| Status | Item | Evidence |
|---|---|---|
| ✅ | A — Settings upload + Firebase Storage | PR #212 |
| ✅ | B — Wallet pass uses church logo | PR #213 |
| ✅ | C — Email headers use church logo (high-priority callers) | PR #222 |
| ✅ | D — Kiosk + parent portal use church logo | PR #214 |
| ⬜ | Dark-mode logo variant | Deferred — single variant only per plan |
| ⬜ | Custom color customization per org | Deferred |
| ⬜ | Church logo on printed labels (Sub-PR E) | Deferred until requested |

---

## Wave 12 — Volunteer Swap & Absence

| Status | Item | Evidence |
|---|---|---|
| ✅ | A — Swap request UI + team broadcast (in-app + email) | PR #215 + hotfix #216 (Codex PASS) |
| ✅ | B — Day-of urgent absence (SMS bypasses scheduler prefs) | PR #217 (Codex PASS) |
| ✅ | C — 24h auto-escalation cron | PR #218 + hotfixes #220 (auth header), #221 (CG index) (Codex PASS) |
| ✅ | D — Per-team peer-swap toggle | PR #219 (Codex PASS) |

---

## Notifications

| Status | Item | Evidence |
|---|---|---|
| ✅ | In-app inbox (`user_notifications` collection) | Multiple types, real-time unread badge, weekly cleanup cron |
| ✅ | Email reminders (24h + 48h) | `/api/cron/reminders` |
| ✅ | SMS reminders | Same path, channel-aware |
| ✅ | FCM web push — service worker + token registration | `public/sw.js:120-142`, `useServiceWorker` hook, `/api/push/subscribe` |
| 🟡 | FCM push **content** for reminders + swap | Infra wired, message payloads optional polish |
| ✅ | Scheduler notification preferences | `shouldNotifyScheduler` helper |
| ✅ | Absence-channel override on urgent (W12-B) | `src/lib/server/absence-channels.ts` |

---

## Monitoring & Security

| Status | Item | Evidence |
|---|---|---|
| ✅ | Sentry SDK installed + initialized | `package.json` (`@sentry/nextjs@^10.50.0`), `next.config.ts:193` |
| ✅ | CSP `report-uri`/`report-to` → Sentry DSN | `next.config.ts:47, 121-124` |
| 🟡 | CSP enforcement (flip Report-Only → enforced) | Wave 1.2b — `next.config.ts:182` still `Content-Security-Policy-Report-Only` |
| ⬜ | Firebase App Check | No `initializeAppCheck` in code; queued for after first 10 paying orgs |
| ✅ | Audit log primitive (`audit_logs` collection) | `src/lib/server/audit.ts`; ~40 action codes |
| ✅ | Rate limiting (in-memory) | Sufficient for beta scale |

---

## Performance / Scaling

| Status | Item | Evidence |
|---|---|---|
| 🟡 | Cursor pagination | Implemented for `/api/admin/audit-logs`, `/api/user/notifications`. **Missing** for People list, Events list, Assignment history |
| ⬜ | Server-side dashboard read (consolidate 5-8 parallel reads) | Phase 22 client TTL cache (60s) covers most pain; defer |
| ⬜ | Firestore COUNT aggregation | Trigger: 100+ orgs |
| ✅ | Phase 22 client-side TTL cache (60s) on heavy reads | Shipped |

---

## Onboarding / Volunteer Lifecycle

| Status | Item | Evidence |
|---|---|---|
| ✅ | Background-check field on volunteer (manual admin entry + expiry tracking) | Schema + admin UI |
| ⬜ | **Self-service background check** (Checkr/Sterling integration) | No external integration; admin manually marks results |
| ✅ | Role validation on notification routes | Onboarding Enhancements wave |
| ✅ | Prerequisite milestone notifications + nudge cron | Same wave |
| ✅ | Training session invites with auto-complete | Same wave |
| ✅ | Trainee assignment type (shadow assignments) | Same wave |

---

## Help / Docs / Marketing

| Status | Item | Evidence |
|---|---|---|
| ✅ | Landing page (public) | `src/app/page.tsx` + 7 help guides added in recent site-fix wave |
| ✅ | Pricing page accuracy | Recent site-fix wave |
| 🟡 | Help center / in-app guides / FAQ | Some help guides exist; broader documentation queued |
| ⬜ | Video walkthroughs | Not started |
| ⬜ | Onboarding docs for admins/schedulers/volunteers (centralized) | Scattered; not consolidated |

---

## Pre-Launch Verification (your manual half)

From `launch-verification.md` — rows that need physical/account-level testing only you can do:

- [ ] Label printing on Brother QL-820NWB (real hardware)
- [ ] iCal calendar feed subscription in Apple Calendar / Google Calendar
- [ ] Stripe live monthly + annual transactions (LLC + bank are already live; this is just exercising one of each in live mode end-to-end)
- [ ] Stripe customer portal flows in live mode
- [ ] ProPresenter export round-trip
- [ ] Deleted-org Stripe subscription cleanup

---

## Check-In feedback batch (Jason 2026-06-02)

| Status | Item | Notes |
|---|---|---|
| ✅ | Household QR encoded `/checkin` instead of `/guardian` → routed to kiosk enrollment when parent scanned with phone camera | Fixed this turn — now encodes `/guardian` (parent portal w/ Add-to-Apple-Wallet button). Kiosk scanner unaffected (extracts `?token=` regardless of path) |
| ⬜ | **Household-level vs per-child Authorized Pickup toggle** | Today: stored per-child. Jason's ask: default household-level with per-child as toggle for blended families. Needs schema additive + UI toggle |
| ⬜ | **Phone number display normalization** — `(###) ###-####` everywhere | Helper `formatPhone()` exists but only used 4/22+ places. Display sweep is cheap (~7 files). Storage cleanup (E.164 everywhere) is a second phase (~15 files + backfill consideration) |
| ⬜ | **Twilio international policy** — SMS to non-US numbers | Twilio supports international but per-message rates vary 5-20x, and toll-free can't deliver to many countries. Need a policy decision: US/Canada only (cheapest, covers ~all churches), or whitelist specific countries |

## Active Bug Watch

| Status | Item | Evidence |
|---|---|---|
| 🟡 | Safari recurring login spin | Long-polling fix is in (May 25). 10s watchdog circuit-breaker shipped this turn (PR #225) — surfaces "Sign-in stuck? Reload" instead of infinite spinner. Custom auth domain ruled out (doesn't apply to email/password auth) |
| ✅ | Org-switcher stale names | PR #223 (this turn) — render precedence fix, merged to main |

---

## How to use this doc

When picking next work:
1. Read this doc first. If something says ✅, it's done.
2. If you find a discrepancy between this doc and the code, the **code wins** — update this doc to match.
3. When shipping anything, update this doc in the same PR. No exceptions.
