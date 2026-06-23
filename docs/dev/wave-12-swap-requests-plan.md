# Wave 12: Volunteer Swap Requests + Day-Of Emergency Path — multi-PR plan

**Status:** Planning. No code yet. Read tomorrow morning before approving.
**Date drafted:** 2026-06-01 (Monday evening session close-out)
**Author:** Claude (with Jason's Anchor Falls Church scheduling feedback as the primary input, and a deep codebase audit by an Explore sub-agent)
**Time-cost estimate:** 2-3 sub-PRs, ~4-7 hours total. Significantly smaller than originally feared because the backend already exists.

---

## What problem this solves

Today, when a scheduled volunteer can't make their shift, the only built-in tool is a "Can't Make It" link in their /dashboard/my-schedule that emails the scheduler + admins. There's no team-side broadcast, no peer acceptance, no day-of urgency signal. Jason's small team handles this by group text.

**Two distinct scenarios to enable:**

### Scenario A — Advance-notice swap (proactive, T-3+ days)
> _"I know two weeks ahead that I can't serve June 15. Can someone on my team take it, or swap a date with me?"_

Volunteer opens their assignment → taps "Request a Swap" → optionally proposes one of their other shifts as a trade → notification broadcasts to teammates → first to claim wins → scheduler gets an FYI after the fact (no action required). If no one bites within ~24h of the shift, auto-escalates to scheduler.

### Scenario B — Day-of emergency (urgent, T-0)
> _"I woke up sick. I won't make today's service."_

Distinct "I can't make it TODAY" button → urgent SMS straight to scheduler + admin, bypassing peer broadcast. Skips team broadcast because last-minute scrambles need full-context decision-makers, not hopeful broadcasts.

### Per-org / per-team enable
Orgs choose whether to turn on peer-swap. Some teams welcome it (worship team); others reject it (kids check-in needs background-checked volunteers — opening to free-for-all peer swap is risky). V1 ships org-level toggle. Per-team toggle is a later follow-up.

---

## What exists today (from the codebase audit)

### Already implemented ✅
- **SwapRequest data model**: `src/lib/types/index.ts:896-928`
  - Status lifecycle: `open | pending_admin | approved | auto_approved | cancelled | expired`
  - Fields: requester_volunteer_id, replacement_volunteer_id, reason, reviewed_by, reviewed_at
- **Full CRUD API**: `src/app/api/swap/route.ts` (POST / GET / PATCH)
  - POST: create swap request (Bearer JWT OR confirmation_token from public link)
  - GET: list eligible replacements with ministry/role/double-booking filters
  - PATCH: accept / approve / reject / cancel (with admin approval gate where needed)
  - Sets Assignment.status to `"substitute_requested"` on creation
  - Fires `swap_resolved` in-app notifications on accept
- **Firestore rules**: `firestore.rules:270-273` — `swap_requests` collection readable/writable by active members
- **Notification types**: `UserNotificationType` already includes `"swap_request"` and `"swap_resolved"`
- **SchedulerNotificationPreferences**: already supports `swap_request` as an enabled_type with channel + ministry scoping (lines 80-100 in types)
- **Absence flow**: `src/app/api/notify/absence/route.ts` — full implementation
  - Marks assignment `attended: "excused"`
  - Resolves admins + schedulers scoped to the ministry
  - Sends email via Resend (`buildAbsenceAlertEmail`)
  - Sends optional SMS via Twilio when preference enabled + phone present
  - Creates in-app notification (type "absence_alert")
  - Logs to `sent_notifications`
- **Cant-Make-It UI**: `src/app/dashboard/my-schedule/page.tsx:932-941` — button + modal already wired
- **Auto-reschedule logic**: `src/lib/services/auto-reschedule.ts` — exists but only triggers on confirmation-decline, not on absence-alert or swap
- **Feature flags infrastructure**: `src/lib/utils/feature-flags.ts` — per-tier defaults + per-org override
- **Audit primitive**: `src/lib/server/audit.ts` — ready for new codes

### Tier-2: partially there 🟡
- **Auto-reschedule** exists but doesn't fire on swap creation
- **Feature flags** infrastructure exists; no swap-related flag yet
- **Team roster queries** scattered (no single "get all volunteers on ministry X assigned to date Y" helper)

### NOT implemented — what this Wave actually has to build ❌
1. **Volunteer-facing swap UI** — no modal/button to create or accept swaps anywhere in the dashboard. The API works; nobody can call it.
2. **Team-wide broadcast of swap requests** — when a swap is created, teammates aren't notified; only the requester sees it
3. **Day-of vs. advance-notice distinction** — same absence flow regardless of timing; no urgent SMS escalation
4. **Swap expiration cron** — `"expired"` status exists but no job marks them
5. **Swap acceptance from a public link** — confirmation_token is supported in POST but no UI surface for accepting
6. **Feature flag toggle** for the swap flow
7. **In-app swap-discovery feed** — "swaps I can cover" view

---

## Sub-PR breakdown

### Sub-PR A — Volunteer swap UI: create + discover + accept

**Goal:** a scheduled volunteer can tap "Request a Swap" from their schedule page → creates a SwapRequest via the existing POST /api/swap → teammates see open requests in a new "Open Swap Requests" section → they can accept → assignment transfers via existing PATCH /api/swap. No new backend; all UI + the team-broadcast notification.

**Scope:**
- New component: `RequestSwapModal` mirroring the existing `CantMakeItModal` shape
  - Live next to "Can't Make It" button on `/dashboard/my-schedule`
  - Optional reason note
  - Type selector: "Just need someone to cover" (sub) vs. "Trade with one of my other shifts" (swap) — for v1, only sub. Swap-trade can be Sub-PR B follow-up.
  - Submit → POST to existing `/api/swap`
- New section on `/dashboard/my-schedule`: "Open swap requests" (visible to other team members)
  - Lists open SwapRequests where caller is in the same ministry but is NOT the requester and is NOT already-scheduled-that-date
  - Each row: "John needs cover for Worship — Sun Jun 15, Lead Vocals" + [Cover] button
  - Reuse GET /api/swap?status=open with ministry-scoped filter
- Team-broadcast notification (extends the existing POST /api/swap handler):
  - After creating the SwapRequest, resolve the requester's ministry teammates
  - For each, fire `createUserNotification(type: "swap_request", ...)` with deep-link
  - Also fire an SMS if the user has SMS notification preference enabled — reuse the same Twilio + preference pattern as the absence-alert path
- Acceptance UI: tap [Cover] → confirm modal → PATCH /api/swap?action=accept → toast "You're now scheduled for Sun Jun 15. We've let John know."
- Audit codes: add `assignment.swap_requested`, `assignment.swap_accepted` to `AuditAction` union; wire emits

**Files touched:** ~5-7 (new modal, new section in my-schedule, audit emits, broadcast helper in swap route, types tweak).

**Estimated:** 3-4 hours.

---

### Sub-PR B — Day-of urgency path

**Goal:** when a volunteer reports they can't make a shift that's TODAY (or within next ~12h), the system uses a distinct "URGENT" SMS path to scheduler + admin, bypassing peer-broadcast. Existing absence-alert flow gets a timing branch.

**Scope:**
- `CantMakeItModal` — when the shift is within 12 hours, swap label to "I can't make it TODAY" with a coral/urgent badge styling
- `/api/notify/absence` — detect when the shift_date - now < 12h; if so:
  - Skip the "courtesy email" template
  - Use a distinct `buildUrgentAbsenceAlertEmail` template (subject prefix: "🚨 URGENT")
  - Force SMS even if scheduler's standard pref is email-only (urgent channel override)
  - In the in-app notification metadata, set `urgency: "today"` so the inbox displays it with coral accent
- New audit code: `assignment.urgent_absence`
- New email template: `src/lib/utils/emails/urgent-absence-alert.ts`

**Files touched:** ~4 (modal copy/styling, absence route timing branch, new email template, audit code).

**Estimated:** 1.5-2 hours.

---

### Sub-PR C — Swap expiration cron + auto-escalate

**Goal:** open swap requests automatically transition to either `expired` (after the service date passes) or escalate to the scheduler 24h before the service. Keeps the system tidy and ensures no volunteer is left hanging.

**Scope:**
- Extend the existing cron infra (`src/lib/services/auto-reschedule.ts` precedent or a new cron in `src/app/api/cron/*`)
- Hourly job: find SwapRequests where status=open AND service_date - now < 24h
  - Mark `escalated` (new status value to add to the union)
  - Send `swap_request` notification to the scheduler with urgency flag
- Hourly job: find SwapRequests where status=open AND service_date - now < 0 (service date passed)
  - Mark `expired`
- Update audit codes to reflect transitions

**Files touched:** ~3 (new cron route or extension, type union update, audit codes).

**Estimated:** 1-1.5 hours.

---

### Sub-PR D (optional) — Feature flag + per-team toggle

**Goal:** orgs can disable the peer-swap path entirely (default behavior = enabled or disabled? — see open question). Within enabled orgs, individual team leads can disable for their specific team.

**Scope:**
- Extend `feature_flags` with `volunteer_swap_enabled: boolean` defaulting to `true` (or `false` — open question)
- Add `Ministry.allow_peer_swaps?: boolean` (defaults to "inherit from org" when undefined)
- Settings → Organization: "Peer swap requests" toggle
- Settings → Teams → individual team: "Allow peer swaps for this team" override
- Backend gates: `/api/swap` POST returns 403 when org/team disabled

**Files touched:** ~4 (flag, settings UI sections, backend gates, Ministry type).

**Estimated:** 1-1.5 hours.

---

## Recommended execution order

1. **Sub-PR A first** — the missing UI that turns existing backend into a usable feature. Highest user value per LOC.
2. **Sub-PR B second** — day-of urgency. Different scenario, different path, but a small focused PR.
3. **Sub-PR C third** — completes the lifecycle (escalation + expiration). Polish.
4. **Sub-PR D last** — feature flag + per-team toggle. Defer unless a real org requests it.

If Sub-PRs A + B land before Sunday, Jason can demo the full peer-swap flow + the urgent path at his church.

---

## Open questions for Jason

1. **Default for new orgs**: peer swap enabled or disabled out of the box?
   - **Recommendation: enabled.** It's a useful feature; opt-out admins can flip it off. Existing churches would have a one-time email "we added this; here's the toggle if you'd like to disable."
2. **Sub-only vs. sub-or-trade for v1?** The existing API supports both; the UI complexity for "trade with which of my other shifts" is nontrivial. Recommendation: ship "sub only" first; add "trade" as Sub-PR A2 if there's demand.
3. **Day-of trigger window**: 12 hours feels right, but should be reviewed. Other plausible thresholds: 6h, 24h.
4. **Broadcast scope**: SMS + in-app + email, or just in-app + SMS? Recommendation: SMS + in-app for V1 (matches the urgency of swap requests; email is heavier and most volunteers ignore email).
5. **Conflict detection**: if Sarah accepts John's June 15 shift but Sarah is ALREADY on a different team's schedule for June 15, do we warn? Recommendation: warn ("You're already scheduled June 15 for Children's Check-In — still cover this?") + allow override.
6. **Auto-suggest** (V2): the system already has volunteer-availability data via the auto-scheduler. Should we auto-suggest the 2-3 best candidates rather than broadcasting to the whole team? Recommendation: defer to V2.

---

## Notification copy proposals (Jason: tweak as desired)

**Peer broadcast SMS:**
> "Sub needed: John can't make Sun Jun 15 (Worship — Lead Vocals). Open in VolunteerCal: volunteercal.com/swap/abc123"

**Peer broadcast in-app:**
> Subject: Sub needed — Worship Team
> Body: John needs someone to cover Lead Vocals on Sunday, June 15. [Cover this shift]

**Acceptance to requester:**
> "Sarah took your June 15 shift. You're all set."

**Acceptance to scheduler (FYI):**
> "John → Sarah swap accepted for June 15 Worship. No action needed."

**Day-of urgent SMS to scheduler + admin:**
> "🚨 URGENT: John can't make TODAY's 9am Worship (Lead Vocals). Reason: Sick. Tap to assign: volunteercal.com/schedule/..."

**Escalation to scheduler (24h before, no taker):**
> "Heads up: John's June 15 swap request has been open 36h with no taker. Tap to resolve."

---

## Cross-references with other planned work

- **Wave 11 (Org Branding)** — if it lands first, the new swap-related transactional emails inherit the church's logo branding. Otherwise, swap emails ship with VolunteerCal branding and re-brand themselves later.
- **W11 Check-In Badge Rollout** — already shipped today (#211). Doesn't intersect with swap work.

---

## Surprise win from the audit

Originally I was bracing for a full data-model + backend + Firestore-rules + audit-codes build. **It's already done.** The original swap implementation was scoped for an internal/admin flow that never got UI'd; we just need to bring the latent feature to the volunteer-facing surface.

That's an unusually good "discover existing infrastructure" outcome. Net result: this Wave is **~4-7 hours** rather than the originally estimated 10-15.
