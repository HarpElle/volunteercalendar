# Codex Retest — Wave 4.3 (Notify Ministry Leads endpoint)

> PR #111 shipped — verify after Vercel deploys the merge (2–5 min after squash).
> Production main should contain a new file at `src/app/api/schedules/[id]/notify-leads/route.ts`.

---

## What's in this PR

The "Request Approval" button on the Schedules approval UI (Growth+ tier, schedule in `in_review`) used to POST to `/api/schedules/[id]/approve` without a `ministry_id` — it silently 400'd. This PR:

1. Adds a real `/api/schedules/[id]/notify-leads` endpoint that enqueues an approval-request email per ministry lead via the existing notification outbox.
2. Rewires the button to hit the new endpoint and surface the sent + skipped counts in the existing toast.
3. Adds `schedule.notify_leads` to the AuditAction union; one audit row per call (not per email) with metadata: `ministries_in_scope, emails_queued, skipped, skipped_reasons[], coverage_period, target_date`.

The email goes through the existing outbox so it's drained by the next `/api/cron/outbox-drain` tick — verify by watching `notification_outbox` for `origin: "schedule.notify_leads"` rows.

---

## Scope of regression checks

### 1. Endpoint behaviour (curl with real Firebase ID tokens)

| # | Setup | Expected status | Expected effect |
|---|-------|-----------------|-----------------|
| 1.1 | Growth+ org, schedule in `in_review`, 2 ministries with `lead_email` set | 200 | 2 outbox rows + 1 `schedule.notify_leads` audit |
| 1.2 | Same setup, ministry has `lead_email = ""` | 200 with `skipped > 0` | Only ministries with email get outbox rows; `skipped_reasons` lists the empty one |
| 1.3 | Schedule has `ministry_ids: [worship-id]` | 200 with `ministries: 1` | Only worship lead emailed, even if other ministries in the church have leads |
| 1.4 | Same call repeated 7× within an hour | 429 on the 7th | Rate-limited per (user, schedule) at 6/hour |
| 1.5 | No `Authorization: Bearer ...` header | 401 | — |
| 1.6 | Volunteer-role token | 403 | — |
| 1.7 | Scheduler-role token | 403 (admin+ required) | — |
| 1.8 | Free-tier org | 403 with `required_tier: "growth"` | — |
| 1.9 | Starter-tier org | 403 with `required_tier: "growth"` | — |
| 1.10 | Schedule status `published` | 400 | — |
| 1.11 | Schedule status `approved` | 400 | — |
| 1.12 | Schedule does not exist | 404 | — |

### 2. UI behaviour (dashboard)

- **Growth+ org with in-review schedule + ministries with lead emails set**: Open `/dashboard/schedules`, select the in-review schedule. The ApprovalCountdown panel appears with a "Request Approval" button. Clicking it:
  - Shows the toast "Sent approval request to N team lead(s)."
  - If some ministries are missing lead emails, toast also reads "(M skipped — fill in team lead emails on the Teams page)".
  - `audit_logs` collection gets a `schedule.notify_leads` row.
  - `notification_outbox` collection gets N pending rows with `origin = "schedule.notify_leads"`.
- **Free/Starter org**: The button shouldn't even render (UI tier gate at line 1150 — `requireMinistryApproval && status === "in_review"` requires multi_stage_approval which is Growth+).
- **Owner / admin caller**: works. **Scheduler / volunteer caller**: button not visible to them since they can't see the in-review schedule grid; if they did somehow trigger the call, 403.

### 3. Outbox + drain integration

After clicking the button:
- `notification_outbox` row's `status` should be `pending` immediately.
- After the next `/api/cron/outbox-drain` tick (Vercel cron, every 5 min on Pro+; manual trigger possible), the row should flip to `sent` and the lead's inbox should receive the email.
- The email subject is "Review needed: {Ministry name} schedule for {coverage period}".
- The email body includes a "Review My Team's Schedule" CTA that links to `/dashboard/schedules?schedule={scheduleId}`.

### 4. Known intentional behaviours (not bugs — don't report)

- **No auto-fire on schedule.status → in_review transition.** Decided manual-only for the rollout period. May promote to auto-fire later.
- **Audit row count is one per call, not per email.** Avoids flooding the Activity feed when an admin notifies 15 leads at once.
- **Rate limit is per (user, schedule)**, not per user globally. An admin can notify leads on multiple different schedules within the same hour.
- **Reminder-style follow-up emails are NOT included in this PR.** Only the initial approval-request email. The existing approval-reminder template (`src/lib/utils/emails/approval-reminder.ts`) remains uncalled.

### 5. Severity rubric

- **Sev 1**: notification ends up at the wrong email address (cross-tenant or wrong ministry lead)
- **Sev 2**: button click returns 500, OR audit row written but no outbox rows enqueued, OR rate limit doesn't fire after 6 calls
- **Sev 3**: skipped count is wrong, OR toast doesn't surface skipped reasons, OR UI doesn't refresh after click
- **Sev 4**: email copy variant wrong (wrong ministry name in subject, wrong coverage period formatting)

---

## Save retest results to

`docs/ux-review/passes/launch-readiness/CODEX_WAVE_4_3_RESULTS.md`
