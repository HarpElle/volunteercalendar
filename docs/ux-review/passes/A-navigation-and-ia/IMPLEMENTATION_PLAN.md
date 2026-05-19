# Pass A — Implementation Plan: Navigation + IA Restructure

> Inputs: Pass A SYNTHESIS.md (adjudicated), CLAUDE.md, CODEX.md, Phase 1 references, Jason's 5 resolution decisions.
> Output: a concrete IA map + phased plan that an engineer can execute.
> **No code in this doc.** Implementation begins after Jason signs off on the plan.

## 0. Decisions baked in

From SYNTHESIS §"Jason Decisions" + the framework's binding constraints:

| Decision | Bound to |
|---|---|
| One product shell with role-aware ordering (Move A) | sidebar + mobile parity |
| Live operational surface label | **Service Day** (desktop) / **Today** (mobile bottom-nav, same destination) |
| Settings visibility | **Primary nav item** with cog icon |
| Tier-locked modules | **Show with lock badges + disabled state** (do not hide) |
| Top-level people language | **People** |
| Worship module label | **Worship Prep** |
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
- **Tier-locked modules stay visible with a 🔒 badge.** Click goes to a tooltip/inline upgrade prompt (see §7).
- **Settings is a top-level primary nav item**, not nested under an "Organization" group. Per Jason's decision.
- **Help stays sidebar-bottom** above the account widget (conventional desktop SaaS pattern; deferred polish per A-09).
- **Active org context** for multi-org users is promoted out of the account popover into the sidebar header — small "TESTER — Codex 2 ▾" line below the brand mark when `activeMemberships.length > 1`. (Addresses Synthesis divergence #2.)

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
- **My Feedback** moves behind the account popover. It's not high-frequency enough to warrant rail space.
- **Open Slots** does NOT get a separate rail entry — it stays as a tab inside My Schedule (per current PR #35 implementation).
- **Same brand mark + footer** as the admin shell. The shell is one component; the *items* differ by role.

---

## 3. Proposed admin mobile bottom nav + More menu

### Bottom nav (always-visible 5 tabs)

```
┌────┬────┬────┬────┬────┐
│ ⌂  │ ☀  │ 👥 │ ✓  │ ≡  │
│Home│Tdy │Peo │Chk │More│
└────┴────┴────┴────┴────┘
```

| Tab | Label | Route | Tier-gating |
|---|---|---|---|
| 1 | **Home** | `/dashboard` | always |
| 2 | **Today** | `/dashboard/service-day` | always (same surface as desktop "Service Day"; short label for thumb-reach) |
| 3 | **People** | `/dashboard/people` | always |
| 4 | **Check-In** | `/dashboard/checkin` | tier-gated; if not enabled, replaced with **Schedules** |
| 5 | **More** | sheet | always |

**Why "Today" on mobile and "Service Day" on desktop:** "Service Day" is 11 characters; tight under a phone bottom-tab icon. "Today" reads naturally on a phone (the use case IS "what's happening today"). Both go to `/dashboard/service-day`. Codex pilot-tested "Today" on the bottom-tab in their Pass A and it worked. Flag for synthesis if this dual labeling is unacceptable.

### More menu (exhaustive, scrollable bottom sheet)

The current More menu has gaps (Sunday Ops, Volunteer Health, Onboarding, Training Sessions, Retention, Org Activity, Short Links all missing). The new menu is **exhaustive — every admin-accessible page reachable from one place**.

```
[Drag handle]

PRIMARY MODULES  (mirrors desktop sidebar)
  ⌂  Home
  ☀  Service Day                       ← same as bottom-nav "Today"
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

### Volunteer mobile bottom nav (no change from today)

Current implementation in `src/components/dashboard/bottom-nav.tsx:41-65`:
```
Schedule · Availability · Inbox · Account
```
Per the synthesis, volunteer mobile shell is "mostly right" — keep it. Account tab opens the volunteer account popover content as a full page (existing `/dashboard/account`). No More menu needed for volunteers.

---

## 4. Contextual subnav per module

Each module is now a **module landing page with a tab strip at the top**. The strip is horizontal on desktop and scrollable-horizontal on mobile (similar to GitHub's tab pattern). Active tab is underlined in `vc-coral`.

### 4.1 Home (`/dashboard`)
**No tabs.** Single-page dashboard. Continues to be the cross-org/cross-module welcome surface (greeting, stats cards, "next actions" prompts).
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

7 tabs is at the upper end of the "manageable tab strip" range. If horizontal space is tight, **Feedback** could move to Settings (admin-feedback-triage is settings-y). Decide during implementation.

Role-gating per tab: Roster + Teams + Training visible to schedulers+; Onboarding + Health + Retention + Feedback admin-only.

### 4.5 Rooms (`/dashboard/rooms`)
Module landing with tabs:

| Tab | Source | Default? |
|---|---|---|
| **Bookings** | `/dashboard/rooms` (current) | ✓ |
| **Requests** | `/dashboard/rooms/requests` (current) | |
| **Facility Groups** | `/dashboard/rooms/facility/[groupId]` + `/dashboard/org/campuses` (current) | |
| **Public Calendar** | `/calendar` (current) | |
| **Settings** | `/dashboard/rooms/settings` (current) | (admin-only) |

The public calendar `/calendar/public?token=…` (unauthenticated) stays as a standalone public URL — only the admin-facing `/calendar` view moves into the Rooms tabs.

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
| `/dashboard/admin/feedback` | Feedback Triage | `/dashboard/people/feedback` | People → Feedback | **route move + alias** (could also live under Settings — decide in impl) |
| `/dashboard/admin/feedback/insights` | (detail) | `/dashboard/people/feedback/insights` | (detail) | **route move + alias** |
| `/dashboard/org/teams` | Teams | `/dashboard/people/teams` | People → Teams | **route move + alias** |
| `/dashboard/rooms` | Bookings | `/dashboard/rooms` (default tab Bookings) | Rooms → Bookings | **label change** |
| `/dashboard/rooms/requests` | Requests | `/dashboard/rooms/requests` | Rooms → Requests | **stays** (already nested) |
| `/dashboard/rooms/facility/[groupId]` | (facility view) | `/dashboard/rooms/facility/[groupId]` | Rooms → Facility Groups | **stays** |
| `/dashboard/rooms/settings` | (settings) | `/dashboard/rooms/settings` | Rooms → Settings | **stays** |
| `/dashboard/rooms/[roomId]` | (detail) | `/dashboard/rooms/[roomId]` | (detail) | **stays** |
| `/dashboard/org/campuses` | Campuses | `/dashboard/rooms/facility` | Rooms → Facility Groups | **route move + alias** |
| `/calendar` | (admin-facing) | `/dashboard/rooms/calendar` | Rooms → Public Calendar | **route move + alias** |
| `/calendar/public` | (public token-protected) | `/calendar/public` | (no change) | **stays** (public-only surface) |
| `/dashboard/checkin` | Dashboard (inside CHILDREN'S CHECK-IN) | `/dashboard/checkin` (default tab Today) | Check-In → Today | **label change** |
| `/dashboard/checkin/households` | Households | `/dashboard/checkin/households` | Check-In → Households | **stays** |
| `/dashboard/checkin/households/[id]` | (detail) | `/dashboard/checkin/households/[id]` | (detail) | **stays** |
| `/dashboard/checkin/reports` | Reports | `/dashboard/checkin/reports` | Check-In → Reports | **stays** |
| `/dashboard/checkin/rooms` | (rooms config) | `/dashboard/checkin/rooms` | Check-In → Room Setup | **label change** |
| `/dashboard/checkin/import` | Import | `/dashboard/checkin/import` | Check-In → Import | **stays** |
| `/dashboard/checkin/settings` | (settings) | `/dashboard/checkin/settings` | Check-In → Settings | **stays** |
| `/dashboard/org/check-ins` | Check-Ins (under ORGANIZATION) | `/dashboard/checkin/settings` | Check-In → Settings | **route move + alias** (merges with `/dashboard/checkin/settings` — same destination) |
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
| `/dashboard/my-feedback` (alias for `/dashboard/feedback`) | My Feedback | `/dashboard/feedback` | (account popover) My Feedback | **leaves rail** |
| `/dashboard/account` | Account | `/dashboard/account` | (account popover) Account | **stays** |
| `/dashboard/my-orgs` | My Organizations | `/dashboard/my-orgs` | (account popover) My Organizations | **stays** (defer "keep as page or fold into popover" call to Pass E per A-10) |
| `/dashboard/help` | Help | `/dashboard/help` | Help | **stays** |
| `/dashboard/admin` | (?) | (audit needed — likely deprecate or redirect to /dashboard) | | **review** |
| `/dashboard/organization` | (?) | (audit needed — likely deprecate or redirect to /dashboard/settings) | | **review** |
| `/dashboard/platform/*` | Platform admin (super-admin only) | `/dashboard/platform/*` | unchanged | **stays** (super-admin shell, out of Pass A scope) |

### Public + auxiliary routes (unchanged, listed for completeness)
`/`, `/login`, `/register`, `/password-reset`, `/privacy`, `/terms`, `/waitlist`, `/offline`, `/join/[churchId]`, `/invites/[membershipId]`, `/confirm/[token]`, `/events/[churchId]/[eventId]/signup`, `/check-in/[code]`, `/checkin`, `/checkin/room/[roomId]`, `/guardian`, `/kiosk`, `/s/[slug]`, `/display/room/[roomId]`, `/stage-sync/conductor/[churchId]/[planId]`, `/stage-sync/view/[churchId]/[planId]`, `/calendar/public`. All stay where they are; Pass A doesn't touch the public shell.

---

## 6. In-place rename vs alias/redirect

Per the framework (no backward-compat concern), we COULD rename everything in place. But the surface inventory + Codex's test fixtures + email-link references benefit from aliases for the route changes, and the cost of an alias is one redirect handler each.

### 6.1 Label-only changes (no route change, no risk)
Pure string changes in `sidebar.tsx` / `bottom-nav.tsx` / page headers:
- "Overview" → "Home"
- "Dashboard" (SCHEDULING group) → "Service Day" (rail) / "Today" (mobile tab)
- "Dashboard" (CHILDREN'S CHECK-IN) → "Today" (module sub-tab)
- "Volunteers" (rail) → "People" (rail) — page header for `/dashboard/people` can become "Roster" since it's now a tab
- "Volunteer Health" → "Health"
- "Team Health" → "Health"
- "WORSHIP" (group header) → "Worship Prep" (rail item)
- "Bookings" (the rail entry) stays, but it becomes the default tab of Rooms

**Cost:** zero risk. Ship as fast as you can change a string.

### 6.2 Route renames WITH alias (route move + old URL redirects to new)
For routes that move into a module's sub-path. The alias is a Next.js `middleware.ts` rewrite OR a tiny `page.tsx` that calls `redirect()` server-side:

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

### 6.5 Routes to audit + possibly deprecate
- `/dashboard/admin` — purpose unclear; check what's there + decide
- `/dashboard/organization` — likely a stub; likely redirect to `/dashboard/settings`
- `/dashboard/feedback` and `/dashboard/my-feedback` — figure out which is canonical; one redirects to the other

---

## 7. Tier-lock behavior

Per Jason's decision: **show locked modules with lock badges + disabled state.**

### 7.1 Visual treatment

```
🚪  Rooms                              🔒 PRO
```

- **Lock icon** to the right of the item label (replaces the chevron/indicator on other items)
- **Tier tag** ("PRO", "GROWTH", whatever the gate is) in a small badge in `vc-sand-dark` text on `vc-sand/30` background
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

### 7.3 Mobile bottom nav

If a tier-locked module would have been one of the 5 bottom tabs (e.g. Check-In on a Free tier where Check-In is gated), the slot replaces with the next-highest-priority always-available module (Schedules). The Pro-tier bottom nav is always Home / Today / People / Check-In / More; Free-tier becomes Home / Today / People / Schedules / More.

### 7.4 More menu

Locked modules appear in the PRIMARY MODULES section of More with the 🔒 PRO badge. Their workbench sections (sub-tabs) are hidden because none of the sub-pages are reachable.

### 7.5 Implementation note

A small `<TierLock />` badge component + a `useTierGate(moduleId)` hook that returns `{ enabled, tier_required, lock_reason }` would centralize the logic. The check itself reuses `TIER_LIMITS[tier]` from `src/lib/constants/index.ts`.

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
- Mobile bottom nav update to `Home / Today / People / Check-In / More` (still pointing at current routes).
- Mobile More menu cleanup: remove the "Organization" expandable; add the missing modules; add Workbench sections for the modules whose sub-tabs already exist. (Workbenches that depend on Phase 2's new tabs ship in Phase 2.)
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
**Scope:**
- Move sub-pages into module sub-routes per §5:
  - `/dashboard/onboarding` → `/dashboard/people/onboarding`
  - `/dashboard/training-sessions` → `/dashboard/people/training`
  - `/dashboard/volunteer-health` → `/dashboard/people/health`
  - `/dashboard/retention` → `/dashboard/people/retention`
  - `/dashboard/admin/feedback` → `/dashboard/people/feedback`
  - `/dashboard/org/teams` → `/dashboard/people/teams`
  - `/dashboard/org/billing` → `/dashboard/settings/billing`
  - `/dashboard/org/activity` → `/dashboard/settings/activity`
  - `/dashboard/short-links` → `/dashboard/settings/short-links`
  - `/dashboard/reminders` → `/dashboard/settings/reminders`
  - `/dashboard/setup` → `/dashboard/settings/setup`
  - `/dashboard/org/campuses` → `/dashboard/rooms/facility`
  - `/dashboard/org/check-ins` → `/dashboard/checkin/settings` (merge)
  - `/dashboard/services-events` → `/dashboard/schedules/services-events`
  - `/calendar` → `/dashboard/rooms/calendar` (the admin-facing /calendar)
  - `/dashboard/scheduling-dashboard` → `/dashboard/service-day`
- For each move: leave a tiny `page.tsx` at the old location that calls `redirect()` to the new path (or use `middleware.ts` rewrites). Aliases stay indefinitely.
- Update internal links in sidebar, bottom nav, More menu, page headers, breadcrumbs, email templates, README, docs to point to the new URLs.
- Audit + handle `/dashboard/admin` and `/dashboard/organization` stubs.

**Risk:** large — many file moves; every internal link is a potential broken-link bug. The CI integration tests catch backend-API breakages; sidebar tests catch link breakages.

**Test:** every alias redirects to the new path; every sub-page loads at its new URL; sidebar tabs all navigate correctly; mobile workbenches all navigate correctly.

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
- Resize to mobile → admin bottom nav shows Home / Today / People / Check-In / More
- Tier-lock: switch a test org to Free tier; verify Worship Prep / Check-In / Rooms render with 🔒 PRO badge + disabled state; click does nothing (or shows tooltip)
- Click every sidebar entry → lands on a current route (no 404s)
- Capture screenshots of: admin desktop sidebar, volunteer desktop sidebar, admin mobile bottom nav, More menu open

### After Phase 2
- Each module landing page has a tab strip
- Tabs reflect §4 spec
- Active tab is highlighted; clicking a non-active tab navigates
- Default tab matches §4 spec
- Mobile: tabs scroll horizontally if overflow

### After Phase 3
- Visit every OLD route in the §5 table → confirms redirect to new path
- Visit every NEW route → confirms page loads + correct content
- Old emails referencing old routes still land at the right page (alias works)

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
| 6 | Mobile (DevTools iPhone 13 width) | Admin: Today / Schedule / People / Check-In / More tabs; volunteer: Schedule / Availability / Inbox / Account |
| 7 | Open More menu on mobile | Exhaustive — every admin module visible; tier-locked items show 🔒; sub-tabs accessible via Workbench sections |
| 8 | Visit `/dashboard/scheduling-dashboard` directly | Redirects to `/dashboard/service-day` |
| 9 | Visit `/dashboard/org/billing` directly | Redirects to `/dashboard/settings/billing` |
| 10 | Visit `/dashboard/onboarding` directly | Redirects to `/dashboard/people/onboarding` |
| 11 | (Free-tier org) Visit `/dashboard/worship` directly | Hits the tier-gate (tooltip or redirect to settings/billing upgrade prompt) |
| 12 | Persona check: count clicks for Sarah's top 5 tasks | Each ≤ 2 clicks from sidebar |
| 13 | Persona check: Alex finds his next assignment | 1 click from any landing |
| 14 | Regression: existing automated tests (152 unit + 25 rules + 55 integration = 237) | All green |
| 15 | Regression: CI smoke pin grep for "Open Slots", "Sign Up", "Training Sessions", "Service Day", "Worship Prep", "Today" | All present in built bundle |

Codex also re-runs the **Phase 1 surface inventory script** to capture refreshed screenshots for the pre-Pass-B baseline.

---

## 10. Open questions before implementation begins

These need a Jason yes/no before Phase 1 starts. Most are small.

1. **Mobile "Today" label vs desktop "Service Day" label** for the same destination (`/dashboard/service-day`). Defensible asymmetry (mobile thumb-reach) but worth confirming. Alternative: "Service Day" on both, accept the slight crowding on mobile.

2. **Feedback Triage placement** — under People (consolidates volunteer-feedback workflows) or under Settings (it's admin triage)? I lean People; either works.

3. **Tier-lock click behavior** — Option A (tooltip, no nav) is the recommended Phase 1 default. OK to defer Options B/C to a marketing conversation?

4. **`/dashboard/admin` and `/dashboard/organization`** route stubs — audit-and-handle in Phase 1 or Phase 3? I lean Phase 1 since they're already deprecated-feeling.

5. **`/dashboard/my-feedback`** vs `/dashboard/feedback` — which is canonical? (Both appear referenced; one redirects to the other today, I believe.) Pick a canonical one + redirect the other.

6. **Module subnav placement on small viewports** — Tab strip below page header (current GitHub pattern) or sticky-top (current Vercel pattern)? Implementation detail, but worth deciding once so all modules follow the same rule.

7. **`/dashboard/admin/feedback/insights`** is a sub-detail under Feedback Triage. Stays nested under whichever home Feedback Triage lands at (People or Settings)?

8. **Phase sequencing** — five PRs over ~2 weeks is the recommended cadence. Want to compress (one larger PR) or expand (more granular)? My recommendation stands at 5.

---

## 11. Summary

**Before:** 31 sidebar entries, 5/6 above-the-fold items are personal volunteer self-service for an admin, 4 different "Dashboard"-named pages, ORGANIZATION as a junk drawer.

**After:** 7 module primaries + Settings + Help, role-aware ordering, modules speak for themselves, contextual sub-tabs inside each module, tier-locked modules visible with lock badges, multi-org context promoted, mobile bottom nav as a real peer of desktop IA.

**Phasing:** 5 PRs over ~2 weeks. Each ships independently, gets a Vercel preview + CI green + a Codex slice retest. Phase 6 = full Pass A retest + refreshed surface inventory.

**Constraints honored:** stays in the ministry-operations strategic lane (no CRM/CMS/giving drift). WorshipTools-style short primary nav (Jason's stated preference). One product shell with role-aware ordering (Move A, per synthesis adjudication).

This plan is directional. The engineer doing the actual work makes per-file implementation decisions (component shape, tab-strip animation, redirect-vs-rewrite, etc.); the plan establishes the destination + the order of travel.

---

**Awaiting Jason sign-off on §10 open questions before Phase 1 PR begins.**
