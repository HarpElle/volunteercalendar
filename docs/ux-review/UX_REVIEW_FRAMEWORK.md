# VolunteerCal UX Deep-Dive — Framework

> **Purpose:** establish a shared rubric, working cadence, and debate protocol so the three of us (Jason + Claude + Codex) can run a rigorous UI/UX review that produces a ranked, actionable backlog — not just opinions.

## 1. The goal

Produce a **prioritized, evidence-backed list of UX changes** that move VolunteerCal closer to:
1. The HarpElle Warm Editorial aesthetic (warm ivory + cream, indigo / coral / sage / sand palette, Plus Jakarta Sans, motion-light micro-interactions)
2. Modern, accessible web-app conventions (WCAG 2.2 AA at minimum, mobile-first, no dead-end states)
3. Norms volunteers + church admins already know (Planning Center is the dominant reference; deviating from it requires a reason)

We are NOT trying to make every change. We are trying to **find every finding worth weighing**, then let Jason decide the cut line.

## 2. Roles + lens

| Person | Lens | Strongest at | Weakest at |
|---|---|---|---|
| **Jason** | Product owner; adjudicates debate points; final cut decisions | Knows the product vision + customer + business constraints | Can't unsee his own decisions — same problem any maker has reviewing their own work |
| **Claude** | Systematic critique grounded in heuristics + competitive patterns + codebase audit | Pattern-matching across the codebase, citing UX literature, proposing structural alternatives, finding cross-file inconsistencies, producing reference materials | Doesn't actually USE the app from a real-user POV; doesn't feel mobile ergonomics; doesn't notice flow-level friction |
| **Codex** | Experiential evaluation as a real user; competitive teardown via direct comparison | Living-the-flow critique, persona walkthroughs, capturing screenshots, mobile testing, multi-session/multi-account flows, noticing things-that-feel-off | Less likely to ground critique in UX literature; doesn't have the full codebase context |

**Rule:** the two of us produce findings independently before discussion. Independent first, debate second. Convergence under pressure is fake convergence.

## 3. The rubric

Every pass evaluates the surface in scope against ALL of these dimensions. We don't split passes by dimension — we apply all dimensions to each surface so we catch cross-cutting issues.

### A. Nielsen-Norman 10 usability heuristics

Cited as `NN-1` … `NN-10`. The canonical set.

1. **Visibility of system status** — Does the user always know what's happening?
2. **Match between system and real world** — Words, concepts, and metaphors the user recognizes (not internal jargon)
3. **User control and freedom** — Undo, exit, escape hatches everywhere
4. **Consistency and standards** — Same word for the same thing; same pattern for the same action
5. **Error prevention** — Better than good error recovery
6. **Recognition rather than recall** — Don't make users remember things across screens
7. **Flexibility and efficiency** — Power-user shortcuts that don't burden first-timers
8. **Aesthetic and minimalist design** — Every extra unit of information competes with the relevant ones
9. **Help users recognize, diagnose, recover from errors** — Plain language, no codes, constructive path forward
10. **Help and documentation** — Findable, task-focused, in-context > separate manual

### B. WCAG 2.2 AA (accessibility)

Cited as `W-{criterion}`. Non-negotiable for any release that touches a screen.

- `W-1.4.3` Color contrast ≥ 4.5:1 for text; 3:1 for large text + UI components
- `W-1.4.10` Reflow at 320px without horizontal scroll
- `W-1.3.1` Logical heading order + semantic structure
- `W-2.1.1` All interactive elements keyboard-operable; no traps
- `W-2.4.7` Focus indicator visible
- `W-2.5.8` Touch target ≥ 24×24 CSS px (we already enforce 44×44 per the HarpElle guide)
- `W-3.3.2` Form fields have visible + programmatic labels
- `W-4.1.3` Status messages announced to assistive tech

### C. HarpElle Warm Editorial aesthetic

Cited as `HE-{principle}`. From CLAUDE.md + the HarpElle brand guide.

- `HE-color` Indigo for trust/text, coral for warm CTAs, sage for success, sand for warm support — used purposefully, not decoratively
- `HE-surface` Warm ivory (#FEFCF9) + cream (#FBF7F0) surfaces, never cold white
- `HE-type` Plus Jakarta Sans only; `font-display` for headings (weight hierarchy, not script hierarchy)
- `HE-rhythm` Spacing rhythm in 4/8/16/24 px increments; no orphan magic numbers
- `HE-motion` Motion library for scroll-triggered reveals + micro-interactions; never decorative
- `HE-min-body` 16px body text minimum
- `HE-mobile-first` Designed for the small screen first; desktop is a layout-expansion of mobile, not a separate design

### D. Church-SaaS competitive conventions

Cited as `CS-{convention}`. Volunteers + church admins arrive with mental models from Planning Center, SignUpGenius, Ministry Scheduler Pro. Deviation requires a reason in the finding.

- `CS-pco-nav` Planning Center separates People / Services / Calendar at the top level — we collapse them under SCHEDULING. Reason?
- `CS-pco-rsvp` PCO uses "Accept / Decline" not "Confirm / Decline" — we use "Confirm". Defensible because it ties to a confirmation token? Or just legacy?
- `CS-volunteer-age` Volunteer demographics skew older + less-technical than the average SaaS user. Defaults to "explain more, hide less."
- `CS-email-first` Volunteers still respond to email more than in-app — when both exist, email is the source of truth and in-app is the convenience layer
- `CS-mobile-volunteer` Volunteers respond on phones (in line at Target, between meetings). Mobile flows are PRIMARY for volunteer-facing screens
- `CS-desktop-admin` Admins schedule on desktop with two tabs open. Desktop flows are PRIMARY for admin-facing screens

### E. Cross-cutting principles

Cited as `XC-{principle}`. Things easy to overlook because they're "obvious."

- `XC-empty` Every list view has at least one empty state; empty states explain the value of getting started + offer the next concrete action
- `XC-loading` Every async surface has a loading state; no blank screens > 100ms
- `XC-error` Errors are teaching moments — plain language, what happened, what to do next
- `XC-tone` Copy register is warm, conversational, never corporate-speak. Read every sentence aloud — if you wouldn't say it to a friend, rewrite
- `XC-terminology` One word per concept across the whole app. We currently mix `team` / `ministry` / `group` — pick one
- `XC-progressive` Progressive disclosure — surface the 80% case prominently, hide the long tail behind disclosure
- `XC-affordance` Buttons look like buttons; links look like links; touchable areas have hover/focus states; nothing surprises

## 4. Severity scale

Every finding gets a severity. We resist the temptation to mark everything HIGH.

| Severity | Meaning | Example |
|---|---|---|
| **5 — Critical** | Breaks the user's task entirely or leaves them with no recovery path. Ships before anyone signs up. | Sign-up button does nothing on iOS Safari |
| **4 — High** | Significantly damages trust or usability. Ships in the next release. | Calendar feed URL exposed publicly |
| **3 — Medium** | Notable friction; an experienced user can work around it but a first-time user might bail. | Sidebar "Schedules" + "Scheduling Dashboard" confusing |
| **2 — Low** | Polish that doesn't gate anything but improves perceived quality. | Empty state copy mentions "team" but the rest of the page says "ministry" |
| **1 — Nit** | Pure cosmetic / minor inconsistency. | Spacing between two cards is 14px not 16px |

For each finding: severity + which heuristic(s) it violates + the proposed change + the expected tradeoff.

## 5. Deliverable shape per pass

Each pass produces THREE artifacts in `docs/ux-review/passes/<pass-name>/`:

1. **`CLAUDE.md`** — my independent findings, structured as:
   ```
   ## Finding 1 — <one-line title>
   **Severity:** 3
   **Heuristics:** NN-4, HE-type, XC-terminology
   **Where:** /dashboard/schedules — header
   **What:** The page title reads "Schedules" but the sidebar entry that brought you here reads "Schedules" too,
     while sibling pages read "Volunteer Health" (two words) vs. "Schedules" (one word). Mixed register…
   **Why it matters:** First-time users scan headers to confirm they landed somewhere related to the link they clicked.
     Identical labels feel right; near-identical labels feel buggy.
   **Proposed change:** Rename the page header to "All Schedules" so it reads as a noun-phrase…
   **Expected tradeoff:** Two more characters; one more thing to internationalize later.
   ```

2. **`CODEX.md`** — Codex's independent findings, same shape. Codex screenshots tied to each finding go in `docs/ux-review/passes/<pass-name>/screenshots/`.

3. **`SYNTHESIS.md`** — once both independent docs exist, EITHER of us drafts the synthesis. Capture:
   - **Convergence**: findings both noticed (high confidence; rank by severity)
   - **Divergence**: findings only one noticed → debate points. Explain why each one is a real concern OR a non-issue. Don't suppress disagreement.
   - **Ranked recommendations**: ordered list of "do this" + the rationale + the alternative considered and rejected
   - **Open questions for Jason** — debate points we can't resolve between ourselves

Jason reads SYNTHESIS.md and either (a) accepts the recommendations, (b) overrides specific ones with rationale, or (c) asks for a deeper dive on a specific point. THEN the pass is done.

## 6. Debate protocol

When we disagree:

1. **State the position with the heuristic citation.** "I think the sidebar should collapse SCHEDULING by default (NN-8, XC-progressive). It's the most-used section but new admins don't need to see all 6 items before they've created their first schedule."
2. **State what would change your mind.** "I'd back off if Codex shows that >50% of click-path sessions reach 3+ SCHEDULING items within the first 10 minutes."
3. **Predict the tradeoff** — every UX choice trades one thing for another. Name yours.
4. **No appeal to authority.** Don't cite Planning Center as gospel. Cite WHY Planning Center does it, then decide if the WHY applies to us.
5. **Personas, not "users."** When making a claim about "users won't like X," name the persona. "Sarah Pastor, 52, runs Worship at a 200-person church, uses an iPhone 12 mini, has used PCO for 4 years" — specific is debatable; vague isn't.

## 7. Data preservation in TESTER — Codex 2

Carry forward from the standing-by prompt. Restated for emphasis because this becomes a 2-3 week engagement and Codex will be clicking everywhere:

**Hard "do not touch":**
- Test orgs (TESTER — Codex 2, TESTER FACILITY — Codex 2) — never accept the Delete Organization danger-zone
- Published schedules — referenced by assignments / iCal / history
- `Phase 6 Background Check` org-wide prereq — referenced by completion records
- `+admin2@gmail.com` cross-org membership — fixture for multi-org tests
- Calendar feed tokens — only regenerate if explicitly testing rotation

**Use disposable accounts** (`+ux1@gmail.com`, `+ux2@gmail.com` etc.) for destructive flows — create + test + remove.

**OK to**: throwaway schedules / sessions / claims via UI; archive + restore loops; self-signup + release loops.

**Firestore Console edits as last resort + easily revertible.**

## 8. Reference materials

These should be assembled in `docs/ux-review/references/` during Phase 1:

- `competitive-teardown.md` — Codex's deliverable. Annotated screenshots of: Planning Center People + Services; Ministry Scheduler Pro; SignUpGenius; Rotunda (if accessible); ChMS comparison if available. Key flows: first-time login dashboard / create a schedule / volunteer signup / RSVP a training. Specifically call out where they make a different choice than we do.
- `design-system-audit.md` — my deliverable. Every design token in `globals.css` + every reusable component in `src/components/ui/` + every page-level layout pattern. Match against the HarpElle brand guide; note divergences.
- `surface-inventory.md` — joint deliverable. Every page + every state (loading / empty / populated / error) in the app, with screenshot pointers.

## 9. Working cadence + meta-rules

- **One pass at a time.** Don't try to do everything at once. Ship each pass's synthesis before starting the next.
- **Synthesize early, refine later.** A rough SYNTHESIS.md is better than a polished one that arrived a week late.
- **Jason is not a tiebreaker by default.** If we can't agree, that's a real signal — name it as an Open Question for Jason; don't ask him to rubber-stamp.
- **No silent disagreement.** If you read the other's CLAUDE.md / CODEX.md and disagree with a finding, say so in SYNTHESIS.md. Withheld disagreement is worse than open conflict.
- **The product changes during the review.** When something gets shipped mid-review (e.g. a UX fix from an earlier pass), re-screenshot the affected surface — don't critique the old state.
- **Be specific about scope.** "The sidebar is bad" is useless. "The sidebar's PEOPLE group has 4 items but only 2 are findable at first glance because items 3 and 4 are below the fold on a 13-inch laptop at 1280×800" is actionable.
- **Cite once per finding.** A finding can cite multiple heuristics, but the same finding shouldn't appear in three different places. One finding, one severity, one home.

## 10. What success looks like

At the end of this review we should have:
1. A **prioritized backlog** of UX changes with severity, heuristic citations, and proposed alternatives — ready to ship via normal sprint cadence
2. A **design-system reference** living in the repo that future contributors can use
3. A **competitive-teardown reference** so future product decisions have an evidence base
4. A **shared vocabulary** for talking about UX in this codebase — when Codex says "this is a CS-pco-rsvp divergence" we both know what they mean

This document is itself part of the deliverable. It should outlive any single pass.
