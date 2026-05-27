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
| **4** | Audit coverage + MFA + Notify Ministry Leads + `/status` page | #110 (4.1 only) | (pending merge) | ⏳ In progress |
| **5** | UX polish + **assignment-rule tightening** (a11y, focus, contrast, server components, image optimization, terminology, My Schedule refactor + rule lock-down) | — | — | ⏸ Queued |
| **6** | Annual billing (20% off) + custom Firebase auth domain | — | — | ⏸ Queued |
| **7** | Production verification matrix (17 features × happy + failure) | — | — | ⏸ Queued |
| **8** | Customer comms + outreach + marketing | — | — | ⏸ Queued |

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

## Wave 4 — In progress (4.1 in PR)

### Closed pieces

| Item | PR | Commit | Scope |
|------|----|--------|-------|
| 4.1 | #110 | `5994089` | `audit_logs` coverage audit. New `/api/memberships/[id]` PATCH+DELETE absorbs direct-Firestore membership mutations from `firestore.ts` so every lifecycle change emits an audit row. `audit()` calls added across invite + batch invite + tier override + kiosk activate + kiosk checkout + org create + the three CSV export endpoints + short-link (allowlist external only). New AuditAction `membership.accept_invite`. 12 integration tests in `tests/integration/membership-mutations.test.ts`. Full suite 262 passing. Codex retest doc at `CODEX_WAVE_4_1.md`. |

### Intentionally skipped audits (deferred or replaced)

- **`kiosk.lookup`**: high-volume per Sunday; redundant with the existing `kiosk.medical_data_revealed` row.
- **`schedule.unpublish` / `schedule.delete`**: no dedicated server endpoint yet; client deletes go through generic `removeChurchDocument`. Add audits when a real route lands.
- **`org.transfer_ownership`**: feature not built.

### Codex retest doc

`docs/ux-review/passes/launch-readiness/CODEX_WAVE_4_1.md` — send to Codex after Vercel serves the post-merge build (2–5 min after squash merge).

### Remaining Wave 4 items (not in this PR)

- **4.2 MFA opt-in surface** in Account → Security (Firebase Auth TOTP)
- **4.3 real "Notify Ministry Leads" endpoint** (Growth+) — currently a stub button
- **4.4 `/status` + `/changelog` route** for the rollout receipt

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

## Next up

- **Wave 4.1 Codex retest** (after PR #110 merges + Vercel deploys): use `docs/ux-review/passes/launch-readiness/CODEX_WAVE_4_1.md`
- **Wave 4.2**: MFA opt-in surface in Account → Security (Firebase Auth TOTP)
- **Wave 4.3**: real "Notify Ministry Leads" endpoint (Growth+) — currently a stub button
- **Wave 4.4**: `/status` + `/changelog` route for the rollout receipt
- **Wave 1.2b CSP enforce flip**: lands ~2026-06-02 (calendar reminder)
- **Wave 3.4 long-tail route sweep**: incremental as files get touched
