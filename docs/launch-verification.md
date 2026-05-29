# Launch Verification Matrix (Wave 7)

The pre-launch "all functionality fully and reliably operational" gate. Walk
**every** core feature end-to-end on the **production** deployment, happy path
**and** one failure path each. Mark a row ✅ only when **both** paths behave
correctly **and** the expected `audit_logs` / `cron_runs` record was written
(where applicable).

Source matrix: `production-launch-plan.md` §7 (Track G). Sign-off here gates
Wave 8 (customer comms + marketing).

## How to run this

- **Use a throwaway live church** — create a fresh org you can delete at the
  end (row 17 doubles as the cleanup + a test in itself).
- **Stripe rows (9–11):** production is Stripe **live mode**, so there's no
  "test card." Either (a) use a real card you immediately cancel/refund, or
  (b) verify the same flow in Stripe **test mode** on a preview deploy and spot-
  check live with one real transaction. Note which you did.
- **Audit checks:** Settings → Activity (`/dashboard/settings/activity`) or the
  `audit_logs` collection. Cron checks: `/dashboard/platform/cron-runs`.
- Record the date, who ran it, and any notes per row. A failure path that
  surfaces a *graceful* error (not a crash/leak) counts as pass.

**Legend:** ✅ pass · ❌ fail (file an issue) · ⬜ not yet run · ➖ N/A

---

## Sign-off summary

| # | Feature | Status | Date | By | Notes |
|---|---------|:------:|------|----|-------|
| 1 | Sign up + email/pw login | ⬜ | | | |
| 2 | Volunteer invite + join | ⬜ | | | |
| 3 | Schedule create → publish → notify | ⬜ | | | |
| 4 | Volunteer self-service availability | ⬜ | | | |
| 5 | Children's check-in (kiosk) | ⬜ | | | |
| 6 | Room reservation | ⬜ | | | |
| 7 | Calendar feed (iCal) | ⬜ | | | |
| 8 | Short links | ⬜ | | | |
| 9 | Stripe checkout → upgrade (monthly + annual + trial) | ⬜ | | | |
| 10 | Stripe customer portal | ⬜ | | | |
| 11 | Stripe webhook idempotency | ⬜ | | | |
| 12 | Notifications inbox | ⬜ | | | |
| 13 | Reminders cron | ⬜ | | | |
| 14 | Stats refresh cron | ⬜ | | | |
| 15 | Worship planning + ProPresenter export | ⬜ | | | |
| 16 | Audit log | ⬜ | | | |
| 17 | Account / org deletion | ⬜ | | | |

**Overall sign-off:** ⬜ — _Jason, date: _____________

---

## Detailed steps

### 1. Sign up + email/password login
- **Happy:** Register a new org → land in dashboard; welcome email arrives.
- **Failure:** Wrong password is rejected; "Forgot password" sends a reset email and the link works; accepting an invite via email lands in the right org.
- **Audit:** `org.create` (actor = new owner). _Login itself isn't audited._

### 2. Volunteer invite + join
- **Happy:** Admin invites a volunteer; invitee accepts; appears as active member in the correct org.
- **Failure:** An expired/used invite is rejected; joining with a different email than invited is handled gracefully.
- **Audit:** `membership.invite`, then `membership.accept_invite` (and `membership.approve` if the org uses approval).

### 3. Schedule create → publish → notify
- **Happy:** Generate a schedule, publish it; assignment + notification emails arrive; assignments become visible to volunteers on My Schedule.
- **Failure:** Simulate a Resend outage mid-publish (e.g., temporarily bad key) → the `notification_outbox` drains/recovers on the next cron run, no lost notifications.
- **Audit:** `schedule.publish`; `schedule.notify_leads` if "Request approval / notify leads" is used.

### 4. Volunteer self-service availability
- **Happy:** Volunteer sets unavailability on My Availability; scheduler sees it while drafting.
- **Failure:** Concurrent edit (two tabs) resolves without clobbering / surfaces a save error.
- **Audit:** ➖ none expected (availability edits aren't audited).

### 5. Children's check-in (kiosk)
- **Happy:** Activate a kiosk station; look up a household; check a child in; print a label; check out.
- **Failure:** Checking in the same child twice is prevented; a revoked kiosk token ends the session cleanly.
- **Audit:** `kiosk.activate`, `kiosk.lookup`, `kiosk.checkin`, `kiosk.checkout` (+ `kiosk.station_revoke`, `kiosk.medical_data_revealed` if exercised).

### 6. Room reservation
- **Happy:** Create a one-off and a recurring reservation; the booking wizard prevents an overlapping booking.
- **Failure:** Two admins booking the same room/time → the transaction blocks the second (conflict surfaced, not double-booked).
- **Audit:** ➖ none expected. Verify the conflict is enforced server-side (reservation transaction).

### 7. Calendar feed (iCal)
- **Happy:** Subscribe to a personal feed in Apple/Google Calendar; an assignment change shows up within the revalidation window.
- **Failure:** Rotating/revoking the feed token invalidates the old subscription URL (old URL stops returning data).
- **Audit:** ➖ none expected.

### 8. Short links
- **Happy:** An internal short link redirects correctly; an external target requires the allowlist + shows the interstitial.
- **Failure:** A disallowed external URL is rejected.
- **Audit:** `short_link.create_external` when an external target is created.

### 9. Stripe checkout → upgrade (monthly + annual + trial) — _Wave 6_
- **Happy:** Free org → **monthly** checkout completes → tier flips, enforcement unlocks. Repeat with **annual** → church doc shows `subscription_interval: "year"` + "· Billed annually". New paid signup shows a **14-day trial** (Stripe sub status `trialing`, tier granted immediately).
- **Failure:** Card declined is handled; an existing **paid** org upgrading does **not** get a fresh trial (trial gated to free→paid).
- **Audit:** `billing.subscription_created` (+ `org.tier_change` if emitted on tier flip).

### 10. Stripe customer portal
- **Happy:** Open the portal; update payment method; switch monthly↔annual; cancel.
- **Failure:** Cancel mid-cycle → tier persists until period end, then downgrades.
- **Audit:** `billing.subscription_updated`, `billing.subscription_canceled`.

### 11. Stripe webhook idempotency
- **Happy:** Replay a delivered event (Stripe dashboard → resend) → no duplicate side effects (`stripe_processed_events` dedupe).
- **Failure:** A webhook with a bad signature is rejected (401), no state change.
- **Audit:** No *new* audit/tier change on replay.

### 12. Notifications inbox
- **Happy:** An event (e.g., new assignment) creates an inbox entry; the unread badge updates; mark-as-read works.
- **Failure:** High volume (~50 notifications) paginates without breaking the UI; no console `permission-denied` spam (fixed in #130).
- **Audit:** ➖ none expected.

### 13. Reminders cron
- **Happy:** A scheduled volunteer receives the 48h + 24h reminder.
- **Failure:** A retried cron run sends **zero** duplicates (per-(assignment,kind,channel) idempotency from Wave 2.1).
- **Check:** `cron_runs` entry for the reminders cron (status + counts).

### 14. Stats refresh cron
- **Happy:** The daily run completes inside `maxDuration` (300s) and writes platform stats + per-org snapshots.
- **Failure:** One org's bad data doesn't abort the whole run (others still complete).
- **Check:** `cron_runs` entry; `/dashboard/platform` totals refresh.

### 15. Worship planning + ProPresenter export
- **Happy:** Build a service plan; export to ProPresenter / song-usage CSV; file delivered.
- **Failure:** An export failure is flagged in `cron_runs` (not silent).
- **Audit:** `export.song_usage` / `export.assignments` where the export path audits.

### 16. Audit log
- **Happy:** The ops exercised above appear in Activity with the **correct actor** and action code.
- **Failure:** A non-owner/non-admin cannot read `audit_logs` (rule enforced — owner/admin only).
- **Audit:** This row *is* the audit verification.

### 17. Account / org deletion
- **Happy:** Owner deletes the throwaway org → all subcollections + Storage purged; Stripe subscription canceled; receipts retained.
- **Failure:** An owner with an **active** subscription is required to cancel first (or cancellation is handled as part of deletion).
- **Audit:** `org.delete` (actor = owner).

---

## Cleanup
Row 17 deletes the throwaway church. Confirm in the Stripe dashboard that its
customer/subscription is canceled, and that no orphaned Firestore/Storage data
remains for that church_id.
