# Site Review — Comprehensive Quality Audit

You are performing a thorough quality review of the VolunteerCalendar site. This review should be run after major development milestones, before releases, or on request.

Work through each section in order. For each section, report findings as:
- **Pass** — meets the standard
- **Issue** — specific problem with a recommended fix
- **Improvement** — not broken, but could be better

At the end, produce a summary with a prioritized action list.

---

## 1. Brand & Content Review

Read `Brand_And_Identity_Guides/Brand_HarpElle.md` (in the HarpElle root) for the parent brand voice.

Review ALL user-facing text across the site for alignment:
- Landing page (`src/app/page.tsx` and `src/components/landing/`)
- Dashboard page titles, descriptions, empty states, and button labels
- Help Center (`src/app/dashboard/help/page.tsx`)
- Email templates (`src/lib/utils/email-templates.ts`, `src/lib/utils/emails.ts`)
- Error messages and confirmation dialogs
- Privacy policy and terms of service

**Check for:**
- Tone: genuine, honest, clean, professional, friendly — NOT corporate-stiff, hype-driven, or overly casual
- Banned words: revolutionary, disruptive, game-changing, next-gen, dominate, crush, hustle, scale fast
- Preferred words: built, crafted, thoughtful, reliable, intentional, clear, refined, deliberate, solid, well-made, care, standard
- Grammar, spelling, consistency (e.g., "team" vs "ministry" matching org type)
- Claims that are specific and honest — no inflated superlatives
- Brand guardrails: Is every piece of text thoughtful, clear, stable, and necessary?

Note: VolunteerCal has its own visual identity (DM Serif Display + DM Sans, warm editorial tokens) but the communication TONE follows HarpElle's parent brand voice.

---

## 2. Frontend Design & Visual Quality

Use the `/frontend-design` skill mindset to evaluate the site against modern SaaS best practices.

**Evaluate:**
- Visual hierarchy: headings, spacing, grouping, scanability
- Color usage: vc-indigo for trust/text, vc-coral for CTAs/accents, vc-sage for success, vc-sand for warmth — no off-brand Tailwind colors (gray, red, green, blue, etc.)
- Typography: DM Serif Display for headings/editorial, DM Sans for body/functional — consistent sizing, no orphan font usage
- Component consistency: buttons, inputs, badges, cards, modals all use the same design language
- Whitespace: generous spacing between sections (48-80px), breathing room inside cards (p-4 to p-6)
- Surface warmth: backgrounds should be vc-bg (#FEFCF9) or vc-bg-warm (#FBF7F0), not cold #FFFFFF
- Animations: motion/react for scroll reveals and micro-interactions — subtle, not distracting
- Icons: consistent stroke width, sizing, and style (Heroicons outline)

**Spot-check these key pages:**
- Landing page (public)
- Dashboard home
- People page
- Schedules page
- Services & Events page
- Organization Settings
- Help Center

---

## 3. User Experience & Information Architecture

Evaluate the site as a first-time church admin setting up volunteer scheduling.

**Check for:**
- Logical page sequencing: setup -> add people -> create services -> generate schedule -> publish
- Dashboard provides clear "what to do next" guidance, not just data
- Frequently used actions are prominent and easily reachable (1-2 clicks max)
- Infrequently used features are accessible but not competing for attention
- No information overload: each page has a clear purpose, not too many competing sections
- Empty states guide the user (not just "nothing here yet")
- Filter/search UX is discoverable but not cluttered
- Navigation sidebar clearly communicates the app's structure
- Tier-gated features are communicated gracefully (not confusing or blocking)

**Mobile-first evaluation (this is the primary consumption method):**
- All touch targets >= 44x44px
- Tables scroll horizontally or stack on small screens
- Modals/drawers are full-width on mobile
- Text is readable without zooming (16px minimum body)
- No horizontal overflow or broken layouts at 375px width

---

## 4. Accessibility Audit

**Check for:**
- Color contrast: all text meets WCAG AA (4.5:1 for normal text, 3:1 for large text)
- Interactive elements: all buttons, links, and form controls are keyboard-accessible
- ARIA labels: icon-only buttons have aria-label attributes
- Focus indicators: visible focus rings on interactive elements
- Form labels: all inputs have associated labels (not just placeholders)
- Image alt text: all meaningful images have descriptive alt attributes
- Screen reader flow: page structure uses semantic HTML (headings, landmarks, lists)

---

## 5. Performance & Technical Quality

**Run:**
- `npx tsc --noEmit` — TypeScript must compile clean with zero errors
- Check for unnecessary client-side data fetching (pages that load everything upfront)
- Look for missing `loading` states (spinners/skeletons during data fetch)
- Verify error boundaries exist and are user-friendly

**Check for:**
- No console.log statements left in production code (except intentional warnings)
- No unused imports or dead code in recently changed files
- Images use next/image or are properly optimized
- Large lists use pagination or virtualization where appropriate

---

## 6. Documentation & Content Sync

After any feature work, verify these files reflect the current state of the app:

| File | What to check |
|---|---|
| `PROJECT_OVERVIEW.md` | Phase history, file tree, status line |
| `CLAUDE.md` | Phase roadmap reference |
| `README.md` | Feature list matches current capabilities |
| `docs/ROADMAP.md` | Pre-launch checklist, blocked items, post-launch priorities |
| `docs/TEST_PLAN.md` | Manual testing sections cover new features |
| `docs/SCALING_ASSESSMENT.md` | Architecture notes if new patterns were introduced |
| `src/components/landing/features.tsx` | Feature cards reflect current capabilities |
| `src/components/landing/faq.tsx` | FAQ answers are accurate |
| `src/lib/constants/index.ts` | Pricing tier feature lists are current |
| `src/app/dashboard/help/page.tsx` | Help Center guides cover new features |

---

## 7. Security Spot-Check

**Verify:**
- All API routes check authentication (Bearer token + `adminAuth.verifyIdToken`)
- Role-based access: admin-only routes reject scheduler/volunteer
- No sensitive data in client-side code (API keys, secrets)
- Firestore document access is scoped to the user's church
- User input is validated server-side (not just client-side)
- No SQL injection vectors (N/A for Firestore, but check string interpolation)

---

## Output Format

Produce a structured report:

### Summary
- Total issues found (by severity)
- Top 3 priorities

### Findings by Section
For each section, list findings as:
```
[PASS/ISSUE/IMPROVEMENT] Section > Specific item
Description of finding
Recommended action (if applicable)
File: path/to/file.tsx:line
```

### Action List
Numbered, prioritized list of changes to make, grouped by:
1. **Critical** — broken functionality or major UX problems
2. **Important** — brand misalignment, accessibility failures, missing docs
3. **Polish** — visual refinements, copy improvements, nice-to-haves
