# Production Smoke Test Report

**Date:** 2026-04-27
**Run by:** Claude (autonomous)
**Production URL:** https://volunteercal.com

## Summary

✅ **All security boundaries pass.** Every protected endpoint correctly rejects unauthenticated / unsigned / unauthorized requests with the right status code. Public surfaces respond as expected.

One issue surfaced and fixed during the run: **Vercel Hobby tier was blocking deploys** because of a sub-daily cron schedule introduced in Batch 6. Production had been stuck on Batch 5's build for hours. Discovered, fixed, and re-deployed during this run. See "Issues found and fixed" section.

## Tests run

### Cron routes (must reject without `CRON_SECRET`)

| Route | No header | Bad Bearer | Expected | Status |
|---|---|---|---|---|
| `/api/cron/reminders` | 401 | 401 | 401 | ✅ |
| `/api/cron/stats-refresh` | 401 | 401 | 401 | ✅ |
| `/api/cron/notification-cleanup` | 401 | n/a | 401 | ✅ |
| `/api/cron/propresenter-export` | 401 | n/a | 401 | ✅ |
| `/api/cron/prerequisite-check` | 401 | n/a | 401 | ✅ |
| `/api/cron/outbox-drain` | 401 (was 404 pre-deploy) | n/a | 401 | ✅ |
| `/api/cron/dunning` | 401 (was 404 pre-deploy) | 401 | 401 | ✅ |

`requireCronSecret` is enforcing fail-closed correctly. The previously fail-open `/api/cron/propresenter-export` (Codex audit finding) now rejects the same as the others.

### Kiosk routes (must reject without `X-Kiosk-Token`)

| Route | Method | Without token | Expected | Status |
|---|---|---|---|---|
| `/api/checkin/lookup` | POST | 401 | 401 | ✅ |
| `/api/checkin/checkin` | POST | 401 | 401 | ✅ |
| `/api/checkin/checkout` | POST | 401 | 401 | ✅ |
| `/api/checkin/register` | POST | 401 | 401 | ✅ |
| `/api/checkin/print` | POST | 401 | 401 | ✅ |
| `/api/checkin/printer-config` | POST | 401 | 401 | ✅ |
| `/api/checkin/services` | GET | 401 | 401 | ✅ |

Track B Phase 1's kiosk gate is enforcing on every protected check-in endpoint. The unauthenticated-children's-PII vulnerability identified in the original audit is closed.

### Other authenticated endpoints

| Route | Method | Without auth | Expected | Status |
|---|---|---|---|---|
| `/api/welcome` | POST | 401 | 401 | ✅ |
| `/api/billing/webhook` | POST (no signature) | 400 | 400 | ✅ |
| `/api/admin/audit-logs` | GET | 401 | 401 | ✅ |

`/api/welcome` no longer functions as an open Resend relay. Stripe webhook signature verification rejects unsigned events.

### Public endpoints (must work)

| Route | Method | Status |
|---|---|---|
| `/` (landing page) | GET | 200 ✅ |
| `/login` | GET | 200 ✅ |
| `/api/kiosk/activate` (empty body) | POST | 400 ✅ (correct error: "Missing code") |
| `/api/kiosk/activate` (fake code `00000000`) | POST | 404 ✅ (correct: code not found) |

Public surfaces respond. Activation endpoint returns the right error semantics for invalid input vs. unknown codes.

## Issues found and fixed

### Vercel Hobby tier blocking deploys

**Cause**: `/api/cron/outbox-drain` had a `*/2 * * * *` (every-2-minutes) schedule from Batch 6. Vercel Hobby tier limits crons to once per day max. Every deploy after Batch 6 silently failed (Vercel CLI showed the error: "Hobby accounts are limited to daily cron jobs").

**Effect**: Production was stuck on Batch 5's build (commit `f1cf34c`) for hours. Routes from Batch 6+ (outbox-drain, dunning, audit hooks at schedule publish + org delete, etc.) didn't exist on production despite being in `main`.

**Fix shipped** (commit `9ea2b02`):
1. `vercel.json`: outbox-drain schedule changed from `*/2 * * * *` to `0 13 * * *` (daily, 1pm UTC). Vercel accepts this on Hobby.
2. `/api/schedules/[id]/publish`: hybrid send strategy — inline Resend with outbox-on-failure fallback. Schedule confirmation emails arrive immediately on the happy path; on Resend outage they get retried from the outbox at the next daily drain.
3. `SHOULD_DO.md` updated with an action item recommending Vercel Pro upgrade. With Pro, the outbox-drain schedule can return to `*/2 * * * *` and the architecture works as originally designed.

**Verified after re-deploy**: all routes that 404'd before now correctly return 401. Security posture unchanged.

## Recommendations

1. **Upgrade Vercel to Pro** (~$20/month) — see SHOULD_DO.md Action D-2 for full rationale. Unlocks sub-daily crons, 300s function timeouts, removes scaling-friction across multiple subsystems.

2. **Verify the deploy timeline regularly** — the GitHub deployments record showed up to commit `f1cf34c` as Vercel-deployed, while local `main` was 5 commits ahead. Without the Vercel CLI inspect step, this would have stayed undetected. Consider periodically running:
   ```bash
   vercel inspect volunteercal.com 2>&1 | grep created
   ```
   And comparing to `git log --oneline -1`.

3. **Consider Vercel deploy-failure email alerts** — Vercel can email you on build failures. Make sure those are routed to an inbox you check, since CI won't catch a deploy-time tier-limit error.

## Coverage gaps

These were NOT tested as part of the smoke run; they need real user/device interaction:

- Kiosk activation flow on a real iPad
- Schedule publish → email arrival on a real volunteer's mailbox
- Twilio SMS delivery
- Stripe Checkout + Customer Portal interactive flows
- Wake-lock holding the room display screen on overnight
- Real concurrency: two browser tabs hitting the same reservation endpoint at the exact same millisecond (the local concurrency test in jason-functionality-testing-room-scheduling.md proves this manually)

Per-capability test docs (`jason-functionality-testing-*.md`) cover these for when you have time.
