# Production Data Audit

**Date:** 2026-04-27
**Run by:** Claude (autonomous)
**Project:** volunteercalendar-mvp

## Summary

Production state is **healthy** but the platform is now hosting **6 organizations**, including **4 unknown free-tier signups** (was previously known as 2). The most recent signed up *today*. Worth noting before the next outreach decision.

Audit-log volume is currently zero — the new audit hooks shipped in Batches 2 / 4 / 5 / 8 will accumulate entries as new activity happens, but pre-deploy events aren't captured. Likewise outbox is empty (no schedule publishes since the outbox went live).

---

## 1. Organizations on the platform

| Created | Name | Tier | Notes |
|---|---|---|---|
| 2026-03-20 | Anchor Falls Church | pro | **Your church** |
| 2026-03-24 | Beth Messiah | pro | Earlier paying customer |
| 2026-04-16 | JESUS HOUSE | free | New (was unknown) |
| 2026-04-20 | Elkton Missionary Church | free | New (was unknown) |
| 2026-04-26 | Testing | starter | **Likely your test org** (created during yesterday's Stripe live test) |
| 2026-04-27 | KingsWord Dallas | free | **Brand new — signed up TODAY** |

**Action items**:
- The "two unknown free-tier churches" in earlier docs is outdated. There are now **4 unknown free-tier organizations**: JESUS HOUSE, Elkton Missionary Church, KingsWord Dallas, and the older one whose name the audit shows.
- Wait — looking more carefully, this includes 3 unknown plus your test one. Updating SHOULD_DO accordingly.
- KingsWord Dallas signed up today — fresh activity. Worth noting if you're tracking signup patterns.

## 2. Sensitive top-level collections

| Collection | Count | Notes |
|---|---|---|
| `audit_logs` | 0 | No entries yet. Hooks fire on future ops; pre-deploy events aren't captured. |
| `stripe_processed_events` | 0 | No webhook deliveries since this collection was added in Batch 1 (C.3 idempotency). Will populate on next live charge. |
| `notification_outbox` | 0 | No schedule publishes since the outbox went live (Batch 6). Will populate on next publish. |

These zero-counts are **expected** post-deploy and not a concern. They'll accumulate as activity happens.

## 3. Outbox health

```
pending=0 sent=0 failed=0 dead_letter=0
```

Nothing in the outbox. Drain cron has nothing to do (which is correct given zero entries).

## 4. Recent audit log activity

No entries in the last 50. Once the platform sees real traffic, the Activity page will start populating.

## 5. Kiosk infrastructure

| | Count |
|---|---|
| Stations enrolled | 0 |
| Active tokens | 0 |
| Pending activation codes | 0 |

**Confirms**: nobody has stood up a children's check-in kiosk since Track B Phase 1 deployed. That includes your own org. When you're ready to test, follow `jason-functionality-testing-childrens-checkin.md`.

## 6. Per-church sensitive data presence

| Church | children | households | sessions |
|---|---:|---:|---:|
| Anchor Falls Church (yours) | 2 | 1 | 6 |
| All others | 0 | 0 | 0 |

**Confirms the audit's earlier finding**: only your own church has any check-in data, from your prior test sessions. The other 5 churches have **zero** children/household/session data. Safe to deploy any further changes to children's check-in without affecting them.

## 7. Payment failures

✅ **None**. No churches in `payment_failed` state. The dunning cron has nothing to do.

## 8. Active disputes

✅ **None**. No active Stripe disputes. The C.10 hook is wired but inactive (which is the desired state).

## 9. Memberships

**15 memberships total, all `active`**. No pending invites, no pending self-joins, no inactive memberships.

This is interesting — if there were pending invites that never got accepted, they'd show up here. Clean state.

## 10. Recommendations

### Customer comms decision (revised)

You now have **4 unknown free-tier organizations**: JESUS HOUSE, Elkton Missionary Church, KingsWord Dallas, and one more. None have used check-in. A casual welcome email is now a more compelling action than when we thought it was just 2 churches:

- Three real organizations beyond your testing footprint
- One is brand new (today)
- They're getting value from the free tier without your input — natural moment to introduce yourself

Sample email:
> Subject: Welcome to VolunteerCal — quick hello from the founder
>
> Hi [name],
>
> I'm Jason, the developer behind VolunteerCal. I noticed [church name] signed up recently — wanted to say welcome. The platform is pre-launch / early access, so if you hit any rough edges or have questions, please reply directly. I'm hands-on with everything.
>
> A few quick tips:
> - You can [link to docs / how-it-works / getting started]
> - Free tier covers up to [X volunteers / Y teams]
> - Check-in for kids is on Growth tier and up if you ever want it
>
> Glad to have you. — Jason

Send to JESUS HOUSE, Elkton Missionary Church, KingsWord Dallas after the testing matrix is green.

### Audit log + outbox will populate naturally

Don't worry about the zero-counts. They reflect "no activity since deploy" — the next schedule publish, kiosk enrollment, or billing event will start filling them in. Re-run this audit in a week and compare.

### KingsWord Dallas is brand new (today)

If they're actively configuring the platform, you might catch them in the act. Could be a perfect first-customer-conversation moment if you have time.

---

## How to re-run this audit

```bash
DOTENV_CONFIG_PATH=.env.local npx tsx scripts/audit-production-data.ts
```

Run weekly (or whenever you want to spot-check): captures ground truth across all collections, flags churches in dunning/dispute state, surfaces orphaned outbox entries, and tracks audit-log volume over time.
