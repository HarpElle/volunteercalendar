# VolunteerCal — User Guide for Testers

_Last updated: 2026-05-15_

> Read this **once** before starting [TEST_PLAN.md](TEST_PLAN.md). Takes about 25 minutes. The mental model you build here will save you hours of confusion during the test.

---

## What VolunteerCal Is (the elevator pitch)

VolunteerCal is a **scheduling tool for organizations that depend on volunteers showing up at the right place at the right time** — most commonly churches, but also nonprofits, community groups, and any team-driven org.

The core problem: a worship pastor needs three musicians, two camera operators, four greeters, two coffee servers, and a sound tech for **every single Sunday for the next two months**. Doing that in a spreadsheet is painful. Doing it fairly (so the same people aren't always asked) is harder. And then someone gets sick and you scramble.

VolunteerCal handles all of it: define the teams, define the volunteers, set everyone's availability, and the system **drafts a fair, conflict-free schedule** for you. Team leaders review it. The system emails everyone, takes confirmations, sends reminders, helps with swaps, and tracks attendance. By the time Sunday morning arrives, everyone knows where they're supposed to be.

That's it. Everything else is layered on top of that core loop.

---

## Who It's Built For

The primary audience is **churches** — that's where the design and language are most polished. But the platform is multi-tenant and supports two other org types:

| Org Type | What changes |
|----------|--------------|
| **Church** | UI uses "Ministries", "Pastor", "Sunday Service", etc. Includes worship-specific features (song libraries, service plans, Stage Sync) on paid tiers. |
| **Nonprofit** | UI uses "Teams" instead of "Ministries". No worship-specific features unless enabled. |
| **Other** | Generic "Teams" terminology. Same underlying capabilities. |

You'll be testing as a **Church** in this round (it's the primary use case and exercises the most features).

---

## The Core Loop

This is the cycle every VolunteerCal organization runs through, every scheduling cycle:

```
  ┌──────────────────────────────────────────────────────────────────┐
  │                                                                  │
  │   1. ADMIN defines:  Teams (Worship, Tech, Greeters)             │
  │                      Services (Sunday 10am)                      │
  │                      Roles (Lead Vocalist, Sound Tech, Usher)    │
  │                                                                  │
  │   2. VOLUNTEERS join (invited by admin OR self-register)         │
  │                      They set: their teams, their availability,  │
  │                      blockout dates, preferred frequency.        │
  │                                                                  │
  │   3. ADMIN clicks "Generate Schedule" for next 4–8 weeks         │
  │              ↓                                                   │
  │   4. SYSTEM creates a fair draft, respecting:                    │
  │      • availability        • household pairings                  │
  │      • role qualifications • prerequisites cleared               │
  │      • blockouts           • prior load (fairness)               │
  │              ↓                                                   │
  │   5. SCHEDULER/ADMIN reviews the draft, fixes conflicts,         │
  │      reassigns if needed, then publishes.                        │
  │              ↓                                                   │
  │   6. SYSTEM emails every assigned volunteer with their slots     │
  │      and a unique confirm/decline link.                          │
  │              ↓                                                   │
  │   7. VOLUNTEERS confirm, decline, or request a shift swap.       │
  │      Their assignments appear on their phone & calendar feed.    │
  │              ↓                                                   │
  │   8. SYSTEM sends reminders 48h and 24h before service.          │
  │              ↓                                                   │
  │   9. ON SUNDAY: volunteers check in (QR, smart banner,           │
  │      proximity, or admin-marked). Attendance tracked.            │
  │              ↓                                                   │
  │  10. AFTER: vacancies, no-shows, and burnout signals feed back   │
  │      into the next cycle. Repeat.                                │
  │                                                                  │
  └──────────────────────────────────────────────────────────────────┘
```

Every feature in the app is a piece of this loop or a tool that supports it.

---

## The People in the Story (Roles)

VolunteerCal has four user roles. Permissions cascade — Owners can do everything Admins can do, Admins everything Schedulers can, etc.

| Role | Can do |
|------|--------|
| **Owner** | Everything. Created the org. Only one allowed (you can transfer). Owns billing. |
| **Admin** | Everything except billing. Manages people, teams, services, schedules, settings. |
| **Scheduler** | Builds and publishes schedules. Often **scoped** to specific teams (e.g., the Worship Pastor only schedules the Worship team). Can mark attendance, send reminders. |
| **Volunteer** | Sees their own schedule, sets availability, confirms/declines, requests swaps, views team rosters. **Cannot** edit teams, services, or other volunteers. |

> **Note**: A "Scheduler" with no team scope acts like a mini-admin for scheduling. A "Scheduler" scoped to "Worship Team" can only schedule worship — they don't see other teams' data.

---

## The Vocabulary (Glossary)

You'll see these words a lot. Knowing them upfront makes the test plan flow better.

### Org & people

- **Ministry / Team** — a group of volunteers organized around a function (Worship, Tech, Greeters, Children's Ministry). Same data shape; "Ministry" if you're a church, "Team" if you're a nonprofit.
- **Membership** — the relationship between a User and an Organization. A user can be a member of multiple orgs with different roles in each.
- **Person / Volunteer** — someone who can be scheduled. Has a Person record (data) and optionally a User account (login).
- **Household** — a family or group whose members should be scheduled together (e.g., spouses) or apart (e.g., parent and child in different teams). Has constraint options: `never_same_service`, `never_same_time`, `prefer_same_service`.
- **Campus** — a physical location. Most orgs have one. Multi-site churches can have several, each with their own services and timezone overrides.

### Scheduling

- **Service** — a recurring scheduled event (e.g., "Sunday 10am service, weekly"). Has roles attached. Generates many "service dates" over time.
- **Event** — a one-time scheduled happening (e.g., "Easter Saturday Egg Hunt"). Has signup forms with role slots, can be public or internal.
- **Role** — a specific position to fill (e.g., "Lead Vocalist", "Sound Tech", "Greeter"). Has a count (need 2 lead vocalists, 1 sound tech).
- **Assignment** — a specific volunteer assigned to a specific role on a specific date. The atomic unit of a schedule.
- **Schedule** — a collection of assignments for a date range, in one of these states:
  - `draft` (auto-generated, not visible to volunteers)
  - `in_review` (with team leads for approval)
  - `approved` (ready to publish)
  - `published` (visible to volunteers, confirmation emails sent)
- **Workflow Mode** — the philosophy your org uses to manage schedules. Four options:
  - **Centralized** — admin builds and publishes everything (default; only mode on Free tier)
  - **Team-First** — each team lead builds and publishes their own team independently
  - **Hybrid** — auto-draft creates templates, team leads tweak, admin coordinates
  - **Self-Service** — volunteers self-signup for open slots, no approval workflow
- **Availability Campaign** — a broadcast sent to volunteers asking them to set/update availability before a schedule is generated.
- **Multi-Stage Approval** — workflow where each ministry's section of a schedule needs to be approved by its lead before the whole thing can be published. Available on Growth+ tiers.

### Volunteer experience

- **Blockout** — a specific date a volunteer is unavailable (added one at a time; consecutive dates form a range visually).
- **Recurring Unavailable** — day-of-week toggles ("I'm never available on Wednesdays").
- **Preferred Frequency** — weeks between assignments (the lower the number, the more often the volunteer is scheduled).
- **Max Roles Per Month** — hard cap on assignments per calendar month for one volunteer.
- **Preferred Weeks** — week-of-month preferences ("1st and 3rd weeks").
- **Availability Notes** — a free-text hint the volunteer leaves for schedulers ("prefer morning services," "needs childcare").
- **Confirmation** — a volunteer's response to an assignment: confirmed, declined, or "Can't Make It" (which triggers the swap/replacement flow).
- **Shift Swap** — a volunteer's request to find a replacement for a confirmed assignment. The system identifies eligible volunteers, one accepts, the admin approves.
- **Inbox** — in-app notification center showing schedule assignments, reminders, role changes, etc. Has an unread badge.

### Onboarding

- **Prerequisite** — a requirement a volunteer must clear before being scheduled to a team. Types: class attendance, background check, minimum service time, ministry tenure, custom. Can be **org-wide** (applies to all teams) or **team-specific**.
- **Pipeline** — the journey of a volunteer from joining → completing prereqs → eligible to serve.
- **Training Session** — a scheduled class linked to a class-type prerequisite. Volunteers RSVP, attend, and the system auto-completes their prereq step.
- **Trainee Assignment** — a "shadowing" assignment where a volunteer learns from someone in the role. Marked with a dashed border + "Shadowing" badge. Doesn't count against slot capacity.

### Worship module (Growth+ tier)

- **Song Library** — your collection of songs (title, CCLI number, default key, tags, chord chart). Can import from SongSelect file uploads.
- **Service Plan** — the order of service for a specific date: opening prayer, song 1, sermon, song 2, etc. Built from songs in the library + non-song items (header dividers, prayer, announcement, sermon, video, custom).
- **Stage Sync** — real-time follow-along view for the band/stage during a live service. One person (the Conductor) advances items; everyone else (Participants) sees the current item on their device. Includes keyboard shortcuts and reconnection.
- **ProPresenter Export** — JSON export of a service plan in a format ProPresenter (popular projection software) can ingest.
- **Song Usage Report** — for CCLI compliance: tracks which songs were sung when, exportable as CSV.

### Children's Check-In (Growth+ tier)

- **Kiosk** — the unauthenticated tablet/iPad UI parents use to check their kids in. Lookup by phone or QR, select children, confirm allergies, get a security code.
- **Household** — a family unit with guardians (adults) and children (minors). Has a unique QR code for fast lookup.
- **Security Code** — a short code printed on the parent receipt. Required for child pickup (timing-safe to prevent guessing).
- **Label** — a sticker printed at check-in (child name, allergies, classroom, security code). Sent to a network printer via the **companion print server** (a small Python service church IT runs on their LAN).
- **Guardian Portal** — token-based self-service page parents access (no login) to view household info, check-in history, edit contact info, get a fresh QR.
- **Teacher Room View** — token-based view a classroom teacher pulls up to see who's in their room (auto-refreshes every 5 seconds).

### Rooms & Reservations (Starter+ for basics, Growth+ for advanced)

- **Room** — a physical space (e.g., "Sanctuary", "Fellowship Hall", "Room 101") with capacity, equipment tags, and booking rules.
- **Reservation** — a booked time slot in a room. Can be one-time or recurring. Has conflict detection.
- **Recurrence Rule** — pattern for recurring reservations (e.g., "every Wednesday 7-9pm for 12 weeks"). When you edit one occurrence, you choose: "this only" / "from this date forward" / "all occurrences".
- **Approval Queue** — if a room requires approval, requests go here for an admin to approve or deny. Approvals can trigger SMS to the requester.
- **Display Signage** — a wall-mounted view (e.g., on a tablet outside the room) showing live status: Available / In Use / Starting Soon. Includes wake-lock so the screen stays on.
- **Public Calendar** — an embeddable view of all room reservations (token-protected). Can be embedded on a church website with `?embed=true`.
- **Facility Group** — a way for multiple orgs to share visibility into each other's room calendars (e.g., a school that rents space from a church). Cross-org reservation read access.

### Notifications

- **Welcome / Invite / Approval emails** — onboarding-related emails sent automatically.
- **Schedule Confirmation Email** — sent on publish. Includes a unique token link to confirm/decline.
- **Reminder Emails** — sent 48 hours and 24 hours before a service.
- **Absence Alert** — when a volunteer clicks "Can't Make It," scheduler/admin gets an email (and SMS on Starter+ if enabled).
- **Self-Removal Alert** — when a volunteer removes themselves from an assignment.
- **Prerequisite Notifications** — step completed, all completed, expiry warning, nudge for stalled progress.
- **In-App Inbox** — every notification also lands in the recipient's in-app Inbox with a real-time unread badge.
- **Push Notifications** — infrastructure is wired (FCM tokens registered, service worker installed) but the message-sending side isn't built yet. So you'll see the badge but won't get actual push pings during this test.

---

## What's Free vs. Paid

VolunteerCal has four self-service tiers — Free, Starter, Growth, Pro — plus an Enterprise plan for custom deals (you'll see all five cards on the public pricing page). You'll test the **Free** tier first, then the **Pro** tier (Jason will upgrade you).

| Capability | Free | Starter $29 | Growth $69 | Pro $119 |
|------------|:----:|:-----------:|:----------:|:--------:|
| Volunteers | 20 | 100 | 250 | 500 |
| Teams | 2 | 5 | 15 | Unlimited |
| Roles per service | 3 | 8 | 20 | 50 |
| Active events | 1 | 5 | 15 | Unlimited |
| Short links | 0 | 3 | 10 | 25 |
| Email reminders | ✅ | ✅ | ✅ | ✅ |
| iCal calendar feeds | ✅ | ✅ | ✅ | ✅ |
| Household scheduling | ✅ | ✅ | ✅ | ✅ |
| All workflow modes (vs. Centralized only) | ❌ | ✅ | ✅ | ✅ |
| SMS reminders & alerts | ❌ | ✅ | ✅ | ✅ |
| Shift swap | ❌ | ✅ | ✅ | ✅ |
| Room booking | ❌ | 5 rooms | 20 rooms | 50 rooms |
| Recurring reservations + public calendar | ❌ | ❌ | ✅ | ✅ |
| Shared facility scheduling | ❌ | ❌ | ✅ | ✅ |
| Multi-stage approval | ❌ | ❌ | ✅ | ✅ |
| Worship module (songs, service plans, Stage Sync, ProPresenter) | ❌ | ❌ | ✅ | ✅ |
| Children's Check-In | ❌ | ❌ | ✅ | ✅ |
| Pre-check-in SMS to parents | ❌ | ❌ | ❌ | ✅ |
| Multi-station check-in (multiple kiosks) | ❌ | ❌ | ❌ | ✅ |
| Advanced check-in reports | ❌ | ❌ | ❌ | ✅ |
| CCLI CSV export | ❌ | ❌ | ✅ | ✅ |

---

## The Major Features Tour

A short tour of every feature group you'll touch. Read for the **why**, not the how — the test plan will walk you through the how.

### Auto-Drafting Schedule

The marquee feature. You define teams, services, and volunteers; the system generates a fair schedule. Fairness considers prior load (so the same person isn't always picked), availability (blockouts, recurring unavailable days, preferred frequency), prerequisites (volunteers without cleared requirements aren't picked), household constraints (keep families together or apart), and trainee status (shadowing assignments don't count toward slot capacity). The draft is editable before publishing — you can manually swap people, add notes, or leave slots open.

### Workflow Modes

Different orgs have different cultures. **Centralized** (default, only option on Free) is "the admin owns scheduling." **Team-First** (Starter+) is "each team lead owns their own team's schedule." **Hybrid** (Starter+) is the middle: auto-draft creates a starting point, leads tweak, admin coordinates. **Self-Service** (Starter+) is "post the open slots and let volunteers grab them." You'll test all four during the Pro phase.

### Volunteer Self-Service

The volunteer experience is intentionally minimal:
- **My Schedule** — upcoming, past, and "team view" (everyone on my teams). Can confirm, decline, or "Can't Make It."
- **My Availability** — recurring unavailable days, blockout dates (single or ranges), preferred frequency (weeks between assignments), max roles per month, preferred weeks of the month, and a free-text "notes for your scheduler" field (e.g. "prefer morning services").
- **Inbox** — every notification, grouped by date (Today / Yesterday / Earlier). Mark-as-read with optimistic update.
- **Account** — name, phone, photo, password, calendar feeds.
- **Calendar feed** — copy an iCal URL, paste into Google/Apple/Outlook, your assignments show up alongside your other events.

### Onboarding Pipeline & Prerequisites

Some teams (children's, security, etc.) require background checks or training before someone can serve. VolunteerCal lets admins:
- Define **prerequisites** (org-wide or team-specific): class, background check, minimum service time, ministry tenure, custom
- Set **expiry dates** (e.g., background checks every 2 years)
- Track each volunteer's progress through the pipeline
- Auto-block ineligible volunteers from the auto-draft
- Send notifications when steps are completed, when a volunteer becomes eligible, when a step is about to expire, or when progress stalls

**Training Sessions** are the operationalized version of class prerequisites: schedule a training, invite volunteers with pending prereqs, take RSVPs, mark complete, and the system auto-completes the matching prereq step for everyone who attended.

### Household Scheduling

Families have constraints: spouses on the same team don't want to be split across services. A parent volunteering in worship doesn't want their kid scheduled in nursery at the same time. VolunteerCal supports three constraint types:
- `never_same_service` — family members can't be on the same service date
- `never_same_time` — family members can't be on any service at the same time
- `prefer_same_service` — try to schedule them together when possible

Conflicts surface as cards in the schedule review.

### Multi-Stage Approval (Growth+)

Bigger churches don't trust one admin to publish without team-lead sign-off. Multi-stage approval splits a draft schedule into per-ministry approval gates. Each lead approves their section. Cross-team coordination modal flags shared volunteers (e.g., a worship leader who's also on the tech team). Only when all sections are approved can the admin hit publish.

### Worship Module (Growth+)

Three things, integrated:
1. **Songs** — your library, with title, CCLI number, default key, tags, and chord chart (you can paste ChordPro, upload SongSelect files, or upload a PDF chord chart that gets parsed by Claude Vision).
2. **Service Plans** — the order of service for a specific date. Add songs (with optional key override), prayer, announcement, sermon, video, header dividers, custom items. Reorder, add inline notes. Publish to lock and create song-usage records.
3. **Stage Sync** — real-time follow-along during a live service. One conductor (worship leader's iPad) advances items; everyone on stage sees the current item live on their device. Keyboard shortcuts (space, arrows). Survives brief disconnects.

Plus **ProPresenter Export** (one-click JSON for projection software) and **Song Usage Reports** (CCLI compliance, CSV export on Growth+).

### Children's Check-In (Growth+)

A complete kids-ministry check-in system. Workflow:
1. Parent walks up to the **kiosk** (a tablet on a stand). Looks up family by QR scan or phone (last 4 digits, then full).
2. Selects which kids are checking in. Confirms allergies and any custodial notes.
3. Kiosk shows a security code. **Labels print** to a Brother QL or Zebra ZD network printer (via the companion Python print server) with child name, classroom, allergies, security code.
4. Parent walks kid to the classroom; teacher's **room view** updates within 5 seconds showing the new arrival.
5. After service, parent returns; presents security code; kid gets released.

Supporting features:
- **Guardian Portal** (no-login token URL): parents view their household, check-in history, update contact info, get a fresh QR.
- **First-time visitor self-registration** at the kiosk.
- **Reports**: daily attendance, room reports, trends, CSV export.
- **Breeze CSV import**: bulk import from Breeze ChMS.
- **Pre-Check-In SMS** (Pro): text parents Saturday night with their family's QR.

### Rooms & Reservations (Starter+ for basics, Growth+ for advanced)

A complete facility-booking system, separate from volunteer scheduling. Workflow:
1. Admin creates **rooms** (Sanctuary, Fellowship Hall, Classroom 1) with capacity, equipment tags, booking rules.
2. Anyone with permission can **book** via a 5-step wizard: pick room → date/time → details/equipment → recurrence → review.
3. **Conflict detection** stops double-bookings; if approval is required, the request hits an **approval queue**.
4. **Recurring reservations** materialize as individual occurrences (Growth+); editing one, you choose "this only" / "from this date" / "all".
5. **Display signage** at room doors shows live status (Available / In Use / Starting Soon).
6. **Public calendar** (Growth+) at a token-protected URL, embeddable on the church website.
7. **iCal feeds** per-room, per-ministry, or church-wide.
8. **Shared facilities** (Growth+): connect with another org so you can see each other's reservations (a school renting a church's space, multiple ministries sharing a building).

### Notifications

Three channels:
1. **Email** — every meaningful event has a template (37 of them: welcome, invite, schedule confirmation, reminder, role promotion, absence alert, self-removal, prerequisite step completed, etc.).
2. **SMS** (Starter+) — urgent notifications (absence alerts, swap requests) can also fire via SMS to the scheduler. Volunteers can opt in to SMS reminders.
3. **In-App Inbox** — every notification also drops into the recipient's Inbox with a real-time unread badge in the sidebar / bottom nav. Optimistic mark-as-read.
4. **Push** — infrastructure exists, content not yet wired. (You'll register for push during the test, but won't actually receive push pings yet.)

---

## Things Intentionally Not Here Yet

Set expectations. These are known-not-built and are NOT bugs:

- **Annual billing** — monthly only for now.
- **Push notification content** — FCM tokens register and a service worker is installed, but no push pings are actually sent yet (email + SMS + in-app inbox cover everything).
- **Live ChMS sync** — CSV import works. Real-time API sync with Planning Center / Breeze / Rock is on the roadmap, not built.
- **Background check provider integration** — you can mark a background check as complete manually, but there's no Checkr / Sterling integration yet.
- **English only** — no i18n / localization.
- **Single timezone per org** — all services use the org's configured timezone (campuses can override). No per-volunteer timezone preference.
- **Apple/Google sign-in** — email/password only. (Forgot-password flow does work.)
- **Annual billing toggle** — see above; monthly only.
- **In-app messaging** between admins and volunteers — not built. (Use email or "send reminder" features.)

If you encounter any of these and they confuse you, that's *also* useful feedback ("I expected push notifications to fire and they didn't"). Note it in the form.

---

## You're Ready

That's the lay of the land. You now know:

- What VolunteerCal is and who it's for
- The core scheduling loop
- The four user roles and what each can do
- The vocabulary you'll see in the UI
- What's gated behind each tier
- A high-level tour of every major feature
- What's intentionally not in scope yet

Open [TEST_PLAN.md](TEST_PLAN.md) and start at **Phase 0**. Have your Gmail aliases ready, your phone nearby, and your feedback form open in another tab.

Good luck — and thank you again.
