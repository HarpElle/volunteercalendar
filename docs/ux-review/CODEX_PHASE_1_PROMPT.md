# Codex — Phase 1 Brief (UX Deep-Dive Setup)

Copy the prompt in the fenced block below to start your Phase 1 work. This is the kickoff for a multi-week UX deep-dive; read the linked framework + pass-plan docs FIRST, then begin.

```
We are starting the UX deep-dive phase for VolunteerCal. Jason framed it: he wants a rigorous, expert-grade UI/UX review where we (Claude + Codex + Jason) strongly challenge assumptions to land on the best possible product. Not just polish — actually testing our design decisions against expert UX literature and the dominant platforms in the church-SaaS space.

YOUR ROLE
You bring the experiential + competitive lens. Claude brings the systematic + codebase-grounded lens. Jason adjudicates debate points. We work in parallel — independent findings first, then synthesis with debate. The framework explicitly invites disagreement; suppressed disagreement is worse than open conflict.

READ FIRST (in SharedTestingDocuments + docs/ux-review/ in the repo):
1. UX_REVIEW_FRAMEWORK.md — the shared rubric. Heuristics we cite (NN-1..10, W-1.4.3 etc., HE-color etc., CS-pco-rsvp etc., XC-empty etc.), severity scale (1-5), deliverable shape per pass, debate protocol, data preservation rules.
2. UX_REVIEW_PASS_LIST.md — the ordered pass plan. We're starting Phase 1 (setup); Phase 2 onward is the actual critique passes.

YOUR PHASE 1 DELIVERABLES (parallel with Claude's Phase 1 work)

(1.A) COMPETITIVE TEARDOWN
Output: docs/ux-review/references/competitive-teardown.md + screenshots in docs/ux-review/references/competitive-screenshots/

Walk through these products as a first-time admin would. Screenshot each KEY FLOW on both desktop (1440 width) AND mobile (375 width or DevTools iPhone 13 emulation):

REQUIRED:
- Planning Center People + Services — https://planning.center (sign up for the free trial if you don't have access; the demo data is rich enough to evaluate)
- SignUpGenius — https://signupgenius.com (free; the "event signup" angle)

STRONGLY RECOMMENDED:
- Ministry Scheduler Pro — older but still widely deployed (https://www.rotundasoftware.com/ministry-scheduler/)
- Rotunda CRM if accessible

OPTIONAL (the "scheduling" lens outside the church context):
- Calendly admin view (mostly relevant for self-scheduling patterns)
- When I Work (shift-swap patterns)

KEY FLOWS TO CAPTURE PER PRODUCT (5 flows × 2 viewports = 10 screenshots minimum per product):
1. The empty-state dashboard a brand-new admin sees on first login
2. Create-a-schedule (or equivalent) flow start to finish
3. The volunteer's view of their next assignment (mobile is the volunteer view that matters most)
4. The volunteer's RSVP / confirmation flow (email → land on page → respond)
5. The admin's view of a team's roster + ability to fill open slots

FOR EACH SCREENSHOT, ANNOTATE IN THE TEARDOWN DOC:
- What they're showing (a one-line description of the surface)
- Which heuristic that design choice supports (or violates, occasionally)
- What VolunteerCal does in the equivalent place
- Whether our divergence is defensible (and IF defensible, what the reason is)

CRITICAL: don't just describe what they do. EVALUATE whether what they do is good. PCO is the dominant platform but it has its own debt + dated choices. Don't grant it gospel status. The output isn't "we should do what PCO does" — it's "PCO does X because Y; do Y arguments apply to us?"

(1.C) SURFACE INVENTORY (you lead; Claude reviews + extends)
Output: docs/ux-review/references/surface-inventory.md + docs/ux-review/references/our-screenshots/

Enumerate every page in VolunteerCal (admin + volunteer + public) and screenshot each on desktop + mobile. For each page, capture distinct states where they matter:
- Default populated state
- Empty state (no data)
- Loading state (if reproducible)
- Error state (if reproducible — bad form input is a quick way in most places)
- No-permission state (where applicable)

Use TESTER — Codex 2 + TESTER FACILITY — Codex 2. Re-read the DATA PRESERVATION section of the framework before clicking anything destructive.

DELIVERABLE FORMAT for the inventory:
| Page | Route | Role | Desktop screenshot | Mobile screenshot | Notes |
|---|---|---|---|---|---|
| Login | / (auth gate) | (public) | login-desktop.png | login-mobile.png | Has email + Google paths |

WORKING CADENCE
- Phase 1 has no debate stage yet — both setup tasks are reference-material-building, not opinion-forming. Just gather.
- Aim for 2-3 days. Don't strive for completeness in one pass; we'll extend during Phase 2 critique passes if specific surfaces need deeper investigation.
- Save in-progress work to docs/ux-review/references/ and SharedTestingDocuments/ux-references/ regularly so Claude can see progress + reference it for his parallel design-system audit.

DATA PRESERVATION (carry forward from earlier prompts; restated because this is a multi-week engagement)
HARD NO:
1. Don't delete the test orgs (Settings → Danger Zone → Delete Organization)
2. Don't delete published schedules — referenced by assignments / iCal / history
3. Don't delete the Phase 6 Background Check org-wide prereq — referenced by completion records
4. Don't accept new cross-org invites for +admin2@gmail.com — its both-orgs membership is the multi-org fixture
5. Don't regenerate calendar-feed tokens

USE DISPOSABLE ACCOUNTS (+ux1@gmail.com, +ux2@gmail.com, etc.) for any destructive flows (Remove from Organization, hard-delete schedules).

OK: throwaway schedules / sessions / claims via UI; archive + restore loops; self-signup + Release slot loops; Firestore Console as a last resort + easily revertible.

WHEN YOU FINISH PHASE 1
Send Jason a short message:
- "Phase 1 setup complete. Competitive teardown covers {N} products + {M} flows; surface inventory covers {X} pages × 2 viewports = {Y} screenshots."
- Confirm the docs are in SharedTestingDocuments
- Wait for Claude + Jason to review before kicking off Pass A (Navigation + IA)

WHY THIS MATTERS
Setup feels boring but every later pass cites this work. A weak competitive teardown means Pass A's debate about IA degenerates into opinions; a strong one means we can say "PCO splits People from Services for THIS reason — does that reason apply to us?" and have a productive argument.

QUESTIONS THAT BREAK THE PROTOCOL
If anything in the framework doesn't make sense, or you think a different approach would serve better, push back BEFORE starting Phase 1 — not after. We're explicitly inviting that.

Reference docs in SharedTestingDocuments:
- UX_REVIEW_FRAMEWORK.md (the rubric)
- UX_REVIEW_PASS_LIST.md (the ordered passes)
- CODEX_PHASE_1_PROMPT.md (this prompt, archived for reference)
```
