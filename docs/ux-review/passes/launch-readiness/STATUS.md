# Launch-Readiness — Status

Single-page tracker. Updated at the close of each wave + on every Codex
round-trip. Full plan lives at `/Users/jasonpaschall/.claude/plans/i-want-you-to-iterative-spring.md`.

---

## Wave summary

| Wave | Scope | PRs | Last commit | Status |
|------|-------|-----|-------------|--------|
| **0** | Admin-aware org activity + marketing rollup | #87 #88 #89 #90 | `f2d2e2f` | ✅ Closed |
| **1** | Observability + safety nets (`log.ts`, CSP report-to, Firestore backups) | #92 #93 #94 | `fa20385` | ✅ Closed except 1.2b (CSP enforce, ~1 wk wait) |
| **2** | Make writes survive failure (reminder idempotency, assignment-rule denorm, cron_runs) | #95 #96 #97 #99 | `53da0a4` | ✅ Closed (2.2b rule-tightening carried to Wave 5) |
| **3** | Auth/validation library coverage (zod, route migration sweep) | #101 #102 #103 #104 #105 #106 #107 #108 | `75f97a4` | ✅ Closed (3.4 long-tail sweep deferred — incremental as files get touched) |
| **4** | Audit coverage + MFA + Notify Ministry Leads + `/status` page | #110 (4.1), #111 (4.3), #112 (4.4), #115 (4.2), #117 (4.2 hotfix) | `5994089` + `d6c6f57` + `5b4b888` + `ef25039` + `65ca484` | ✅ Closed (all sub-items Codex PASS) |
| **5** | UX polish + **assignment-rule tightening** (a11y, focus, contrast, server components, image optimization, terminology, My Schedule refactor + rule lock-down) | #119–#128 | `9f76668` | ✅ Closed — Batches A–D + E phase 1 + E phase 3 (incl. 2.2b rule lockdown) merged & Codex-verified; E phase 2 (admin-page perf) deferred to post-launch |
| **6** | Annual billing (20% off / "2 months free") + 14-day trial; custom auth domain N/A | #131 #132 | `a651501` | ✅ Closed — billing + trial shipped; custom auth domain dropped (N/A for an email/password app) |
| **7** | Production verification matrix (17 features × happy + failure) | #133 #134 #135 #136 #137 #139 #140 #141 | `2f315bf` | ✅ Closed — all 11 Codex-owned rows PASS in prod; 6 Jason halves (label print, calendar subscribe, Stripe live × 2, ProPresenter, Stripe customer cleanup) intentionally left open and tracked in `launch-verification.md` |
| **8** | Customer comms + outreach + marketing | — | — | ⏸ Parked behind Wave 9 |
| **9** | **Best-in-class Child Check-In safety** (Outreach Magazine + ECAP + PCO research; P0-1 → P0-5) — pre-launch | P0-1 #142; P0-2 #143–146 (reverted via #147; re-landed via #156 #157 #158 #159 #160→#161 #162 #163 #164) | `4b38ac5` | 🟢 Active — P0-1 + P0-2 closed in prod (Codex PASS each); P0-3 queued |

---

## Wave 0 — Closed

**Codex PASS on hotfix round 2, 2026-05-26**. Production head `f2d2e2f`.

Closure receipt (each block of changes that landed):

| PR | Commit | Scope |
|----|--------|-------|
| #87 | `30a3c94` | Initial: admin-aware sign-in fetch + cron snapshot writes + Platform totals panel |
| #88 | `a09c244` | Hotfix: marketing rollup on manual Refresh Stats (extracted `computeMarketingRollup` helper) |
| #89 | `96bea6e` | Optional `CODEX_CRON_SECRET` env var for Codex's QA harness |
| #90 | `f2d2e2f` | Hotfix round 2: cron feedback query alignment + honest `platform_stats_computed` flag |

### Decisions baked in (Wave 0)
- Activity signal includes **all owner + admin + scheduler sign-ins**, not just owner
- Marketing metrics ship on the **same PR** as the activity fix (one Codex round-trip per phase)
- Cron architecture: **single nightly cron** (`/api/cron/stats-refresh`) writes per-volunteer stats + per-org snapshots + platform aggregates + recent activity rollup. Manual POST endpoint stays available as the "Refresh Stats" button on the platform admin page.
- Feedback rollup query: **JS filter, not Firestore index**. Avoids cron-vs-manual drift; sub-second at our scale.
- `CODEX_CRON_SECRET`: **optional second secret** (not a replacement for `CRON_SECRET`). Lets Jason rotate Codex's access independently.

### Recurring bug class observed (Wave 0)
**Cron-vs-manual drift bit us twice** on the same PR set:
- Round 1: cron computed `marketing` rollup, manual POST didn't (PR #88 fix)
- Round 2: cron used an indexed feedback query, manual POST filtered in JS (PR #90 fix)

Both fixes consolidated the pattern (`computeMarketingRollup` helper, JS-filter alignment). Future cross-path additions should default to a shared helper from the start.

### Marketing metrics now available

The five rollup fields are live in `platform/stats.marketing`. Both auto-refresh nightly (5 AM UTC cron) and on-demand via the Platform admin "Refresh Stats" button:

- `total_active_orgs` — orgs with status === "active" after admin-aware activity signal
- `total_volunteers_all_orgs` — sum of `memberships.volunteer` across orgs
- `total_services_all_orgs` — sum of `counts.services`
- `scheduled_assignments_30d` — sum of `assignments_by_day` across orgs
- `events_with_signups_30d` — count of orgs with any assignment activity in the past 30 days

Ready for landing-page hero copy when Wave 8 / marketing comes around.

---

## Wave 1 — Closed (except 1.2b, intentionally pending)

Pure backend infrastructure; no Codex retest needed for the merged pieces.

| Item | PR | Commit | Scope |
|------|----|--------|-------|
| 1.1 | #92 | `15ee828` | `src/lib/log.ts` structured logging wrapper + `no-console` lint rule + sweep of ~54 highest-signal call sites (Stripe webhook, all cron routes, all notify/* routes, platform admin, lib/server core) |
| 1.2a | #93 | `20f28d1` | CSP `report-to` + `Reporting-Endpoints` header wired to Sentry's security endpoint. CSP still in Report-Only mode. |
| 1.3 | #94 | `fa20385` | `docs/firestore-backup-runbook.md`: daily export to GCS + 30-day lifecycle + restore procedure. Jason runs the `gcloud` commands when convenient. |

### Item 1.2b — deferred 1 week

CSP enforcement promotion (flip `Content-Security-Policy-Report-Only` → `Content-Security-Policy`). The plan calls for ~1 week of report telemetry first so we can extend the directive allowlist for any legitimate paths that show up. **Calendar reminder for ~2026-06-02**: review Sentry → Issues filtered by `security` for CSP report entries, extend the allowlist, then flip the header.

### Logger usage convention

```ts
import { log } from "@/lib/log";

log.info("Order created", { order_id: id, user_id: uid });
log.error("Failed to send reminder", { error: err, person_id });  // auto-flows to Sentry
log.error("[POST /api/notify]", err);  // ergonomic shortcut: Error directly as 2nd arg
```

ESLint flags raw `console.log` going forward (warning, not error). Existing ~170 sites get migrated as files are touched for other reasons.

---

## Wave 2 — In progress (2.1 + 2.3 done; 2.2 active)

### Closed pieces

| Item | PR | Commit | Scope |
|------|----|--------|-------|
| 2.1 | #95 | `054be12` | Reminder idempotency: per-(assignment, kind, channel) bool flags in `reminder_dispatches` map, claimed inside `adminDb.runTransaction()`. Legacy-grace path backfills the new shape when the old array indicates "already sent." 4 integration tests in `tests/integration/reminders-idempotency.test.ts`. |
| 2.3 | #96 | `085b434` | `cron_runs` visibility: `withCronRun(name, fn)` wrapper writes start/finish markers with status + duration + processed/failed counts. All 7 cron routes wrapped. Admin page at `/dashboard/platform/cron-runs`. |

### CI infrastructure note (Wave 2.3 side effect)

PR #96 was the first PR to actually exercise the auto-deploy-rules workflow (PR #82) after Jason wired the GitHub secret. Three IAM rounds were needed before it shipped:

1. **PR #97** dropped `storage:rules` from `--only` because the service account lacked `serviceusage.serviceUsageConsumer` for the storage API precondition check
2. Jason added `roles/serviceusage.serviceUsageConsumer` — got past the precondition for firestore too
3. Jason added `roles/datastore.indexAdmin` — got past index deploy 403

**Current SA roles on `github-actions-rules-deploy@volunteercalendar-mvp.iam.gserviceaccount.com`**:
- Firebase Rules Admin
- Service Usage Consumer
- Cloud Datastore Index Admin

Successful manual `workflow_dispatch` run at 2026-05-26 14:22 UTC. Wave 2.3's `cron_runs` rule landed in production at this time. **Future PRs touching `firestore.rules` or `firestore.indexes.json` auto-deploy on merge to main**, no manual step.

`storage:rules` auto-deploy is still off (intentionally — see workflow comment). Re-add with a tiny PR if/when needed.

### 2.2 — schedule.status denorm (split outcome)

| Sub-item | Status | Notes |
|---|---|---|
| **2.2a** writers + backfill | ✅ Merged (PR #99, `53da0a4`) + backfill run 2026-05-26 | 194 assignments populated, 18 already matching, 0 orphans. Codex PASS. |
| **2.2b** rule tightening | ⏭ **Deferred to Wave 5** | See "Wave 5 prep notes" below for the saved rule wording + gotcha + test cases. |

**Why 2.2b moved to Wave 5**: trying to push the rule alone surfaced that Firestore's list-query semantics couple the rule shape to the client query shape. My Schedule's current client query (`where person_id == X, where service_date >= Y`) returns docs across all `schedule_status` values — including drafts the new rule denies — which makes the entire list query fail for ANY volunteer in an org with in-flight drafts. Fixing that requires updating every volunteer-facing client query to filter on `schedule_status`. Wave 5's planned server-side refactor of My Schedule (and the other hot dashboard pages) dissolves the issue by moving the data assembly to admin-SDK endpoints. Rather than ship the rule tightening + a partial My Schedule refactor in Wave 2.2b, we carry the rule change forward as part of Wave 5's coherent refactor.

**Risk of deferral**: zero new risk. The current rule (open read for active members) is what production has been running since launch; app-layer filtering in My Schedule + `/api/calendar` has been the actual line of defense and remains in place. The denormalized `schedule_status` field that Wave 2.2a landed is the prerequisite Wave 5 needs — that work isn't wasted.

---

## Wave 4 — 4.1 / 4.3 / 4.4 Closed (Codex PASS); 4.2 MFA next

### Closed pieces

| Item | PR | Commit | Scope |
|------|----|--------|-------|
| 4.1 | #110 | `5994089` | `audit_logs` coverage audit. New `/api/memberships/[id]` PATCH+DELETE absorbs direct-Firestore membership mutations from `firestore.ts` so every lifecycle change emits an audit row. `audit()` calls added across invite + batch invite + tier override + kiosk activate + kiosk checkout + org create + the three CSV export endpoints + short-link (allowlist external only). New AuditAction `membership.accept_invite`. 12 integration tests in `tests/integration/membership-mutations.test.ts`. Full suite 262 passing. Codex retest doc at `CODEX_WAVE_4_1.md`. |
| 4.3 | #111 | `d6c6f57` | Real Notify Ministry Leads endpoint. New `/api/schedules/[id]/notify-leads` POST replaces the stub "Request Approval" button (was POSTing to `/approve` without ministry_id, silently 400'ing). Sends approval-request email per ministry lead with `lead_email` set via the existing outbox. New AuditAction `schedule.notify_leads` (one per call, not per email). 7 integration tests in `tests/integration/notify-leads.test.ts`. Full suite 269 passing. Codex retest doc at `CODEX_WAVE_4_3.md`. |
| 4.4 | #112 | `5b4b888` | Public `/status` + `/changelog` pages with hand-curated data files. Status page shows overall pill + per-subsystem health + recent incidents. Changelog page renders dated entries grouped by month with category chips + PR links. Links from Settings (About VolunteerCal section, visible to all org members) and the landing footer. Sitemap updated. No new tests — pure static content. |

### Codex Wave 4 combined retest — PASS 2026-05-27

PRs #110 + #111 + #112 retested in production at `233b0b9` (5b4b888 + the docs-only #113 commit). **No Sev 1-4 product findings.** Verification artifacts live in Codex's workspace:

- `docs/ux-review/passes/launch-readiness/CODEX_WAVE_4_RESULTS.md`
- `docs/ux-review/passes/launch-readiness/wave4-results.json`
- `docs/ux-review/passes/launch-readiness/wave4-owner-cases-results.json`
- `docs/ux-review/passes/launch-readiness/wave4-browser.json`
- `docs/ux-review/passes/launch-readiness/wave4-settings-browser.json`
- `docs/ux-review/passes/launch-readiness/wave4-gmail-summary.json`

Three notes from the retest (all "rules are working" confirmations, not bugs):

1. **kiosk.checkout audit fixture was source-verified** rather than runtime-exercised — Firestore rules correctly blocked Codex's attempt to client-seed `checkInSessions` docs. Good signal: the rule layer denies direct writes that should only flow from the kiosk-token-authenticated endpoint.
2. **`notification_outbox` direct client reads blocked by rules** — Codex verified the schedule.notify_leads flow via endpoint response + audit row + cron drain + actual Gmail delivery to the lead's inbox.
3. **GitHub main was at `233b0b9`** during the retest — one docs-only commit (#113 — Wave 4.2 MFA decisions) past the last code-bearing commit. No retest scope impact.

### Intentionally skipped audits (deferred or replaced)

- **`kiosk.lookup`**: high-volume per Sunday; redundant with the existing `kiosk.medical_data_revealed` row.
- **`schedule.unpublish` / `schedule.delete`**: no dedicated server endpoint yet; client deletes go through generic `removeChurchDocument`. Add audits when a real route lands.
- **`org.transfer_ownership`**: feature not built.

### Codex retest docs

- `docs/ux-review/passes/launch-readiness/CODEX_WAVE_4_1.md` — Wave 4.1 audit coverage.
- `docs/ux-review/passes/launch-readiness/CODEX_WAVE_4_3.md` — Notify Ministry Leads.
- (Wave 4.4 doesn't need a Codex retest — pure static content. Visual confirmation on /status, /changelog, Settings → About VolunteerCal section, and landing footer is sufficient.)

### 4.2 — Shipped 2026-05-27 (`ef25039` + `65ca484`); Codex PASS WITH NOTES

| PR | Commit | Scope |
|----|--------|-------|
| #115 | `ef25039` | TOTP MFA opt-in with 8 force-confirmed recovery codes. New `/api/account/mfa/recovery-codes` (POST/DELETE) and `/api/account/mfa/verify-recovery-code` (unauthed, rate-limited). MfaSetupModal + MfaDisableModal + MfaChallengeModal + MfaSettingsCard + RecoveryCodesDisplay. 4 new AuditActions. 12 integration tests. Required Firebase Identity Platform upgrade. |
| #117 | `65ca484` | Hotfix: per-user Security activity card on /dashboard/account surfaces user-scoped MFA audit rows that the church-scoped /dashboard/settings/activity can't see. New `/api/account/activity` endpoint + new `audit_logs (actor, created_at)` composite index. 6 integration tests. |

**Codex retest PASS 2026-05-27** after a multi-round environment-blocker debug (see Recurring bug class below). Results: all enrollment / sign-in challenge / disable / regenerate / recovery-code / Security activity flows verified end-to-end against production.

Three notes from Codex (none launch-blocking):
1. Firebase enforces `emailVerified=true` before TOTP enrollment — Codex verified disposable test accounts through Firebase's email-verification flow before retesting. Worth surfacing to users in our UI copy if MFA enrollment fails for this reason; today it would surface as a Firebase error code. (Polish item — file for Wave 5.)
2. The `/api/account/mfa/verify-recovery-code` per-IP limit (10/hr) was warmed during the retest run; per-email (5/hr) was source-verified but Codex didn't wait an hour for a cold-IP confirmation of the exact 5-wrong-then-429 sequence. Source-verified is sufficient given the implementation matches.
3. Codex's `.txt` recovery-code artifacts were removed from the docs tree and not copied to SharedTestingDocuments — clean hygiene.

### Recurring bug class observed (Wave 4.2 environment)

Multi-round debug of `auth/operation-not-allowed` cost two retest cycles. Captured for the next session:

1. **Firebase TOTP MFA is NOT enabled via the Console UI.** The Console only has the Identity Platform upgrade button + SMS-MFA toggles. TOTP-specific MFA must be enabled via either (a) the Admin SDK's `projectConfigManager().updateProjectConfig(...)` call or (b) a PATCH to `identitytoolkit.googleapis.com/admin/v2/projects/{id}/config?updateMask=mfa`. The docs are explicit; the Console UI is misleading because it implies TOTP could exist there.
2. **Two state flags must BOTH be `ENABLED`.** Identity Platform's MFA config has both `mfa.state` (project-wide) and `mfa.providerConfigs[].state` (per-provider). A PATCH that only sets the provider but omits the top-level state leaves project-wide MFA `DISABLED`, and TOTP enrollment still 403s. The first PATCH attempt landed the provider config but left the top-level state untouched (defaulted to DISABLED). Second PATCH explicitly set both.
3. **Project ID matters.** Production volunteercal.com uses Firebase project `volunteercalendar-mvp`. Any Console changes done on a sibling project won't affect production. Verified by grepping the production JS bundle for `projectId:"volunteercalendar-mvp"`.

Working canonical curl saved for future reference:
```bash
curl -X PATCH \
  "https://identitytoolkit.googleapis.com/admin/v2/projects/volunteercalendar-mvp/config?updateMask=mfa" \
  -H "Authorization: Bearer $(gcloud auth print-access-token)" \
  -H "Content-Type: application/json" \
  -H "X-Goog-User-Project: volunteercalendar-mvp" \
  -d '{ "mfa": { "state": "ENABLED", "providerConfigs": [{ "state": "ENABLED", "totpProviderConfig": { "adjacentIntervals": 5 } }] } }'
```

Original decision table for reference:

| Decision | Choice |
|---|---|
| MFA method | **TOTP only** (no SMS — SIM-swap deprecation; matches GitHub/Stripe/Linear) |
| Recovery codes | **8 codes, force confirmation during enrollment** — build our own (Firebase TOTP has none native): bcrypt-hashed in `user_recovery_codes/{uid}` Firestore collection (server-only via Admin SDK) |
| Un-enroll auth | **Current MFA code + password** (industry standard) |
| Tier gate | **Free for everyone, all tiers** (modern SaaS norm) |
| Challenge cadence | **Every sign-in** (Firebase Auth default; no trusted-device complexity for v1) |
| Authenticator app | **Brand-agnostic** (any TOTP app: Google Authenticator, 1Password, Authy) |
| Location in app | **Account → Security**, sits next to the existing SecuritySection |

Implementation scope (~12 hours focused work, single PR — half-baked MFA in production is worse than no MFA):

- Backend (~3h): 4 API routes for recovery codes lifecycle + new AuditActions (`auth.mfa_enrolled`, `auth.mfa_disabled`, `auth.mfa_recovery_codes_regenerated`, `auth.mfa_recovery_code_used`)
- Frontend (~5h): `MfaSetupModal` (3-step wizard), `MfaChallengeModal` (sign-in challenge with "use recovery code" toggle), `MfaSettingsCard` in Account → Security, `RecoveryCodesDownload` reusable component, disable-flow modal
- Tests (~2h): integration for verify endpoint (correct/wrong/used), regenerate flow, enrollment audit
- Polish (~2h): early-close-modal warning, copy, error states, mobile QR sizing

Pickup trigger: after Codex returns Wave 4 retest results and any Sev 1/2 hotfixes land. Jason elected to wait rather than start 4.2 in parallel to avoid context-switching.

---

## Wave 3 — Closed

Authz + zod library coverage shipped across 8 PRs. 19 high-risk routes migrated.

| Item | PRs | Scope |
|------|-----|-------|
| 3.1 authz library | #101 | `requireUser`, `requireMembership(churchId, minRole)`, `requirePlatformAdmin`, `requireStripeWebhook` + 14 integration tests |
| 3.2 zod validation | #102 | `parseBody(req, schema)` + `parseQuery(req, schema)` + 10 unit tests |
| 3.3 batch 1 platform | #103 | 5 platform routes / 8 method handlers |
| 3.3 batch 2 billing | #104 | checkout, portal, webhook |
| 3.3 batch 3 schedule mutations | #105 | publish, approve |
| 3.3 batch 4 membership/org | #106 | memberships, invites, organization (POST + DELETE) |
| 3.3 batch 5 short-links | #107 | GET/POST/PATCH/DELETE + new `assertBearerToken` helper |
| 3.3 hotfix auth-order | #108 | Retrofit `assertBearerToken` to 6 routes from batches 2–4 |

Final production main: `75f97a4`.

### Codex validation

- Batches 1 + 2 PASS confirmed in first retest (all 11 cases green).
- Batches 3 retested separately due to a deployment-lag false positive in the first round (Codex tested cc56b00 before Vercel had served it). Focused retest of batch 3 after production caught up: **PASS** (all 6 cases including the new auth-order fast-path).
- Codex artifacts (in Codex's workspace, not committed to this repo):
  - `docs/ux-review/passes/launch-readiness/CODEX_WAVE_3_3_BATCH_3_RETEST.md`
  - `docs/ux-review/passes/launch-readiness/wave33-batch3-retest-results.json`
  - `docs/ux-review/passes/launch-readiness/scripts/run-wave33-batch3-retest.mjs` — reusable test harness for future Wave 3 retests

### Recurring bug class observed (Wave 3)

**Auth-order regression** — bit us in batches 2/3/4 silently (not caught by tests until batch 5's short-links suite caught it). When a route needs body fields to call `requireMembership(req, body.church_id, role)`, the natural-feeling order is `parseBody → requireMembership`. But that returns 400 (body invalid) BEFORE 401 (no auth) for callers with no token AND no body. Subtle, but breaks defensive client code and leaks body-shape hints pre-auth. Fixed library-wide with `assertBearerToken` fast-path used before `parseBody`. Pattern captured below.

### Items intentionally deferred from Wave 3

- **Wave 3.4 long-tail sweep**: ~100 remaining lower-traffic routes get migrated incrementally as they're touched for other reasons. Not a single focused effort.
- **`/api/reservations/*`** (3 routes, ~1,000 lines): has a custom local `getAuthorizedUser` helper that deserves more careful surgery. Migrate when the next reservations-related change comes through.
- **`/api/cron/*` zod schemas**: cron routes already use `requireCronSecret`; adding zod body/query validation is a polish item with low ROI. Defer.

---

## Open Codex findings

None merged as of `75f97a4`. Waves 0, 1, 2, 3 all closed.

---

## Manual deploy log

- 2026-05-26 14:22 UTC: First successful auto-deploy of `firestore.rules` (PR #96 + #97 chain). Wave 2.3 `cron_runs` rule live.
- 2026-05-26 ~later: `scripts/backfill-assignment-schedule-status.ts` run against production with the github-actions-rules-deploy SA (+ Cloud Datastore User role granted that day). Wrote `schedule_status` to 194 assignments across 4 active orgs. Codex verified PASS (7 of 18 orgs covered by client-token spot-check; remaining 11 orgs unverifiable client-side but covered by the script's deterministic walk).
- 2026-05-27 ~01:40 UTC: Wave 3.3 batch 3 retest confirmed PASS at production main `75f97a4` after deployment lag cleared.

---

## Workflow patterns (reinforced this session)

- **Cron-vs-manual drift**: when two paths produce the same field, extract the helper FIRST (don't fix the drift after the fact)
- **Rules auto-deploy → no rollback window**: PRs that modify EXISTING rules (vs. add new ones) deserve a Codex retest gate before merge. Adding new collection rules with explicit-deny is safe to autonomously merge.
- **GitHub status before assumption**: check https://www.githubstatus.com before diagnosing "account suspended"-style errors. Today's Wave 2.3 dispatch failure was caused by a GitHub-side Actions auth incident (2026-05-26 10:57 → 13:18 UTC), not anything on our side.
- **Auth-order in route helpers**: when a route needs a body field for `requireMembership`, do `assertBearerToken` → `parseBody` → `requireMembership`. Reversing the first two returns 400 before 401, which is a subtle regression that breaks defensive clients and leaks body-shape pre-auth. Pattern from Wave 3.3 hotfix.
- **Codex retest cache lag**: when a PR has just merged, give Vercel 2–5 minutes to deploy before sending Codex the retest prompt. Otherwise Codex tests an old build and reports false-positive regressions. Confirm production deploy first via `gh api repos/.../deployments`.

---

## Wave 5 prep notes — Assignment rule tightening

When Wave 5 picks up the My Schedule server-component refactor, the rule tightening should land in the SAME PR as the My Schedule refactor (not separately). Pre-built artifacts to reuse:

### The rule (proven correct in emulator tests today)

```
match /assignments/{docId} {
  // Use resource.data.get('schedule_status', '') — NOT
  // resource.data.schedule_status — so the predicate is safe when
  // the field is missing (legacy orphan whose parent schedule was
  // deleted before backfill ran). Bare access throws on undefined
  // during LIST queries because Firestore's rule engine evaluates
  // the predicate for every collection doc, and a throw kills the
  // whole list. .get(...) with a default returns '' which isn't in
  // the allowlist → safe deny.
  allow read: if isActiveMember(churchId) && (
    isSchedulerOrAbove(churchId) ||
    resource.data.get('schedule_status', '') in ['published', 'archived']
  );
  allow write: if isSchedulerOrAbove(churchId);
}
```

### The list-query gotcha (would have shipped a regression without catching it)

Firestore rejects a list query if ANY doc in the result set fails the rule. So adding the rule above without coordinated client-query changes breaks `getDocs(query(... where person_id == X, where service_date >= Y))` whenever ANY draft assignment matches the where-clauses. This is what blocked shipping 2.2b alone.

Wave 5 fix path: route My Schedule's data fetch through a new server endpoint (`/api/my-schedule` or similar) that uses Admin SDK to bypass the rule. The endpoint can return whatever shape the page needs without the rule blocking it. The strict client-side rule then catches any future code path that tries to direct-read assignments without going through the endpoint — defense-in-depth.

### Test cases worth porting (all green in emulator with the rule above + a small seed update)

In `tests/rules/firestore.rules.test.ts`, seed: published / draft / archived schedules + matching assignments + one legacy orphan with no `schedule_status`. Then assert:

1. Volunteer's My Schedule LIST query succeeds — proves list-query semantics work end-to-end
2. Volunteer CAN read published assignment (single get)
3. Volunteer CAN read archived assignment (single get)
4. Volunteer CANNOT read draft assignment
5. Volunteer CANNOT read legacy orphan (missing field)
6. Volunteer in different church CANNOT read (cross-tenant)
7. Admin CAN read draft assignment (scheduler+ bypass branch, single get)
8. Admin CAN read all assignments via list query (scheduler+ bypass branch, list)

For test 1 to pass, the test's seeded data must NOT include any draft assignments under the volunteer's person_id (or the query must filter them out). When Wave 5 refactors My Schedule to a server endpoint, this test reverts to "does the volunteer's LIST query against the volunteer-readable subset succeed" — which it will.

### Known regression that goes away in Wave 5

Self-service mode volunteers currently see their own draft-schedule claims on My Schedule (carve-out in `src/app/dashboard/my-schedule/page.tsx`). The rule tightening would block that at the rule layer with no way to replicate the carve-out without a get(). Wave 5's server endpoint can fetch the carve-out via admin SDK, restoring the behavior. **Don't ship the rule without the server endpoint** — that's what made the carve-out impossible in Wave 2.2b.

---

## Wave 5 — Batches A-D closed; Batch E in phased delivery

| Batch | PRs | Status |
|------|-----|--------|
| A quick wins (setup-guide auto-dismiss, warm empty state, MFA email-verify) | #119 | ✅ Merged |
| B a11y sweep (form aria, focus traps, coral-deep contrast, nav semantics) | #120 | ✅ Merged |
| C Teams/Ministries rename (user-facing copy; code identifiers unchanged) | #121 | ✅ Merged |
| D perf (lazy-load Cropper + recharts, next/image avatars) | #122 | ✅ Merged |
| E design doc | #123 | ✅ Merged |
| E phase 1 — `/api/dashboard-summary` + consumer + Data Cache fix | #124, #125 | ✅ Merged (Codex PASS; Sev 4 cache finding fixed via unstable_cache) |
| **E phase 2 — Schedules + Service Day server endpoints** | — | ⏸ **DEFERRED to post-launch** (decision 2026-05-27). Pure admin-page perf; no security/correctness dependency. Pattern proven by phase 1. Not a crumb — a conscious scope call. |
| **E phase 3 — My Schedule endpoint + 2.2b rule lockdown** | #126, #127, #128 | ✅ **Merged + verified in prod.** Rule live (deploy-rules green on `caf03f0`); Codex security retest PASS. Check-in-window hotfix (#127 helper + #128 route wiring) — Codex retest PASS in America/Chicago. |

### Batch E phase 3 — SHIPPED (2026-05-28)

All steps landed and were verified by Codex in production. Closing summary:

- **`/api/my-schedule`** (#126) — authorized Admin-SDK read path. Multi-church aggregation from the caller's own active memberships (no church_id param → no cross-tenant surface), self-signup carve-out preserved server-side. `tests/integration/my-schedule.test.ts` (7 cases) locks the carve-out + cross-user isolation.
- **My Schedule page rewired** (#126) — `loadAll` + `refetchChurchState` now consume the endpoint; the 5 client assignment reads are gone.
- **Assignment-rule lockdown** (#126) — `firestore.rules` `/assignments` (top-level + nested) now denies volunteer client reads of non-published work via the denormalized `schedule_status` (`resource.data.get('schedule_status','') in ['published','archived']`), scheduler+ bypass. `tests/rules/firestore.rules.test.ts` gained 12 lockdown assertions (published-filtered list succeeds, unfiltered fails, draft/legacy-orphan denied, cross-tenant denied, scheduler/admin bypass). Live via deploy-rules on `caf03f0`. **Codex security retest PASS.**
- **Pre-lockdown audit** — only two volunteer-facing client assignment reads existed: the My Schedule page (→ endpoint) and `SmartCheckInBanner` (→ now filters `where('schedule_status','==','published')`, #126). Service Day / Schedules / People analytics are scheduler+ (bypass branch); confirm/cron/iCal use the Admin SDK.

**Follow-up — check-in window timezone bug (Codex Sev 2, separate from the rule):** `SmartCheckInBanner` prompted but `POST /api/check-in/self` 403'd "window closed" off-UTC. Root cause was a runtime-local-zone `new Date()` parse that ignored the church timezone. Fixed by the shared deterministic helper `src/lib/utils/check-in-window.ts` (#127, 14 unit tests) — but #127's commit message overstated scope and **never actually wired the server route**; #128 finished the wiring. **Codex retest PASS in America/Chicago** (happy path + outside-window negative control).

**Known non-blocker (flagged separately):** the volunteer dashboard logs a benign `permission-denied` from the `useNotifications` onSnapshot listener during auth/org-switch transitions — pre-existing, unrelated to the rule work, console-noise only.

---

## Wave 6 — Closed (annual billing + trial; custom auth domain N/A)

| Item | PR | Commit | Scope |
|------|----|--------|-------|
| Annual billing | #131 | `42d085c` | Interval-aware Stripe **lookup-key** resolution (`resolvePriceId` / `parseLookupKey` / `resolveTierAndInterval`) replacing the env-var Price maps; checkout accepts `interval`; webhook writes `subscription_interval`; `Church.subscription_interval` type; monthly/annual toggle on in-app billing + public pricing; "· Billed annually" badge; annual amounts **$278 / $662 / $1,142** (20% off). 188 unit tests incl. new `stripe-price-resolution` suite. |
| 14-day trial | #132 | `a651501` | `subscription_data.trial_period_days: 14` at checkout (Stripe-recommended; per-Price trials are deprecated). Gated to NEW subs (free→paid) so existing paid orgs don't get a fresh trial. Makes the "Start Free Trial" copy honest. |

### Stripe dashboard (Jason — done)
- 3 annual Prices ($278 / $662 / $1,142/yr) on the existing products; six lookup keys `{starter,growth,pro}_{monthly,annual}` (confirmed matching the code constant); Customer Portal updated with the annual Prices for plan switching.
- No trial on any Price (per-Price trials now "Legacy") → trial lives at checkout instead.

### Custom auth domain — N/A (not "deferred")
`auth.volunteercal.com` was listed to fix the Safari ITP issue "at the root." Investigation closed it out:
- The app signs in with **email/password only** (`signInWithEmailAndPassword`) — no OAuth popup/redirect. The client `authDomain` config is only consumed by those flows + the auth-state iframe they load, **neither of which this app uses**; email/password talks directly to Google's identity API and never routes through the auth domain.
- The real Safari issue (PR #86) was a **Firestore** long-polling thing — different mechanism, already fixed.
- DNS pre-flight confirmed `https://auth.volunteercal.com/__/auth/handler` has no TLS cert (a bare CNAME to `firebaseapp.com` doesn't provision one — that needs a Firebase Hosting domain connection). Since nothing routes through that domain, the cert is moot.
- **Decision (2026-05-28): skip it.** `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` stays `volunteercalendar-mvp.firebaseapp.com`. The unused `auth` CNAME at Hover can be deleted; the Authorized-domains entry is harmless. Revisit only if social/OAuth login is ever added.

---

## Wave 7 — Closed

**Codex PASS on the full Codex-owned matrix (11 rows), 2026-05-29.** Production head at closure: `2f315bf` (also includes #140 short-link interstitial and #141 artifact cleanup which landed alongside the matrix).

Closure receipt (rows that Codex verified end-to-end on production):

| Row | Feature | PRs that fixed regressions during the matrix | Status |
|-----|---------|---|---|
| 1 | Sign-up + email/password login | — | ✅ |
| 2 | Volunteer invite + join | — | ✅ |
| 3 | Schedule create → publish → notify | — | ✅ |
| 4 | Volunteer self-service availability | — | ✅ |
| 5 | Kiosk happy + revoked-token + duplicate-prevention + lookup audit | #133, #136, #139 | ✅ (Codex half; Jason half = label print on a real printer) |
| 6 | Room reservation | — | ✅ |
| 7 | Calendar feed (.ics + rotation) | — | ✅ (Codex half; Jason half = Apple/Google subscribe) |
| 8 | Short links + allowlisted external interstitial | #140 | ✅ |
| 9 | Stripe checkout wiring (monthly + annual + trial) | — | ✅ (Codex half; Jason half = live charge smoke) |
| 10 | Stripe customer portal session | — | ✅ (Codex half; Jason half = live update/cancel) |
| 11 | Stripe webhook idempotency | — | ✅ |
| 12 | Notifications inbox | — | ✅ |
| 13 | Reminders cron | — | ✅ |
| 14 | Stats refresh cron | — | ✅ |
| 15 | Worship planning + ProPresenter export wiring | — | ✅ (Codex half; Jason half = ProPresenter import + play) |
| 16 | Audit log | — | ✅ |
| 17 | Account / org deletion + Stripe wiring + index fix | #136 (purge + index) | ✅ (Codex half; Jason half = live customer-record cleanup) |

Six Jason-half rows remain — they don't gate Wave 9 (Check-In hardening), only Wave 8 (customer comms). Jason can knock them out at any pace; they involve physical printers, real calendar apps, real Stripe charges, etc.

### Decisions baked in (Wave 7)

- **Codex never runs real live-mode Stripe payments** — wiring-only on production; charge/cancel/refund are Jason's halves.
- **Throwaway live church pattern** — each row that mutated data spun a fresh church (`/dashboard/account/delete-account` cleanup at the end). Row 17 doubled as cleanup + test.
- **Residual finding fix-forward, not block** — Codex Sev 3 ("security_code surfaced on idempotent re-checkin") fixed in #139 before closing the wave; no fatal blocker emerged.

### Recurring bug class observed (Wave 7)

**Idempotency tells the truth about response shape.** The Wave 7 Sev 3 was a check-in route returning a duplicate-warning that still echoed the security code — fine for first-write, leaked detail on idempotent retry. Pattern: **whenever a route is idempotent, hand-author the duplicate response separately rather than reusing the first-write response shape**. Captured in `src/app/api/checkin/checkin/route.ts` (PR #139) and added to the "review-checklist for idempotent endpoints."

---

## Wave 9 — Active (Best-in-class Child Check-In safety)

Triggered by Outreach Magazine's "New Trends in Kids Check-In" + the 109-agent deep-research workflow that surfaced ECAP / PCO / KidCheck / GuideOne industry patterns. Jason's explicit framing: *"almost nothing is more important than handling children properly, respectfully, and safely."* Active plan: `/Users/jasonpaschall/.claude/plans/i-want-you-to-iterative-spring.md` (5 P0 phases, ~25 days, supersedes the original launch-readiness plan).

### P0-1 — Station type architecture — SHIPPED (2026-05-30)

| PR | Commit | Scope |
|----|--------|-------|
| #142 | `52b5e6d` | `KioskStation.type: "self_service" \| "staffed"`; `KioskScope[]` narrowed per station type (self-service excludes `checkout`); `requireKioskToken` now reads the token's actual persisted scope (was hardcoded to ALL_SCOPES — silent gap closed); `changeStationType()` transactionally revokes the active token and issues a fresh activation code; `kiosk.checkout_blocked_self_service` + `kiosk.station_type_changed` audit codes; admin Stations create form + per-row "Change to X" affordance; kiosk top-bar hides Check Out toggle on self-service stations (renders "Self-service" label instead); legacy stations get back-compat `"staffed (legacy)"` default at read time. |

**Codex production retest PASS** on `52b5e6d` (`docs/ux-review/passes/launch-readiness/CODEX_CHECKIN_P01.md`). Verified end-to-end:
- Self-service station: type=`self_service`, scopes exclude `checkout`, direct checkout returns 403 + audit row.
- Staffed station: type=`staffed`, scopes include `checkout`, direct checkout succeeds.
- Change-type flow: old token revoked, new activation code issued, audit row carries `from_type` / `to_type`.

### Decisions baked in (Wave 9, current as of P0-1 close)

- **All 5 P0 phases pre-launch** (~25 days; Jason 2026-05-29 authorized).
- **Tier strategy:** Child Check-In stays Growth+; ALL safety features included in Growth+ (no tier-gating on child safety as a moral floor + competitive moat); pre-check-in SMS stays Pro; SMS monitoring (not metering) per Jason 2026-05-29.
- **Background-check vendor:** abstraction + MinistrySafe adapter pre-launch (P1-6).
- **HIPAA stance:** HIPAA-aware (per-field medical visibility, encrypted storage, retention) without making a formal HIPAA claim.
- **Two-deep "related adults count":** counts as 1 volunteer but does NOT satisfy `min_unrelated_adults` (Jason 2026-05-29).
- **Authorized-pickup photo capture:** strongly recommended at registration, never blocking; "incomplete" badge until populated.
- **Custody-order storage:** Firebase Storage with `read=false, write=false` rules — server-side signed-URL pattern only.
- **Parent self-service pickup-list cooling-off:** 24h before parent-initiated changes take effect; both household primaries notified.
- **Blocked-pickup override authority:** Owner role ONLY; operator on-site cannot self-override.
- **Emergency Response Team:** new `CheckInSettings.emergency_notification_numbers` — SMS in parallel to owner on blocked-pickup attempts (Jason 2026-05-29).
- **Audit retention:** 7 years (matches ECAP guidance) — implemented as a future cron pass.
- **Operator training tabletop exercise:** deferred to help-articles phase (task #21); per-org "Operator Training" toggle in admin onboarding tracked in P0-2/P0-5 PRs.

### Privacy architecture decision (P0-2 foundation, 2026-05-30)

Plan called for `ChildProfile.blocked_pickups` + `UnifiedHousehold.household_blocked_pickups`. **Implementation deviates** — both are now in a single top-level subcollection `churches/{churchId}/checkin_blocked_pickups/{id}` (server-only client rules, `allow read,write: if false`), with a `scope: "child" | "household"` discriminator + `child_id` / `household_id` fields. Reason: `people/{docId}` is volunteer-readable (line 174 of `firestore.rules`), so embedding the most sensitive surface in the system in `ChildProfile` would leak custody-order data to every active member. Same logic for not embedding in `UnifiedHousehold` (org-admin readable, but server-only matches the pattern for `checkInSessions` / `check_in_codes` / `checkinAlerts` — the most consistent privacy boundary).

### P0-2 — Authorized-pickup photos + block list + ERT — SHIPPED (2026-05-30 → 2026-05-31)

Multi-PR sub-phase per the plan ("PR per phase, or per substantial sub-step in P0-2 and P0-5"). Shipped as 7 sub-PRs + 1 hotfix; Codex production retest PASS on each Codex-tested sub-PR (D, E, F-hotfix, G-hotfix). Sub-PRs A/B/C/E2 were small/server-only and Codex was not engaged per the standing rule ("Codex's efforts are best leveraged for physical-interaction navigation or genuine second-opinion technical input" — Jason 2026-05-30).

| Sub-PR | PR | Commit | Scope | Codex |
|---|---|---|---|---|
| **A — foundation** | #143 → reverted #147 → re-landed #156 | `42b2110` | Data model deltas (`PersonAuthorizedPickup`, `BlockedPickup`, `CheckInSettings.emergency_notification_numbers`, `KioskStation.type`); audit code additions across `pickup.*` + `kiosk.checkout_blocked_*` + `kiosk.blocked_pickup_attempted` + `kiosk.ert_notified`; `firestore.rules` updates (`checkin_blocked_pickups/**: read=false, write=false` — server-only); `storage.rules` updates (`checkin-photos/**: read=false, write=false`). | — |
| **B — server CRUD** | #144 → reverted #149/#150 → re-landed inside #156 | `42b2110` | Authorized-pickup POST + PATCH + DELETE; blocked-pickup GET + POST + PATCH + DELETE; settings PUT ERT-aware. After re-land moved from `children/[personId]/authorized-pickups[/[pickupId]]/route.ts` → flat `authorized-pickups/[id]/route.ts` per the bundler-bug workaround (see below). `child_id` moved to body. | — |
| **C — photos** | #145 → reverted #147 → re-landed #157 | `e93fd20` | `src/lib/server/checkin-photos.ts` (`uploadCheckInPhoto`, `getCheckInPhotoSignedUrl`, `buildCheckInPhotoPath`, `isCheckInPhotoPathFor`); photo POST + signed-URL serving routes; custody-order document upload (`blocked-pickups/[id]/document/route.ts`). | — |
| **D — households UI** | #146 → reverted #147 → re-landed #158 | `ba5d0b4` | `<PhotoCapture>` greenfield component (webcam via `getUserMedia` + `<input capture>` mobile fallback); `<AuthorizedPickupPanel>` on `/dashboard/checkin/households/[id]`. | ✅ PASS on `ba5d0b4` (`CODEX_CHECKIN_P02D.md`) |
| **E — blocked-pickup panel** | #159 | `8526eb8` | `<BlockedPickupPanel>` side-by-side with authorized list on household detail; per-entry photo + document upload affordances; scope-aware (child vs. household). | ✅ PASS on `8526eb8` (`CODEX_CHECKIN_P02E.md`) |
| **E2 — ERT settings UI** | #162 | `becb8ec` | `<ErtSettingsSection>` admin UI with E.164 validation (`/^\+[1-9]\d{6,14}$/`); per-recipient name + role. Persists to `CheckInSettings.emergency_notification_numbers`. | — |
| **F — kiosk attempt + ERT** | #160 → Sev 1 caught by Codex → hotfix #161 | `735e325` | Kiosk-side intercept: `<BlockedPickupReview>` full-screen modal before release; `<BlockedPickupAlert>` confirmed-attempt full-screen alarm; `/api/checkin/blocked-pickup-attempt` ERT SMS fan-out (parallel to owner); defense-in-depth `acknowledged_blocks` gate in `/api/checkin/checkout`; query-predicate fix (the Sev 1 — `where("status","==","checked_in")` referenced a non-existent field). | ✅ PASS on `735e325` (`CODEX_CHECKIN_P02F_HOTFIX.md`) |
| **G — parent self-service** | #163 → 2 findings → hotfix #164 | `4b38ac5` | `/dashboard/account/family/pickups` parent UI; `/api/account/family/pickups` GET + POST; `/api/account/family/pickups/[id]/{request,cancel}-removal` with 24h cooling-off; `notifyHouseholdAdults` email fan-out via Resend (initiator excluded); `pickup.authorized_parent_{added,remove_requested,remove_canceled,change_notified}` audit codes. Hotfix: cancel-removal wrote `undefined` (Firestore rejects) → write `null`; parent GET didn't filter elapsed pending entries → server-side `filterElapsed`. | ✅ PASS on `4b38ac5` (`CODEX_CHECKIN_P02G_HOTFIX.md`) |

**Deferred from P0-2 (intentional — not blocking P0 close):**
- Past-pending cleanup cron (G v2) — for now, elapsed entries linger in the doc but are filtered at read time on the parent surface.
- Discoverability link from `/dashboard/account/family` to the new pickup-list page — Codex flagged as a known follow-up.
- Integration test re-land (was task #30) — original `tests/integration/checkin-pickups.test.ts` (519 lines) targets the pre-flat-path route shape (`children/[personId]/...`); re-landing is now a rewrite against the new `authorized-pickups/[id]` shape + `requireModuleTier` mock, not a re-land. Tracking in task #30; not blocking P0-3.

### Next.js 16 bundler bug — root cause + workaround

During P0-2 D landing (PR #146, commit `176ef9a`), production hit a regression where every Firebase-backed API route hung ~30s with zero response bytes — even routes whose imports weren't touched (e.g. `/api/church-info`). Emergency revert (PR #147 / `ef8def2`) restored service. The investigation file (now consolidated into `docs/dev/nextjs-16-bundler-bug.md`) bisected the cause to a single Next.js 16 app-router bundler bug:

> A `route.ts` file at `[param]/static/[param]/route.ts` (TWO dynamic segments separated by a literal segment) corrupts the build artifacts of EVERY Firebase-backed Vercel function — even ones that don't import the offending route. Verified with PR #154 which shipped a 3-line empty GET handler at exactly that path and reproduced the global hang.

**Workaround applied across P0-2 re-lands:** all routes flatten to a single dynamic segment with the other ID in the request body. `children/[personId]/authorized-pickups/[pickupId]/route.ts` → `authorized-pickups/[id]/route.ts` (`child_id` in body). All four reverted sub-PRs (foundation/CRUD/photos/households-UI) and three subsequent sub-PRs (E/F/G) ship clean against this pattern. Upstream Next.js issue draft lives in `docs/dev/nextjs-16-bundler-bug.md` (task #31 — Jason can submit when convenient).

---

## Next up

- **Wave 9 P0-3** queued — `Person.restrictions[]` + `cannot_serve_with_children` hard block + `Person.background_check.sor_*` field + scheduler-level enforcement in `canServeInMinistry()` + raw `background_check.expires_at` scan added to `/api/cron/prerequisite-check`.
- **Wave 9 P0-4** queued — HIPAA-aware medical visibility.
- **Wave 9 P0-5** queued — ratio enforcement + worker check-in (biggest differentiator).
- **Wave 1.2b CSP enforce flip**: lands ~2026-06-02 (calendar reminder).
- **Wave 7 Jason halves**: 6 manual confirmations on a flexible schedule; don't gate Wave 9.
- **Deferred — Wave 5 Batch E phase 2** (Schedules + Service Day server endpoints): pure admin-page perf; revisit post-launch.
- **Console-noise cleanup — DONE (2026-05-28)**: `useNotifications` onSnapshot error handler treats `permission-denied` as benign.
- **Wave 3.4 long-tail route sweep**: incremental as files get touched.
- **Polish item from Wave 4.2 retest**: clearer UI copy when MFA enrollment fails because the user's email isn't verified. Carry as standalone polish.
