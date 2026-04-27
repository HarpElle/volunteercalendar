# Functionality Testing — Schedules

Service definition through schedule generation, publishing, volunteer confirmation, and reminders.

## Prerequisites

- Onboarding tests passed; you have an org with at least 5 active volunteers across 3+ teams (Worship, Tech, Children, etc.)
- Each volunteer has an email address Firebase recognizes
- Owner/admin role for the test scenarios

---

## Test 1 — Create a recurring service

**Steps**
1. Dashboard → Services & Events → New Service
2. Name: "Sunday Morning Service"
3. Day of week: Sunday, time: 9:00 AM – 10:30 AM
4. Add roles: Worship leader (1), Vocalist (2), Drums (1), AV (1), Greeter (2). Set ministry per role.
5. Save

**Expected**
- Service appears in the list
- Roles have ministry assignments
- Setup-guide step "Set up a service or event" marked complete

**Verify**
| Where | What |
|---|---|
| Firestore `churches/{churchId}/services` | One doc with the role array populated |

☐ **Pass / Fail**: ___

---

## Test 2 — Set volunteer availability + skills

**Steps**
1. People → pick a volunteer → edit
2. Add skills: e.g. "Guitar, Vocals"
3. Add a blockout date (next Sunday) — the volunteer is unavailable
4. Save

**Expected**
- Profile shows skills and the blockout
- Schedule generator (Test 3) should NOT assign this volunteer for that date

**Verify**
| Where | What |
|---|---|
| Firestore `churches/{churchId}/people/{personId}` | `scheduling_profile.skills` has the values; `scheduling_profile.blockout_dates` includes the date |

☐ **Pass / Fail**: ___

---

## Test 3 — Generate a draft schedule

**Steps**
1. Schedules → New Schedule
2. Date range: next 4 Sundays
3. Click Generate (or Auto-fill)

**Expected**
- Schedule with 4 service occurrences appears in DRAFT status
- Each role has a candidate volunteer assigned (or marked vacant if no one fits)
- Volunteer from Test 2 is NOT assigned for next Sunday

**Verify**
| Where | What |
|---|---|
| Firestore `churches/{churchId}/schedules/{scheduleId}` | New doc, `status: "draft"` |
| Firestore `churches/{churchId}/assignments` | Multiple new assignment docs, each with `schedule_id` matching |
| Coverage report on the schedule | Shows fill % and any vacancies |

☐ **Pass / Fail**: ___ Notes (any unfilled roles?): ___

---

## Test 4 — Edit assignments manually

**Steps**
1. From the draft schedule, click into an assignment cell
2. Change the volunteer from auto-assigned to a different one
3. Save

**Expected**
- The assignment doc updates immediately
- Conflict warnings appear if the new person is already assigned elsewhere that day

☐ **Pass / Fail**: ___

---

## Test 5 — Publish the schedule (transactional outbox)

**Steps**
1. From the draft → click **Publish**
2. Note the moment you click

**Expected**
- The publish completes within ~1 second (no waiting for Resend)
- Banner says "Published — N emails enqueued"
- Schedule status flips to `published`
- Assignment docs get a `confirmation_token` field

**Verify**
| Where | What | When |
|---|---|---|
| Firestore `churches/{churchId}/schedules/{id}` | `status: "published"`, `published_at` timestamp | Immediately |
| Firestore `notification_outbox` | New `pending` rows, one per assigned volunteer with email | Immediately |
| Activity page | New `schedule.publish` entry, sage dot | Immediately |
| Volunteers' inboxes | Confirmation emails | **Within 2 minutes** (outbox cron drains every 2 min) |
| Firestore `notification_outbox` rows | Status flipped from `pending` → `sent` | After ~2 min |

If you check the outbox 5 min after publish and see still-`pending` rows or `attempts > 0`, something's wrong with the drain cron or with Resend itself. Tell me.

☐ **Pass / Fail**: ___ Time-to-inbox: ___

---

## Test 6 — Volunteer confirms an assignment (Yes)

**Steps**
1. As a volunteer (from a fresh incognito + the email you got)
2. Click the "Yes, I'm in" button in the confirmation email
3. Land on `/confirm/{token}` page → confirm

**Expected**
- Confirmation success page shows
- Owner dashboard now shows that assignment as `confirmed`

**Verify**
| Where | What |
|---|---|
| Firestore `churches/{churchId}/assignments/{id}` | `status: "confirmed"`, `confirmed_at` timestamp |
| Owner's schedule view | Volunteer name highlighted as confirmed (sage indicator) |

☐ **Pass / Fail**: ___

---

## Test 7 — Volunteer declines

**Steps**
1. As another volunteer, open their email and click the "Can't make it" / decline button
2. On the confirm page, mark declined

**Expected**
- Status flips to `declined`
- Owner sees the role go back to "vacant" or open
- Re-running the schedule generator should fill the gap

**Verify**
| Where | What |
|---|---|
| Firestore `churches/{churchId}/assignments/{id}` | `status: "declined"` |
| Schedule fill rate on dashboard | Decreases by 1 |

☐ **Pass / Fail**: ___

---

## Test 8 — Reminder cron fires (24h + 48h)

**Manual trigger** (instead of waiting for noon UTC):

```bash
curl -X GET "https://volunteercal.com/api/cron/reminders?hours=48" \
  -H "Authorization: Bearer $CRON_SECRET"
```

(You'll need `CRON_SECRET` from Vercel; copy it locally without echoing.)

**Expected**
- Response: `{ "success": true, "sent_email": N, "sent_sms": M, ... }`
- Volunteers with assignments 48h out get reminders
- Already-reminded ones (E.4 idempotency) are skipped

**Verify**
| Where | What |
|---|---|
| Volunteer inboxes | Reminder emails arrive |
| Firestore `churches/{churchId}/assignments/{id}` | `reminder_sent_at` array gains a `reminder_48h:{ts}` entry |

**Repeat for 24h reminders**:
```bash
curl -X GET "https://volunteercal.com/api/cron/reminders?hours=24" \
  -H "Authorization: Bearer $CRON_SECRET"
```

☐ **Pass / Fail (48h)**: ___ ☐ **Pass / Fail (24h)**: ___

---

## Test 9 — Idempotency: run reminders twice

**Steps**
1. Immediately run the 48h reminder curl from Test 8 a second time

**Expected**
- Response: `sent_email: 0`, `skipped: N` — nothing re-sent
- No duplicate emails arrive at volunteer inboxes

**Why it matters**: this proves Track E.4. Vercel sometimes retries cron failures; without idempotency, a flaky run can double-send.

☐ **Pass / Fail**: ___

---

## Test 10 — Shift swap

**Steps** (Phase 2 if not built yet — check sidebar for Swaps)
1. As a volunteer with an assignment, request a swap
2. Pick another eligible volunteer
3. Send the swap request

**Expected**
- Other volunteer gets an email/notification
- They can accept or decline
- On accept, both assignments flip ownership atomically

☐ **Pass / Fail**: ___

---

## Test 11 — Unpublish / cancel a schedule

**Steps**
1. From a published schedule, click Unpublish (or Delete)
2. Confirm

**Expected**
- Status flips to `draft` (or doc deleted)
- Assignments get marked appropriately
- (Optional) Notification email goes out telling volunteers their service was canceled

☐ **Pass / Fail**: ___

---

## Failure modes to watch

- **Outbox stale** — if `notification_outbox` rows stay `pending` for > 5 minutes after publish, drain cron isn't firing or Resend is rejecting. Check Vercel logs for `/api/cron/outbox-drain`.
- **Email arrives multiple times** — E.4 idempotency broken. Tell me.
- **Confirmation token expired** — confirmation links should work for at least 30 days; if they 404 sooner, regression.
- **Volunteer sees wrong service** — schedule scoped to wrong church; tenant isolation regression.
- **Reminder for declined assignment** — the reminder cron should skip declined ones.

## What I can't test for you

- Email deliverability (Resend → mailbox)
- Email rendering across clients (Gmail web, Apple Mail, Outlook desktop, mobile)
- The volunteer's actual UX of clicking the email button on a mobile device
