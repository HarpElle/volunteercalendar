# Launch Verification Matrix (Wave 7)

The pre-launch "all functionality fully and reliably operational" gate. Walk
**every** core feature end-to-end on the **production** deployment, happy path
**and** one failure path each. Mark a row ✅ only when **both** paths behave
correctly **and** the expected `audit_logs` / `cron_runs` record was written
(where applicable).

Source matrix: `production-launch-plan.md` §7 (Track G). Sign-off here gates
Wave 8 (customer comms + marketing).

## How to run this

- **Use a throwaway live church** — create a fresh org to delete at the end
  (row 17 doubles as the cleanup + a test in itself). Codex creates its own for
  its rows; the Stripe/kiosk manual checks can reuse one.
- **Stripe rows (9–11):** production is Stripe **live mode**, so there's no
  "test card." Either (a) use a real card you immediately cancel/refund, or
  (b) verify the same flow in Stripe **test mode** on a preview deploy and spot-
  check live with one real transaction. Note which you did.
- **Audit checks:** Settings → Activity (`/dashboard/settings/activity`) or the
  `audit_logs` collection. Cron checks: `/dashboard/platform/cron-runs`.
- Record the date, who ran it, and any notes per row. A failure path that
  surfaces a *graceful* error (not a crash/leak) counts as pass.

**Status legend:** ✅ pass · ❌ fail (file an issue) · ⬜ not yet run · ➖ N/A

**Owner legend:**
- **Codex** — Codex verifies the whole row autonomously (UI/API flows + audit/cron checks) against production with a throwaway church + test account.
- **Codex + Jason** — Codex verifies the server/API side; the device/client/payment part is Jason's manual confirmation (called out per row below). Both halves must pass for ✅.

> Codex must **not** complete real live-mode Stripe payments — it verifies wiring up to the payment step only. Real charges, physical label printing, and subscribing the iCal feed in a calendar app are the Jason halves.

---

## Sign-off summary

| # | Feature | Owner | Status | Date | By | Notes |
|---|---------|-------|:------:|------|----|-------|
| 1 | Sign up + email/pw login | Codex | ✅ | 2026-05-29 | Codex | Wave 7 PASS |
| 2 | Volunteer invite + join | Codex | ✅ | 2026-05-29 | Codex | Wave 7 PASS |
| 3 | Schedule create → publish → notify | Codex | ✅ | 2026-05-29 | Codex | Wave 7 PASS |
| 4 | Volunteer self-service availability | Codex | ✅ | 2026-05-29 | Codex | Wave 7 PASS |
| 5 | Children's check-in (kiosk) | Codex + Jason | ⬜ | | | Codex ✅ 2026-05-29 (PR #136 + residual #139); **Jason pending: label print on real printer** |
| 6 | Room reservation | Codex | ✅ | 2026-05-29 | Codex | Wave 7 PASS |
| 7 | Calendar feed (iCal) | Codex + Jason | ⬜ | | | Codex ✅ 2026-05-29 (.ics + rotation); **Jason pending: Apple/Google Calendar subscribe** |
| 8 | Short links | Codex | ✅ | 2026-05-29 | Codex | Wave 7 PASS; Sev 3 interstitial adjudicated **working-as-designed** |
| 9 | Stripe checkout → upgrade (monthly + annual + trial) | Codex + Jason | ⬜ | | | Codex ✅ 2026-05-29 (wiring); **Jason pending: live monthly + annual + trial smoke** |
| 10 | Stripe customer portal | Codex + Jason | ⬜ | | | Codex ✅ 2026-05-29 (portal session); **Jason pending: live update/cancel/interval switch** |
| 11 | Stripe webhook idempotency | Codex | ✅ | 2026-05-29 | Codex | Wave 7 PASS |
| 12 | Notifications inbox | Codex | ✅ | 2026-05-29 | Codex | Wave 7 PASS |
| 13 | Reminders cron | Codex | ✅ | 2026-05-29 | Codex | Wave 7 PASS |
| 14 | Stats refresh cron | Codex | ✅ | 2026-05-29 | Codex | Wave 7 PASS |
| 15 | Worship planning + ProPresenter export | Codex + Jason | ⬜ | | | Codex ✅ 2026-05-29 (export file generation); **Jason pending: ProPresenter import + play** |
| 16 | Audit log | Codex | ✅ | 2026-05-29 | Codex | Wave 7 PASS |
| 17 | Account / org deletion | Codex + Jason | ⬜ | | | Codex ✅ 2026-05-29 (PR #136 purge + index fix); **Jason pending: Stripe customer/sub canceled confirmation** |

**Overall sign-off:** ⬜ — _Jason, date: _____________  
_All Codex-side rows ✅ as of 2026-05-29 (PR #136 remediation + residual). Final sign-off pending the 6 Jason-half rows (label print, calendar subscribe, Stripe live × 2, ProPresenter, Stripe customer cleanup). These can be knocked out at any pace — gating only Wave 8 customer comms._

---

## Detailed steps

### 1. Sign up + email/password login
- **Owner:** Codex
- **Happy:** Register a new org → land in dashboard; welcome email arrives.
- **Failure:** Wrong password is rejected; "Forgot password" sends a reset email and the link works; accepting an invite via email lands in the right org.
- **Audit:** `org.create` (actor = new owner). _Login itself isn't audited._

### 2. Volunteer invite + join
- **Owner:** Codex
- **Happy:** Admin invites a volunteer; invitee accepts; appears as active member in the correct org.
- **Failure:** An expired/used invite is rejected; joining with a different email than invited is handled gracefully.
- **Audit:** `membership.invite`, then `membership.accept_invite` (and `membership.approve` if the org uses approval).

### 3. Schedule create → publish → notify
- **Owner:** Codex
- **Happy:** Generate a schedule, publish it; assignment + notification emails arrive; assignments become visible to volunteers on My Schedule.
- **Failure:** Simulate a Resend outage mid-publish (e.g., temporarily bad key) → the `notification_outbox` drains/recovers on the next cron run, no lost notifications.
- **Audit:** `schedule.publish`; `schedule.notify_leads` if "Request approval / notify leads" is used.

### 4. Volunteer self-service availability
- **Owner:** Codex
- **Happy:** Volunteer sets unavailability on My Availability; scheduler sees it while drafting.
- **Failure:** Concurrent edit (two tabs) resolves without clobbering / surfaces a save error.
- **Audit:** ➖ none expected (availability edits aren't audited).

### 5. Children's check-in (kiosk)
- **Owner:** Codex + Jason — _Codex: the activate/lookup/checkin/checkout API flow + audits + revoked-token handling. Jason: physical label printing on a real printer._
- **Happy:** Activate a kiosk station; look up a household; check a child in; print a label; check out.
- **Failure:** Checking in the same child twice is prevented; a revoked kiosk token ends the session cleanly.
- **Audit:** `kiosk.activate`, `kiosk.lookup`, `kiosk.checkin`, `kiosk.checkout` (+ `kiosk.station_revoke`, `kiosk.medical_data_revealed` if exercised).

### 6. Room reservation
- **Owner:** Codex
- **Happy:** Create a one-off and a recurring reservation; the booking wizard prevents an overlapping booking.
- **Failure:** Two admins booking the same room/time → the transaction blocks the second (conflict surfaced, not double-booked).
- **Audit:** ➖ none expected. Verify the conflict is enforced server-side (reservation transaction).

### 7. Calendar feed (iCal)
- **Owner:** Codex + Jason — _Codex: the `.ics` endpoint returns data + token rotation invalidates the old URL. Jason: subscribe in Apple/Google Calendar and confirm updates appear._
- **Happy:** Subscribe to a personal feed in Apple/Google Calendar; an assignment change shows up within the revalidation window.
- **Failure:** Rotating/revoking the feed token invalidates the old subscription URL (old URL stops returning data).
- **Audit:** ➖ none expected.

### 8. Short links
- **Owner:** Codex
- **Happy:** An internal short link redirects correctly; an **allowlisted** external target redirects directly.
- **Failure:** A disallowed (non-allowlisted) external URL is rejected (404/notFound).
- **Audit:** `short_link.create_external` when an external target is created.
- **Adjudicated (2026-05-28, Codex Wave 7 Sev 3):** there is intentionally **no interstitial** — the security model is allowlist-or-reject (`validateTargetUrl` → `relative | volunteercal | allowlist`, else rejected). A trusted (allowlisted) host redirects directly; an untrusted one never redirects at all. The original "shows the interstitial" expectation was an incorrect assumption. A "you're leaving VolunteerCal" interstitial for external links is an **optional future UX nicety**, not a security requirement — Jason's call whether to add it.

### 9. Stripe checkout → upgrade (monthly + annual + trial) — _Wave 6_
- **Owner:** Codex + Jason — _Codex: session creation, redirect, and tier-enforcement logic, WITHOUT completing a live payment. Jason: one real paid upgrade in live mode (monthly + annual), confirming `subscription_interval` + the 14-day trial._
- **Happy:** Free org → **monthly** checkout completes → tier flips, enforcement unlocks. Repeat with **annual** → church doc shows `subscription_interval: "year"` + "· Billed annually". New paid signup shows a **14-day trial** (Stripe sub status `trialing`, tier granted immediately).
- **Failure:** Card declined is handled; an existing **paid** org upgrading does **not** get a fresh trial (trial gated to free→paid).
- **Audit:** `billing.subscription_created` (+ `org.tier_change` if emitted on tier flip).

### 10. Stripe customer portal
- **Owner:** Codex + Jason — _Codex: portal session creation + return. Jason: actually update payment method / switch interval / cancel in live mode._
- **Happy:** Open the portal; update payment method; switch monthly↔annual; cancel.
- **Failure:** Cancel mid-cycle → tier persists until period end, then downgrades.
- **Audit:** `billing.subscription_updated`, `billing.subscription_canceled`.

### 11. Stripe webhook idempotency
- **Owner:** Codex
- **Happy:** Replay a delivered event (Stripe dashboard → resend) → no duplicate side effects (`stripe_processed_events` dedupe).
- **Failure:** A webhook with a bad signature is rejected (401), no state change.
- **Audit:** No *new* audit/tier change on replay.

### 12. Notifications inbox
- **Owner:** Codex
- **Happy:** An event (e.g., new assignment) creates an inbox entry; the unread badge updates; mark-as-read works.
- **Failure:** High volume (~50 notifications) paginates without breaking the UI; no console `permission-denied` spam (fixed in #130).
- **Audit:** ➖ none expected.

### 13. Reminders cron
- **Owner:** Codex
- **Happy:** A scheduled volunteer receives the 48h + 24h reminder.
- **Failure:** A retried cron run sends **zero** duplicates (per-(assignment,kind,channel) idempotency from Wave 2.1).
- **Check:** `cron_runs` entry for the reminders cron (status + counts).

### 14. Stats refresh cron
- **Owner:** Codex
- **Happy:** The daily run completes inside `maxDuration` (300s) and writes platform stats + per-org snapshots.
- **Failure:** One org's bad data doesn't abort the whole run (others still complete).
- **Check:** `cron_runs` entry; `/dashboard/platform` totals refresh.

### 15. Worship planning + ProPresenter export
- **Owner:** Codex + Jason — _Codex: plan build + export file generation + cron_runs failure flagging. Jason: confirm the exported file imports/plays in ProPresenter._
- **Happy:** Build a service plan; export to ProPresenter / song-usage CSV; file delivered.
- **Failure:** An export failure is flagged in `cron_runs` (not silent).
- **Audit:** `export.song_usage` / `export.assignments` where the export path audits.

### 16. Audit log
- **Owner:** Codex
- **Happy:** The ops exercised above appear in Activity with the **correct actor** and action code.
- **Failure:** A non-owner/non-admin cannot read `audit_logs` (rule enforced — owner/admin only).
- **Audit:** This row *is* the audit verification.

### 17. Account / org deletion
- **Owner:** Codex + Jason — _Codex: delete a throwaway church → subcollections + Storage purged, `org.delete` audit, must-cancel-first guard. Jason: confirm in the Stripe dashboard that a deleted org's customer/subscription is canceled (pairs with row 9)._
- **Happy:** Owner deletes the throwaway org → all subcollections + Storage purged; Stripe subscription canceled; receipts retained.
- **Failure:** An owner with an **active** subscription is required to cancel first (or cancellation is handled as part of deletion).
- **Audit:** `org.delete` (actor = owner).

---

## Cleanup
Row 17 deletes the throwaway church(es). Confirm in the Stripe dashboard that
each test customer/subscription is canceled, and that no orphaned
Firestore/Storage data remains for those church_ids.
