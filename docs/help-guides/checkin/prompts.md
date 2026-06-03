# Prompts

Three prompts. Each is wrapped in `~~~` so the inner `~~~` and triple
backticks don't break copy-paste. Just select the inside of each
block and paste into the target tool.

---

## 1. Prompt for Claude Chat (copy authoring)

**How to use:** Open Claude Chat. Attach your Brand & Voice document.
Attach `docs/help-guides/checkin/briefs-claude-chat.md` from this
repo. Then paste the prompt below. You can also paste just one
journey's brief if you want to iterate one at a time.

When Claude Chat responds, save each journey's output as a separate
markdown file in `docs/help-guides/checkin/inbox-claude-chat/` using
the slug exactly as the brief specifies (e.g. `a1-kiosk-setup.md`).

~~~text
I'm writing help-guide content for a SaaS called VolunteerCal — it's a
volunteer scheduling + children's check-in platform for churches.
You'll find my Brand & Voice document attached; use it as the
authoritative source for tone, register, vocabulary, and the warm
editorial aesthetic the platform uses.

I've also attached a brief from the engineering side (briefs-claude-
chat.md) that lists every help-guide journey with full content
specifications — audience, outcome, every step in the UI, every
feature/capability they encounter, common confusions, error states,
and cross-references. Treat that brief as the SOURCE OF TRUTH for
what the product actually does. Don't invent features beyond what's
listed; if something feels missing or ambiguous, flag it back to me
rather than guessing.

For each journey in the brief, produce polished help-guide copy
that:
  - Is written for the audience the brief specifies (admin /
    volunteer / parent — each has different reading conditions)
  - A non-technical reader can scan on their phone at 9:55am on
    a Sunday morning when service is starting at 10:00am
  - Uses the Brand & Voice document's tone — warm but precise,
    direct but not curt, never condescending
  - Includes every step, capability, and nuance the brief lists
  - Marks where a screenshot belongs with a clearly-bracketed
    placeholder: [SCREENSHOT: slug-from-the-brief]
  - Outputs as **markdown ready to drop into a React JSX component
    as text content** — use headings (##, ###), bullets, numbered
    lists, bold for emphasis. No HTML, no code fences, no
    triple-backticks (since this will become JSX text). Inline code
    spans (single backticks) are fine for short literal strings the
    user sees on screen, e.g. `Settings → Check-In → Stations`.

Output one journey at a time. Start with the journey ID and slug
as a top-level header so I can route the output to the right
filename. After each journey, pause so I can save and queue the
next one. If you want to batch tier-1 first then tier-2 then
tier-3, that works — produce them in the order they appear in the
brief unless I tell you otherwise.

Begin with journey A1 unless I've told you to start elsewhere.
~~~

---

## 2. Prompt for Codex (screenshot capture)

**How to use:** Open Codex. Paste the prompt below. Codex reads the
`briefs-codex.md` file from this repo and captures every screenshot
listed. PNGs land in `docs/help-guides/checkin/inbox-codex/`.

~~~text
Capture every screenshot listed in docs/help-guides/checkin/briefs-
codex.md. Use production (volunteercal.com) with my admin account
(jpaschall@gmail.com) on the Anchor Falls Church organization.

For each screenshot entry in the brief:
  - Navigate to the URL specified
  - Execute the pre-screenshot setup steps EXACTLY as written
    (sign in as a specific role, create or use specific fixtures,
    fire specific actions in another browser tab, etc.)
  - Capture the screenshot at 2x DPR (Retina). Use a viewport
    width appropriate to the surface: 1440 wide for admin
    dashboards, 768 wide (iPad portrait) for kiosk screens, 390
    wide (iPhone 14 Pro) for phone-rendered surfaces like the
    teacher dashboard and parent guardian portal
  - Crop per the crop hints if given; otherwise full viewport
  - Save as PNG into docs/help-guides/checkin/inbox-codex/ using
    EXACTLY the slug from the brief as the filename, plus .png
    (so a slug of "a3-teacher-view-pickup-ready" saves as
    "a3-teacher-view-pickup-ready.png")

If a screenshot requires test fixtures (a fake household, a fake
session in pickup_ready state, etc.), use the existing test harness
endpoints listed at the top of the brief. Clean up synthetic
fixtures after the run, same as a retest.

If you can't capture a screenshot because of a missing fixture or
production state you can't easily produce, skip it and add a single
line to docs/help-guides/checkin/inbox-codex/SKIPPED.md explaining
why. Don't fake the image.

Open a PR with all the captured PNGs in
docs/help-guides/checkin/inbox-codex/ plus the SKIPPED.md if any.
~~~

---

## 3. Prompt to send back to Claude Code

**How to use:** When BOTH inboxes have files (Claude Chat copy +
Codex screenshots), paste this prompt into a fresh Claude Code
conversation in the VolunteerCal repo. I'll incorporate everything
and open a PR.

You don't have to wait for both to be fully complete — you can also
send this for "just tier 1" once tier 1's artifacts are in.

~~~text
The Check-In help-guide artifacts have landed.

  - Polished copy from Claude Chat is in
    docs/help-guides/checkin/inbox-claude-chat/
  - Screenshots from Codex are in
    docs/help-guides/checkin/inbox-codex/
  - (Any skipped-screenshot notes are in inbox-codex/SKIPPED.md)

Please incorporate them into the user-facing help center. Steps:

  1. For each .md file in inbox-claude-chat/, find the matching
     [SCREENSHOT: slug] placeholders and verify the corresponding
     PNG exists in inbox-codex/. If a PNG is missing, leave the
     placeholder in place with a TODO comment and surface the gap
     in your final summary.
  2. Move all PNGs from inbox-codex/ to public/help/checkin/
     using the same filenames (so the React component can
     reference them as /help/checkin/<slug>.png).
  3. For each journey, write the corresponding React JSX
     entry following the existing pattern in
     src/app/dashboard/help/page.tsx (look at the existing
     "Children's Check-In" entry around line 1075 for the
     structure). Use the polished copy verbatim except where you
     need to translate markdown to JSX. Replace each
     [SCREENSHOT: slug] placeholder with an <Image> component
     pointing at the public path, with proper alt text matching
     the slug description from the brief.
  4. Extend the help page's category grouping in the
     featureGuides array so the new entries surface under
     "Check-In" in the categorized navigation. If a journey is
     meaty enough to warrant its own top-level guide entry
     (e.g. "Teacher View", "Emergency Roster"), add it as a
     sibling rather than nesting under "Children's Check-In".
  5. Save the markdown source-of-truth (the same copy that
     became JSX) into docs/help-guides/checkin/published/ so
     future updates have a clean diff target.
  6. Run npx tsc --noEmit. Run npx eslint on the touched files.
  7. Open a PR with a clear summary listing each journey added
     and which tier it belongs to. Include the test plan from
     the brief in the PR body.

Read the brief at docs/help-guides/checkin/briefs-claude-chat.md
for the canonical journey list. If anything is ambiguous, ask me
before invented decisions.
~~~

---

## Iteration notes

- You can run sections 1 and 2 in **parallel** — Claude Chat doesn't
  need screenshots to write copy, and Codex doesn't need copy to
  capture screenshots
- You can ship in **batches** — send section 3 with just tier-1
  artifacts, ship that PR, then loop back for tier 2 + 3
- If Claude Chat asks clarifying questions, the answers belong in
  the brief — update `briefs-claude-chat.md` and re-route. That
  way the next iteration has fewer questions
- If Codex hits a production-state issue capturing a screenshot
  (test fixture won't behave, an unrelated bug), the SKIPPED.md
  is the way to surface it — easier to read than scattered notes
