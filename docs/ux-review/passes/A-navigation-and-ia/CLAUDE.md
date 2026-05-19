# Pass A — Navigation + Information Architecture (Claude, independent)

> Independent findings from the systematic / codebase-grounded lens.
> See UX_REVIEW_FRAMEWORK.md for rubric + citation codes.
> Cross-read with `CODEX.md` (forthcoming) before the SYNTHESIS step.
>
> **Binding constraint (Jason, mid-Pass A):** the current user base is the three of us + a few of Jason's work team members under direct supervision who know things will change. Backward-compat / muscle-memory concerns DO NOT apply. There will never be fewer people affected by a rename than today. Sever any finding that was downgraded for "we'd break testers" reasoning.

## 0. Phase 1 evidence — sufficient

Reviewed: `competitive-teardown.md` (404 lines, 6 products incl. WorshipTools + PCO + Breeze + MSP + SignUpGenius live captures), `surface-inventory.md` (120 of our screenshots across 50+ routes × 2 viewports, 31 source routes still pending fixtures), the JSON capture metadata, and a focused look at the actual sidebar code at `src/components/dashboard/sidebar.tsx` plus the admin dashboard + WorshipTools logged-in dashboard screenshots.

The evidence is **sufficient** for Pass A. The 31 routes still pending fixtures are all dynamic/edge-case routes that don't change the IA conclusion. Worth deferring those to Pass F (edge states).

## 1. Sidebar shape, today (codebase fact, ungrouped by opinion)

Source: `src/components/dashboard/sidebar.tsx`, lines 60–393. Screenshot: `our-screenshots/admin-desktop-dashboard.png`.

For an admin (Sarah Pastor Tester, Owner role) the sidebar today renders:

- Brand mark
- **HOME** group (always expanded, no header click): My Schedule, Inbox, My Availability, **Overview** (admin-only), My Journey (conditional on prereqs), My Feedback — **6 items, 5 of them volunteer-self-service**
- Divider
- **VOLUNTEERS** (collapsible, default collapsed): Team Health, Retention, Feedback Triage, Volunteers, Onboarding, Training Sessions — **6 items**
- **SCHEDULING** (collapsible, default collapsed): Dashboard, Schedules, Services & Events — 3 items
- **WORSHIP** (tier-gated, collapsible, default collapsed): Service Plans, Songs, Reports — 3 items
- **CHILDREN'S CHECK-IN** (tier-gated, collapsible, default collapsed): Dashboard, Households, Reports, Import — 4 items
- **ROOMS** (tier-gated, collapsible, default collapsed): Bookings, Requests — 2 items
- **ORGANIZATION** (collapsible, default collapsed): Teams, Check-Ins (a settings page, not the module), Campuses, Billing, Activity, Settings, Short Links — **7 items**
- Divider
- Help
- Account widget (avatar + name + org + role + chevron → popover with Account Settings / My Organizations / Sign out + org switcher when multi-org)

**Count for a Pro-tier admin: 6 always-visible items + 25 items behind collapsibles + 1 Help + 1 account = 33 items addressable from the sidebar.** Of the 6 always-visible items, exactly one (Overview) is admin work; the other 5 are volunteer self-service.

WorshipTools Planning's sidebar by contrast (screenshot `competitive-screenshots/wt-loggedin-desktop-dashboard-empty.png`): **5 items, flat, all visible**: Dashboard / Services / Messages / Songs / People. Account lives in the top-right. No collapsibles. Single-word labels.

The delta is real.

---

## 2. Findings

### A-01 — HOME inverts admin priority by putting volunteer-self-service items above the fold
**Severity: 4 — High**
**Heuristics: NN-2, NN-7, NN-6, XC-progressive, CS-desktop-admin**
**Evidence:** `our-screenshots/admin-desktop-dashboard.png`; `src/components/dashboard/sidebar.tsx:89–136`

For an admin, "HOME" today is functionally a volunteer-self-service group with one admin item (Overview) buried fourth. The admin's actual job-to-be-done — staffing this weekend, reviewing team health, generating schedules — is locked behind 6 collapsed groups by default. WT (`wt-loggedin-desktop-dashboard-empty.png`) and PCO Services (`pco-loggedin-desktop-services-home.png` per the teardown) both make the admin's primary modules visible at first glance, with account/personal stuff in the top-right or a separate area.

This is a defensible design ONLY if we assume "every admin in a small church is first a volunteer." But even granting that: the admin lands on `/dashboard` (Overview) on every login, then has to expand 1–6 groups to do their admin job. NN-7 (efficiency for frequent users) and CS-desktop-admin (admin flows are primary on desktop) both push the other direction.

**The thing that would change my mind:** Codex shows session-time data that admin users spend the majority of their session in My Schedule / Inbox / My Availability and not in admin modules. If true, the current order is correct.

**Proposed direction:** see §3.

---

### A-02 — "Overview" page name doesn't match what the page is
**Severity: 3 — Medium**
**Heuristics: NN-2, NN-4, XC-terminology**
**Evidence:** `our-screenshots/admin-desktop-dashboard.png` (page header reads "Welcome, Sarah Pastor Tester / Here's an overview of your organization's volunteer schedule"); `src/components/dashboard/sidebar.tsx:113–118`

The route `/dashboard` is the **admin home dashboard** — it greets the user by name, shows org-wide stats, and is the first thing they see after login. It's not an "overview" sub-view; it is the dashboard. WT calls this surface **Dashboard**. PCO calls it **Home**. Both are conventional. "Overview" is an internal-feeling word that doesn't match either pattern.

Compounding: there are at least **three** pages in the app currently labeled with home/dashboard-adjacent language — `/dashboard` ("Overview"), `/dashboard/scheduling-dashboard` ("Dashboard" inside SCHEDULING group), `/dashboard/checkin` ("Dashboard" inside CHILDREN'S CHECK-IN group). NN-4 (consistency) violation: the same word means different things by context, and the admin's actual home is the one *not* called Dashboard.

**Proposed direction:** rename `/dashboard` → "Home" (matches PCO; warmer than "Dashboard"; clearly distinct from module-level dashboards). Per-module dashboards keep their names because they're sub-views of a module. Route rename (`/dashboard` URL itself) is optional and incurs no real cost given the user-base constraint.

---

### A-03 — Module groups are collapsed by default, making admin modules a 2-click discovery
**Severity: 4 — High**
**Heuristics: NN-7, NN-1, XC-affordance**
**Evidence:** `src/components/dashboard/sidebar.tsx:445–469`; admin dashboard screenshot shows 6 caret rows below the divider.

The collapsible pattern (PR #18-era IA work, per inline comments) is a power-user accommodation, not a beginner accommodation. A first-time admin opens VolunteerCal, sees 6 collapsed "MODULE" headers, and has no preview of what's inside any of them. NN-7 and NN-1 both push the other way — visibility of system status + efficiency for the most-used flows.

In our codebase, the collapsibles are also inconsistent: ROOMS has 2 items, WORSHIP has 3, ORGANIZATION has 7. **Sections under 4 items pay more cost (a click to expand) than benefit (hiding 2 things)**. The collapsible pattern was right when sections were 6+ items; current 2-3-item groups don't earn the affordance.

Worth noting that auto-expand on active route IS implemented (line 441–443), so once you're inside a module the group opens. But the cold-start admin still hits collapsed-everywhere.

**Proposed direction:** primary modules visible at first glance, not collapsed. See §3.

---

### A-04 — "VOLUNTEERS" mixes audience (people) + workflow (training) + insights (health, retention)
**Severity: 3 — Medium**
**Heuristics: NN-2, NN-4, XC-progressive**
**Evidence:** `src/components/dashboard/sidebar.tsx:138–191`; surface inventory rows for `/dashboard/volunteer-health`, `/dashboard/retention`, `/dashboard/people`, `/dashboard/onboarding`, `/dashboard/training-sessions`

The VOLUNTEERS group currently contains six items that span three different mental models:
- **Roster management:** Volunteers (the people list), Teams (admin-organization, but lives under ORGANIZATION currently)
- **Workflow:** Onboarding (prereqs), Training Sessions, Feedback Triage
- **Insights / reporting:** Team Health, Retention

PCO's analog (per teardown §"Admin Team Roster + Fill Open Slots") separates People (CRM/roster) from Services People (scheduling-aware filters) and from Teams. PCO's pattern is defensible because the data shapes differ. Breeze just labels things "People" and lets the admin invent the rest via Tags — and Codex's teardown explicitly flags that as the anti-pattern.

The risk for us: "Volunteers" the LABEL might mean any of (roster, onboarding queue, health insights, retention analytics). The user has to read all 6 children to figure out which is "the people list." Recognition-rather-than-recall (NN-6) suffers.

**Proposed direction:** People = the roster + the people-shaped operational surfaces (Onboarding, Training Sessions, Team Health together because they're all "is this person ready to serve?"). Retention and Feedback Triage are admin analytics → could move to a separate Insights surface or stay nested under People as sub-tabs.

---

### A-05 — "ORGANIZATION" is a junk drawer with a confusing internal "Check-Ins" item
**Severity: 4 — High**
**Heuristics: NN-2, NN-4, XC-terminology, CS-pco-nav**
**Evidence:** `src/components/dashboard/sidebar.tsx:333–391`; surface inventory rows for `/dashboard/org/teams`, `/dashboard/org/check-ins`, `/dashboard/org/campuses`, `/dashboard/org/billing`, `/dashboard/org/activity`, `/dashboard/settings`, `/dashboard/short-links`

This group contains 7 items that don't share a clean mental model:
- **Org config:** Teams, Campuses, Billing, Activity, Settings → all settings-y
- **Settings sub-pages:** "Check-Ins" here is a *settings page for the check-in module*, not the check-in module itself (which has its own CHILDREN'S CHECK-IN group)
- **Admin power tool:** Short Links

The "Check-Ins" item under ORGANIZATION is the most actively confusing — it's the same plural noun as the CHILDREN'S CHECK-IN module group, but it's a settings page. A user reading the sidebar can't tell from the label that one is "the module" and one is "settings for the module."

Modern admin apps (Linear, Vercel, Notion, Stripe Dashboard, PCO Services) overwhelmingly put **Settings behind the avatar menu or a dedicated bottom-pinned Settings link**, not as a peer to product modules. Teams and Campuses are debatable (they're tenant-level concepts that touch both data and config), but Billing / Activity / Settings should not be a peer to "Volunteers" or "Schedules" in the primary nav.

**Proposed direction:** dissolve ORGANIZATION. Move Settings (including a sub-page-grouped "Org settings" for Teams/Campuses/Billing/Activity/Check-In settings) behind the avatar popover OR to a single bottom-pinned Settings link. Short Links → tools menu OR keep it as an admin-flat item.

---

### A-06 — Three different "Dashboard"-named surfaces create label collision
**Severity: 3 — Medium**
**Heuristics: NN-4, XC-terminology**
**Evidence:**
- `/dashboard` is labeled "Overview" in the sidebar (A-02)
- `/dashboard/scheduling-dashboard` is labeled "Dashboard" (inside SCHEDULING group), sidebar.tsx:202
- `/dashboard/checkin` is labeled "Dashboard" (inside CHILDREN'S CHECK-IN group), sidebar.tsx:271

A user navigating with breadcrumbs or browser tab titles sees three "Dashboard"s. The site-route hierarchy also overloads the word — every admin page lives under `/dashboard/*` so the URL says "dashboard" 4 times for `/dashboard/scheduling-dashboard`.

**Proposed direction:** rename in-app — Home (the admin dashboard, was "Overview"), Sunday Ops (or similar for `/dashboard/scheduling-dashboard` — this is the live-Sunday operational view per the surface inventory), Check-In Today (for `/dashboard/checkin`). Single word per concept (XC-terminology). URL changes are a separate concern (link-stability tradeoffs).

---

### A-07 — The volunteer view and the admin view share one sidebar shape
**Severity: 3 — Medium, debate point**
**Heuristics: NN-2, NN-6, CS-mobile-volunteer, CS-desktop-admin**
**Evidence:** `our-screenshots/volunteer-desktop-dashboard-my-schedule.png` vs `admin-desktop-dashboard.png`; `src/components/dashboard/sidebar.tsx:140` `gate: (m) => isScheduler(m)`

For a pure volunteer (no scheduler role) the sidebar gates out every module group, leaving just: My Schedule, Inbox, My Availability, My Journey, My Feedback, Help — 5–6 items. Visually clean.

For an admin who is also a volunteer (the dominant pattern in small churches), the same sidebar adds 5–6 collapsed module groups beneath. The shape **shifts roles aggressively**: admins see volunteer items first + their modules collapsed below; volunteers see only volunteer items.

PCO's pattern (per teardown §"Empty-State Dashboard"): one cross-product Home, then separate apps (Services, People, Calendar) the admin enters. WT's pattern: 5 flat items, role differences handled via permissions inside the same shell. Both work because in both cases the **shape doesn't change much per role**.

VolunteerCal's gating-with-collapsibles approach is the most flexible of the three (works for free-tier vs Pro-tier, volunteer vs admin, single-org vs multi-org) — but flexibility costs learnability.

**Debate point:** should VolunteerCal have **two distinct sidebar shapes** (volunteer shell + admin shell, switched based on context) or **one sidebar with smarter role-aware default ordering**? I have an opinion (see §3) but Codex's experiential view of "what does it feel like to switch hats mid-session?" is the deciding evidence here.

---

### A-08 — Tier-gated module groups produce 5 different sidebar shapes per org
**Severity: 2 — Low (acknowledge, don't fix yet)**
**Heuristics: NN-4, XC-progressive**

WORSHIP, CHILDREN'S CHECK-IN, ROOMS are tier-gated. An org can have any subset enabled. This means the sidebar shape an admin learns at one org may not match what they see at another, or what they see after a tier change. NN-4 (consistency) suffers, but the alternative (always-show with "Pro" lock badges) trades clarity for promo. WT's freemium model just shows everything because the gating is per-feature inside each module; PCO splits at product-purchase boundaries.

**Proposed direction:** acknowledge the cost, decide intentionally. If we keep tier-gating per module group, document the principle ("admins see only modules their tier includes"). If we want learnability across orgs, show all module groups with a small lock + tooltip on tier-locked ones.

---

### A-09 — Help lives between collapsibles and account; conventional, but not contextual
**Severity: 1 — Nit**
**Heuristics: NN-10**

Help (`/dashboard/help`) is a static, sidebar-bottom link. NN-10 prefers contextual help (in-place hints near the surface that needs explaining). The current shape is conventional desktop SaaS and fine for a Phase A fix list. Bring it back up only if Pass B's FTUE work shows new users don't find it.

---

### A-10 — Multi-org switcher pattern is good; "My Organizations" full page is redundant
**Severity: 2 — Low**
**Heuristics: NN-4, NN-8**
**Evidence:** sidebar account popover, `src/components/dashboard/sidebar.tsx:733–807`; `/dashboard/my-orgs` exists as a full page

The avatar-popover org switcher matches the modern multi-tenant pattern (Linear, Vercel, Slack, Notion). Good. But the popover also links to "My Organizations" which is a separate full page that mostly duplicates the popover's content. Two paths to the same thing isn't a violation by itself, but it inflates the surface count (the page exists in surface inventory; an extra route to maintain) for marginal value.

**Proposed direction:** Phase C (account/settings/multi-org) decision; flag here as input to that pass.

---

### A-11 — Mobile bottom-nav vs desktop sidebar is a separate decision we should make explicit
**Severity: deferred**
**Heuristics: CS-mobile-volunteer, HE-mobile-first, W-1.4.10**
**Evidence:** CLAUDE.md mentions admin-5-tab / volunteer-4-tab bottom nav split (PR-era "Navigation & UI Overhaul"); not visible in this pass's screenshots because mobile captures aren't pulled into this finding

Pass A's scope is "global sidebar" which is desktop-primary. Mobile bottom-nav is the morphological equivalent and shouldn't drift from the desktop sidebar in surface intent. Flag for Pass F or a dedicated mobile sweep that the bottom-nav choices need to track whatever we decide for the desktop sidebar.

---

### A-12 — Public-shell vs auth-shell separation is clean and shouldn't change
**Severity: 1 — Affirm**
**Heuristics: NN-2, NN-4**
**Evidence:** `our-screenshots/public-desktop-home.png` (How It Works / Features / Pricing / FAQ / Log In / Start Free) vs `admin-desktop-dashboard.png` (sidebar shell)

The public marketing shell is a different beast from the auth shell. It's well-organized in its own right (top nav, sticky CTA, footer). No IA changes needed in Pass A. The dynamic-fixture failure modes (`/join/nothing`, `/confirm/badtoken`, `/s/bogus`, `/calendar/public?token=bogus`) are public-error states whose IA is single-page-friendly-message; that's covered by Pass F.

---

## 3. Recommended IA direction (intent, not implementation)

These are directional recommendations. Implementation details (component shape, animation, persistence) are deliberately out of scope.

### 3.1 Primary admin sidebar — short, module-first, contextual subnav per module

Modeled on WorshipTools / Linear / Vercel pattern. Specifically Jason's preferred WT pattern: short primary sections, flat hierarchy, clean modern UI, contextual structure that reduces cognitive load.

**Target shape (Pro-tier admin):**

```
[Brand mark]

Home                    ← was "Overview"; the admin dashboard
Schedules               ← Schedules + Services & Events + Sunday Ops surfaced as tabs inside
People                  ← Volunteers + Onboarding + Training Sessions + Team Health surfaced as tabs
Worship   (when enabled) ← Plans + Songs + Reports as tabs
Check-In  (when enabled) ← Households + Reports + Import + Settings as tabs
Rooms     (when enabled) ← Bookings + Requests as tabs

——————
Help

[Account widget at bottom → popover with org switcher, Account Settings, Org Settings, Sign Out]
```

That's **6 primary items + Help** for a Pro-tier admin, vs today's 6-always-visible + 25-collapsed = 31 sidebar items.

**Settings dissolution:** Account Settings (personal) and Org Settings (Teams / Campuses / Billing / Activity / Check-In Settings / Short Links / etc.) both live behind the avatar popover OR a single bottom-pinned Settings entry that takes the user to a unified Settings page with tabs. This is the dominant modern pattern (Stripe, Linear, Vercel, Slack, Notion all do this).

**Contextual subnav** lives at the top of each module page as horizontal tabs (Linear pattern) or a left-rail-within-the-content (Vercel project pattern). The choice between horizontal and left-rail subnav can be debated in Pass C+ on a per-module basis; the principle is "module-level navigation belongs inside the module, not in the global sidebar."

### 3.2 Volunteer sidebar — keep narrow; revisit shape only

For pure volunteers, the current narrow shape is already close to right. Possible polish:
- "Open Slots" tab on My Schedule is the right home for self-signup (don't add a top-level Open Slots entry to the sidebar)
- Account / My Organizations / My Feedback all collapse into the avatar popover
- Help stays sidebar-bottom

**Target volunteer shape:**

```
[Brand mark]

My Schedule
Inbox
My Availability
My Journey (when prereqs exist)

——————
Help

[Account widget → popover with Account Settings, My Feedback, My Organizations, Sign Out]
```

That's **4 primary items + Help** vs today's 5–6.

### 3.3 The role-shape question (the debate point)

For an admin who is *also* a volunteer at their own church (common in small churches), there are two design moves possible:

**Move A — One shell, role-aware ordering.** Keep a single sidebar shape; reorder so admin modules come first, volunteer "My X" items below or behind a small "My Account" group. Pros: predictable across role transitions; one mental model. Cons: still long; admins still see volunteer chrome they may not need every login.

**Move B — Two shells, switched by context.** Separate volunteer shell and admin shell, with a clear toggle (e.g. an "Admin view / Volunteer view" switch in the account popover). Pros: each role gets its own clean experience; matches PCO's "different products for different jobs" intuition. Cons: switching can feel awkward; admins ARE volunteers and might want both visible.

I lean **Move A** because of the small-church pattern (every admin is also a volunteer at their own church; switching shells inflates clicks) and because the difference between PCO and us is that PCO is a multi-product suite (Services, People, Calendar are separate apps) and we are not. But I want Codex's experiential read before committing.

### 3.4 Mobile bottom-nav parity

Whatever the desktop sidebar shape becomes, the mobile bottom-nav should mirror its top 4–5 items. Today they don't share an explicit pattern. Separate pass (or Pass F) — but flag the dependency.

---

## 4. Open questions for Jason

These are the calls that benefit from your input rather than us debating in synthesis.

1. **Strategic lane re-confirmed:** the recommended target shape (3.1) assumes VolunteerCal stays in the "ministry-operations" lane and does not try to be a CRM/CMS/giving platform. That's consistent with your framing. **Confirm?**

2. **Role-shape question (§3.3):** Move A (one shell, role-ordered) or Move B (two shells, role-switched)? Both are defensible; my recommendation is Move A but the call is yours given you know how small-church owners think of themselves vs how mid-size-church admins do.

3. **Settings dissolution:** the recommendation moves Org Settings behind the avatar popover (or a single bottom-pinned Settings entry). The cost is making Settings less discoverable for net-new admins who don't know to click their avatar. The benefit is removing the ORGANIZATION junk drawer and matching the dominant SaaS pattern. **Tolerable, or do we keep a top-level Settings entry?**

4. ~~**Renaming proposal:** Ship in this UX phase or defer rename until we have other reasons to touch those pages?~~ **Resolved by Jason mid-pass:** muscle-memory concern doesn't apply. Rename freely.

5. **Tier-gated module groups (A-08):** hide-when-locked (today) or show-with-lock-badge? Trades learnability across orgs vs visible promo surface. Your call as product owner.

6. **`My Organizations` page (A-10):** keep as a full page or fold its content into the avatar popover? Touches multi-org switching UX in Pass E.

---

## 5. Where I expect Codex to disagree

Calling out my own bets up front. These are the places where Codex's experiential lens is most likely to push back, and where the SYNTHESIS step should not paper over the disagreement.

| Likely Codex pushback | My position | What would change my mind |
|---|---|---|
| "The current 'Volunteers' / 'Scheduling' / 'Worship' grouping IS the mental model for church admins — don't flatten it." | Group names are fine; the problem is *collapsing them by default* + putting *one item per group above the fold for admin priorities*. A flattened module list with sub-tabs preserves the grouping inside each module. | Codex shows session telemetry that admins frequently switch between, say, Schedules and Services & Events such that tabbing within a module would add friction the current expanded-group flow avoids. |
| "Move A vs Move B — admins want everything visible because they switch hats constantly." | Move A keeps everything available; it just reorders so admin priorities are above the fold. Move B is the contested call. | Codex's persona walkthroughs ("Sarah Pastor at 9am Saturday on her laptop") show ordering matters less than I'm claiming. |
| ~~"Don't rename 'Overview' to 'Home' — it'll confuse existing testers."~~ | **Resolved by Jason's constraint update — muscle-memory is not a factor.** | n/a |
| "Settings behind the avatar isn't discoverable for new admins." | True risk. Mitigation: setup wizard surfaces Settings explicitly + the FTUE pass adds a small "Set up your org" prompt that links. | Codex's FTUE walkthrough (Pass B) finds that 2/3 of test admins look for Settings as a top-level nav item before checking the avatar. |
| "Three dashboards is fine because each lives in a distinct module." | Conventional naming wins. Sunday Ops + Check-In Today + Home read better than three Dashboards. | Codex shows that church admins use the word "dashboard" as a generic noun and don't expect distinct names per module. |

These are not arguments I'm conceding now. They're the seams I want the debate to live on.

---

## 6. Out of scope for Pass A (deferred to later passes by design)

- Detailed sub-tab design *within* each module (Pass C for Schedules; Pass D for People/Onboarding; Pass E for Settings; future passes for Worship/Check-In/Rooms)
- The first-time experience flow (Pass B)
- Mobile bottom-nav specific design (Pass F or dedicated mobile sweep)
- Visual design / typography / token-level consistency (Pass F as cross-cutting)
- Per-page heading consistency (Pass F)

---

## 7. Status

Independent draft complete. Ready for Codex's independent Pass A doc (`CODEX.md`). After both exist, either of us drafts `SYNTHESIS.md` per the framework §5.
