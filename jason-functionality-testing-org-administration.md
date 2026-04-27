# Functionality Testing — Organization Administration

Settings, member management, role changes, organization deletion, platform admin actions.

## Prerequisites

- Onboarding done; admin/owner role on a test org
- A second test org to test platform-admin operations across orgs
- Platform admin UID configured in Vercel `PLATFORM_ADMIN_UIDS` env var

---

## Test 1 — Org settings (general)

**Steps**
1. `Settings → General` (or `/dashboard/settings`)
2. Edit: name, slug, timezone, scheduling preferences
3. Save

**Expected**
- Changes persist on reload
- Slug must be unique (try saving with a slug that another org owns → expect 409)

**Verify**
| Where | What |
|---|---|
| Firestore `churches/{churchId}` | Updated fields |

☐ **Pass / Fail**: ___

---

## Test 2 — Workflow mode

**Steps**
1. Settings → set workflow mode (e.g., `auto_publish` vs `manual_approve`)
2. Save

**Expected**
- Subsequent schedule generation respects the mode
- Some modes are tier-gated (Starter+ unlocks all)

**Verify**
| Where | What |
|---|---|
| `churches/{churchId}` | `workflow_mode` field updated |

☐ **Pass / Fail**: ___

---

## Test 3 — Add campuses (multi-site)

**Steps**
1. Settings → Campuses → New Campus
2. Name: "North Campus", address, color
3. Save → repeat for "South Campus"

**Expected**
- Both visible in the list
- People + services + schedules can be filtered by campus

**Verify**
| Where | What |
|---|---|
| Firestore `churches/{churchId}/campuses` | 2 docs |

☐ **Pass / Fail**: ___

---

## Test 4 — Member roles enumeration

**Steps**
1. People → Filter by role → cycle through Owner / Admin / Scheduler / Volunteer

**Expected**
- Each filter shows only members with that role
- Counts match what you'd expect

☐ **Pass / Fail**: ___

---

## Test 5 — Promote volunteer to scheduler

**Steps**
1. People → pick a volunteer → change role to Scheduler
2. Save

**Expected**
- Sidebar of that user (their session, when they refresh) gains scheduler-only items: Schedule generation, Service plans
- They can NOT change settings, manage billing, etc.

**Verify**
| Where | What |
|---|---|
| `memberships/{uid}_{churchId}` | `role: "scheduler"` |

☐ **Pass / Fail**: ___

---

## Test 6 — Scheduler ministry-scope restriction

**Steps**
1. Edit the scheduler's role: scope to specific ministries (e.g., only Worship + Tech)
2. From the scheduler's account, navigate to schedule generation

**Expected**
- They can only schedule volunteers in those ministries
- Other ministries' volunteers don't appear in their picker

**Verify**
| Where | What |
|---|---|
| `memberships/{uid}_{churchId}` | `ministry_scope` array contains those ministry IDs |

☐ **Pass / Fail**: ___

---

## Test 7 — Owner transfer (if implemented)

**Steps** (Phase 2 — check if this exists)
1. Owner → Settings → Transfer Ownership
2. Pick an admin → confirm

**Expected**
- That admin becomes owner
- Original owner becomes admin (or volunteer, depending on intent)
- Both confirmations sent

**Note**: this might not be wired yet. Skip if you don't see the option.

☐ **Pass / Fail**: ___

---

## Test 8 — Member self-leave

**Steps**
1. As a non-owner volunteer → Account → "Leave organization"
2. Confirm

**Expected**
- Their membership is deleted (not deactivated)
- They lose access to the org's data immediately
- Owner gets a "[Name] left" notification email
- The Activity entry — _Phase 2: requires server migration of membership writes_

**Verify**
| Where | What |
|---|---|
| `memberships/{volUid}_{churchId}` | Doc deleted |
| Volunteer's dashboard | "No Organization" empty state |

☐ **Pass / Fail**: ___

---

## Test 9 — Owner deletes the organization (cascade)

**Steps**
1. As owner of a throwaway test org → Settings → Delete Organization → confirm
2. Watch the cascade run

**Expected**
- All church subcollections deleted (people, ministries, services, schedules, assignments, rooms, reservations, children, households, sessions, etc.)
- All memberships for that church deleted
- All event_signups for that church deleted
- All short_links for that church deleted
- Stripe subscription canceled if active
- Owner receives a "deletion confirmed" email
- Other members receive a "this org was deleted" email
- `org.delete` audit entry written BEFORE cascade so it survives

**Verify**
| Where | What |
|---|---|
| Firestore `churches/{churchId}` | Doc no longer exists |
| Firestore `memberships` filtered by church_id | No docs |
| Firestore `audit_logs` filtered by `target_id: {churchId}` | `org.delete` entry exists with metadata |
| Stripe Subscriptions | If had one, marked canceled |
| Email | Owner + members get deletion notifications |

☐ **Pass / Fail**: ___

---

## Test 10 — Platform admin: org list

**Steps** (requires being in `PLATFORM_ADMIN_UIDS`)
1. Navigate to `/dashboard/platform`
2. Click "Organizations"

**Expected**
- See ALL orgs across the platform
- Each row shows: name, slug, tier, status pill (active / dormant / at-risk), last active, member count, check-in indicator, children count, sessions 7d, created date
- Filter by tier, status, has-checkin
- Sort by last activity, member count, etc.

☐ **Pass / Fail**: ___

---

## Test 11 — Platform admin: per-org detail

**Steps**
1. Click into one of the orgs (any of yours, or one of the unknown free-tier signups)
2. Review the detail page

**Expected**
- Owner email + last sign-in time
- Membership breakdown (counts by role)
- Configuration checklist (services, worship plans, rooms, calendar feeds, etc.)
- Children's check-in card (numbers only — no PII)
- 30-day sparklines for sessions / assignments / new members
- "Recompute snapshot" button

**Verify**
| Where | What |
|---|---|
| `platform_orgs/{churchId}` | Snapshot doc exists with these fields |

☐ **Pass / Fail**: ___

---

## Test 12 — Platform admin: tier override (manual)

**Steps**
1. Platform admin → org detail → manually set tier to Growth
2. Note: this should set `subscription_source: "manual"` so Stripe webhooks don't auto-revert

**Expected**
- Tier flipped on the church doc
- Subsequent Stripe events for that church don't change the tier (manual override respected)
- Audit entry: `platform.tier_override` (Phase 2 — wire this hook if not already)

**Verify**
| Where | What |
|---|---|
| `churches/{churchId}` | `subscription_tier`: new value, `subscription_source: "manual"` |
| Activity (per-org) | Phase 2 hook |

☐ **Pass / Fail**: ___

---

## Test 13 — Platform feedback triage

**Steps**
1. Platform admin → "Platform Feedback"
2. View open feedback items submitted by churches via the in-app feedback form
3. Resolve / mark as won't-do / etc.

**Expected**
- All platform feedback visible across orgs
- Status changes persist

☐ **Pass / Fail**: ___

---

## Test 14 — Refresh platform stats

**Steps**
1. Platform Overview → click "Refresh Stats"
2. Wait ~30 seconds

**Expected**
- Aggregate stats recompute (total orgs, growth windows, tier distribution, feature adoption)
- Per-org snapshots all rebuild
- Recent Activity + Dormant + At-Risk sections refresh

**Verify**
| Where | What |
|---|---|
| `platform/stats` | `computed_at` updated to now |
| `platform_orgs/*` | All `computed_at` updated to now |
| `platform/recent_activity` | Updated |

☐ **Pass / Fail**: ___ Time to complete: ___ seconds

**Performance note**: with concurrency-cap 5 (Track E.3), this should scale to ~50 churches × 2-3s each = under 60 seconds total. Beyond that, future work in E.3 can tighten further.

---

## Failure modes to watch

- **Cascade-delete leaves orphan data** — should never happen but inspect with the platform-admin tools after a delete. Tell me if you find any.
- **Member leave breaks the org's data isolation** — they should NOT see any org data after leaving. If they do, regression.
- **Tier change affects only one of: Stripe state, app feature gates, audit log** — all three must move together. Test carefully.
- **Platform admin sees a non-admin role's data** — should NEVER happen unless they're explicitly impersonating. Check that ONLY the dashboards you expect to be platform-admin-scoped show all orgs.

## What I can't test for you

- Real cascade-delete time on a large church (seconds vs. minutes)
- Whether the deletion email actually reaches all 50+ members of a real church
- Edge cases in member leave during a Sunday morning service (concurrent writes)
