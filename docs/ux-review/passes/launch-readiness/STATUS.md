# Launch-Readiness — Status

Single-page tracker. Updated at the close of each wave + on every Codex
round-trip. Full plan lives at `/Users/jasonpaschall/.claude/plans/i-want-you-to-iterative-spring.md`.

---

## Wave summary

| Wave | Scope | PRs | Last commit | Status |
|------|-------|-----|-------------|--------|
| **0** | Admin-aware org activity + marketing rollup | #87 #88 #89 #90 | `f2d2e2f` | ✅ Closed |
| **1** | Observability + safety nets (`log.ts`, CSP enforce, Firestore backups) | — | — | ⏸ Next |
| **2** | Make writes survive failure (reminder idempotency, assignment-rule perf, cron_runs) | — | — | ⏸ Queued |
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

Both fixes consolidated the pattern (`computeMarketingRollup` helper, JS-filter alignment). Future cross-path additions should default to a shared helper from the start. **Adding this to the launch plan's workflow patterns section** for the next session.

### Marketing metrics now available

The five rollup fields are live in `platform/stats.marketing`. Both auto-refresh nightly (5 AM UTC cron) and on-demand via the Platform admin "Refresh Stats" button:

- `total_active_orgs` — orgs with status === "active" after admin-aware activity signal
- `total_volunteers_all_orgs` — sum of `memberships.volunteer` across orgs
- `total_services_all_orgs` — sum of `counts.services`
- `scheduled_assignments_30d` — sum of `assignments_by_day` across orgs
- `events_with_signups_30d` — count of orgs with any assignment activity in the past 30 days

Ready for landing-page hero copy when Wave 8 / marketing comes around.

---

## Open Codex findings

None as of `f2d2e2f`.

---

## Manual deploy log

- (None for launch-readiness; PR #82 auto-deploy is armed but no rules / indexes touched yet in this pass)

---

## Next up

**Wave 1 item 1**: `src/lib/log.ts` structured logging wrapper. ~1 day. After that:
- Item 2: CSP enforcement promotion (2-PR sequence over a week)
- Item 3: Daily Firestore backups (Jason runs `gcloud` commands; I provide the runbook)
