# Check-In Help Guides — Workflow

This folder is where the **content production for the Check-In help
guides** happens. Three collaborators move pieces through it:

- **Claude Code** (the agent that knows the code) — writes briefs that
  tell Claude Chat and Codex everything they need to know. Eventually
  takes their outputs and wires them into `src/app/dashboard/help/page.tsx`
- **Claude Chat** (the conversational app) — writes the polished copy
  using your Brand & Voice document for tone
- **Codex** (the agent with browser access) — captures pixel-perfect
  screenshots of every UI state the guides reference

Why not put this under `docs/testing/`? The artifacts produced here
end up in **production** as help-center content — they're not test
fixtures. `docs/help-guides/` is the home for content-production work
across all feature surfaces; today there's just `checkin/` but the
same pattern can branch to `scheduling/`, `worship/`, etc. later.

---

## Folder map

```
docs/help-guides/checkin/
├── README.md                       ← you are here
├── prompts.md                      ← the 3 prompts Jason sends + receives
├── briefs-claude-chat.md           ← everything CC needs to know (all journeys)
├── briefs-codex.md                 ← every screenshot Codex needs (all journeys)
├── inbox-claude-chat/              ← CC saves polished copy here, one file per journey
│   └── .gitkeep
├── inbox-codex/                    ← Codex saves PNGs here, one per slug
│   └── .gitkeep
└── published/                      ← Claude Code's source of truth pre-React, one file per journey
    └── .gitkeep
```

---

## Workflow

1. **Jason → Claude Chat.** Jason copies the prompt from `prompts.md`
   section 1, pastes it into Claude Chat, attaches his Brand & Voice
   document, attaches `briefs-claude-chat.md`. Claude Chat returns
   polished copy. Jason saves it into `inbox-claude-chat/` using the
   filename specified in the brief (e.g. `a1-kiosk-setup.md`).

2. **Jason → Codex.** Jason copies the prompt from `prompts.md`
   section 2, pastes it into Codex. Codex reads `briefs-codex.md`,
   captures every screenshot, saves PNGs to `inbox-codex/` using the
   specified slugs.

3. **Jason → Claude Code (back to me).** When both inboxes have
   their files, Jason copies the prompt from `prompts.md` section 3
   and pastes into a fresh Claude Code conversation. I (or a future
   me) reads both inboxes, places PNGs into `public/help/checkin/`,
   updates `src/app/dashboard/help/page.tsx`, and opens a PR.

Each stage is independent. Claude Chat can be working on tier-1 copy
while Codex is still capturing tier-2 screenshots. Jason can ship
tier 1 first, then add tier 2 + 3 as follow-up PRs.

---

## Scope coverage in this kit

This kit currently covers:

- **Tier 1** (5 journeys, deepest depth) — what Anchor Falls testing
  needs first: kiosk setup, kiosk runtime, teacher view, admin per-room,
  emergency roster
- **Tier 2** (5 journeys, moderate depth) — wallet pass, parent-arrival
  ping, Page Parent SMS, blocked-pickup awareness, attendance-taking
- **Tier 3** (8 journeys, lighter outlines) — operational completeness:
  household edits, grade roll-up, visitor flow, multi-campus, recovery,
  parent self-service, volunteer scheduling for check-in, staffed vs
  self-service kiosks

The briefs are written so Claude Chat and Codex can work on **any
journey independently**. Jason picks which to route first.
