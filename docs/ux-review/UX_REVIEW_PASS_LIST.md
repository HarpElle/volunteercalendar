# UX Deep-Dive — Pass Plan

> **Order matters.** Earlier passes establish reference materials and IA conclusions that downstream passes lean on. Don't skip ahead.

> **Each pass produces 3 docs** (`CLAUDE.md`, `CODEX.md`, `SYNTHESIS.md`) in `docs/ux-review/passes/<pass-name>/` — see UX_REVIEW_FRAMEWORK.md §5 for the shape.

## Phase 1 — Setup (parallel, ~1–2 days each)

Establishes the references all later passes cite.

### 1.A — Competitive teardown (Codex)
**Output:** `docs/ux-review/references/competitive-teardown.md`

**Scope:**
- Planning Center People + Services (definitive market reference; sign up for trial if needed)
- Ministry Scheduler Pro (older but still widely used)
- SignUpGenius (the "event signup" angle)
- Rotunda or another modern church-SaaS if accessible
- Optional: Calendly / When I Work for the "scheduling" angle outside the church context

**For each:** screenshot key flows
- Empty-state dashboard for a brand-new admin
- Create-a-schedule flow start-to-finish
- Volunteer's view of their next assignment (mobile + desktop)
- Volunteer RSVP / confirmation flow
- Admin's view of a team's roster

**Deliverable structure:** per product + per flow, capture (i) what they do, (ii) which heuristic that choice supports, (iii) what we do, (iv) call out the divergence.

### 1.B — Design-system audit (Claude)
**Output:** `docs/ux-review/references/design-system-audit.md`

**Scope:**
- Every design token in `src/app/globals.css` (`@theme inline` block)
- Every reusable component in `src/components/ui/`
- Layout patterns: page header, page footer, modal shape, form shape, list-vs-table conventions, empty-state shape, error-state shape, loading-state shape
- Match each against the HarpElle brand guide (Plus Jakarta Sans, warm surface palette, motion library, 44×44 touch targets, 16px body minimum)
- Note divergences with line references

### 1.C — Surface inventory (joint, Codex-led)
**Output:** `docs/ux-review/references/surface-inventory.md`

**Scope:** every page in `src/app/` + every distinct state per page. For each: route, role/auth gate, screenshot pointer (desktop + mobile viewports), one-line description.

Codex captures the screenshots; Claude reviews and extends the list with any pages Codex missed (the codebase enumeration is straightforward via the app router file tree).

---

## Pass A — Navigation + Information Architecture

**Scope:** sidebar, bottom tab bar (mobile), header, page-to-page transitions, breadcrumbs/back-buttons, "where am I?" affordances, depth (clicks-to-feature for the 10 most-used flows).

**Specific questions to debate:**
- Does the sidebar grouping (HOME / VOLUNTEERS / SCHEDULING / WORSHIP / CHILDREN'S CHECK-IN / ROOMS / ORGANIZATION) match how a first-time admin thinks? Where are they looking when they don't find what they need?
- The collapsed-vs-expanded default for groups — what determines it now? What should?
- "Training Sessions" is under PEOPLE. Is that the right home, or does it deserve its own SCHEDULING-adjacent group given prereqs gate scheduling?
- "Schedules" + "Scheduling Dashboard" — are these distinct enough by name? By function?
- Mobile bottom-nav volunteer vs admin split — does the admin's "5-tab" experience suffer from being squeezed into a phone width?

**Out of scope for this pass:** the actual content of each page (covered later). We're only auditing how a user navigates between them.

---

## Pass B — First-Time Experience (FTUE)

**Scope:** landing page → register → email verification → first login → first valuable action (admin: first schedule generated; volunteer: first assignment confirmed). Plus the "first 5 minutes" of a returning user.

**Specific questions to debate:**
- Time-to-first-value: how long from "/" click → first valuable action? What's the friction map?
- Setup wizard — does it survive the "I don't want to read" user? Can someone skip and recover?
- The "create your first ministry / team" prompt — does it explain why before asking?
- Empty states on a brand-new org dashboard — do they teach, or do they just say "nothing yet"?
- Email verification + redirect handling on mobile (deep-link reliability)
- Login → wrong-role redirect (volunteer who lands on `/dashboard` sees the admin sidebar items even if gated — confusing?)

**Personas to use:**
- "Sarah Pastor" — 52, runs Worship at a 200-person church, has used PCO for 4 years, switching because of cost
- "First-time Carmen" — 38, runs the volunteer pool at a 50-person plant, never used scheduling software
- "Volunteer Alex" — 27, signs up sporadically, opens email links on his phone walking from car to building

---

## Pass C — Marquee Feature: Schedules + Self-Service Claim

**Scope:** `/dashboard/schedules` (admin matrix + states), the create-schedule wizard, the Self-Service open-slots view (admin), `/dashboard/my-schedule` Open Slots tab + Sign Up flow (volunteer), the Release-slot flow, in-app + email confirmation, iCal feed UX.

This is the feature with the most product investment. Highest scrutiny here.

**Specific questions to debate:**
- The matrix is dense — is the cognitive load reasonable for a 50-volunteer church, or does it crater at 200+?
- "Trainee (shadow)" — does the visual treatment + label make the intent obvious? Compared to PCO's "TBD" or "Sub" patterns?
- Open Slots tab — "Sign Up" vs "Claim" was already debated; revisit: is the word warm enough? Is the button placement on mobile right (full-width vs right-aligned)?
- Race-loss banner ("That slot was just filled") — does it land as friendly or as a "you lost"?
- The confirm-decline-can't-make-it-remove-release matrix on Upcoming rows is FOUR conditional actions. Is that the right shape? Could two of them collapse?
- Email vs in-app confirmation parity — when both arrive, which is the source of truth in the volunteer's head?

---

## Pass D — Multi-Actor Chain: Onboarding + Training Sessions

**Scope:** `/dashboard/onboarding` (admin) + `/dashboard/my-journey` (volunteer) + `/dashboard/training-sessions/*` (admin) + `/dashboard/training` (volunteer RSVP) + the invitation email + the auto-complete handshake.

The chain has 4+ handoffs (admin sets prereq → invites → email lands → volunteer RSVPs → admin marks complete → prereq auto-completes → volunteer becomes scheduleable). Friction compounds.

**Specific questions to debate:**
- Prereq vocabulary — "Background Check" / "Class" / "Shadow" / "Minimum Service" / "Ministry Tenure" — these are jargon; do they communicate?
- The `expires_in_days` field — does the UI explain *why* (compliance) or just *what*?
- "Cleared to Serve" — warm + clear, or stiff?
- Volunteer RSVP page — only reachable via email link. Should there be an in-app entry point too?
- Mark Complete → "X attendees; Y prereqs auto-completed" — does that toast tell the admin what to do next (e.g. "Sarah is now eligible to be scheduled")?

---

## Pass E — Account, Settings, Multi-Org

**Scope:** `/dashboard/account`, `/dashboard/my-orgs`, multi-org switching, profile sync across orgs, `/dashboard/settings/*`, the Danger Zone, password reset flows.

**Specific questions to debate:**
- Multi-org switch — is the current org name persistently visible, or buried in the sidebar footer?
- Profile-sync semantics — when a volunteer changes their name, do they understand it propagates?
- Settings IA — is the consolidated settings page the right call, or should it split by concern (Account / Notifications / Privacy)?
- Danger Zone — wrong-name guard is good; is the visual treatment "scary enough"?
- Password reset / email change — round-trip works but does the copy hold their hand?

---

## Pass F — Edge States (cross-cutting)

**Scope:** systematic walk through EVERY page checking: empty state, loading state, error state, no-permission state, no-data-for-this-filter state.

**This is where the heuristics get applied most rigorously.** XC-empty / XC-loading / XC-error / W-4.1.3 / HE-tone all converge on edge states.

**Specific questions to debate:**
- Are loading states present everywhere a fetch happens?
- Are skeleton states used consistently, or do some pages flash blank?
- Are empty states actionable (telling user what to do) or just informational?
- Are error states constructive (telling user what to do next) or just defeated?
- Do toasts say what happened in the user's vocabulary?

---

## Phase 7 — Synthesis + prioritized backlog

After Passes A–F complete:
1. Both of us produce ranked recommendations (independent files: `PRIORITIZED_BACKLOG_CLAUDE.md` + `PRIORITIZED_BACKLOG_CODEX.md`)
2. Synthesize into `PRIORITIZED_BACKLOG_SYNTHESIS.md` — single ranked list with severity, citation, proposed change, expected tradeoff
3. Jason picks the cut line — "ship 5s + 4s; defer 3s; reject the rest" or whatever
4. Above-the-line items move to a normal-cadence implementation sprint (separate PRs, normal CI gate, normal Codex retest)
5. Below-the-line items get logged in `docs/ux-review/DEFERRED.md` for future revisits

## Phase 8 — Validation

After implementation:
- Codex re-runs the surface inventory screenshots to confirm shipped changes match the proposals
- Both of us look for regressions in already-passed surfaces
- Sign-off: "VolunteerCal UX baseline shifted, ready for beta launch"

---

## Estimated timeline

| Phase / Pass | Wall-clock | Notes |
|---|---|---|
| Phase 1 setup | 2–3 days, parallel | Reference materials need to land first |
| Pass A — Nav/IA | 1–2 days each side + 1 day synthesis | Foundational; later passes cite this |
| Pass B — FTUE | 1–2 days + synthesis | Requires fresh accounts + screen-recording |
| Pass C — Schedules | 2–3 days + synthesis | Biggest surface |
| Pass D — Onboarding/Training | 2 days + synthesis | Multi-actor; needs ≥2 accounts |
| Pass E — Account/Settings | 1 day + synthesis | Smaller surface |
| Pass F — Edge states | 2 days + synthesis | Systematic = slow |
| Phase 7 — Backlog | 1 day | Bigger if there's heavy debate |
| Phase 8 — Implementation | Separate sprint | Normal cadence |
| Phase 8 — Validation | 1 day | After implementation |

Calendar-wall-clock: ~3 weeks of UX work + implementation sprint of variable length depending on backlog size.

This is a longer engagement than the post-Phase-6 sprint. The depth is the point. If we're going to challenge assumptions, we have to put real time into it.
