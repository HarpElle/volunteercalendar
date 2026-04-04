# Claude Max — Implementation Synthesis & Execution Plan

## Platform & Mode

**Use:** Claude (claude.ai) with **Extended Thinking** enabled. On Claude.ai, go to Settings and ensure "Extended thinking" is toggled on. For Claude Max subscribers, this gives you the full extended thinking budget for complex reasoning.

**Do NOT use:** Claude Code (the CLI tool you've been using to build the app). This prompt is for the Claude.ai web interface as a separate research/synthesis conversation. The output from this conversation will then be brought back to Claude Code for implementation.

**Why Claude last:** Claude has the deepest reasoning capability for synthesizing multiple inputs into a coherent implementation plan. By now you have:
- Market data (Perplexity)
- UX patterns and gaps (ChatGPT)
- Strategic direction and pricing (Grok)
- Technical architecture for the Person model (Gemini)

Claude's job is to synthesize ALL of it into a single, executable implementation plan that you bring back to Claude Code.

**Pre-prompt context (IMPORTANT):** Before the main prompt below, paste these items in order. Claude's 200K context window can handle all of it:

1. **Perplexity output:** The full market research response (key pricing data, market size, integration landscape)
2. **ChatGPT output:** The comparison table and "best of all worlds" synthesis (skip the per-platform deep dives unless they're short)
3. **Grok output:** The full strategic analysis, especially the 5 most important decisions and month-by-month roadmap
4. **Gemini output:** The complete technical architecture (TypeScript interfaces, Firestore schema, migration script, implementation order)
5. **Your current types file:** Paste the contents of `src/lib/types/index.ts`
6. **Your current scheduler:** Paste the contents of `src/lib/services/scheduler.ts`

This gives Claude the complete picture to produce an implementation plan that accounts for market positioning, UX excellence, and technical soundness.

---

## Prompt (copy everything below this line)

---

I'm building VolunteerCal, a church management SaaS. I've gathered research from 4 different AI platforms (included above as context) covering market data, UX competitor analysis, business strategy, and a proposed unified Person data model architecture.

I need you to synthesize all of this into a single, prioritized implementation plan that I can execute with Claude Code (the CLI coding assistant). The output of this conversation will be pasted directly into Claude Code as instructions, so it must be precise, actionable, and implementation-ready.

## Output Format Requirements

Structure your response as a series of **Implementation Phases**, where each phase:
- Can be completed in one Claude Code session (roughly 2-4 hours of work)
- Ends with the app in a working, deployable state
- Has a clear verification step (`npx tsc --noEmit` + manual test)
- Lists every file to create, modify, or delete
- Includes the exact TypeScript types, Firestore schema changes, and component modifications

For code, provide complete implementations — not snippets or pseudocode. If something is too long to include in full, provide the complete interface/type definitions and describe the implementation logic precisely enough that a coding AI can produce it without ambiguity.

For each phase, also note:
- **Dependencies:** What must be done before this phase
- **Risk:** What could go wrong
- **Rollback:** How to undo if something breaks
- **Test:** How to verify it works

---

## What I Need Synthesized

### 1. Unified Person Model — Final Design

Review Gemini's proposed architecture (included in context). Evaluate it against:
- The Firestore query patterns my app actually needs
- The UX patterns from the ChatGPT competitor analysis (how do the best platforms model people?)
- The strategic direction from Grok (what market am I targeting?)

Then produce the FINAL TypeScript interfaces and Firestore schema. If you disagree with any of Gemini's decisions, explain why and provide your alternative. Specifically address:

- Should `children` be Person documents with `type: "child"` or a separate subcollection under Household? (Consider: the check-in kiosk needs to list children after finding a parent by phone. What's the minimum reads for that flow?)
- Should scheduling-specific fields (max_services_per_month, blackout_dates, skills) be inline on Person or in a map/subcollection? (Consider: the scheduling algorithm reads ALL volunteers for a ministry in one query and needs these fields.)
- How should the Assignment collection reference people? (Currently uses `volunteer_id`. Should it become `person_id`? What about backward compatibility during migration?)
- How should Household work for: single person with no family, single parent + kids, married couple + kids where both volunteer, foster/blended families with complex custody?

### 2. Permission System — Final Design

Review Gemini's proposed permission utilities. Produce the final:
- Updated `Membership` interface with permission flags
- Complete `canPerformAction()` utility with every permission check the app needs
- How permission flags interact with roles (e.g., does a scheduler with `checkin_volunteer` flag see the check-in admin view or just the kiosk?)

### 3. Navigation Overhaul — Informed by UX Research

Based on ChatGPT's competitor analysis and the "best of all worlds" synthesis, propose the updated navigation structure for VolunteerCal. Produce:
- The new sidebar sections and items (exact labels, icons, routes)
- Which current pages get removed, merged, or renamed
- The mobile bottom tab bar layout
- What a scheduler sees vs. what a volunteer sees vs. what an admin sees

### 4. Priority Sequencing — Informed by Strategy

Based on Grok's strategic analysis, sequence the implementation work by business impact:
- What ships first to make the beta church happy?
- What ships second to attract church #2-5?
- What ships third to support a launch to 50 churches?
- What can wait until post-launch?

### 5. Pricing Tier Impact on Architecture

Based on Perplexity's pricing data and Grok's pricing recommendations, do any architectural decisions change based on the final pricing model? For example:
- If we do per-person pricing, do we need a `person_count` field on the church document?
- If we bundle check-in at a specific tier, do we need feature gating in the UI?
- If we add giving later, should the Person model have giving-related fields now?

---

## Phase Structure

Organize everything into these phases (adjust if needed, but this is the expected structure):

### Phase 0: Foundation
- Updated type definitions (Person, Household, Membership, etc.)
- Migration script
- Compatibility layer (so existing UI doesn't break)
- Verification: `npx tsc --noEmit` passes, app loads, existing features still work

### Phase 1: Data Layer Swap
- Update all Firestore read/write functions to use new collections
- Update the scheduling algorithm to use Person instead of Volunteer
- Update check-in to use Person/Household instead of CheckInHousehold
- Verification: Generate a schedule, do a check-in, view the people list — all work with new data

### Phase 2: Permission System
- Updated Membership with permission flags
- Permission utility functions
- UI gating (hide/show features based on role + flags)
- Verification: Scheduler can only see their scoped ministries, admin sees everything

### Phase 3: Navigation Overhaul
- New sidebar structure
- Page merges/removals
- Mobile bottom tab bar
- Verification: All routes work, no dead links, role-appropriate views

### Phase 4: Stats & Display Improvements
- Correct schedule stats (building on the fix already implemented)
- Dashboard consolidation
- Any UI improvements from the competitor analysis
- Verification: Stats are accurate, dashboard shows useful information

### Phase 5: Integration Prep
- Background check integration points (even if not fully built)
- Calendar feed improvements
- Email notification system (Postmark/SES setup)
- Verification: Calendar feeds work, email sends

---

## Constraints Reminder

- Next.js 16 App Router, TypeScript, Tailwind CSS v4
- Firebase Auth + Firestore (client SDK v9+ modular)
- React Context + useReducer (no Redux, no Zustand)
- All timestamps as ISO strings
- kebab-case collections, PascalCase components, camelCase functions
- `@/` import alias for `src/`
- Mobile-first, 44px minimum touch targets
- "Warm Editorial" design: vc-indigo, vc-coral, vc-sage, vc-sand color tokens
- Plus Jakarta Sans font only
- No component libraries — hand-built UI components

---

## Final Checklist

End your response with a checklist I can paste into Claude Code as the starting instruction:

```
## Implementation Checklist
- [ ] Phase 0, Step 1: [specific action]
- [ ] Phase 0, Step 2: [specific action]
...
```

Each checklist item should be small enough to be a single Claude Code instruction (one tool call or a small set of related edits).
