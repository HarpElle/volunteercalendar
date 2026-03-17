# VolunteerCal

Flexible volunteer scheduling SaaS for multi-ministry churches. MVP targets 1-2 beta churches with centralized draft-review-approve-publish workflow.

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
- VolunteerCal has its own brand identity (not HarpElle tokens)
- Color tokens defined in `src/app/globals.css` under `@theme inline`
- **Indigo** (`vc-indigo`) — deep trust, primary text, dark sections
- **Coral** (`vc-coral`) — warm CTAs, accents, interactive elements
- **Sage** (`vc-sage`) — success, calm, growth indicators
- **Sand** (`vc-sand`) — warm supporting tone, subtle highlights
- **Surfaces** — warm ivory `vc-bg` (#FEFCF9), cream `vc-bg-warm` (#FBF7F0), not cold white
- **Font display:** DM Serif Display (headings, editorial moments)
- **Font sans:** DM Sans (body, functional text)
- **Animations:** Use `motion/react` (Motion library) for scroll-triggered reveals and micro-interactions
- Minimum body text: 16px. Minimum touch target: 44x44px.
- Mobile-first responsive design (PWA target)
- All timestamps stored as ISO strings (NOT JS Date objects or Firestore Timestamps)

## Key Files
- `src/lib/types/` — All TypeScript interfaces
- `src/lib/firebase/config.ts` — Firebase initialization
- `src/lib/context/auth-context.tsx` — Auth state provider
- `src/app/page.tsx` — Public landing page
- `src/app/dashboard/` — Auth-guarded admin routes
- `.env.local` — Firebase credentials (never commit)

## Phase Roadmap
- **Phase 1 (Current):** Scaffolding, landing page with waitlist, Firebase auth
- **Phase 2:** Data model, volunteer import (CSV + manual), ministry/service config
- **Phase 3:** Scheduling algorithm, draft matrix UI, conflict detection
- **Phase 4:** Review/approval workflow (Mode 1: Centralized)
- **Phase 5:** Publish, reminders (email/SMS), calendar feeds (iCal)
- **Phase 6:** Dashboard analytics, Stripe billing, exports
