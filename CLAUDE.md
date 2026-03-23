# VolunteerCal

Flexible volunteer scheduling SaaS for churches, nonprofits, and volunteer-driven organizations. MVP targets 1-2 beta churches with centralized draft-review-approve-publish workflow.

## Workflow
- Do not use worktrees. Make changes directly in the working directory.
- Do not commit or push unless explicitly asked.
- After making changes, run `npx tsc --noEmit` to verify TypeScript compiles cleanly.
- To preview locally: `npm run dev` (visits localhost:3000)
- Keep `PROJECT_OVERVIEW.md` in sync when adding, renaming, or deleting files.

## Code Conventions
- **Framework:** Next.js 16 with App Router, TypeScript, Tailwind CSS v4
- **Backend:** Firebase (Auth, Firestore, Cloud Functions)
- **State:** React Context + useReducer (no external state library)
- **File naming:** kebab-case for files and folders (`schedule-matrix.tsx`, `auth-context.tsx`)
- **Component exports:** PascalCase (`ScheduleMatrix`, `Button`)
- **Firestore collections:** kebab-case (`volunteers`, `ministries`, `schedules`)
- **Cloud Functions:** camelCase (`onSchedulePublished`, `sendReminder`)
- **No component library** — hand-built components in `src/components/ui/`
- **Imports:** Use `@/` alias for `src/` directory

## Design Rules — "Warm Editorial" Aesthetic
- VolunteerCal is a HarpElle sub-brand with its own color palette (per Brand_HarpElle.md sub-brand rules)
- Color tokens defined in `src/app/globals.css` under `@theme inline`
- **Indigo** (`vc-indigo`) — deep trust, primary text, dark sections
- **Coral** (`vc-coral`) — warm CTAs, accents, interactive elements
- **Sage** (`vc-sage`) — success, calm, growth indicators
- **Sand** (`vc-sand`) — warm supporting tone, subtle highlights
- **Surfaces** — warm ivory `vc-bg` (#FEFCF9), cream `vc-bg-warm` (#FBF7F0), not cold white
- **Font:** Plus Jakarta Sans (all text — per HarpElle brand guide, sub-brands use Plus Jakarta Sans only)
- **Headings** use `font-display` class (Plus Jakarta Sans SemiBold/Bold) for weight-based hierarchy
- **Animations:** Use `motion/react` (Motion library) for scroll-triggered reveals and micro-interactions
- Minimum body text: 16px. Minimum touch target: 44x44px.
- Mobile-first responsive design (PWA target)
- All timestamps stored as ISO strings (NOT JS Date objects or Firestore Timestamps)

## Key Files
- `src/lib/types/` — All TypeScript interfaces
- `src/lib/firebase/config.ts` — Firebase initialization
- `src/lib/firebase/admin.ts` — Firebase Admin SDK (server-side only)
- `src/lib/context/auth-context.tsx` — Auth state provider
- `src/app/page.tsx` — Public landing page
- `src/app/dashboard/` — Auth-guarded admin routes
- `.env.local` — Firebase credentials (never commit)
- `docs/ROADMAP.md` — Outstanding items, pre-launch checklist, post-launch priorities
- `docs/SCALING_ASSESSMENT.md` — Architecture capacity analysis, optimization roadmap
- `docs/TEST_PLAN.md` — Manual + automated testing checklist

## Phase Roadmap
See `PROJECT_OVERVIEW.md` for complete phase history (Phases 1–32 + Expansion Phases 4–11 + Phase G + Part 3 + Onboarding Enhancements + Navigation & UI Overhaul complete). All expansion phases are done: SongSelect integration, Stage Sync, ProPresenter export, song usage reports, platform admin tier override, ministry templates, volunteer archive/status system, ChordPro/PDF import with chord chart viewer system, native children's check-in with kiosk UI, label printing, companion print service, room & resource scheduling with booking wizard, conflict detection, recurring reservations, approval workflow, iCal feeds, wall-mounted display signage, WorshipTools UX improvements (service plan editor with header items + inline notes, volunteer availability indicators, self-service availability page, batched notification emails, ministry group collapse/expand, multi-service compare view), onboarding enhancements (role validation on notification routes, prerequisite milestone notifications with expiry/nudge cron, training session invitations with auto-complete, trainee assignment type for shadow assignments), navigation/UI overhaul (mobile bottom tab bar with volunteer 4-tab/admin 5-tab split, warm sidebar redesign with collapsible Check-In/Rooms sections, More menu slide-up sheet, unified Settings page consolidating org/check-in/rooms settings, reports absorbed into parent pages, My Availability page with warm brand styling), and comprehensive site fix + shared facility feature (pricing tier accuracy fixes, CCLI reframed as CSV export, email standardization to info@volunteercal.com + noreply@harpelle.com, 3 new landing page feature cards, 7 new help guides, hidden routes surfaced via account/plans/settings/more-menu links, room display wake-lock for always-on signage, and shared facility room scheduling with facility_groups Firestore collection, cross-org reservation API, invite notification emails, and Settings UI for group management).
