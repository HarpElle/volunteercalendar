# Functionality Testing — Activity / Audit Log

The owner-visible Activity feed at `/dashboard/org/activity` and its underlying `audit_logs` Firestore collection. Used by admins to see what happened, when, and (where applicable) by whom.

## Prerequisites

- Onboarding done; admin or owner role
- Some real activity has occurred (schedule publish, kiosk enrollment, billing event, etc.)
- Optional: Sentry env vars set so any errors during loading get captured

---

## Test 1 — Activity link visible in sidebar

**Steps**
1. As admin → look in left sidebar under "Organization"

**Expected**
- "Activity" link visible (between Billing and Settings)
- Volunteer-only accounts do NOT see this link

**Verify**
| Where | What |
|---|---|
| Sidebar in admin account | Link present |
| Sidebar in volunteer account | Link absent |

☐ **Pass / Fail**: ___

---

## Test 2 — Activity page renders

**Steps**
1. Click Activity link
2. Wait for page to load

**Expected**
- Page renders within ~2 seconds
- Filter chips at top: All / Schedule / Memberships / Billing / Children's check-in / Organization / Short links
- List of recent events with: action label, summary, actor, relative timestamp, color dot
- Most recent at top

**Verify**
| Where | What |
|---|---|
| Network tab | GET `/api/admin/audit-logs?church_id=...&limit=50` returns 200 |
| Response body | `entries` array, `next_cursor` if > 50 entries exist |

☐ **Pass / Fail**: ___

---

## Test 3 — Filter by category

**Steps**
1. Click each filter chip in turn: Schedule, Memberships, Billing, Children's check-in, Organization, Short links

**Expected**
- Each filter shows only matching action types
- "All activity" returns to the unfiltered view
- URL doesn't change (state is local; intentional for now)

☐ **Pass / Fail**: ___

---

## Test 4 — Pagination ("Load older")

**Steps**
1. If there are >50 entries, scroll to bottom and click "Load older"
2. Verify the next batch appears

**Expected**
- Up to 50 more entries appended
- "Load older" button stays visible if more remain, hides if at the end

**Note**: pagination uses cursor-based on `created_at`. Composite index for `audit_logs (church_id, created_at desc)` was added in Batch 6 — should work cleanly.

☐ **Pass / Fail**: ___

---

## Test 5 — Recent kiosk action audit trail

**Steps**
1. From the kiosk testing doc, perform a check-in for a child with allergies (Test 10 of `jason-functionality-testing-childrens-checkin.md`)
2. Within ~5 seconds, refresh the Activity page

**Expected**
- New `kiosk.checkin` entry appears at top with sage dot, summary "2 children (with alerts)"
- New `kiosk.medical_data_revealed` entry appears showing 1 child record was accessed
- Both entries show actor "Kiosk" (or station-specific identifier)

**Verify**
| Where | What |
|---|---|
| Firestore `audit_logs` | New docs with church_id matching, action matching |
| Activity page | Both visible after refresh |

☐ **Pass / Fail**: ___

---

## Test 6 — Schedule publish audit

**Steps**
1. Publish a schedule (see schedules doc Test 5)
2. Refresh Activity page

**Expected**
- `schedule.publish` entry appears
- Summary shows email-enqueue count
- Color: sage (no failures at enqueue time)

**Note**: The audit fires when emails are *enqueued*, not when delivered. The actual delivery happens 1-2 minutes later via the outbox drain. If you want to see drain failures, you'd need a separate `outbox.dead_letter` audit hook (currently not wired).

☐ **Pass / Fail**: ___

---

## Test 7 — Stripe billing audit

**Steps**
1. Perform a billing action (upgrade, refund, cancel — see billing doc)
2. Refresh Activity

**Expected**
- For each Stripe webhook event you triggered, a corresponding audit entry:
  - `billing.subscription_created` for the upgrade
  - `billing.invoice_paid` for the recurring payment
  - `billing.subscription_canceled` if you canceled
- All show actor "System" (Stripe-driven server actions)

☐ **Pass / Fail**: ___

---

## Test 8 — Org delete audit

**Steps** (do this on a throwaway test org!)
1. As owner of a test org → Settings → delete organization → confirm
2. Before the cascade-delete completes, the audit entry has already been written

**Expected**
- `org.delete` entry appears in audit_logs (check Firestore directly since the org is now gone)
- Metadata captures the org name, member count, and whether it had a Stripe subscription
- Important: audit_logs survives the org deletion (separate top-level collection)

**Verify**
| Where | What |
|---|---|
| Firestore `audit_logs` | Filter by `target_id == deletedChurchId` → should show the `org.delete` entry |

☐ **Pass / Fail**: ___

---

## Test 9 — Color-coded outcome dots

**Steps**
1. Look at the dots next to action labels in the Activity feed

**Expected**
- Sage green dot: outcome `ok` (most actions)
- Coral red dot: outcome `failed` (e.g., schedule publish where some emails failed)
- Amber dot: outcome `denied` (when authz blocks something)

**Test by triggering a failure** (skip if too tedious):
- Manually break an email template, publish a schedule, see if `schedule.publish` shows up as coral

☐ **Pass / Fail**: ___

---

## Test 10 — Volunteer can't see Activity

**Steps**
1. As a volunteer (not admin) → try to navigate to `/dashboard/org/activity` directly

**Expected**
- "You don't have access to this page" message
- API call to `/api/admin/audit-logs` returns 403

**Verify** that the `requireOrgAdmin` check in the route fires correctly.

☐ **Pass / Fail**: ___

---

## Test 11 — Other org's data not visible

**Steps**
1. As admin of org A → navigate to Activity
2. Check that nothing from org B appears (you'd need to be a member of both orgs to verify firsthand)

**Expected**
- All entries scoped to your active church_id
- Cross-tenant data isolation respected

☐ **Pass / Fail**: ___

---

## Test 12 — Performance with many entries

**Steps**
1. Trigger ~100 activity events (publish a few schedules, do many kiosk check-ins)
2. Load the Activity page

**Expected**
- Initial 50 entries load in < 2 seconds
- "Load older" pagination works smoothly

☐ **Pass / Fail**: ___

---

## Failure modes to watch

- **Activity link missing for admins** — sidebar gating broken. Fix is in `src/components/dashboard/sidebar.tsx`.
- **Activity entries missing for actions you just performed** — audit hook not wired in that route. Tell me which action you did, I'll add the hook.
- **Stale entries** — audit_logs uses Firestore which is realtime; should be fast. If 30-second-old events aren't showing after refresh, there's a bug.
- **Sensitive data leaking into metadata** — audit metadata should NEVER contain medical content, raw phone numbers, etc. Reference IDs only. Check any new audit calls if you spot it.

## Audit hooks currently wired

For reference, here are the audit actions that get logged today:

| Action | Where it fires | Source |
|---|---|---|
| `kiosk.station_create` | `/api/admin/kiosk/stations` POST | server |
| `kiosk.station_revoke` | `/api/admin/kiosk/stations/[id]` DELETE | server |
| `kiosk.station_reissue_code` | `/api/admin/kiosk/stations/[id]` POST | server |
| `kiosk.checkin` | `/api/checkin/checkin` after success | kiosk |
| `kiosk.register_visitor` | `/api/checkin/register` after success | kiosk |
| `kiosk.medical_data_revealed` | `/api/checkin/child-alerts` when allergies returned | kiosk |
| `schedule.publish` | `/api/schedules/[id]/publish` after batch commit | user |
| `org.delete` | `/api/organization` DELETE before cascade | user |
| `billing.subscription_created` | Stripe webhook `checkout.session.completed` | system |
| `billing.subscription_updated` | Stripe webhook `customer.subscription.updated` | system |
| `billing.subscription_canceled` | Stripe webhook `customer.subscription.deleted` AND dunning cron | system |
| `billing.invoice_paid` | Stripe webhook `invoice.payment_succeeded` | system |
| `billing.invoice_failed` | Stripe webhook `invoice.payment_failed` | system |
| `billing.dispute_created` | Stripe webhook `charge.dispute.created` | system |

## Audit hooks deferred (Phase 2)

These are valuable but require server-migration of existing client-side writes:
- `membership.invite`, `membership.approve`, `membership.role_change`, `membership.remove`
- `kiosk.lookup`, `kiosk.checkout` (medium-priority — currently audit only fires on the most-sensitive actions)
- Data export actions
- Short link external creation

## What I can't test for you

- Real-world distribution across days/weeks — patterns only emerge with sustained use
- Whether the action labels are clear to a non-technical owner
