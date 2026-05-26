# Launch-Readiness — Status

Single-page tracker. Updated at the close of each wave + on every Codex
round-trip. Full plan lives at `/Users/jasonpaschall/.claude/plans/i-want-you-to-iterative-spring.md`.

---

## Wave summary

| Wave | Scope | PRs | Last commit | Status |
|------|-------|-----|-------------|--------|
| **0** | Admin-aware org activity + marketing rollup | #87 #88 #89 #90 | `f2d2e2f` | ✅ Closed |
| **1** | Observability + safety nets (`log.ts`, CSP report-to, Firestore backups) | #92 #93 #94 | `fa20385` | ✅ Closed except 1.2b (CSP enforce, ~1 wk wait) |
| **2** | Make writes survive failure (reminder idempotency, assignment-rule denorm, cron_runs) | #95 #96 #97 | `065e92f` | 🟡 2.1 + 2.3 done; **2.2 in progress** |
| **3** | Auth/validation library coverage (zod, route migration sweep) | — | — | ⏸ Queued |
| **4** | Audit coverage + MFA + Notify Ministry Leads + `/status` page | — | — | ⏸ Queued |
| **5** | UX polish (a11y, focus, contrast, server components, image optimization, terminology) | — | — | ⏸ Queued |
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

### Active piece: 2.2 — schedule.status denorm

Codex flagged the per-read `get()` cost on the assignment rule. Current rule allows all active members to read all assignments (any status); draft-visibility lives at the application layer (My Schedule client filter + `/api/calendar` server filter). 

**Goal**: denormalize `schedule.status` onto each assignment as a `schedule_status` field, then tighten the firestore rule to check the denormalized field. Tighter security + no get() cost.

**Why this needs a Codex retest gate**: the previous attempt at tightening this exact rule (Pass G Codex Round 1) broke volunteers' My Schedule page entirely because Firestore's list-query rule engine couldn't statically prove the `get()` predicate safe. The denorm approach should avoid that pitfall, but Codex needs to confirm before the rule auto-deploys.

**Status**: PR in flight; will not auto-merge until Codex PASS.

---

## Open Codex findings

None merged as of `065e92f`. Wave 2.2 PR will request a fresh Codex retest before merging.

---

## Manual deploy log

- 2026-05-26 14:22 UTC: First successful auto-deploy of `firestore.rules` (PR #96 + #97 chain). Wave 2.3 `cron_runs` rule live.

---

## Workflow patterns (reinforced this session)

- **Cron-vs-manual drift**: when two paths produce the same field, extract the helper FIRST (don't fix the drift after the fact)
- **Rules auto-deploy → no rollback window**: PRs that modify EXISTING rules (vs. add new ones) deserve a Codex retest gate before merge. Adding new collection rules with explicit-deny is safe to autonomously merge.
- **GitHub status before assumption**: check https://www.githubstatus.com before diagnosing "account suspended"-style errors. Today's Wave 2.3 dispatch failure was caused by a GitHub-side Actions auth incident (2026-05-26 10:57 → 13:18 UTC), not anything on our side.

---

## Next up

**Wave 2.2** is the active piece (in progress). After it Codex-passes and merges:

- Wave 2 closes
- Wave 3 starts: extend `src/lib/server/authz.ts` + adopt `zod` + ~30 high-risk route migrations
- Wave 1.2b CSP enforce flip lands ~2026-06-02 (calendar reminder)
