# Functionality Testing — Index

Pick up any of these in isolation. Each doc is self-contained: prerequisites, numbered test scenarios, expected results, verification points (in-app + Firestore + Stripe + audit log), and known failure modes.

## Recommended order

1. [Onboarding](jason-functionality-testing-onboarding.md) — sign-up, invites, role assignment. Foundation for everything else.
2. [Schedules](jason-functionality-testing-schedules.md) — services, schedule generation, publish, confirmation, reminders.
3. [Children's check-in](jason-functionality-testing-childrens-checkin.md) — kiosk enrollment, lookup, walk-up registration, check-in, checkout, alerts.
4. [Resource scheduling (rooms)](jason-functionality-testing-room-scheduling.md) — rooms, reservations, recurring, conflicts, approvals.
5. [Room signage / wall displays](jason-functionality-testing-room-signage.md) — display URL on tablet, status colors, wake-lock.
6. [Billing & subscriptions](jason-functionality-testing-billing.md) — upgrade, refund, cancel, dunning, disputes.
7. [Activity / audit log](jason-functionality-testing-activity-audit.md) — visibility into what happened, when, by whom.
8. [Organization administration](jason-functionality-testing-org-administration.md) — settings, member management, deletion, platform admin.
9. [Worship & service planning](jason-functionality-testing-worship.md) — song library, service plans, ProPresenter export, Stage Sync.
10. [Calendar feeds & integrations](jason-functionality-testing-calendar-feeds.md) — iCal, JSON volunteers feed, short links.

## How to use these docs

For each capability:

1. **Open the relevant `jason-functionality-testing-*.md` doc.**
2. **Confirm prerequisites** (top of doc). Most reference earlier capabilities — onboarding before schedules, schedules before reminders, etc.
3. **Walk numbered test scenarios in order**. Each has an "Expected" you compare your result against.
4. **Use the verification table** at the bottom of each scenario to confirm the right data landed in the right place. Most failures show up there before the UI shows them.
5. **If you hit something unexpected** — write a short note in the Actual column ("got 503 instead of 401") and tell me. I'll fix.

Each doc also has a **Failure modes** section listing things to specifically watch for. Most are edge cases that real users hit; spotting them in dry-run is gold.

## Conventions used

- ✅ / ❌ checkboxes — fill in as you go
- "Verify" lines list specific places to check (Firestore path, Stripe dashboard, Activity page)
- Bold timestamps in instructions like **wait 2 min** are real — outbox cron drains every 2 minutes
- Some scenarios are marked **Phase 2** — those depend on later track work and can be skipped now
