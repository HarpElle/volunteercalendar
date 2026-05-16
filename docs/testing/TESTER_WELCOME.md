# Welcome, VolunteerCal Tester!

_Last updated: 2026-05-15_

---

## Why You're Here

Thank you for taking the time to test VolunteerCal before it goes wide. Jason has been heads-down building this for months, which means he literally cannot see the rough edges anymore. **You can.** That's the whole point.

This isn't a check-the-boxes QA pass. It's a real-world walkthrough where you simulate being a church admin, a volunteer, a parent dropping their kid off at children's church, and a worship leader running a Sunday service. As you go, **anything that surprises you, confuses you, slows you down, or feels off is a win to report**. Even small papercuts — a label that's wrong, a button that's hard to find, a bit of jargon that doesn't make sense — are exactly what we need.

You don't need to find "bugs" to be useful. The honest reaction of a fresh user is more valuable than any automated test.

---

## The Big Picture Goal

**Help us catch confusion, breakage, and missing pieces before paying customers do.**

The four kinds of feedback we want:

| Type | Example |
|------|---------|
| 🐛 **Bugs / blockers** | "I clicked Publish and got a blank screen for 30 seconds." |
| 😕 **Confusion moments** | "I had no idea what 'Hybrid workflow mode' meant — I just picked one randomly." |
| 💡 **Gut reactions** | "The landing page looks polished, but the dashboard felt cluttered the moment I logged in." |
| 🌟 **Feature wishes** | "I wish I could text a volunteer directly from their profile." |

You'll capture these in `FEEDBACK_FORM.md` after each phase.

---

## Time Commitment

Plan for roughly **6 hours total**, splittable however you want:

- **2-session option**: 3 hours each (Free tier in session 1; Paid tier in session 2)
- **3-session option**: 2 hours each (Public + Setup; Volunteer + Sunday Ops; Worship + Check-In + Rooms)
- **Marathon option**: full Saturday — bring snacks

The test plan has natural pause points. **Pausing is encouraged** — fresh perspective on day 2 catches things you missed on day 1.

---

## What You Need Before Starting

- **A Gmail account.** (You'll use one address with the `+suffix` trick — see below.)
- **A phone with internet** (for mobile testing — phone, not just a laptop).
- **A modern browser** (Chrome, Edge, Safari, or Firefox — recent version).
- **A Google Voice number** (free — only needed for paid-tier SMS testing in later phases). Setup: [voice.google.com](https://voice.google.com), takes ~5 min if you don't have one.
- **About 30 minutes of focus** before you start — read this doc, then [USER_GUIDE.md](USER_GUIDE.md), then dive into [TEST_PLAN.md](TEST_PLAN.md).

You do NOT need:
- A credit card. (Stripe is intentionally out of scope. When the test plan tells you to upgrade, you'll message Jason and he'll do it manually.)
- Multiple email accounts. (The Gmail alias trick handles that.)
- Any technical setup, IDEs, or local installs. Everything happens in your browser.

---

## The Gmail Alias Trick (Important!)

Gmail ignores anything between a `+` and the `@` in your address. That means:

- `yourname@gmail.com`
- `yourname+admin@gmail.com`
- `yourname+sarah@gmail.com`
- `yourname+vol1@gmail.com`

…all land in the **same** `yourname@gmail.com` inbox.

VolunteerCal, however, treats each one as a different person. This lets you sign up as multiple users — admin, scheduler, volunteer 1, volunteer 2 — and see every email they would receive without juggling browser logins or burner accounts.

### Suggested Aliases for This Test

You'll create these one at a time as you go. Have them ready in a notes app:

| Alias | Role they'll play |
|-------|-------------------|
| `you+admin@gmail.com` | Org owner (Pastor Sarah) — the main test account |
| `you+sched@gmail.com` | Scheduler — promoted volunteer who builds schedules |
| `you+vol1@gmail.com` | Volunteer 1 — receives invites, confirms assignments |
| `you+vol2@gmail.com` | Volunteer 2 — for shift-swap testing, second confirmer |
| `you+vol3@gmail.com` | Volunteer 3 — gets archived, then restored |
| `you+guardian@gmail.com` | Children's check-in guardian |
| `you+facility@gmail.com` | Owner of a second org (for shared facility testing) |

### Try It Right Now

Open Gmail, compose a new email to `yourname+test@gmail.com`, send it, and confirm it lands in your inbox. **If this doesn't work, stop and message Jason** — without working aliases, the test plan won't flow.

> **Tip**: In Gmail, you can filter by `to:yourname+admin@gmail.com` to see only emails for the admin persona. Saves you from scrolling.

---

## Browser Setup Tips

### Use one browser profile per persona (recommended)

The cleanest way to switch between admin and volunteer roles is **multiple Chrome profiles** (or Firefox containers). Each profile has its own cookies, so each one stays logged in as a different alias.

- Chrome → top-right profile icon → "Add" → make profiles named "VC-Admin", "VC-Vol1", "VC-Vol2"
- Easier alternative: regular browser window for `+admin`, incognito window for `+vol1`. Works for two-persona tests.

### Mobile

You'll do some testing on your phone. Use the **same Gmail aliases** (you can paste them — no need to type the `+` on a tiny keyboard). The site is mobile-responsive and installable as a PWA (Progressive Web App), so you can add it to your home screen like a native app.

---

## Ground Rules

These are firm.

### ✅ DO

- **Use the live site at [volunteercal.com](https://volunteercal.com).**
- **Name your test org `TESTER — [Your Name]`** (e.g., `TESTER — Alex Kim`). This lets Jason find your data quickly.
- **Treat real-world data as real.** Real emails fire from this site. Real SMS fires on paid tiers. Don't put anyone else's contact info in unless you've cleared it with them.
- **Pause and message Jason** at the marked checkpoints (between Phase 3 and Phase 4) so he can upgrade your tier.
- **Take screenshots** when something feels off. Phone screenshot, browser screenshot, anything. They make bug reports 10× more useful.
- **Be honest.** "This was annoying" is feedback. "I gave up here" is gold.

### ❌ DO NOT

- **Do not enter real payment info.** When you reach the Billing tab, **stop and message Jason**. He'll upgrade your tier manually. Even with a test card, going through Stripe is out of scope.
- **Do not delete your test org until Jason confirms it's safe.** He may want to pull data from it first.
- **Do not test from your church's actual data.** This is a sandbox. Don't import your real volunteer roster.
- **Do not share security issues publicly.** If you find anything that looks like an authentication bypass, data leak, or PII exposure, message Jason **privately** (not in any group chat). He'll fix it before broader release.
- **Do not skip the User Guide.** Reading [USER_GUIDE.md](USER_GUIDE.md) once will save you an hour of confusion later.

---

## How the Test Plan Is Structured

Seven phases, designed to flow like a real church's first 6 months with VolunteerCal:

| Phase | Persona | Tier | Time |
|-------|---------|------|------|
| **0** | Curious pastor browsing the site | (no account) | ~20 min |
| **1** | Pastor Sarah setting up her tech ministry | Free | ~60 min |
| **2** | A volunteer Sarah just invited | Free | ~45 min |
| **3** | Sarah handling a real Sunday week | Free | ~45 min |
| **⏸ PAUSE — message Jason: "Ready for Pro tier upgrade"** | | | |
| **4** | Worship director + children's check-in lead | Pro | ~90 min |
| **5** | Facility coordinator booking rooms across campuses | Pro | ~60 min |
| **6** | Returning admin doing day-2 housekeeping | Pro | ~30 min |

Each phase opens with a **scenario** (who you're pretending to be and why), then walks you through specific actions with verification cues.

---

## How to Reach Jason

**Preferred channel:** [Jason will fill in — Slack, Discord, email, etc.]

**Response window:** Jason will reply within [Jason fills in — e.g., "24 hours on weekdays"]. If you're stuck and need to keep moving, skip the blocked step, note it in the feedback form, and continue.

### When messaging Jason about a bug

Include:

1. **Which phase / step** you were on (e.g., "Phase 4, Children's Check-In, kiosk lookup step")
2. **What you did** (the click sequence)
3. **What you expected** to happen
4. **What actually** happened
5. **Screenshot** (always helpful — phone screenshot or browser screenshot)
6. **Browser + device** (e.g., "Chrome 130, MacBook" or "iPhone Safari")

### When messaging Jason for a tier upgrade

Just say: **"Ready for Pro tier upgrade — org name `TESTER — [Your Name]`."**

He'll bump your subscription_tier in the database and reply when it's ready (usually within a few hours).

---

## Getting Help During the Test

You have three sources of help inside the app, in addition to Jason:

1. **In-app Help Center** — sidebar → "Help Center" link. ~30 accordion guides covering everything from "How does auto-draft work?" to "How do I print labels?"
2. **Landing page FAQ** — scroll to the bottom of [volunteercal.com](https://volunteercal.com) for 8 quick answers about the product.
3. **Tooltips** — small `(i)` icons throughout the dashboard expand on terms.

> **A meta-test**: when you use the Help Center, **does the help actually match what you see on screen?** If a help guide references a button that no longer exists, or describes a workflow that's changed, that's a confusion-worthy bug. Note it in the feedback form.

---

## Final Words Before You Begin

Three things to remember:

1. **You are not testing for "completeness."** You're testing for *experience*. If something works but feels weird, that's worth flagging.
2. **The product is supposed to be friendly to non-technical church admins.** When you simulate that user, you'll uncover the most useful feedback. Resist the urge to "figure it out" the way a developer would — instead, ask "would Pastor Sarah figure this out?"
3. **Have fun.** This thing actually works for a real church. You're going to set up a fake one and put it through a year of imagined Sundays in a few hours. That's kind of cool.

When you're ready, head to [USER_GUIDE.md](USER_GUIDE.md) for a 25-minute tour of what VolunteerCal is and what it does. Then open [TEST_PLAN.md](TEST_PLAN.md) and start Phase 0.

Thank you again. Your fresh eyes are about to make this a much better product.

— Jason
