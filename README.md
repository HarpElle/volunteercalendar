# VolunteerCal.org

**Flexible scheduling for multi-ministry churches.**

Auto-generate fair, conflict-free volunteer schedules across worship, kids, tech, greeters — or let ministries run independently. Team leaders review and tweak in a shared draft state. Volunteers confirm and sync to their personal calendar.

## Features

- **Flexible workflows** — Centralized approval, ministry-independent, or self-service signups
- **Multi-ministry coordination** — Prevents double-booking across all teams
- **Household awareness** — Never schedule a parent and child at the same time in different ministries
- **Calendar feeds** — Personal and team iCal subscriptions for Google Calendar, Outlook, Apple Calendar
- **Configurable reminders** — Email, SMS, calendar invite, or none — each volunteer chooses
- **Smart check-in** — QR codes, time-aware prompts, and proximity detection; volunteers check in from their phone automatically
- **Shift swap** — Volunteers request swaps; eligible replacements accept; admins approve
- **Volunteer health** — At-risk detection, declining engagement alerts, inactive classification
- **Onboarding pipeline** — Org-wide and team-specific prerequisites (background checks, training, orientation) with volunteer progress tracking
- **Song library & service plans** — Full worship planning with CCLI metadata, order-of-service builder, and song usage tracking (Growth+ tiers)
- **SongSelect integration** — Import songs directly from CCLI SongSelect with automatic metadata sync (Growth+ tiers)
- **Stage Sync** — Real-time worship display for the team: conductor advances items, participants follow along on any device
- **Song usage reports** — Date range filtering, aggregation, and CSV export for CCLI compliance reporting
- **ProPresenter export** — Export service plans as ProPresenter-compatible JSON, with optional daily auto-email delivery
- **Availability campaigns** — Broadcast availability requests before schedule generation with volunteer response tracking
- **Multi-stage approval** — Draft → ministry review → approved → published with per-ministry approval gates
- **Multi-site support** — Campus-level services with optional timezone overrides
- **PWA** — Installable on mobile with offline support
- **Works standalone** — CSV upload or manual entry. No church management system required
- **Optional integrations** — Planning Center, Breeze, Rock RMS

## Tech Stack

- **Frontend:** Next.js 16, React 19, TypeScript, Tailwind CSS v4
- **Backend:** Firebase (Auth, Firestore, Cloud Functions)
- **Hosting:** Vercel
- **SMS:** Twilio
- **Payments:** Stripe

## Getting Started

```bash
npm install
cp .env.example .env.local
# Fill in Firebase credentials in .env.local
npm run dev
```

## License

Proprietary. All rights reserved.
