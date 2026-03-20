# VolunteerCal.org

**Flexible scheduling for multi-ministry churches.**

Auto-generate fair, conflict-free volunteer schedules across worship, kids, tech, greeters — or let ministries run independently. Team leaders review and tweak in a shared draft state. Volunteers confirm and sync to their personal calendar.

## Features

- **Flexible workflows** — Centralized approval, ministry-independent, or self-service signups
- **Multi-ministry coordination** — Prevents double-booking across all teams
- **Household awareness** — Never schedule a parent and child at the same time in different ministries
- **Calendar feeds** — Personal and team iCal subscriptions for Google Calendar, Outlook, Apple Calendar
- **Configurable reminders** — Email, SMS, calendar invite, or none — each volunteer chooses
- **QR check-in** — Generate QR codes for services; volunteers self-check-in from their phone
- **Shift swap** — Volunteers request swaps; eligible replacements accept; admins approve
- **Volunteer health** — At-risk detection, declining engagement alerts, inactive classification
- **Onboarding pipeline** — Track prerequisite completion (classes, background checks, tenure) per ministry
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
