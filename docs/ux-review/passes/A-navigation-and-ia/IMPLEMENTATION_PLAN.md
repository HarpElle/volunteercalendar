# Pass A — Implementation Plan: Navigation + IA Restructure

> Inputs: Pass A SYNTHESIS.md (adjudicated), CLAUDE.md, CODEX.md, Phase 1 references, Jason's 5 resolution decisions.
> Output: a concrete IA map + phased plan that an engineer can execute.
> **No code in this doc.** Implementation begins after Jason signs off on the plan.

## 0. Decisions baked in

From SYNTHESIS §"Jason Decisions" + the framework's binding constraints + Jason's resolution of the §10 open questions (2026-05-19):

| Decision | Bound to |
|---|---|
| One product shell with role-aware ordering (Move A) | sidebar + mobile parity |
| Live operational surface label | **Service Day** on BOTH desktop sidebar and mobile bottom nav. Fall back to "Today" only if real-device testing in Phase 1 shows sizing issues. |
| Settings visibility | **Primary nav item** with cog icon |
| Tier-locked modules | **Show with lock badges + disabled state** (do not hide); Option A click behavior (tooltip, no nav) |
| Top-level people language | **People** |
| Worship module label | **Worship Prep** |
| Feedback Triage home | **People** module |
| Module subnav placement | **Vercel/Stripe/WorshipTools pattern** — tab strip at top of content area, sticky on scroll, no large module-name H1 above it. The active tab is the page identity. (See §4 intro for detail.) |
| `/dashboard/feedback` canonical | Yes — the page is named `MyFeedbackPage`. No `/dashboard/my-feedback` route exists. |
| `/dashboard/admin` stub | Real page (platform-admin tier override) currently orphaned. Move to `/dashboard/platform/tier-override` in Phase 3; out of Pass A primary scope. |
| `/dashboard/organization` stub | Pure `?tab=X` redirect handler. Update its TAB_REDIRECTS in Phase 3 to point at new module routes. |
| Phasing | **5 PRs** over ~2 weeks |
| Backward-compat / muscle memory | **Not a concern** (Jason 2026-05-18); rename routes freely |
| Strategic lane | Ministry operations only — Schedules / Service Day / People / Rooms / Check-In / Worship Prep. Don't drift into CRM/giving/CMS. |

---

## 1. Proposed final desktop admin sidebar

```
┌──────────────────────┐
│ [VolunteerCal logo]  │
├──────────────────────┤
│ ⌂  Home              │   → /dashboard
│ ☀  Service Day       │   → /dashboard/service-day
│ 📅  Schedules         │   → /dashboard/schedules
│ 👥  People            │   → /dashboard/people
│ 🚪  Rooms        🔒    │   → /dashboard/rooms      (lock badge when tier-locked)
│ ✓  Check-In     🔒    │   → /dashboard/checkin    (lock badge when tier-locked)
│ 🎵  Worship Prep  🔒  │   → /dashboard/worship    (lock badge when tier-locked)
├──────────────────────┤
│ ⚙  Settings          │   → /dashboard/settings
│ ?  Help              │   → /dashboard/help
├──────────────────────┤
│ ⊙  Sarah Pastor     ▾│   (account widget — popover with org switcher + Account + Sign Out)
│    Test Church       │
│    Owner             │
└──────────────────────┘
```

**Total: 7 primary modules + Settings + Help + account widget = 10 sidebar entries** (vs. today's 31).

### Principles enforced

- **No collapsible groups.** Module-internal navigation lives inside each module page as a tab strip.
- **No "VOLUNTEERS" / "SCHEDULING" / "ORGANIZATION" group headers.** Modules speak for themselves.
- **Personal items removed from the admin global nav.** An admin who's also a volunteer accesses their personal Schedule via the **Me** zone in the account popover (see §5.4) or via the auto-switch when they're acting in volunteer capacity. (Synthesis Move A.)
- **Me zone in the account popover is explicit and exhaustive** — when an admin opens the account popover (top-right account widget), the popover panel includes a labeled "Me" section listing: `My Schedule`, `My Availability`, `Inbox`, `My Feedback`, `My Organizations` (multi-org only), and `Account`. These are the items that used to live in the admin rail; surfacing them in the popover panel keeps them one click away without re-cluttering the global nav. (Codex review note — prevents the Me zone from feeling like an Easter egg.)
- **Tier-locked modules stay visible with a 🔒 badge.** Click goes to a tooltip/inline upgrade prompt (see §7). The badge shows the *actual* required tier per module (e.g. Rooms → STARTER, Check-In → PRO, Worship Prep → PRO) based on `TIER_LIMITS`, NOT a generic "PRO" badge.
- **Settings is a top-level primary nav item**, not nested under an "Organization" group. Per Jason's decision.
- **Help stays sidebar-bottom** above the account widget (conventional desktop SaaS pattern; deferred polish per A-09).
- **Active org context** for multi-org users is promoted out of the account popover into the sidebar header — small "TESTER — Codex 2 ▾" line below the brand mark when `activeMemberships.length > 1`. (Addresses Synthesis divergence #2.)
- **Phase 1 transition note:** `Worship Prep` rail item links to `/dashboard/worship/plans` until Phase 2 creates the `/dashboard/worship` module landing. Same pattern for `People` (links to current `/dashboard/people` Roster page) and `Schedules` (links to current `/dashboard/schedules`). Phase 2 swaps these in place when the module landings exist. (Codex review note — Phase 1 must not link to routes that don't yet exist.)

### Role-aware ordering (Move A)

The same sidebar component renders differently based on role:

| Role | Visible items |
|---|---|
| **Owner / Admin** | Home · Service Day · Schedules · People · Rooms · Check-In · Worship Prep · Settings · Help |
| **Scheduler** | Home · Service Day · Schedules · People · Rooms · Check-In · Worship Prep · Help (Settings hidden; scheduler can't edit org config) |
| **Volunteer (only)** | uses the volunteer shell (§2), NOT the admin shell |
| **Volunteer with admin role at another org** | Admin shell for the current org; org switcher in the popover lets them flip context |

---

## 2. Proposed pure-volunteer navigation

```
┌──────────────────────┐
│ [VolunteerCal logo]  │
├──────────────────────┤
│ 📅  Schedule          │   → /dashboard/my-schedule
│ ◐  Availability      │   → /dashboard/my-availability
│ 📥  Inbox             │   → /dashboard/inbox
├──────────────────────┤
│ 🎓  My Journey         │   → /dashboard/my-journey   (conditional; only when prereqs exist)
├──────────────────────┤
│ ?  Help              │   → /dashboard/help
├──────────────────────┤
│ ⊙  Alex Kim         ▾│   (account widget — Account / My Feedback / Sign Out)
│    Test Church       │
│    Volunteer         │
└──────────────────────┘
```

**Total: 4 primary items + Help + account = 5 sidebar entries** (vs. today's 5–6, but cleaner because "Overview"/"My Feedback" leave the rail).

### Principles enforced

- **No admin chrome leaks** — gated entirely by membership role.
- **My Journey** is conditional on prereqs being configured for the org. When absent, the rail is just 3 + Help + account.
- **My Feedback** moves behind the account popover — it's not high-frequency enough to warrant rail space, but it MUST be a labeled entry in both the desktop account popover AND the mobile Account tab (not collapsed under a generic "more options" submenu). Codex review note: Alex must keep his existing support/feedback path. Treat this as a load-bearing requirement, not a polish item.
- **Open Slots** does NOT get a separate rail entry — it stays as a tab inside My Schedule (per current PR #35 implementation).
- **Same brand mark + footer** as the admin shell. The shell is one component; the *items* differ by role.

---

## 3. Proposed admin mobile bottom nav + More menu

### Bottom nav (always-visible 5 tabs)

```
┌────────┬────────┬────────┬────────┬────────┐
│   ⌂    │   ☀    │   👥   │   ✓    │   ≡    │
│  Home  │Svc Day │ People │ Check  │  More  │
└────────┴────────┴────────┴────────┴────────┘
```

| Tab | Label | Route | Tier-gating |
|---|---|---|---|
| 1 | **Home** | `/dashboard` | always |
| 2 | **Service Day** | `/dashboard/service-day` | always (same label as desktop sidebar) |
| 3 | **People** | `/dashboard/people` | always |
| 4 | **Check-In** | `/dashboard/checkin` | tier-gated; if not enabled, replaced with **Schedules** |
| 5 | **More** | sheet | always |

**Labeling rule (resolved):** "Service Day" on BOTH desktop sidebar and mobile bottom nav. Jason resolved this 2026-05-19. The label is 11 characters — comfortably within the existing 12-char "Availability" precedent already in the volunteer bottom nav. Codex pilot-tested "Today" on the mobile tab and it worked, but the asymmetry between desktop ("Service Day") and mobile ("Today") was undesirable. Fall back to "Today" only if real-device testing in Phase 1 shows the label wraps or truncates on the smallest target viewport (iPhone SE 1st gen / 320 px). The icon row above the label gives a fallback affordance.

### More menu (exhaustive, scrollable bottom sheet)

The current More menu has gaps (Sunday Ops, Volunteer Health, Onboarding, Training Sessions, Retention, Org Activity, Short Links all missing). The new menu is **exhaustive — every admin-accessible page reachable from one place**.

```
[Drag handle]

PRIMARY MODULES  (mirrors desktop sidebar)
  ⌂  Home
  ☀  Service Day                       ← same surface as bottom-nav "Service Day"
  📅 Schedules
  👥 People
  🚪 Rooms        🔒 (when locked)
  ✓  Check-In     🔒 (when locked)
  🎵 Worship Prep 🔒 (when locked)
  ⚙  Settings

PEOPLE WORKBENCH (admin shortcut to module sub-pages)
  ↳ Roster
  ↳ Teams
  ↳ Onboarding
  ↳ Training Sessions
  ↳ Health
  ↳ Retention

ROOMS WORKBENCH (when enabled)
  ↳ Bookings
  ↳ Requests
  ↳ Facility Groups
  ↳ Public Calendar

CHECK-IN WORKBENCH (when enabled)
  ↳ Today
  ↳ Households
  ↳ Reports
  ↳ Import
  ↳ Room Setup

WORSHIP WORKBENCH (when enabled)
  ↳ Service Plans
  ↳ Songs
  ↳ Reports

SETTINGS WORKBENCH (admin only)
  ↳ General
  ↳ Billing
  ↳ Activity
  ↳ Short Links
  ↳ Reminders
  ↳ Setup Wizard

ME
  ↳ My Schedule
  ↳ My Availability
  ↳ My Journey  (when prereqs)
  ↳ My Feedback
  ↳ Inbox
  ↳ My Organizations

[Divider]
?  Help
🚪 Sign Out
```

**Rules:**
- Top section (PRIMARY MODULES) mirrors the desktop sidebar exactly — direct routes.
- Workbench sections expose sub-tabs of each module for users who want to deep-link without going through the module landing → tab pattern. Reduces hop count on phone.
- Tier-locked modules appear in the PRIMARY MODULES block with a 🔒 badge AND their workbench section is hidden (no point showing sub-pages of a module the org can't use).
- **ME** zone gathers the personal volunteer pages an admin might also need — keeps them off the primary nav but findable.
- Help + Sign Out stay last (convention).

**Anti-junk-drawer discipline (Codex review note):** The More sheet is intentionally exhaustive, which is the whole point — but exhaustiveness without visual hierarchy IS the ORGANIZATION group's failure mode warmed over. The implementation MUST:

- **Section headings** are bold/uppercase with `vc-text-muted` color and adequate vertical breathing room above each section (~24 px). PRIMARY MODULES / PEOPLE WORKBENCH / ROOMS WORKBENCH / etc. are visually distinct buckets, not a flat list.
- **Scroll affordance** — if the sheet content exceeds the viewport on the smallest target device, the bottom edge of the sheet shows a subtle gradient fade so it's obvious there's more below. The drag handle at the top affords expansion to full-height.
- **Collapse the workbench sections by default on first open** for any user whose org has all four tier-gated modules (Rooms + Check-In + Worship Prep + People workbench = a lot). PRIMARY MODULES + ME stay always-expanded. Decide during implementation; defer if not needed.
- **Search/jump-to box** at top of the sheet if the total entry count exceeds ~15 on the active tier. Defer to Phase 5 unless real users complain in Phase 1.

If the sheet feels like a second junk drawer in Codex's Phase 1 retest, it failed — fix before Phase 2.

### Volunteer mobile bottom nav (no change from today)

Current implementation in `src/components/dashboard/bottom-nav.tsx:41-65`:
```
Schedule · Availability · Inbox · Account
```
Per the synthesis, volunteer mobile shell is "mostly right" — keep it. Account tab opens the volunteer account popover content as a full page (existing `/dashboard/account`). No More menu needed for volunteers.

---

## 4. Contextual subnav per module

Each module is now a **module landing page whose identity IS the active tab**. There is no large module-name H1 above the tab strip — the active tab in the strip is the page identity. This is the Vercel / Stripe / WorshipTools pattern (Jason's resolved preference, 2026-05-19).

### Pattern spec

- **Sticky tab strip** at the top of the content area, immediately below the global page chrome (sidebar + top bar). On scroll, the strip pins to the viewport top so the user always knows which module and which tab they're in.
- **Small module identifier** to the LEFT of the strip — module icon + module name in `vc-text-muted` at body size, NOT a full H1. e.g. `🚪 Rooms  · Bookings · Requests · Facility Groups · Public Calendar · Settings`. (The icon+name is the breadcrumb; the tabs are the navigation; the page content is what the user came for.)
- **Tabs** are inline, horizontal on desktop, scrollable-horizontal on mobile (overflow-x with a snap behavior). Active tab has the `vc-coral` underline indicator. Inactive tabs are `vc-text-muted`; hover lightens to `vc-text`.
- **No subtitle / no description text** above the strip. The module's name + the active tab tells the user what they're looking at; the content tells them what they can do.
- **Page-level actions** (Create, Filter, Export) live in a `vc-flex-end` row to the RIGHT of the tab strip on desktop. On mobile they collapse into a `⋯` overflow menu or move to a sticky bottom action bar — per-page call.
- **Same horizontal rule** (`vc-border-subtle`) underlines the entire strip so it visually divides the chrome from the content.

### Anti-patterns explicitly avoided

- ❌ Big "ROOMS" all-caps H1 above the tabs (looks like Phase 1 admin chrome from 2024, eats vertical space)
- ❌ Tabs that scroll AWAY with the page on long content (loses context on Worship Service Plans, where the user might scroll 8 screens)
- ❌ Page subtitle paragraph between H1 and tabs ("Manage your rooms, bookings, and facility groups…" — the tabs do that job)
- ❌ Vertical secondary sidebar inside a module (overloads the rail; admin sidebar already does navigation)

### Accessibility — semantic page identity (Codex review note)

Removing the visual H1 does NOT remove the *semantic* need for a page-level landmark. Each module landing + each sub-tab page MUST provide one of:

- An `<h1>` that is **visually hidden** (`sr-only` Tailwind utility) but present in the DOM, e.g. `<h1 className="sr-only">Rooms — Bookings</h1>`. Screen readers announce it; visually it's invisible.
- OR `aria-labelledby` on the page `<main>` element pointing to the active tab's text, so the active tab text becomes the page's accessible name.
- OR a `<nav aria-label="Rooms tabs">` wrapper around the tab strip plus a `<section aria-labelledby="active-tab-id">` for content, so the landmark structure is unambiguous.

Pick one approach and use it consistently. Codex's Phase 1 retest will include a screen-reader smoke (VoiceOver on macOS, NVDA on Windows) to verify the module + active tab are announced as the page identity.

### 4.1 Home (`/dashboard`)
**No tabs.** Single-page dashboard — Home is not a "module," so it doesn't follow the tab pattern; it gets a normal page treatment (greeting + cards). It continues to be the cross-org/cross-module welcome surface (greeting, stats cards, "next actions" prompts).
**Renamed from** "Overview" → "Home".

### 4.2 Service Day (`/dashboard/service-day`)
**No tabs.** Single-page live operational surface (the upcoming/today's service occurrence with role coverage, RSVPs, on-the-fly fixes).
**Renamed from** `/dashboard/scheduling-dashboard` → `/dashboard/service-day`. Sidebar label "Dashboard" inside SCHEDULING → "Service Day" as a primary sidebar item.

### 4.3 Schedules (`/dashboard/schedules`)
Module landing with tabs:

| Tab | Source | Default? |
|---|---|---|
| **All Schedules** | `/dashboard/schedules` (current) | ✓ |
| **Services & Events** | `/dashboard/services-events` (current) | |

The current `/dashboard/schedules` page becomes the "All Schedules" tab. The current `/dashboard/services-events` page becomes the "Services & Events" tab. Both reachable as deep-links `/dashboard/schedules` and `/dashboard/schedules/services-events` (preferred) OR keep old route alive as alias.

### 4.4 People (`/dashboard/people`)
Module landing with tabs (most consolidated module — addresses Findings A-04 + Codex 4 + Codex 5):

| Tab | Source | Default? |
|---|---|---|
| **Roster** | `/dashboard/people` (current) | ✓ |
| **Teams** | `/dashboard/org/teams` (current) | |
| **Onboarding** | `/dashboard/onboarding` (current) | |
| **Training** | `/dashboard/training-sessions` (current) | |
| **Health** | `/dashboard/volunteer-health` (current) | |
| **Retention** | `/dashboard/retention` (current, admin-only) | |
| **Feedback** | `/dashboard/admin/feedback` (current, admin-only) | |

7 tabs is at the upper end of the "manageable tab strip" range, but Jason resolved Feedback Triage → People (not Settings). Hold the line: if the strip wraps on mid-width desktops (≤ 1280 px), use horizontal scroll with snap behavior — do NOT split Feedback off into Settings as a secondary fallback.

Role-gating per tab: Roster + Teams + Training visible to schedulers+; Onboarding + Health + Retention + Feedback admin-only.

### 4.5 Rooms (`/dashboard/rooms`)
Module landing with tabs:

| Tab | Source | Default? |
|---|---|---|
| **Bookings** | `/dashboard/rooms` (current) | ✓ |
| **Requests** | `/dashboard/rooms/requests` (current) | |
| **Facility Groups** | `/dashboard/rooms/facility/[groupId]` + (subset of) `/dashboard/org/campuses` (current) | |
| **Calendar** | `/calendar` (admin-facing — current) | |
| **Settings** | `/dashboard/rooms/settings` (current) + (subset of) `/dashboard/org/campuses` | (admin-only) |

**Naming + scope (Codex review note):** The tab is labeled **Calendar** — NOT "Public Calendar." `/calendar` is the admin-facing authenticated room calendar view; `/calendar/public?token=…` is the separate public token-protected surface. The admin tab shows the room calendar + the controls for *managing* the public feed (toggle on/off, regenerate token), but is itself not public. The unauthenticated `/calendar/public` URL stays put — no nav change.

**`/dashboard/org/campuses` is not a wholesale move.** It currently mixes three concepts: (a) campus/setup configuration, (b) public-calendar feed settings, and (c) facility-sharing/group setup. Phase 3 splits these intentionally: facility-sharing/group setup → Rooms → Facility Groups; campus/setup config → Settings → General (or a dedicated Campuses tab if real-estate justifies); public-calendar settings → the Calendar tab's settings drawer. Do NOT migrate the page as one redirect.

### 4.6 Check-In (`/dashboard/checkin`)
Module landing with tabs:

| Tab | Source | Default? |
|---|---|---|
| **Today** | `/dashboard/checkin` (current) | ✓ |
| **Households** | `/dashboard/checkin/households` (current) | |
| **Reports** | `/dashboard/checkin/reports` (current) | |
| **Room Setup** | `/dashboard/checkin/rooms` (current) | |
| **Import** | `/dashboard/checkin/import` (current, admin-only) | |
| **Settings** | `/dashboard/checkin/settings` + `/dashboard/org/check-ins` (current) | (admin-only) |

**The confusing "Check-Ins" item under ORGANIZATION goes away.** Its settings live under the Settings tab inside the Check-In module.

### 4.7 Worship Prep (`/dashboard/worship`)
Module landing with tabs:

| Tab | Source | Default? |
|---|---|---|
| **Service Plans** | `/dashboard/worship/plans` (current) | ✓ |
| **Songs** | `/dashboard/worship/songs` (current) | |
| **Reports** | `/dashboard/worship/reports` (current) | |

**Notable:** there is no `/dashboard/worship` index page today (sidebar deep-links straight into `/dashboard/worship/plans`). This module needs a new landing page that defaults to Service Plans.

### 4.8 Settings (`/dashboard/settings`)
Module landing with tabs (replaces ORGANIZATION group):

| Tab | Source | Default? |
|---|---|---|
| **General** | `/dashboard/settings` (current) | ✓ |
| **Billing** | `/dashboard/org/billing` (current) | |
| **Activity** | `/dashboard/org/activity` (current) | |
| **Reminders** | `/dashboard/reminders` (current) | |
| **Short Links** | `/dashboard/short-links` (current) | |
| **Setup** | `/dashboard/setup` (current — setup wizard) | (conditional: visible to owner only; auto-surfaces when setup incomplete) |

**Team** and **Campus** management does NOT live here — those moved to People → Teams and Rooms → Facility Groups respectively. Settings is now strictly account/org-wide configuration.

---

## 5. Route mapping table (current → proposed)

Format: **current route** | **current label** | **proposed route** | **proposed label** | **route action**

| Current route | Current label | Proposed route | Proposed label | Route action |
|---|---|---|---|---|
| `/dashboard` | Overview | `/dashboard` | Home | **label change only** |
| `/dashboard/scheduling-dashboard` | Dashboard (inside SCHEDULING) | `/dashboard/service-day` | Service Day | **route rename + alias** |
| `/dashboard/schedules` | Schedules | `/dashboard/schedules` (default tab) | Schedules → All Schedules | **label change** |
| `/dashboard/services-events` | Services & Events | `/dashboard/schedules` (tab=services-events) | Schedules → Services & Events | **route alias** (`/dashboard/services-events` → `/dashboard/schedules?tab=services-events` OR `/dashboard/schedules/services-events`) |
| `/dashboard/people` | Volunteers | `/dashboard/people` (default tab Roster) | People → Roster | **label change** |
| `/dashboard/volunteer-health` | Team Health | `/dashboard/people/health` | People → Health | **route move + alias** |
| `/dashboard/retention` | Retention | `/dashboard/people/retention` | People → Retention | **route move + alias** |
| `/dashboard/onboarding` | Onboarding | `/dashboard/people/onboarding` | People → Onboarding | **route move + alias** |
| `/dashboard/training-sessions` | Training Sessions | `/dashboard/people/training` | People → Training | **route move + alias** |
| `/dashboard/training-sessions/[id]` | (detail) | `/dashboard/people/training/[id]` | (detail) | **route move + alias** |
| `/dashboard/admin/feedback` | Feedback Triage | `/dashboard/people/feedback` | People → Feedback | **route move + alias** |
| `/dashboard/admin/feedback/insights` | (detail) | `/dashboard/people/feedback/insights` | (detail) | **route move + alias** |
| `/dashboard/org/teams` | Teams | `/dashboard/people/teams` | People → Teams | **route move + alias** |
| `/dashboard/rooms` | Bookings | `/dashboard/rooms` (default tab Bookings) | Rooms → Bookings | **label change** |
| `/dashboard/rooms/requests` | Requests | `/dashboard/rooms/requests` | Rooms → Requests | **stays** (already nested) |
| `/dashboard/rooms/facility/[groupId]` | (facility view) | `/dashboard/rooms/facility/[groupId]` | Rooms → Facility Groups | **stays** |
| `/dashboard/rooms/settings` | (settings) | `/dashboard/rooms/settings` | Rooms → Settings | **stays** |
| `/dashboard/rooms/[roomId]` | (detail) | `/dashboard/rooms/[roomId]` | (detail) | **stays** |
| `/dashboard/org/campuses` | Campuses | **split** between `/dashboard/rooms/facility` (facility-sharing/groups), `/dashboard/settings/general` (campus config), and `/dashboard/rooms/calendar` (public-feed settings) | Rooms → Facility Groups + Settings → General + Rooms → Calendar | **route split + multiple aliases**: the old URL redirects to the highest-frequency landing (Facility Groups). The other two slices migrate separately. See §6.5 split detail |
| `/calendar` | (admin-facing) | `/dashboard/rooms/calendar` | Rooms → Calendar | **route move + alias** |
| `/calendar/public` | (public token-protected) | `/calendar/public` | (no change) | **stays** (public-only surface) |
| `/dashboard/checkin` | Dashboard (inside CHILDREN'S CHECK-IN) | `/dashboard/checkin` (default tab Today) | Check-In → Today | **label change** |
| `/dashboard/checkin/households` | Households | `/dashboard/checkin/households` | Check-In → Households | **stays** |
| `/dashboard/checkin/households/[id]` | (detail) | `/dashboard/checkin/households/[id]` | (detail) | **stays** |
| `/dashboard/checkin/reports` | Reports | `/dashboard/checkin/reports` | Check-In → Reports | **stays** |
| `/dashboard/checkin/rooms` | (rooms config) | `/dashboard/checkin/rooms` | Check-In → Room Setup | **label change** |
| `/dashboard/checkin/import` | Import | `/dashboard/checkin/import` | Check-In → Import | **stays** |
| `/dashboard/checkin/settings` | (settings — currently redirects to `/dashboard/org/check-ins`) | `/dashboard/checkin/settings` (real surface, not a redirect) | Check-In → Settings | **convert from redirect to real page in Phase 3** before reversing the alias. Codex review note: `/dashboard/checkin/settings` is currently a redirect *to* `/dashboard/org/check-ins`; Phase 3 must (a) move the settings UI into `/dashboard/checkin/settings`, (b) verify the page loads with full settings content, THEN (c) point `/dashboard/org/check-ins` back at the new home. Do these in that order to avoid a redirect loop |
| `/dashboard/org/check-ins` | Check-Ins (under ORGANIZATION) | `/dashboard/checkin/settings` | Check-In → Settings | **route move + alias** (see Phase 3 ordering note above) |
| `/dashboard/worship/plans` | Service Plans | `/dashboard/worship/plans` | Worship Prep → Service Plans | **label change** |
| `/dashboard/worship/plans/[id]` | (detail) | `/dashboard/worship/plans/[id]` | (detail) | **stays** |
| `/dashboard/worship/songs` | Songs | `/dashboard/worship/songs` | Worship Prep → Songs | **stays** |
| `/dashboard/worship/songs/[id]` | (detail) | `/dashboard/worship/songs/[id]` | (detail) | **stays** |
| `/dashboard/worship/songs/[id]/edit` | (edit) | `/dashboard/worship/songs/[id]/edit` | (edit) | **stays** |
| `/dashboard/worship/reports` | Reports | `/dashboard/worship/reports` | Worship Prep → Reports | **stays** |
| `/dashboard/worship` | (no current page) | `/dashboard/worship` | Worship Prep (module landing) | **NEW page** (tabs landing; defaults to Service Plans) |
| `/dashboard/settings` | Settings | `/dashboard/settings` | Settings → General | **stays** (becomes default tab) |
| `/dashboard/org/billing` | Billing | `/dashboard/settings/billing` | Settings → Billing | **route move + alias** |
| `/dashboard/org/activity` | Activity | `/dashboard/settings/activity` | Settings → Activity | **route move + alias** |
| `/dashboard/reminders` | (under ORGANIZATION? not in current sidebar but exists as a route) | `/dashboard/settings/reminders` | Settings → Reminders | **route move + alias** |
| `/dashboard/short-links` | Short Links | `/dashboard/settings/short-links` | Settings → Short Links | **route move + alias** |
| `/dashboard/setup` | (setup wizard) | `/dashboard/settings/setup` | Settings → Setup | **route move + alias** |
| `/dashboard/my-schedule` | My Schedule | `/dashboard/my-schedule` | (volunteer shell) Schedule | **label change** (rail says "Schedule", page header can stay "My Schedule") |
| `/dashboard/my-availability` | My Availability | `/dashboard/my-availability` | (volunteer shell) Availability | **label change** |
| `/dashboard/inbox` | Inbox | `/dashboard/inbox` | (volunteer shell) Inbox | **stays** |
| `/dashboard/my-journey` | My Journey | `/dashboard/my-journey` | (volunteer shell) My Journey | **stays** |
| `/dashboard/account` | Account | `/dashboard/account` | (account popover) Account | **stays** |
| `/dashboard/my-orgs` | My Organizations | `/dashboard/my-orgs` | (account popover) My Organizations | **stays** (defer "keep as page or fold into popover" call to Pass E per A-10) |
| `/dashboard/help` | Help | `/dashboard/help` | Help | **stays** |
| `/dashboard/admin` | Platform-Admin Tier Override (no sidebar entry today) | `/dashboard/platform/tier-override` | (admin-only utility, no sidebar entry) | **route move + alias** (Phase 3); audit confirmed it's a real page wired to platform-admin tier override, not a stub |
| `/dashboard/organization` | (stub — pure `?tab=X` redirect handler) | (delete file) | n/a | **delete** in Phase 3 after updating the existing `TAB_REDIRECTS` table in this file to point at the new module routes (`teams` → `/dashboard/people/teams`, `campuses` → `/dashboard/rooms/facility`, `checkin` → `/dashboard/checkin/settings`, `billing` → `/dashboard/settings/billing`); any inbound links from emails/docs that pointed at `/dashboard/organization?tab=X` get the new destinations transparently |
| `/dashboard/feedback` | (canonical page — `MyFeedbackPage` component) | `/dashboard/feedback` | (account popover) My Feedback | **stays** — confirmed canonical via audit; sidebar at `sidebar.tsx:131` already points here; no `/dashboard/my-feedback` route exists |
| `/dashboard/platform/*` | Platform admin (super-admin only) | `/dashboard/platform/*` | unchanged | **stays** (super-admin shell, out of Pass A scope) |

### Public + auxiliary routes (unchanged, listed for completeness)
`/`, `/login`, `/register`, `/password-reset`, `/privacy`, `/terms`, `/waitlist`, `/offline`, `/join/[churchId]`, `/invites/[membershipId]`, `/confirm/[token]`, `/events/[churchId]/[eventId]/signup`, `/check-in/[code]`, `/checkin`, `/checkin/room/[roomId]`, `/guardian`, `/kiosk`, `/s/[slug]`, `/display/room/[roomId]`, `/stage-sync/conductor/[churchId]/[planId]`, `/stage-sync/view/[churchId]/[planId]`, `/calendar/public`. All stay where they are; Pass A doesn't touch the public shell.

---

## 6. In-place rename vs alias/redirect

Per the framework (no backward-compat concern), we COULD rename everything in place. But the surface inventory + Codex's test fixtures + email-link references benefit from aliases for the route changes, and the cost of an alias is one redirect handler each.

### 6.1 Label-only changes (no route change, no risk)
Pure string changes in `sidebar.tsx` / `bottom-nav.tsx` / page headers:
- "Overview" → "Home"
- "Dashboard" (SCHEDULING group) → "Service Day" (both desktop rail AND mobile bottom tab)
- "Dashboard" (CHILDREN'S CHECK-IN) → "Today" (module sub-tab inside Check-In; distinct from the global Service Day surface)
- "Volunteers" (rail) → "People" (rail) — page header for `/dashboard/people` can become "Roster" since it's now a tab
- "Volunteer Health" → "Health"
- "Team Health" → "Health"
- "WORSHIP" (group header) → "Worship Prep" (rail item)
- "Bookings" (the rail entry) stays, but it becomes the default tab of Rooms

**Cost:** zero risk. Ship as fast as you can change a string.

### 6.2 Route renames WITH alias (route move + old URL redirects to new)
For routes that move into a module's sub-path. **Prefer a tiny `page.tsx` that calls `redirect()` server-side** over a `middleware.ts` rewrite (Codex review note) — route-level redirects are explicit per-file, won't accidentally affect adjacent routes, are easier to grep and reason about, and don't add per-request work to auth-routing middleware that runs on every dashboard page. Only use `middleware.ts` when a single rule covers many routes AND the rule clearly reduces churn (e.g. `/dashboard/old-prefix/*` → `/dashboard/new-prefix/*` for a whole subtree).

Routes to alias:

- `/dashboard/scheduling-dashboard` → `/dashboard/service-day`
- `/dashboard/services-events` → `/dashboard/schedules/services-events` (or `?tab=services-events`)
- `/dashboard/volunteer-health` → `/dashboard/people/health`
- `/dashboard/retention` → `/dashboard/people/retention`
- `/dashboard/onboarding` → `/dashboard/people/onboarding`
- `/dashboard/training-sessions` (+ `/[id]`) → `/dashboard/people/training` (+ `/[id]`)
- `/dashboard/admin/feedback` (+ `/insights`) → `/dashboard/people/feedback` (+ `/insights`)
- `/dashboard/org/teams` → `/dashboard/people/teams`
- `/dashboard/org/campuses` → `/dashboard/rooms/facility`
- `/dashboard/org/check-ins` → `/dashboard/checkin/settings`
- `/dashboard/org/billing` → `/dashboard/settings/billing`
- `/dashboard/org/activity` → `/dashboard/settings/activity`
- `/dashboard/reminders` → `/dashboard/settings/reminders`
- `/dashboard/short-links` → `/dashboard/settings/short-links`
- `/dashboard/setup` → `/dashboard/settings/setup`
- `/calendar` (admin-facing) → `/dashboard/rooms/calendar`

**Cost per route:** ~5 lines of redirect code. Aliases stay alive indefinitely (or for a defined "deprecation window" of e.g. 90 days; doesn't matter when there are zero external links to break).

### 6.3 In-place route renames WITHOUT alias
Reserved for routes that have zero current usage outside the codebase. None in this pass — every route the user might hit gets an alias for safety.

### 6.4 New routes that need creation
- `/dashboard/service-day/page.tsx` (or reuse current `/dashboard/scheduling-dashboard/page.tsx`)
- `/dashboard/worship/page.tsx` — currently nothing; need module landing
- `/dashboard/people/page.tsx` — currently the Roster page; needs to become a tabbed module landing (the Roster tab is the current page content)

### 6.5 Audit results (folded in)

All three of the audit-needed routes have been resolved. Findings:

- `/dashboard/admin` → **real page** (Platform-Admin Tier Override utility used by super-admins to flip a church's tier for testing). Currently orphaned from the sidebar — only super-admins know it exists. Move to `/dashboard/platform/tier-override` in Phase 3 to make the URL self-documenting; no sidebar entry needed (platform admin has its own shell at `/dashboard/platform/*`).
- `/dashboard/organization` → **pure stub** containing a single `TAB_REDIRECTS` lookup that maps `?tab=teams|campuses|checkin|rooms|billing` to old `/dashboard/org/*` routes. Phase 3 updates `TAB_REDIRECTS` to point at the new module routes (`teams` → `/dashboard/people/teams`, `campuses` → `/dashboard/rooms/facility`, `checkin` → `/dashboard/checkin/settings`, `billing` → `/dashboard/settings/billing`). **Keep the stub alive for at least one release cycle past Phase 3** (Codex review note) to absorb stale email/doc traffic; delete in a later cleanup PR only after verifying no traffic via Vercel analytics or server logs.
- `/dashboard/feedback` vs `/dashboard/my-feedback` → **canonical is `/dashboard/feedback`**. The page component is named `MyFeedbackPage` (legacy of the rename); the sidebar already links here at `src/components/dashboard/sidebar.tsx:131`. No `/dashboard/my-feedback` route exists in the codebase. No alias needed.

### 6.6 Campuses split (Codex review note)

`/dashboard/org/campuses` is the only route in the migration that cannot be moved wholesale — it mixes three concerns that should each land at different destinations. Phase 3 splits as follows:

| Slice of /dashboard/org/campuses | New home | Phase | Notes |
|---|---|---|---|
| **Facility-sharing / Facility Groups setup** (cross-org room sharing, member orgs of a facility group) | `/dashboard/rooms/facility` (Rooms → Facility Groups tab) | Phase 3 | Highest-frequency slice; `/dashboard/org/campuses` redirects HERE by default |
| **Campus configuration** (campus list, primary campus, multi-site routing) | `/dashboard/settings/general` or a dedicated `/dashboard/settings/campuses` tab if Jason's data shows multi-campus orgs are common | Phase 3-4 | Settings-level concern; small UI extraction |
| **Public room calendar feed settings** (toggle public feed, regenerate token, embed snippet) | Rooms → Calendar tab → settings drawer | Phase 3 | Stays adjacent to the calendar surface it configures |

Process: extract each slice into the new home with its own commit *within Phase 3's PR* (or split Phase 3 into 3a/3b/3c per §8.2 sub-bullet); leave `/dashboard/org/campuses` as a redirect to `/dashboard/rooms/facility` (the highest-frequency landing). Code-review verification: grep `/dashboard/org/campuses` references — any `?tab=X` query string in those references tells you which slice the caller actually wanted.

### 6.7 Email-template URL sweep (Codex review note)

In addition to in-app links, Phase 3 MUST sweep email-template source for old route references. Known instances:

- Absence/self-removal alert emails currently link to `/dashboard/scheduling-dashboard` → must update to `/dashboard/service-day`.
- Any email under `src/lib/utils/emails/*.ts` that references `/dashboard/org/billing`, `/dashboard/org/teams`, etc.

**Verification method:** `grep -r "/dashboard/scheduling-dashboard\|/dashboard/org/\|/dashboard/onboarding\|/dashboard/training-sessions\|/dashboard/volunteer-health\|/dashboard/retention\|/dashboard/short-links\|/dashboard/reminders\|/dashboard/admin/feedback\|/calendar[^/]" src/lib/utils/emails/ src/app/api/` should return zero matches after Phase 3 ships. Aliases will still work for legacy emails already in inboxes, but new emails should send the canonical URLs.

---

## 7. Tier-lock behavior

Per Jason's decision: **show locked modules with lock badges + disabled state.**

### 7.1 Visual treatment

```
🚪  Rooms                              🔒 STARTER
✓  Check-In                            🔒 PRO
🎵  Worship Prep                       🔒 PRO
```

- **Lock icon** to the right of the item label (replaces the chevron/indicator on other items)
- **Tier tag is per-module, NOT generic** (Codex review note) — the badge shows the actual `tier_required` for THIS module from `TIER_LIMITS`, e.g. Rooms may be STARTER while Check-In and Worship Prep are PRO. Never display a one-size "PRO" badge across all locked modules
- Tier-tag badge styling: small uppercase text in `vc-sand-dark` on `vc-sand/30` background
- **Disabled state:** `opacity-50`, no hover background, cursor `not-allowed`, `aria-disabled="true"`
- **Icon and label** stay in `vc-text-muted` (not the bright `vc-coral` active treatment)

### 7.2 Click behavior

Three options to choose during implementation:

| Option | Behavior | Tradeoff |
|---|---|---|
| **A. Tooltip + no nav** | Click does nothing; hover shows tooltip "Available on Pro. Upgrade in Settings →" | Calmest; lowest distraction |
| **B. Upgrade modal** | Click opens a modal explaining the feature + "Upgrade" button | Promotes upgrade; more friction |
| **C. Read-only preview page** | Click navigates to a paywalled page showing what the feature does, with upgrade CTA | Best for upsell; most work |

**Recommendation:** Option A for Phase 1 (lowest cost, defensible). Option C is a marketing/sales decision worth its own conversation later.

### 7.2a Accessibility for locked items (Codex review note)

Disabled-looking items must remain **keyboard-discoverable** so non-mouse users can learn what they need to upgrade. Implementation requirements:

- Locked item is `aria-disabled="true"` (NOT `disabled` — disabled removes from tab order). It IS focusable via Tab.
- On focus, an accessible description appears via `aria-describedby` pointing to the tooltip content (or via an `aria-label` that includes "Locked. Available on STARTER. Open Settings to upgrade.").
- The tooltip itself is rendered into the DOM at all times (not just on hover), with `role="tooltip"`. The visual show/hide is CSS-driven on hover/focus.
- Pressing Enter or Space on the focused locked item moves focus to the in-tooltip "Upgrade in Settings →" link (or, if Option A strictness is enforced, the press is a no-op and the tooltip remains visible).
- Verified in Codex's Phase 1 retest with keyboard-only navigation (Tab through the sidebar; confirm locked items are reached, focused, and their tier info is announced).

### 7.3 Mobile bottom nav

If a tier-locked module would have been one of the 5 bottom tabs (e.g. Check-In on a Free tier where Check-In is gated), the slot replaces with the next-highest-priority always-available module (Schedules). The Pro-tier bottom nav is always Home / Service Day / People / Check-In / More; Free-tier becomes Home / Service Day / People / Schedules / More.

### 7.4 More menu

Locked modules appear in the PRIMARY MODULES section of More with the per-module tier badge (🔒 STARTER, 🔒 PRO, etc. — never a generic "PRO" across all locked items). Their workbench sections (sub-tabs) are hidden because none of the sub-pages are reachable.

### 7.5 Implementation note

A small `<TierLock />` badge component + a `useTierGate(moduleId)` hook that returns `{ enabled, tier_required, lock_reason }` would centralize the logic. The check itself reuses `TIER_LIMITS[tier]` from `src/lib/constants/index.ts`. The hook returns `tier_required` per-module so the badge component renders the correct tier label dynamically.

---

## 8. Risk assessment + phased implementation

### 8.1 Risks identified

| Risk | Severity | Mitigation |
|---|---|---|
| **Module landing pages don't exist** for `/dashboard/worship` and (kind of) `/dashboard/checkin` as tabbed landings | Medium | Phase 2 creates them before any sidebar links point to them |
| **Tab subnav component doesn't exist** in `src/components/ui/` | Medium | Phase 1 ships the component as part of the Settings page (lowest-risk first use); reuse in subsequent phases |
| **Sub-pages don't share layout** today — moving them into a module tab might require pulling header / breadcrumb out of each page | Medium | The tab strip becomes the module-level header; existing page-level headers either stay (and the tab strip wraps them) or get reduced to a context line. Per-page decision |
| **Setup wizard at `/dashboard/setup`** is an FTUE flow that auto-redirects new orgs — wrapping it in Settings tabs may break the wizard's "no chrome" desired state | Medium | Keep the wizard accessible at `/dashboard/settings/setup` but check the wizard's existing redirect logic. Possibly the wizard hides the tab strip when active |
| **Public `/calendar/public?token=…`** must not move | Low | Explicitly out of scope; alias only affects authenticated `/calendar` |
| **iCal subscribers** that point at calendar feed URLs are unaffected — those use `/api/calendar` not the page routes | None | Verified — the iCal feed API stays put |
| **`/dashboard/admin` and `/dashboard/organization`** are unknown stubs that might be doing something | Low | Audit step before any move; if they're 404-able, drop them; if they're load-bearing for some flow, plan accordingly |
| **Mobile More menu rebuild** is invasive and the current menu has been tested | Medium | Build new menu behind a feature flag OR ship as one PR after the sidebar lands so Codex can compare both in one retest |
| **Active-org context promotion** (synthesis #2) — affects sidebar header + every multi-org user's experience | Low | Optional; can ship as a polish PR after the main restructure |
| **Tests + CI smoke pins** reference current labels (e.g. "Open Slots", "Sign Up", "Training Sessions") — those don't change in this pass, but new pins should be added ("Service Day", "People", etc.) | Low | Part of each phase's PR |
| **Surface inventory + Codex test fixtures** will go stale | Low | Surface inventory regenerated as part of Codex's post-implementation retest. Worth running the screenshot capture script at the end of each phase |

### 8.2 Phased plan

Five PRs over ~2 weeks. Each independently shippable + reviewable. Each gets the standard treatment (CI green before merge, Vercel preview verified, prod bundle smoke check).

#### Phase 1 — Sidebar shape + label-only renames + tier-lock primitive
**Estimated PR size:** medium (sidebar.tsx + bottom-nav.tsx + a few constant strings + new `<TierLock />` component)
**Scope:**
- Replace `getNavSections()` in `sidebar.tsx` with the §1 shape — 7 modules + Settings + Help. No collapsibles. Pure role-aware ordering.
- All current routes preserved (Phase 1 does NOT move any pages); sidebar links point to current routes.
- Mobile bottom nav update to `Home / Service Day / People / Check-In / More` (still pointing at current routes). Real-device label check on iPhone SE 1st gen / 320 px — fall back to "Today" only if "Service Day" truncates or wraps unacceptably.
- Mobile More menu cleanup: remove the "Organization" expandable; add the missing modules; add Workbench sections for the modules whose sub-tabs already exist. **All More-menu links in Phase 1 point at CURRENT routes** (Codex review note) — e.g. PEOPLE WORKBENCH → Onboarding links to `/dashboard/onboarding`, NOT `/dashboard/people/onboarding`. Workbenches that depend on Phase 2's new tabs ship in Phase 2; Phase 3 swaps the deep-links to the new URLs once they exist.
- `<TierLock />` component + `useTierGate` hook. Tier-locked modules show the badge.
- Label renames: "Overview" → "Home" (page header AND sidebar), "Scheduling Dashboard" → "Service Day", "Volunteers" sidebar entry → "People", "WORSHIP" → "Worship Prep", "Bookings" stays as a tab inside Rooms (rail says "Rooms"), etc.
- Active-org context in sidebar header for multi-org users (small "TESTER — Codex 2 ▾" line below brand mark).

**Risk:** low — no route changes, no data changes, no page rebuilds. Pure rail surgery.

**Test:** sidebar items present per role; click each → lands on the existing page; mobile bottom nav works; tier-lock badges render on Free-tier accounts.

#### Phase 2 — New module landing pages + tab subnav primitive
**Estimated PR size:** medium-large
**Scope:**
- Create `<ModuleTabs />` component (horizontal tab strip; mobile-scrollable; active underline in `vc-coral`).
- Create new `/dashboard/worship/page.tsx` as module landing with Service Plans default tab.
- Convert `/dashboard/people/page.tsx` into a tabbed landing (Roster is the default tab and contains the current page's content; other tabs are placeholder links to current routes for now).
- Convert `/dashboard/rooms/page.tsx` into a tabbed landing (Bookings default).
- Convert `/dashboard/checkin/page.tsx` into a tabbed landing (Today default).
- Convert `/dashboard/schedules/page.tsx` into a tabbed landing (All Schedules default).
- Convert `/dashboard/settings/page.tsx` into a tabbed landing (General default).
- Tabs link to **current** routes for sub-pages (e.g. People → Onboarding tab links to `/dashboard/onboarding`); Phase 3 moves the sub-pages into the new URLs.

**Risk:** medium — new pages + new component. Test thoroughly that tab navigation works on desktop + mobile.

**Test:** each module's tab strip renders all expected tabs; clicking a tab navigates correctly; default tab is selected on module entry; active tab has the underline indicator.

#### Phase 3 — Sub-page route migration with aliases
**Estimated PR size:** large (touches many files but mostly redirects + import-path updates)

**Sub-phasing option (Codex review note):** If Phase 3's PR is touching too many files at once (rough threshold: > 40 changed files or > 800 line delta), split into independently shippable sub-phases. Each can be its own PR with its own CI green gate and Codex slice retest:

- **Phase 3a — People moves:** `/dashboard/onboarding`, `/dashboard/training-sessions`, `/dashboard/volunteer-health`, `/dashboard/retention`, `/dashboard/admin/feedback`, `/dashboard/org/teams` → `/dashboard/people/*`
- **Phase 3b — Settings moves:** `/dashboard/org/billing`, `/dashboard/org/activity`, `/dashboard/short-links`, `/dashboard/reminders`, `/dashboard/setup` → `/dashboard/settings/*`
- **Phase 3c — Rooms / Calendar moves:** `/dashboard/org/campuses` (split per §6.6), `/calendar` → `/dashboard/rooms/calendar`, `/dashboard/checkin/settings` real-page-then-reverse-alias from `/dashboard/org/check-ins`
- **Phase 3d — Schedules / Service Day moves:** `/dashboard/services-events` → `/dashboard/schedules/services-events`, `/dashboard/scheduling-dashboard` → `/dashboard/service-day`, `/dashboard/admin` → `/dashboard/platform/tier-override`

If file/line counts come in below threshold, ship Phase 3 as a single PR — the sub-phase grouping is a fallback to keep review tractable.

**Scope (combined):**
- Move sub-pages into module sub-routes per §5.
- For each move: leave a tiny `page.tsx` at the old location that calls `redirect()` to the new path (route-level redirects preferred over middleware per §6.2). Aliases stay indefinitely.
- Update internal links in sidebar, bottom nav, More menu, page headers, breadcrumbs, **email templates** (per §6.7 sweep), README, docs to point to the new URLs.
- Handle `/dashboard/admin` (move to `/dashboard/platform/tier-override`) and `/dashboard/organization` (update `TAB_REDIRECTS`, keep alive for ≥1 release cycle).
- Special ordering: `/dashboard/checkin/settings` is currently a redirect TO `/dashboard/org/check-ins`. Convert it to a real page BEFORE reversing the alias direction (§5 row + §6.6).

**Risk:** large — many file moves; every internal link is a potential broken-link bug. The CI integration tests catch backend-API breakages; sidebar tests catch link breakages.

**Test:** every alias redirects to the new path; every sub-page loads at its new URL; sidebar tabs all navigate correctly; mobile workbenches all navigate correctly; `grep -r "/dashboard/scheduling-dashboard\|/dashboard/org/" src/lib/utils/emails/ src/app/api/` returns zero matches.

#### Phase 4 — Settings consolidation + dissolve ORGANIZATION group
**Estimated PR size:** medium
**Scope:**
- After Phase 3's moves, the old `/dashboard/org/*` group is empty except for aliases. Audit + remove the directory.
- Polish the Settings landing page so all 6 tabs (General, Billing, Activity, Reminders, Short Links, Setup) render with consistent layouts.
- Update Help Center content + any in-app documentation to reference new locations.

**Risk:** low — by this point most of the work is cleanup.

**Test:** all Settings tabs load; old `/dashboard/org/*` URLs redirect; no orphaned routes.

#### Phase 5 — Multi-org context promotion + mobile More menu finalization
**Estimated PR size:** small
**Scope:**
- Sidebar header: when `activeMemberships.length > 1`, show active org line below the brand mark with a quick-switch caret.
- Mobile More menu: finalize the workbench sections now that all sub-pages live at their new URLs.
- Address synthesis divergence #2 (multi-org as a working context control, not a destination).

**Risk:** low.

**Test:** multi-org sidebar header renders + switch works; single-org sidebar header is unchanged; mobile More menu has all destinations reachable.

#### Phase 6 — Final smoke + Codex retest
- Re-run the surface inventory screenshot script (`docs/ux-review/references/our-screenshots/`) to refresh evidence
- Codex runs the §9 retest

### 8.3 What's NOT in this plan

- **Per-page content / layout polish** within each module — deferred to later passes (Pass C for Schedules, Pass D for People, etc.) as per the framework
- **Visual design / typography / spacing token consistency** — Pass F (cross-cutting)
- **Empty / error / loading states** within modules — Pass F
- **Mobile drawer/sheet/modal patterns** beyond the More menu — Pass F
- **Persistent "active org" badge for solo-org users** — single-org users should not pay for multi-org chrome
- **Tier-lock click behavior beyond Option A** (tooltip + no nav) — flag for marketing/sales conversation

---

## 9. Codex post-implementation smoke checks

After each phase ships to production (Vercel preview is enough for most), Codex runs the targeted slice. After Phase 5, Codex runs the full §9 sweep + reports back.

### After Phase 1
- Sign in as Sarah (admin) → desktop sidebar shows 7 modules + Settings + Help in the §1 order; no collapsibles; account widget at bottom; multi-org context line under brand mark
- Sign in as Alex (volunteer) → desktop sidebar shows 4 items + Help; no admin chrome
- Resize to mobile → admin bottom nav shows Home / Service Day / People / Check-In / More (label is "Service Day" matching desktop sidebar; flag if it truncates on iPhone SE 1st gen / 320 px)
- Tier-lock: switch a test org to Free tier; verify Worship Prep / Check-In / Rooms render with 🔒 PRO badge + disabled state; click shows tooltip and does not navigate (Option A)
- Click every sidebar entry → lands on a current route (no 404s)
- Capture screenshots of: admin desktop sidebar, volunteer desktop sidebar, admin mobile bottom nav, More menu open

### After Phase 2
- Each module landing page has a sticky tab strip at the top of the content area (Vercel/Stripe/WT pattern)
- NO big H1 above the strip — module icon + name appears at body size to the LEFT of the tabs as a breadcrumb
- Tabs reflect §4 spec
- Active tab is highlighted (`vc-coral` underline); clicking a non-active tab navigates without losing scroll context
- Default tab matches §4 spec
- Mobile: tabs scroll horizontally if overflow; active tab snaps into view
- Strip stays pinned to viewport top on long-content pages (Worship Service Plans is the stress test)

### After Phase 3
- Visit every OLD route in the §5 table → confirms redirect to new path
- Visit every NEW route → confirms page loads + correct content
- **Email-template URL audit (Codex review note — practical proxy for "old emails still land at the right page"):** run `grep -r "/dashboard/scheduling-dashboard\|/dashboard/org/\|/dashboard/onboarding\|/dashboard/training-sessions\|/dashboard/volunteer-health\|/dashboard/retention\|/dashboard/short-links\|/dashboard/reminders\|/dashboard/admin/feedback" src/lib/utils/emails/ src/app/api/` and confirm zero matches. Aliases catch in-flight legacy emails; this grep catches newly-sent emails that should use canonical URLs

### After Phase 4
- `/dashboard/org/*` is empty or removed
- Settings has all expected tabs
- All "Settings" deep-links (from in-app + email templates) work

### After Phase 5 — Full Pass A retest
| # | Action | Pass criteria |
|---|--------|---------------|
| 1 | Sarah → /dashboard | Lands on "Home" header; admin sidebar with 7 modules + Settings + Help |
| 2 | Click each sidebar entry | Module landing page loads with the §4 tabs |
| 3 | Click each module's tabs | Sub-page loads at the new URL |
| 4 | Switch org via account popover | Sidebar reflects new org; active-org line updates |
| 5 | Sign out → log in as Alex | Volunteer sidebar (4 items + Help); no admin chrome leaks |
| 6 | Mobile (DevTools iPhone 13 + iPhone SE widths) | Admin: Home / Service Day / People / Check-In / More tabs (Service Day matches desktop label); volunteer: Schedule / Availability / Inbox / Account. Flag if "Service Day" truncates on iPhone SE 1st gen 320 px |
| 7 | Open More menu on mobile | Exhaustive — every admin module visible; tier-locked items show 🔒; sub-tabs accessible via Workbench sections |
| 8 | Visit `/dashboard/scheduling-dashboard` directly | Redirects to `/dashboard/service-day` |
| 9 | Visit `/dashboard/org/billing` directly | Redirects to `/dashboard/settings/billing` |
| 10 | Visit `/dashboard/onboarding` directly | Redirects to `/dashboard/people/onboarding` |
| 11 | (Free-tier org) Visit `/dashboard/worship` directly | Tier-gate behavior is acceptable in any of three forms: (a) redirect to a settings/billing upgrade prompt, (b) render a module-level locked-state page with an upgrade CTA, or (c) render the upgrade-prompt tooltip behavior. **What matters:** no usable locked feature is reachable AND no crash/404 (Codex review note — implementations vary, the smoke check is for behavior not exact UI) |
| 12 | Persona check: count clicks for Sarah's top 5 tasks | Each ≤ 2 clicks from sidebar |
| 13 | Persona check: Alex finds his next assignment | 1 click from any landing |
| 14 | Regression: automated test suites pass | `npm run test:unit` green, `npm run test:rules` green, integration/smoke suite green. (De-pinned from hard counts per Codex review note — test counts change throughout testing; the assertion is the suites pass, not a specific number) |
| 15 | Regression: CI smoke pin grep for "Open Slots", "Sign Up", "Training Sessions", "Service Day", "Worship Prep", "Home", "People" | All present in built bundle |
| 16 | Accessibility: VoiceOver/NVDA pass on module landings | Active tab is announced as the page identity; locked sidebar items are keyboard-focusable and announce their tier requirement (per §4 a11y note + §7.2a) |

Codex also re-runs the **Phase 1 surface inventory script** to capture refreshed screenshots for the pre-Pass-B baseline.

---

## 10. Resolved decisions (Jason 2026-05-19)

All eight pre-implementation questions have been resolved. The plan above already incorporates these decisions; this section records the resolutions for traceability + future passes.

| # | Question | Decision | Where it shows up in the plan |
|---|---|---|---|
| 1 | Mobile "Today" label vs desktop "Service Day" label for `/dashboard/service-day` | **"Service Day" on both** desktop sidebar and mobile bottom nav. Fall back to "Today" only if real-device testing in Phase 1 shows truncation on iPhone SE 1st gen / 320 px | §0, §3 bottom-nav table, §6.1, §8.2 Phase 1, §9 retest |
| 2 | Feedback Triage placement (People vs Settings) | **People** module — consolidates volunteer-feedback workflows in the lifecycle module | §4.4, §5 route table |
| 3 | Tier-lock click behavior | **Option A** (tooltip, no nav). Options B/C deferred to marketing/sales conversation later | §7.2, §9 Phase 1 retest |
| 4 | `/dashboard/admin` + `/dashboard/organization` stubs — audit in Phase 1 or Phase 3? | **Audit done now; route changes happen in Phase 3** alongside other module-route moves. `/dashboard/admin` is a real platform-admin page (Tier Override utility) that moves to `/dashboard/platform/tier-override`; `/dashboard/organization` is a pure stub whose `TAB_REDIRECTS` get updated in Phase 3 | §5 route table, §6.5 audit results |
| 5 | `/dashboard/my-feedback` vs `/dashboard/feedback` canonical | **`/dashboard/feedback` is canonical** — confirmed via codebase audit. The component is named `MyFeedbackPage` (legacy), the sidebar at `src/components/dashboard/sidebar.tsx:131` already links to `/dashboard/feedback`, and no `/dashboard/my-feedback` route exists. No alias needed | §5 route table, §6.5 audit results |
| 6 | Module subnav placement on small viewports | **Vercel/Stripe/WorshipTools pattern** — sticky tab strip at the top of the content area, no large module-name H1 above it. The active tab IS the page identity. Module icon + name appears at body size to the LEFT of the tabs as a breadcrumb | §4 intro (full pattern spec + anti-patterns), §9 Phase 2 retest |
| 7 | `/dashboard/admin/feedback/insights` placement | **Stays nested under Feedback Triage** wherever that lands. Since Feedback Triage → People (decision #2), insights → `/dashboard/people/feedback/insights` | §5 route table |
| 8 | Phase sequencing — compress (one PR) or expand (more granular)? | **5 PRs over ~2 weeks** (recommended cadence stands). Each independently shippable + reviewable + CI-green-gated | §8.2 |

## 10.5 Codex review notes folded in (2026-05-19)

Codex reviewed `IMPLEMENTATION_PLAN.md` (`CODEX_PLAN_REVIEW.md`, 2026-05-19) and returned **CONCUR WITH NOTES** — no Severity 4-5 objections, no synthesis re-open. All notes are Severity 1-3 implementation tightenings. Each is folded into the plan; nothing is deferred.

| Section | Codex note | Where folded |
|---|---|---|
| §1 | Worship Prep rail must link to existing `/dashboard/worship/plans` in Phase 1 until module landing exists in Phase 2 | §1 Principles enforced — "Phase 1 transition note" bullet |
| §1 | Me zone in account popover must be explicit (not Easter egg) — must list My Schedule / My Availability / Inbox / My Feedback / My Organizations | §1 Principles enforced — "Me zone in the account popover is explicit and exhaustive" bullet |
| §2 | My Feedback must remain visible from account popover AND mobile Account, not feel like an Easter egg | §2 Principles enforced — "My Feedback moves behind the account popover" bullet expanded |
| §3 | More menu structure must avoid being a second junk drawer — section headings, scrolling affordance, optional collapse-by-default | §3 Anti-junk-drawer discipline subsection |
| §4 | Accessibility — removing visual H1 doesn't remove semantic page identity; need `sr-only h1` or `aria-labelledby` or `nav aria-label` | §4 Accessibility — semantic page identity subsection |
| §4 | Drop the "Feedback could move to Settings" hedge in §4.4 — Jason resolved Feedback Triage → People | §4.4 7-tab rationale paragraph rewritten |
| §4 | `/calendar` is admin-facing room calendar view; `/calendar/public` is the public token surface. Don't overpromise tab name "Public Calendar" | §4.5 Rooms tab renamed to "Calendar" + Naming + scope note |
| §5 | Drop the `/dashboard/my-feedback` row — no such route exists | Row deleted from §5 route table |
| §5 | `/dashboard/org/campuses` mixes 3 concerns (facility-sharing, campus config, public-calendar settings) — don't move wholesale | §5 row rewritten + §6.6 Campuses split detail |
| §5 | `/dashboard/checkin/settings` currently redirects to `/dashboard/org/check-ins` — convert to real page BEFORE reversing alias | §5 row rewritten with Phase 3 ordering note |
| §5 | Include email-template URLs in migration sweep — absence/self-removal emails point to `/dashboard/scheduling-dashboard` | §6.7 Email-template URL sweep subsection + §9 Phase 3 retest grep |
| §6 | Prefer route-level `redirect()` over `middleware.ts` rewrites | §6.2 intro paragraph rewritten |
| §6 | Keep `/dashboard/organization?tab=X` redirect compat for ≥1 release cycle past Phase 3 | §6.5 audit results — `/dashboard/organization` bullet updated |
| §7 | Lock badge must show per-module tier (STARTER / PRO / GROWTH per TIER_LIMITS), not generic "PRO" | §7.1 Visual treatment updated + §7.4 More menu note + §7.5 implementation note |
| §7 | Accessibility — locked items must be keyboard-discoverable; `aria-disabled` + focusable tooltip, not truly inert | §7.2a new subsection |
| §8 | Phase 3 can be split by module (People / Settings / Rooms-Calendar / Schedules-ServiceDay) if PR is too big | §8.2 Phase 3 sub-phasing option (3a/3b/3c/3d) |
| §8 | Phase 1's More menu rebuild must point at CURRENT routes (no Phase 2/3 route dependencies) | §8.2 Phase 1 scope updated |
| §9 | De-pin automated-test counts (237 changes) — assert suites pass, not specific numbers | §9 Phase 5 retest row 14 updated |
| §9 | "Old emails referencing old routes" is hard to test as live corpus — use URL aliases + email-template source grep as proxy | §9 Phase 3 retest bullet updated |
| §9 | Tier-lock direct-URL behavior may be redirect, upgrade state, or module gate — what matters is no usable locked feature + no crash/404 | §9 Phase 5 retest row 11 updated |

**Nothing deferred.** Every Codex note is in the plan. Phase 1 PR can begin.

---

## 11. Summary

**Before:** 31 sidebar entries, 5/6 above-the-fold items are personal volunteer self-service for an admin, 4 different "Dashboard"-named pages, ORGANIZATION as a junk drawer.

**After:** 7 module primaries + Settings + Help, role-aware ordering, modules speak for themselves, contextual sub-tabs inside each module, tier-locked modules visible with lock badges, multi-org context promoted, mobile bottom nav as a real peer of desktop IA.

**Phasing:** 5 PRs over ~2 weeks. Each ships independently, gets a Vercel preview + CI green + a Codex slice retest. Phase 6 = full Pass A retest + refreshed surface inventory.

**Constraints honored:** stays in the ministry-operations strategic lane (no CRM/CMS/giving drift). WorshipTools-style short primary nav (Jason's stated preference). One product shell with role-aware ordering (Move A, per synthesis adjudication).

This plan is directional. The engineer doing the actual work makes per-file implementation decisions (component shape, tab-strip animation, redirect-vs-rewrite, etc.); the plan establishes the destination + the order of travel.

---

**Status:** All §10 questions resolved 2026-05-19. Codex returned CONCUR WITH NOTES (no Severity 4-5); all notes folded into the plan per §10.5 on 2026-05-19. Phase 1 PR is cleared to begin.
