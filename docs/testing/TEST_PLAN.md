# VolunteerCal — Tester Test Plan

_Last updated: 2026-05-15_

> **Before you start:** read [TESTER_WELCOME.md](TESTER_WELCOME.md) and [USER_GUIDE.md](USER_GUIDE.md). Have [FEEDBACK_FORM.md](FEEDBACK_FORM.md) open in another tab — you'll fill in a section after each phase.

---

## How This Plan Works

Seven phases. Each phase has:

1. **Scenario** — who you're pretending to be and why.
2. **Goal** — what this phase is checking for.
3. **Prep** — anything to set up before starting.
4. **Walk-through** — numbered checklists with sub-scenarios. Each line tells you what to do AND what you should see.
5. **Watch-fors** — specific UX questions to answer in the feedback form.
6. **Wrap-up** — pause and fill in the feedback form for this phase.

### Conventions

- ✅ **Green check** — what should happen. If you don't see this, note it in the feedback form.
- ⚠️ **Warning** — known gotcha or thing testers commonly miss.
- 🟢 **Tip** — optional thing that makes life easier.
- 🛑 **STOP** — do not proceed without doing this first.
- `code` — exact text you type or URL you visit.
- _italic_ — name of a button, page, or label inside the app.

### Where to find IDs

When the test plan asks for "your church ID" or "a room ID", you'll find these in the URL bar after navigating to the page. Example: visit a room page and the URL is `https://volunteercal.com/dashboard/rooms/abc123XYZ` — `abc123XYZ` is the room ID.

---

## Phase 0 — The Curious Visitor (no account)

> **Time:** ~20 minutes
> **Tier:** N/A — no account yet

### Scenario

You're a pastor at a 200-person church. A friend mentioned VolunteerCal. You're skeptical of yet-another-SaaS-tool but you've got the next 20 minutes to scope it out before deciding whether to even sign up. **You will not register yet** — just browse like a real prospect.

### Goal

Test the public-facing surface: landing page, pricing, FAQ, legal pages, and graceful error handling for bad URLs. Catch first-impression issues before anyone gets past the home page.

### Prep

- Open [volunteercal.com](https://volunteercal.com) in a regular (not incognito) browser tab on your laptop.
- Have your phone within reach.

### Walk-through

#### 0.1 — Landing page on desktop
- [ ] Visit `https://volunteercal.com`
  - ✅ Hero loads quickly with no layout jumps.
  - ✅ You can scroll through the whole page (hero → pain points → how it works → features → pricing → FAQ → waitlist form → footer) with no broken images or empty sections.
- [ ] Read the hero headline and subheadline. **Does it tell you what the product does in under 10 seconds?**
- [ ] Scroll to the pricing section. Note the four tiers: Free, Starter ($29), Growth ($69), Pro ($119).
- [ ] Open the FAQ at the bottom. Click each of the 8 questions to expand.
  - ✅ Each accordion opens smoothly with the answer visible.
  - ✅ Only one is open at a time (clicking a different one closes the previous).

#### 0.2 — Public pages
- [ ] Click the _Privacy Policy_ link in the footer → `/privacy`. ✅ Loads, readable.
- [ ] Click the _Terms of Service_ link in the footer → `/terms`. ✅ Loads, readable.
- [ ] Use the browser back button → returns to landing.

#### 0.3 — Waitlist form (don't sign up — just submit a placeholder)
- [ ] Scroll to the waitlist / contact form near the bottom.
- [ ] Submit with `you+phase0@gmail.com` and any test message.
  - ✅ Confirmation message shown ("Thanks, we'll be in touch" or similar).
  - ✅ Within a few minutes, an email arrives in your `you@gmail.com` inbox confirming the waitlist signup. (If not, note it.)

#### 0.4 — Bad URLs (graceful error handling)
- [ ] Visit `https://volunteercal.com/dashboard` directly while logged out.
  - ✅ You're redirected to `/login` (not a blank screen or 500 error).
- [ ] Visit `https://volunteercal.com/join/nonexistent`.
  - ✅ A friendly error or "not found" page (not a crash).
- [ ] Visit `https://volunteercal.com/confirm/badtoken`.
  - ✅ A friendly error message (not a crash).
- [ ] Visit `https://volunteercal.com/s/bogus`.
  - ✅ A 404 page.

#### 0.5 — Mobile pass
- [ ] Open `https://volunteercal.com` on your phone.
  - ✅ The hero text is readable without zooming.
  - ✅ Buttons are large enough to tap with your thumb without zooming in.
  - ✅ The pricing cards stack vertically.
- [ ] Tap into the FAQ on mobile and expand 2–3 questions. ✅ Smooth.
- [ ] **PWA install prompt:** if you're on iPhone Safari or Android Chrome, look for a banner suggesting you can "Install" or "Add to Home Screen." It may not appear immediately. (If you don't see it, that's OK — it appears intermittently.)

### Watch-fors

Answer these in the feedback form:

1. **First-impression test:** within 10 seconds of seeing the landing page, what do you think the product does? Were you right after reading more?
2. **Pricing clarity:** do the four tiers feel distinct, or did the differences blur together?
3. **Trust signals:** did anything on the landing page make you doubt the product's professionalism (typos, broken links, off-brand colors, weird copy)?
4. **Mobile readability:** rate the mobile experience 1–5. Specifically: was anything hard to read or tap?

### Wrap-up

🛑 **Pause now and fill in [FEEDBACK_FORM.md](FEEDBACK_FORM.md) → Phase 0 section** before moving on. Even if you have nothing to report, write "no issues" — it tells Jason you completed the phase.

---

## Phase 1 — Pastor Sarah Sets Up Her Tech Ministry

> **Time:** ~60 minutes
> **Tier:** Free

### Scenario

You're Pastor Sarah, the worship and tech pastor at Riverside Community Church. Your previous scheduling solution was "a shared Google Sheet that nobody updates." You signed up for VolunteerCal's Free plan to see if it can handle your two main teams: **Worship Team** and **Tech / A/V**. You have a Sunday 10am service, a small Easter Egg Hunt event coming up, and about 8 volunteers across both teams. You've allotted an hour to get set up.

### Goal

Test the full admin onboarding flow: registration, setup wizard, dashboard orientation, team and service creation, people management, schedule generation, and publication. **This is the most important phase** — every shipped feature for Free-tier admins gets exercised here.

### Prep

- Open Gmail with a filter ready for `to:you+admin@gmail.com` (so you can quickly see admin-related emails).
- Have a notes app open for jotting down your church ID, schedule ID, etc. (you'll see them in URLs).
- Have a sample CSV ready, or use this one:

```csv
name,email,phone
Alex Kim,you+vol1@gmail.com,555-0101
Jordan Reyes,you+vol2@gmail.com,555-0102
Sam Patel,you+vol3@gmail.com,555-0103
Casey Nguyen,you+vol4@gmail.com,
Morgan Lee,you+vol5@gmail.com,555-0105
```

(The phone numbers are fake — don't worry, no SMS will fire on Free tier.)

### Walk-through

#### 1.1 — Register
- [ ] Visit `https://volunteercal.com/register`.
- [ ] Fill in: Full name `Pastor Sarah Tester`, email `you+admin@gmail.com`, phone (your real or Google Voice number, optional), password (min 6 chars), confirm password.
  - ✅ Real-time validation: ✓ when passwords match.
  - ✅ Submit redirects you to the dashboard or setup page.
- [ ] Switch to your `you@gmail.com` Gmail tab.
  - ✅ Welcome email arrived addressed to `you+admin@gmail.com`. The subject and content are friendly, on-brand, and have no broken images.

#### 1.2 — Setup wizard
- [ ] You should land on a setup page (or be redirected after registration).
- [ ] **Step 1 — Org type**: pick `Church`. ✅ Three buttons (Church / Nonprofit / Other) are all clickable.
- [ ] **Step 2 — Org name + timezone**: name it `TESTER — [Your Name]`. Pick your timezone.
- [ ] **Step 3 — Workflow mode**: pick `Centralized`. The other modes (Team-First, Hybrid, Self-Service) should be **disabled with a "Starter+ required" or upgrade hint**. ✅ Disabled state is clear.
- [ ] **Step 4 — Ministry templates**: select 2 templates (e.g., `Worship Team` and `Audio/Visual`). 
  - ⚠️ Free tier limits you to **2 ministries** — try to select a 3rd. ✅ It should block you with a clear message.
  - 🟢 You can rename a template inline before creating (try renaming `Worship Team` to `Worship Band`).
- [ ] Click _Create Church with 2 Ministries_.
  - ✅ Page reloads to dashboard.
  - ✅ Welcome email or org-created confirmation lands in `you+admin` inbox shortly.

#### 1.3 — Dashboard orientation
- [ ] You should land on `/dashboard`.
  - ✅ Greeting: "Welcome, Pastor Sarah Tester" (or similar).
  - ✅ A **Setup Guide** card is visible with 6–7 numbered steps and a progress bar.
  - ✅ The first step (org setup) is checked. Other steps are clickable links to their respective sections.
  - ✅ Stats cards show zeros (0 volunteers, 0 services, etc.).
- [ ] **Watch-for**: does the Setup Guide make sense without explanation? Could you figure out where to go next?

🟢 **Note your church ID**: visit `/dashboard/people` and copy the ID from the URL or the page footer (you'll need it later).

#### 1.4 — Add a campus (with Google Places autocomplete)
- [ ] Click _Settings_ in the sidebar (or visit `/dashboard/org/campuses`).
- [ ] Add a campus named `Main Campus`. In the address field:
  - 🟢 Try typing a real street address and look for Google Places autocomplete dropdown. Select an option to capture lat/lng.
  - ⚠️ If the dropdown doesn't appear, that's OK — note it in the feedback form. (It depends on whether Jason has the Google Maps API key configured.)
- [ ] Save.

#### 1.5 — People: add one person manually
- [ ] Visit `/dashboard/people` (or click _Volunteers_ in sidebar).
- [ ] Click _Add People_ → _Add Person_.
- [ ] Fill in name `Alex Kim`, email `you+vol1@gmail.com`, phone optional. Save.
  - ✅ Alex appears in the roster immediately.
- [ ] Click into Alex's name to open the **Person Detail Drawer**.
  - ✅ Profile, Teams & Roles, Eligibility, Access & Permissions sections all visible.
  - ✅ "Edit" toggle reveals editable fields.
  - 🟢 Try uploading a photo (any image file) — it should upload and show as the avatar.

#### 1.6 — People: CSV import via review queue
- [ ] Click _Add People_ → _Import CSV_.
- [ ] Upload the sample CSV from the prep section (5 people).
  - ✅ Banner appears: "5 people added to review queue" (or similar).
- [ ] Click into the **Review Queue** (banner link or queue button).
  - ✅ See all 5 people with name + email visible.
  - ✅ Try editing one person's role from the queue (e.g., set Sam's role to Scheduler).
  - ✅ Try skipping one (e.g., remove Casey).
  - ✅ Select remaining → click _Approve_ → click _Send Invites_.
  - ✅ A progress indicator shows; success message confirms invites sent.
- [ ] Switch to Gmail. ✅ See invite emails for each `+vol` alias. Subject mentions "TESTER — [Your Name]".

#### 1.7 — Add a public join link (Free tier limitations)
- [ ] On the People page, find the share/join link button (top of page, near header).
- [ ] Copy the join link. Should look like `volunteercal.com/join/[your-church-id]`.
- [ ] Open that link in an **incognito window**.
  - ✅ Page shows your church name and a signup form.
- [ ] Try to submit with a fake new email like `you+selfreg@gmail.com`. This person should land in your invites/queue.
  - ✅ Welcome-to-org email arrives.
  - ✅ Back in the admin tab, the new person shows up under **Invites tab → Pending Approval**.
- [ ] Approve them. ✅ Approval email fires.
- [ ] Try the **Short Links** feature: visit `/dashboard/short-links` (or click in sidebar).
  - ✅ On Free tier, you should see a **tier gate / upgrade prompt** (Free has 0 short links).

#### 1.8 — Create a service
- [ ] Visit `/dashboard/services-events` → _Services_ tab → _Add Service_.
- [ ] Set: name `Sunday 10am Service`, day of week `Sunday`, start `10:00 AM`, end `11:30 AM`, recurrence `weekly`.
  - 🟢 Optionally test the multi-ministry option — assign roles for both ministries.
- [ ] Add roles: 
  - For Worship Band: `Lead Vocalist` × 1, `Guitar` × 1, `Drums` × 1
  - ⚠️ Free tier caps at **3 roles per service** — try adding a 4th, it should block.
  - For A/V: also add roles (you'll have to choose which ministry's roles you're configuring).
- [ ] Save the service. ✅ Appears in the list with the next service date shown.
- [ ] **Roster button test**: click the _Roster & Attendance_ button on the service card.
  - ✅ Roster modal opens for the next upcoming service date (no assignments yet — empty state).
  - ✅ The Attendance tab is visible and accessible (not gated to past services).

#### 1.9 — Create a one-time event
- [ ] Same page, _Events_ tab → _Add Event_.
- [ ] Name `Easter Saturday Egg Hunt`, date 2 weeks from today, visibility `Public`, signup mode `Open`.
- [ ] Add roles: `Coordinator` × 1, `Helper` × 4. ⚠️ Free tier caps at **2 roles per event** — try a 3rd, it should block.
- [ ] Save. ✅ Event appears.
- [ ] Open in incognito: visit the public signup URL (copy from the event card share menu).
  - ✅ Public signup page loads with role options.
  - ✅ Submit a fake signup with a different alias (e.g., `you+egghuntvol@gmail.com`).
  - ✅ Confirmation email arrives.

#### 1.10 — Generate and publish a schedule
- [ ] Visit `/dashboard/schedules` → _Create Schedule_.
- [ ] Walk through the wizard:
  - **Step 1**: workflow mode = Centralized (only option on Free).
  - **Step 2**: pick a date range (next 4 weeks).
  - **Step 3**: review summary → _Generate_.
- [ ] Wait for draft to generate. ✅ Schedule matrix appears with services as rows/columns and volunteer names in cells.
  - ⚠️ With only Alex assigned to a team, most slots will be empty. That's fine — it's testing the empty/partial state.
  - 🟢 Filter by ministry to test the filter UI.
  - ⚠️ Look for a "conflicts panel" if any conflicts exist (overbooking, missing prereqs, etc.). Note any UI confusion.
- [ ] Click _Submit for Review_. ✅ Status changes to `In Review`.
- [ ] Click _Approve_. ✅ Status changes to `Approved`.
- [ ] Click _Publish_. ✅ Confirmation emails fire to assigned volunteers.
- [ ] Switch to Gmail. ✅ Schedule confirmation emails for each assigned `+vol` alias.

#### 1.11 — Personal calendar feed
- [ ] Visit `/dashboard/account` → _Calendar Feeds_ section.
- [ ] Click _Create Feed_ → choose `Personal`. ✅ A unique iCal URL appears.
- [ ] Copy the URL.
- [ ] In Google Calendar (or Apple Calendar): _Add by URL_ → paste → save.
  - ✅ Within a few minutes, your assignments appear as calendar events.
  - 🟢 If you have no assignments yet, the calendar will be empty — that's fine. Just verify the URL works (no errors when subscribed).

#### 1.12 — Help Center sanity check
- [ ] Click _Help Center_ in the sidebar (or visit `/dashboard/help`).
- [ ] Open the **Getting Started** section. Read 1–2 of the guides.
- [ ] **Watch-for**: does the help guide accurately describe what you just did? If a button is named differently or a screen is described differently, note it.

### Watch-fors

1. **Setup guide clarity**: Did the dashboard setup guide make sense without help? Could you figure out the right next step at every point?
2. **Free tier gates**: Were the Free tier limits (2 ministries, 3 roles per service, 2 roles per event, 0 short links) communicated clearly when you hit them? Did the upgrade prompt feel pushy or appropriate?
3. **Email quality**: Open the welcome, invite, approval, and schedule confirmation emails. Do they look professional? On-brand? Are any links broken?
4. **Person Detail Drawer**: Is the layout intuitive? Did you understand the difference between Profile, Teams & Roles, Eligibility, and Access & Permissions sections?
5. **Schedule matrix**: When you saw the matrix view, did it feel scannable, or overwhelming? What would you change?

### Wrap-up

🛑 **Pause now and fill in [FEEDBACK_FORM.md](FEEDBACK_FORM.md) → Phase 1 section.**

---

## Phase 2 — A Volunteer Joins (Free tier, mobile-friendly)

> **Time:** ~45 minutes
> **Tier:** Free

### Scenario

You're Alex Kim — Pastor Sarah just invited you to join her Worship Band. You're a part-time bank teller, you're in your 30s, you have an iPhone, and you're vaguely overwhelmed by all the apps in your life. You're going to accept her invite, set your availability for the next month (you have your kid's soccer tournament one weekend, and you can't serve more than twice a month), and confirm an upcoming assignment. You want this to be **fast** and **invisible** — sign in once, see what's needed of you, get on with your day.

### Goal

Test the full volunteer experience end-to-end: invite acceptance, dashboard reveal, My Schedule, confirmation flow, My Availability self-service, Inbox, calendar feed, and mobile/PWA experience. Catch anything that would frustrate a non-technical volunteer.

### Prep

- Sign out of `you+admin` in your main browser (or use a separate browser profile / incognito).
- Open Gmail and search `to:you+vol1@gmail.com` to find Alex Kim's invite.
- Have your phone ready — at least half of this phase is mobile-focused.

### Walk-through

#### 2.1 — Accept the invite
- [ ] In Gmail, open the invite email for Alex Kim. Click the accept link.
- [ ] You'll land at `/invites/[id]`.
  - ✅ Page shows the church name (`TESTER — [Your Name]`).
  - ✅ If not signed in, prompted to sign up or sign in.
- [ ] Click _Accept_ → if not registered, fill in name `Alex Kim`, password, etc. → submit.
  - ✅ Land on volunteer dashboard.

#### 2.2 — Volunteer-only nav
- [ ] Look at the sidebar (desktop) or bottom tab bar (mobile).
  - ✅ Volunteer sees: My Schedule, Inbox, My Availability, Account. **Not** Schedules, People, Services & Events, Settings.
  - ⚠️ If you see admin-only nav items as a volunteer, **that's a permission bug** — flag it.

#### 2.3 — My Schedule
- [ ] Visit `/dashboard/my-schedule`.
- [ ] Three tabs: Upcoming, Past, Team View. Click each.
- [ ] On Upcoming: find your assignment from the schedule Sarah published.
  - ✅ Card shows: date, service name, role, time. Confirm/Decline/Can't Make It buttons visible.
- [ ] Click _Confirm_ on one assignment.
  - ✅ Status updates to "Confirmed" with a green check.
  - 🟢 Optimistic update — the UI should respond instantly.

#### 2.4 — Confirmation via email link (separate flow)
- [ ] Open the schedule confirmation email for Alex Kim in Gmail.
- [ ] Click the unique confirmation link (different from confirming inside the app).
  - ✅ Page loads showing the assignment.
  - ✅ Click _I'll Be There!_ → success message.
  - ⚠️ If you already confirmed inside the app, you should see "Already Responded" — verify this is graceful (not an error).

#### 2.5 — Decline another assignment via email link (test second `+vol` alias)
- [ ] Open the schedule confirmation email for Jordan Reyes (`+vol2`) in Gmail.
- [ ] Click the link, click _Decline_.
  - ✅ Status updates. Decline reason field optional.
- [ ] Switch back to admin (`+admin`) tab. Visit dashboard or scheduling dashboard.
  - ✅ Stats reflect the new confirm/decline state.

#### 2.6 — My Availability
- [ ] As Alex, visit `/dashboard/my-availability`.
- [ ] **Recurring unavailable days**: toggle one or more day-of-week chips (e.g., "Wednesday"). These are days you're never available to serve.
  - ✅ Chip changes color when active; saves on click.
- [ ] **Preferred frequency**: set how often you'd like to serve (in "weeks between assignments" — lower = more often).
- [ ] **Max roles per month**: set a cap (e.g., 2) so the scheduler doesn't over-book you.
- [ ] **Preferred weeks**: tap "1st" and "3rd" — you'll only be considered for those weeks of the month. Leave empty for no preference.
- [ ] **Notes for your scheduler** (new): type "Prefer morning services" in the optional text area. Counter updates as you type, max 500 chars.
- [ ] **Unavailable dates**: pick a future date (e.g., next Saturday) and click _Add Date_. Try a date range by adding consecutive days.
  - ✅ Date appears in the list with a remove button.
- [ ] Click _Save_ (or watch the auto-save indicator).
  - ✅ "Saved" toast appears.
  - ✅ Refresh the page — all settings persist exactly as you set them.

#### 2.7 — Inbox
- [ ] Visit `/dashboard/inbox`.
  - ✅ See notifications populated: "New schedule assignment", possibly "Welcome to TESTER — [Your Name]", etc.
  - ✅ Notifications are **grouped by date** (Today / Yesterday / Earlier).
  - ✅ Each has an icon and color matching its type.
- [ ] Click on a notification.
  - ✅ Marked as read (visually faded or check mark).
  - ✅ Click navigates you to the related page (e.g., a schedule notification opens the schedule).
- [ ] Click _Mark all read_ if available. ✅ Unread badge clears.
- [ ] **Watch-for**: the unread count badge — does it appear in the sidebar / bottom nav next to "Inbox"? Does it update in real time when a new notification fires?

#### 2.8 — Calendar feed (volunteer's own)
- [ ] Visit `/dashboard/account` → _Calendar Feeds_.
- [ ] Create a personal feed → copy the iCal URL → add to your phone calendar (or laptop).
  - ✅ Your assignments appear as calendar events with the right date/time/role.

#### 2.9 — Mobile pass — open VolunteerCal on your phone
- [ ] On your phone, sign in as Alex Kim (`you+vol1@gmail.com`).
- [ ] Verify the **bottom tab bar** appears at the bottom of the screen.
  - ✅ Tabs visible: Schedule, Availability, Inbox, Account (volunteer set).
  - ✅ Tap each — navigation works smoothly.
- [ ] Tap _Inbox_ → ✅ unread badge visible if any unread.
- [ ] Tap _Account_ → ✅ profile, calendar feeds, password options visible.
- [ ] **PWA install**: in iOS Safari, tap Share → "Add to Home Screen". In Android Chrome, tap menu → "Install app".
  - ✅ Installs as an icon on your home screen.
  - ✅ Tapping the icon launches the app (no browser chrome).

#### 2.10 — Offline page
- [ ] In your laptop browser, open DevTools → Network tab → toggle "Offline".
- [ ] Refresh `/dashboard/my-schedule`.
  - ✅ A friendly offline page loads (not a browser error).
- [ ] Turn offline back off, refresh — back to normal.

### Watch-fors

1. **First moment of "this works for me"**: What was the first action that made you feel like the app was actually serving you, not just being administered to you?
2. **Confusing labels**: Were any nav items, buttons, or terms unclear from a volunteer's perspective? (E.g., "My Journey" — did you know what that was?)
3. **Mobile parity**: Did anything on mobile feel cut off, slow, or visibly broken compared to desktop?
4. **Inbox value**: Did the in-app Inbox feel useful, or redundant with email?
5. **Calendar feed value**: Did adding the iCal feed to your calendar feel worth the friction?

### Wrap-up

🛑 **Fill in [FEEDBACK_FORM.md](FEEDBACK_FORM.md) → Phase 2 section.**

---

## Phase 3 — Sarah Handles a Real Sunday Week (Free tier)

> **Time:** ~45 minutes
> **Tier:** Free

### Scenario

It's Wednesday. Pastor Sarah has a service this Sunday. She wants to: (1) generate QR codes so volunteers can self-check-in, (2) handle a last-minute "Can't Make It" from one volunteer, (3) facilitate a shift swap, (4) mark attendance after the service, (5) glance at the volunteer health dashboard to see if anyone's burning out, and (6) promote one volunteer (Sam Patel) to Scheduler so they can help build next month's schedule. She's juggling between her phone and her laptop the whole time.

### Goal

Test the operational features Sarah uses week-to-week: QR check-in, smart check-in banner, "Can't Make It" → absence alert, shift swap, attendance tracking, volunteer health, role promotion, account changes, and the sole-admin deletion guard.

### Prep

- Sign back in as `you+admin@gmail.com` in your main browser.
- Have at least one upcoming assignment for Alex Kim (`+vol1`) and one for Jordan Reyes (`+vol2`) — if not, generate another short schedule first.
- Have your phone available.

### Walk-through

#### 3.1 — Generate a QR check-in code
- [ ] Visit `/dashboard/scheduling-dashboard`.
- [ ] Find an upcoming service. Click the QR / check-in icon on it.
  - ✅ Modal opens showing a QR code and a check-in URL like `volunteercal.com/check-in/[code]`.
- [ ] Copy the URL.

#### 3.2 — Self-check-in (logged in volunteer)
- [ ] In another browser tab (or your phone), sign in as Alex Kim.
- [ ] Visit the check-in URL you copied.
  - ✅ Page shows your name and the service date.
  - ✅ _Check In Now_ button visible.
- [ ] Click _Check In Now_.
  - ✅ Success message with name and date.
  - ✅ A 5-second countdown appears that auto-redirects to My Schedule.
  - ✅ "View My Schedule" link works as immediate navigation.
- [ ] Test invalid code: visit `volunteercal.com/check-in/badcode`.
  - ✅ Friendly error (not a crash).
- [ ] Test logged out: sign out, visit a valid check-in URL.
  - ✅ "Sign In" button shown that redirects back to check-in page after login.

#### 3.3 — Smart check-in banner (time-aware)
- [ ] As admin, visit `/dashboard/org/check-ins` (or wherever check-in settings live).
- [ ] Verify "Smart Check-In" or "Self Check-In" toggle is enabled. Set window to 30 min before / 30 min after.
- [ ] Create or modify an assignment so its service starts within the next 30 minutes (you may need to use Firestore Console or temporarily edit the service time — if too complex, **skip this and note it**).
- [ ] As Alex Kim, refresh the dashboard. ✅ A coral "Smart Check-In" banner appears with the service name and time.
- [ ] Click _Check In_ on the banner. ✅ Success.
- [ ] Click _Not now_ on a different banner. ✅ Banner hides; refresh — should remain hidden for that assignment.

#### 3.4 — "Can't Make It" → absence alert
- [ ] As Alex Kim, visit My Schedule.
- [ ] On an upcoming confirmed assignment, click _Can't Make It_.
  - ✅ Modal opens with optional note field.
- [ ] Add note: "Down with the flu, sorry!" → submit.
  - ✅ Assignment marked. Toast confirms.
- [ ] Switch to admin Gmail tab. ✅ Absence alert email arrives addressed to `you+admin@gmail.com` with Alex's note.
- [ ] **SMS check**: on Free tier, no SMS should fire. ✅ No text on your Google Voice.

#### 3.5 — Shift swap (Starter+ — skipped on Free)
> Shift swap is a Starter+ feature per the tier matrix in [USER_GUIDE.md](USER_GUIDE.md). On Free you'll **not** see a Request Swap option — that's expected. Verify the absence (no swap surface on confirmed assignments and no swap action in the Can't Make It flow) and move on. The full swap exercise happens in Phase 4 after Jason upgrades you to Pro.

#### 3.6 — Attendance tracking
- [ ] As admin, visit a service roster (Services & Events → click _Roster & Attendance_ on a past or current service).
- [ ] Switch to the **Attendance** tab.
- [ ] Toggle each volunteer through the four states: Present (green ✓), No-Show (red ✗), Excused (yellow), Not Marked (clear).
  - ✅ State change persists.
  - 🟢 Try _Mark all present_ button. ✅ Toggles everyone at once.
- [ ] **Future date attendance check**: open a roster for a service date in the future. ✅ Attendance tab is accessible (not gated).

#### 3.7 — Volunteer Health dashboard
- [ ] Visit `/dashboard/volunteer-health` (or _Team Health_ in sidebar).
- [ ] Review the dashboard.
  - ✅ Stats row shows distribution: healthy / at-risk / declining / inactive / no-show.
  - ✅ At-risk volunteers shown with reasons.
  - 🟢 Click the email icon on a volunteer row. ✅ Opens `mailto:` with pre-filled subject.
- [ ] **Watch-for**: do the categories make sense? Are the thresholds for "at-risk" vs "declining" intuitive, or do you have to guess?

#### 3.8 — Promote volunteer to Scheduler
- [ ] Visit `/dashboard/people`.
- [ ] Click into Sam Patel (`+vol3`) → expand Access & Permissions.
- [ ] Change role to `Scheduler` → optionally restrict scope to "Worship Band".
  - ✅ Confirmation prompt for promotion (admin promotion uses a confirm dialog).
  - ✅ Save → Sam now shows as Scheduler with team chips.
- [ ] Switch to `+vol3` Gmail tab. ✅ Role promotion email arrives.

#### 3.9 — Profile change → propagation
- [ ] Visit `/dashboard/account`.
- [ ] Change your display name from `Pastor Sarah Tester` to `Sarah Pastor Tester`. Save.
- [ ] Visit `/dashboard/people`. ✅ Your row reflects the new name.
- [ ] If you've created a 2nd org (you haven't yet — but later in Phase 6 you will), the change should propagate there too.

#### 3.10 — Sole-admin deletion guard
- [ ] Visit `/dashboard/account` → _Danger Zone_ → _Delete Account_.
  - ⚠️ **Do not actually delete**. Just go through the flow to see the warnings.
- [ ] You should see a warning: "You're the only admin of [TESTER — Your Name]" with options:
  - "Promote someone first" (links to People page).
  - "Delete everything" (cascades the org).
- [ ] Click _Promote someone first_. ✅ Navigated to People page.
- [ ] **Do not click _Delete everything_** — Jason needs your data. Cancel out.

### Watch-fors

1. **QR check-in friction**: was the QR flow obvious for both admin (generating) and volunteer (using)? What would you change?
2. **Smart banner relevance**: did the smart check-in banner feel useful or annoying?
3. **Swap workflow**: did the shift swap involve too many steps? Was it clear who was responsible at each stage?
4. **Volunteer health classification**: did the categories (at-risk, declining, etc.) match your gut sense of "this person needs a check-in"?
5. **Account deletion warning**: was the sole-admin guard reassuring or scary?

### Wrap-up

🛑 **Fill in [FEEDBACK_FORM.md](FEEDBACK_FORM.md) → Phase 3 section.**

---

## ⏸ PAUSE — Request Pro Tier Upgrade

You've completed all Free tier testing. Before continuing:

🛑 **Message Jason now**: 

> "Phases 0–3 complete. Org name `TESTER — [Your Name]`. Ready for Pro tier upgrade so I can test paid features."

Wait for confirmation. He'll bump your subscription_tier to `pro` in the database. **Do not enter payment info — Jason handles this manually.**

When Jason confirms, refresh your dashboard. ✅ The sidebar should now show new sections: **Worship**, **Children's Check-In**, and **Rooms**.

Now continue to Phase 4.

---

## Phase 4 — Worship Director + Children's Check-In Lead (Pro tier)

> **Time:** ~90 minutes
> **Tier:** Pro

### Scenario

You're now wearing two hats. As **worship director**, you're building this Sunday's set list, including a song you haven't done before. You'll publish the service plan, fire up Stage Sync on your iPad to lead the band through it. Then as **children's ministry lead**, you're setting up the kids' check-in for the first time: registering some test families, generating QR codes, and walking through a kiosk check-in as if you were a parent.

### Goal

Test two complete feature suites: the Worship module (Songs → Service Plans → Stage Sync → Reports) and Children's Check-In (Settings → Households → Kiosk → Guardian Portal → Teacher Room → Reports).

### Prep

- Two browser windows open (you'll need both for Stage Sync and for kiosk testing).
- Optional: a sample PDF chord chart (any worship-style PDF) and a sample SongSelect file (`.txt` or ChordPro) — if you have access to songselect.ccli.com, download a song's ChordPro file.
- A second device or browser for the kiosk test (e.g., your phone in incognito mode).

### Walk-through

#### 4.1 — Worship: Songs library
- [ ] Visit `/dashboard/worship/songs` (or click _Worship → Songs_ in sidebar).
- [ ] Click _Add Song_. Fill in:
  - Title: `Amazing Grace`
  - CCLI #: `22025`
  - Default key: `G`
  - Tags: `hymn`, `traditional`
- [ ] Save. ✅ Song appears in library.
- [ ] Click into the song. Navigate to Arrangements (if available). Try adding a chord chart manually.
- [ ] **Try SongSelect import** (if you have a file): Click _Import Songs_ → drag & drop a `.txt` or ChordPro file.
  - ✅ Song is parsed and previewed with title, key, CCLI #.
  - ✅ Click _Import_ → song added to library.
  - ⚠️ **Duplicate detection**: try importing the same file twice. ✅ Second time, message says "already in your library."
- [ ] **Try PDF chord chart upload** (if you have one): same _Import Songs_ → upload PDF.
  - ✅ PDF is sent to Claude Vision for parsing. May take 30-60 seconds.
  - ✅ Song is created with chord chart sections.
- [ ] Edit a song. ✅ Changes save.
- [ ] Archive a song. ✅ Moves to Archived tab. Restore. ✅ Returns to active.

#### 4.2 — Worship: Service Plan
- [ ] Visit `/dashboard/worship/plans` → _New Plan_.
- [ ] Pick the upcoming Sunday 10am service date.
- [ ] Add a theme (optional): "Easter Lead-Up Week 2".
- [ ] Build the plan:
  - Add a header item: `OPENING`.
  - Add `Amazing Grace` as a song. ✅ Inline form lets you set a key override (e.g., A instead of G).
  - Add a prayer item.
  - Add a header: `MESSAGE`.
  - Add a sermon item with title.
  - Add a header: `RESPONSE`.
  - Add another song.
  - Add an announcement.
  - Reorder items by dragging. ✅ Sequence numbers update.
  - Add an inline note to one item.
- [ ] Click _Publish_.
  - ✅ Plan is locked / marked published.
  - ✅ Song usage records are created (you can verify by visiting reports later).

#### 4.3 — Worship: Stage Sync
- [ ] On the published plan, click _Start Stage Sync_.
  - ✅ Share modal appears with a QR code and a participant URL.
- [ ] Open the participant URL in a **second browser window** (or scan the QR with your phone).
  - ✅ Participant view shows the current item in large format.
- [ ] In the conductor (first window):
  - Click _Next_ to advance. ✅ Participant view updates within a second.
  - Use keyboard shortcuts: `Space` and `→` advance, `←` goes back. ✅ Both work.
- [ ] In the participant window: disconnect your laptop's WiFi briefly (~5 seconds), then reconnect. ✅ View resumes at the current item.
- [ ] **Watch-for**: any noticeable lag in the real-time sync? Any stale state after reconnect?

#### 4.4 — Worship: Reports
- [ ] Visit `/dashboard/worship/reports`.
- [ ] Pick a date range (last 30 days).
  - ✅ Table shows songs with use counts.
  - ✅ At least the song(s) you used in the published plan should appear with count = 1.
- [ ] Click _Export CSV_. ✅ File downloads with title, CCLI #, use count, last-used date.
- [ ] Visit a published plan. Click _Export for ProPresenter_. ✅ JSON file downloads.

#### 4.5 — Check-In: Settings
- [ ] Visit `/dashboard/org/check-ins` (or via Settings).
- [ ] Enable check-in. Set service times (e.g., Sunday 9:30am, 11:00am).
- [ ] Set check-in window (open 30 min before, close 30 min after).
- [ ] Save.

#### 4.6 — Check-In: Rooms (mark some rooms as check-in rooms)
- [ ] Visit `/dashboard/checkin/rooms` (or wherever check-in room assignments are).
- [ ] Mark at least one room as a check-in room. Set grade range (e.g., K-2). Set capacity (e.g., 12).
  - 🟢 If you don't have rooms yet, you may need to create one first via Rooms section.

#### 4.7 — Check-In: Households
- [ ] Visit `/dashboard/checkin/households` → _Add Household_.
- [ ] Create a household:
  - Name: `Kim Family`
  - Guardian: `Alex Kim`, `you+guardian@gmail.com`, your Google Voice number for SMS testing.
  - Add 2 children: `Mia Kim` (age 5, allergies: peanuts), `Noah Kim` (age 8, no allergies).
  - Add a custodial note: "Mom or Dad only — no grandparents.";
- [ ] Save.
  - ✅ Household appears in list.
- [ ] Click into the household. ✅ Detail view shows guardians, children, and a QR code.
- [ ] Click _Generate / View QR_. ✅ QR code displays. Try printing or screenshot.

#### 4.8 — Check-In: Kiosk flow
- [ ] On a **second device** (phone in incognito, tablet, or another laptop), visit `https://volunteercal.com/checkin?church_id=[your-church-id]`.
  - ⚠️ You may need to find the kiosk URL via your dashboard — look for "Kiosk Mode" or "Open Kiosk."
- [ ] **Family lookup screen**: try the phone keypad. Enter the last 4 digits of your guardian phone number.
  - ✅ Match found → moves to family selection.
  - 🟢 You can also try the QR scan button (use the QR you generated in step 4.7).
- [ ] **Child selection**: select Mia and Noah → confirm.
- [ ] **Allergy confirmation**: see Mia's peanut allergy listed. Acknowledge with a tap.
- [ ] **Success screen**: see a security code displayed.
  - ✅ Label payload generated (visible in the network tab if you peek, or in admin reports). If you have a printer set up, label prints; otherwise, just verify the payload exists.
- [ ] **First-time visitor flow**: from the family lookup screen, tap _New Family_ or similar.
  - ✅ Self-registration form appears (parent name, phone, kids, etc.).
  - ✅ Submit a fake new family. Confirm they show up in the household list.

#### 4.9 — Check-In: Guardian Portal
- [ ] As an admin, generate a guardian portal link/SMS for the Kim Family. (Look for "Send QR" or "Send Portal Link" — should be on the household detail page.)
  - ✅ SMS arrives at your Google Voice (Pro tier supports guardian SMS).
- [ ] Click the SMS link → land on `/guardian` portal.
  - ✅ Page shows household info, kids list, recent check-in history, fresh QR code.
  - ✅ No login required (token-authenticated).
- [ ] Try editing the guardian phone number from the portal. ✅ Update saves.

#### 4.10 — Check-In: Teacher Room View
- [ ] As admin, find the room URL with token (look for "Teacher View" link on the room detail page).
- [ ] Open in another tab.
  - ✅ Page shows live list of children currently checked into the room.
  - ✅ Page auto-refreshes every 5 seconds.
  - ✅ Late arrivals (after service start) are visually flagged.

#### 4.11 — Check-In: Reports
- [ ] Visit `/dashboard/checkin/reports`.
- [ ] View today's daily attendance report. ✅ Shows the children you checked in.
- [ ] Try the room report and trends views.
- [ ] Click _Export CSV_. ✅ File downloads.
- [ ] **Breeze CSV import** (optional): visit `/dashboard/checkin/import`. Upload a sample Breeze CSV (any CSV with the right columns).
  - ✅ Preview screen shows parsed households + grade mapping.
  - 🟢 Skip the actual import unless you have a real Breeze export.

### Watch-fors

1. **Worship workflow speed**: a worship director needs to build a service plan in under 15 minutes. Could you do that here without referencing help?
2. **Stage Sync polish**: does it feel ready to use during a live service? What would make you nervous?
3. **Kiosk discoverability**: was it obvious how to launch the kiosk from the admin dashboard?
4. **Kiosk parent experience**: pretend you're a sleep-deprived parent. Was the kiosk fast and clear, or slow and confusing?
5. **Guardian portal**: did the no-login token approach feel safe, or sketchy?
6. **Teacher room view**: useful for a kids' ministry leader, or noisy?

### Wrap-up

🛑 **Fill in [FEEDBACK_FORM.md](FEEDBACK_FORM.md) → Phase 4 section.**

---

## Phase 5 — Facility Coordinator (Pro tier)

> **Time:** ~60 minutes
> **Tier:** Pro

### Scenario

You're now Pat the Facility Coordinator. The church has three rooms (Sanctuary, Fellowship Hall, Classroom 1). Beyond Sunday services, the building hosts a Wednesday small group, a monthly community meal, and an outside school that rents the Fellowship Hall on weekday afternoons. You need to: set up the rooms, book recurring Wednesday small groups, configure approval-required for the Fellowship Hall, walk through the booking-conflict flow, set up a wall-mounted display outside the Sanctuary, and link with the school's org via Shared Facility Groups so everyone sees each other's reservations.

### Goal

Test the Rooms & Reservations system end-to-end, plus the Pro-tier advanced workflow features (Multi-Stage Approval, all Workflow Modes, Availability Campaigns, Trainee Assignments).

### Prep

- A second browser window or device for testing the room display.
- A second Gmail alias (`you+facility@gmail.com`) ready to register a second org for shared facility testing.

### Walk-through

#### 5.1 — Rooms: Settings
- [ ] Visit `/dashboard/rooms/settings`.
- [ ] Add some equipment tags: `Projector`, `Sound system`, `Whiteboard`, `Tables`.
- [ ] Toggle "Public calendar" on (Pro tier). Generate the public calendar token.
- [ ] Save.

#### 5.2 — Rooms: Create rooms
- [ ] Visit `/dashboard/rooms` → _New Room_.
- [ ] Create 3 rooms:
  - `Sanctuary` (capacity 200, equipment: Projector + Sound system)
  - `Fellowship Hall` (capacity 80, equipment: Tables + Sound system, **require approval** = on)
  - `Classroom 1` (capacity 15, equipment: Whiteboard + Tables)
- [ ] Each room appears in the grid with equipment badges.

#### 5.3 — Rooms: Book a recurring small group
- [ ] Click into Classroom 1 → _New Reservation_ (or use the booking wizard from main rooms page).
- [ ] Walk through the 5-step wizard:
  - **Step 1**: confirm Classroom 1.
  - **Step 2**: date/time. Pick next Wednesday 7pm-9pm.
  - **Step 3**: details — title `Wednesday Bible Study`, organizer your name, select equipment.
  - **Step 4**: recurrence — `Weekly, every Wednesday for 12 weeks`.
  - **Step 5**: review → submit.
- [ ] ✅ Reservation appears on the calendar. 12 occurrences materialized.
- [ ] Edit one occurrence (e.g., week 5). Choose **"This only"** scope. Change the time. ✅ Other weeks unaffected.
- [ ] Edit again, this time choose **"From this date forward"**. Change the time. ✅ Weeks 6-12 update.
- [ ] Cancel one occurrence. ✅ That week disappears, others remain.

#### 5.4 — Rooms: Conflict detection
- [ ] Try to book a second event in Classroom 1 that overlaps with one of the recurring small group times.
  - ✅ Conflict modal appears showing the overlap.
  - ✅ Cannot proceed unless you adjust time or override (depending on settings).

#### 5.5 — Rooms: Approval queue (for Fellowship Hall)
- [ ] As a non-admin user (sign in as a volunteer in another browser), submit a request for Fellowship Hall.
  - ⚠️ This requires the volunteer to have permission to request — may need an admin to grant first. If too complex, use admin for the request.
- [ ] As admin, visit `/dashboard/rooms/requests`. ✅ Pending request appears in queue.
- [ ] Click _Approve_. ✅ Request approved. SMS notification fires to requester (if SMS enabled).
- [ ] Try denying another. ✅ Denial fires notification.

#### 5.6 — Rooms: Display signage
- [ ] Find a room URL like `/display/room/[roomId]`. (Look for "Display URL" or "Wall Display" in the room settings or detail page.)
- [ ] Open in a second tab or device.
  - ✅ Full-screen view shows current status: Available (green), In Use (red), or Starting Soon (amber).
  - ✅ The screen stays on (wake-lock indicator).
  - ✅ Updates within 30 seconds when you change a reservation in admin.

#### 5.7 — Rooms: Public calendar
- [ ] Visit `/calendar/public?token=[your-token]` (URL from Settings step 5.1).
  - ✅ All reservations visible.
  - ✅ Add `&embed=true` → header/nav stripped, ready for iframe embedding.

#### 5.8 — Rooms: iCal feeds
- [ ] In room detail, find iCal feed URLs (per-room, church-wide, per-ministry).
- [ ] Add per-room URL to your calendar app. ✅ Reservations appear as events.

#### 5.9 — Shared Facility Groups
- [ ] **Create a 2nd org**: open an incognito window. Register with `you+facility@gmail.com`. Create a small org named `TESTER FACILITY — [Your Name]`.
- [ ] Back in your main admin window, visit Settings → Campuses (or wherever Shared Facility section lives).
- [ ] Click _Create Facility Group_ → name it `Riverside Building`.
- [ ] Send an invite to the 2nd org by entering its admin email (`you+facility@gmail.com`).
- [ ] Switch to `+facility` tab. ✅ Invitation email arrived.
- [ ] Accept the invite from the 2nd org's admin view.
- [ ] Back in main org: ✅ 2nd org appears as a member of the facility group.
- [ ] Test cross-org visibility: from the 2nd org's room calendar, ✅ you should see the main org's reservations (and vice versa).

#### 5.10 — Multi-Stage Approval (Pro tier)
- [ ] Generate a new schedule via the wizard.
- [ ] Click _Submit for Review_. ✅ Status changes to `In Review`.
- [ ] You should see a per-ministry approval grid showing each ministry as pending.
- [ ] As an admin, approve each ministry's section.
  - 🟢 Test the cross-team coordination modal — click _Coordinate with other teams_ to see shared volunteers.
- [ ] When all approved, click _Publish Now_. ✅ Confirmation emails fire.

#### 5.11 — All workflow modes
- [ ] Visit `/dashboard/schedules` → _New Schedule_.
- [ ] In step 1, you should now see all 4 workflow modes enabled: Centralized, Team-First, Hybrid, Self-Service.
- [ ] Try **Team-First**: pick a scope of "Worship Band only" → generate. ✅ Schedule limited to that team.
- [ ] Cancel out and try **Hybrid**: ✅ Master schedule with per-ministry edit sections.
- [ ] (Optional) Try **Self-Service**: ✅ Open slots that volunteers can claim.

#### 5.12 — Availability Campaign
- [ ] On a draft schedule, click _Send Availability Request_.
- [ ] ✅ Email goes to all active volunteers.
- [ ] Switch to a volunteer (e.g., Alex). ✅ A campaign banner appears on their dashboard with "Submit Availability" CTA.
- [ ] As volunteer, click through to update availability. Save.
- [ ] As volunteer, dismiss the banner. ✅ Stays dismissed.

#### 5.13 — Trainee Assignment
- [ ] Open a schedule's matrix view.
- [ ] Edit an assignment → change type to `Trainee`.
- [ ] ✅ Visual indicators appear: dashed border in roster, "Shadowing" badge, "(shadow)" label in matrix and compare view.
- [ ] ✅ Slot count excludes the trainee (e.g., role still shows "1 of 2 filled" if regular + trainee).
- [ ] Switch back to `Regular`. ✅ Indicators clear, slot count includes them again.

### Watch-fors

1. **Booking wizard pace**: did the 5-step booking wizard feel right, or were there too many steps?
2. **Conflict detection clarity**: when you hit a conflict, did the modal explain the problem clearly?
3. **Display signage usefulness**: would you actually mount this outside a room? What would stop you?
4. **Shared facility complexity**: was the cross-org invite flow obvious or convoluted?
5. **Multi-stage approval**: did the per-ministry approval gates add helpful structure or unnecessary friction?

### Wrap-up

🛑 **Fill in [FEEDBACK_FORM.md](FEEDBACK_FORM.md) → Phase 5 section.**

---

## Phase 6 — Day-2 Housekeeping (Pro tier)

> **Time:** ~30 minutes
> **Tier:** Pro

### Scenario

It's a few weeks later. Sarah is doing her monthly housekeeping: archiving a volunteer who moved away, restoring another who came back, setting up a background-check prerequisite for the children's ministry, scheduling a training session for new helpers, and verifying a few edge cases in the system. Then she wraps up testing and reports back to Jason.

### Goal

Test the long-tail features: multi-org switching, profile sync across orgs, volunteer archiving, prerequisites, training sessions, and edge cases (404s, expired tokens, rate limiting).

### Walk-through

#### 6.1 — Multi-org switching
- [ ] Visit `/dashboard/my-orgs`.
  - ✅ Both orgs appear (`TESTER — [Your Name]` and `TESTER FACILITY — [Your Name]`).
- [ ] Click into the 2nd org. ✅ Dashboard switches context. Sidebar shows the 2nd org's data.
- [ ] Switch back. ✅ Original org context restored.

#### 6.2 — Profile sync
- [ ] In your main org, change your display name to `Sarah Pastor [Your Name]`. Save.
- [ ] Switch to the 2nd org → People page. ✅ Your name appears as the new value.

#### 6.3 — Volunteer Archive / Restore / Remove
- [ ] In main org, visit `/dashboard/people`.
- [ ] Click the kebab (...) menu on a volunteer (e.g., Casey). Select _Archive_.
  - ✅ Confirmation dialog. Confirm.
  - ✅ Casey is removed from default Active view; appears under Archived filter.
- [ ] Filter to Archived. ✅ Faded row with "Archived" badge.
- [ ] Restore Casey. ✅ Returns to active.
- [ ] Click _Remove from Organization_ on a different volunteer. ✅ Permanent removal warning. Confirm.
  - ✅ Volunteer is gone from all filters (Active, Archived, All).

#### 6.4 — Prerequisites
- [ ] Visit `/dashboard/onboarding` → _Manage Prerequisites_ tab.
- [ ] Add an **org-wide** prerequisite: type `Background Check`, expires in 365 days.
- [ ] Add a **team-specific** prerequisite for Children's Ministry (if you've created one): type `Class`, name `Safe Sanctuary Training`.
- [ ] Switch to _Volunteer Progress_ tab. ✅ Pipeline shows merged org-wide + team prereqs.
- [ ] Expand a volunteer's row. Mark a step as Complete.
  - ✅ Step-completed email arrives to that volunteer.
- [ ] Verify scheduler gating: try to generate a new schedule. ✅ Volunteers with incomplete prereqs are excluded from auto-draft.

#### 6.5 — Training Sessions
- [ ] Find the training session creation UI (may be on the Onboarding page or under Settings).
- [ ] Create a session: title `Safe Sanctuary Training`, date 2 weeks out, capacity 10, link to the `Safe Sanctuary Training` prereq.
- [ ] Send invitations. ✅ Emails go out to volunteers with that pending prereq.
- [ ] As one volunteer, RSVP yes. ✅ Attendee count increments.
- [ ] As admin, mark the session complete.
  - ✅ Attendees' prereq step is auto-completed.
  - ✅ All-completed email may fire if this was their last prereq.

#### 6.6 — Edge cases
- [ ] **Expired short link**: as admin (Pro tier now allows short links), create a short link with expiry date in the past. Visit it.
  - ✅ 404 page (not crash).
- [ ] **Double confirmation**: open a confirmation email link, confirm it. Click the same link again.
  - ✅ "Already Responded" message (not a duplicate confirmation).
- [ ] **Wrong-name org deletion**: visit Settings → Danger Zone → Delete Organization. Type a wrong name.
  - ✅ "Name doesn't match" error.
  - ⚠️ **Do not actually delete**.
- [ ] **Rate limiting** (informal): submit the waitlist form on the landing page rapidly 6 times in 30 seconds. ✅ 6th attempt should be blocked or throttled.

#### 6.7 — Final wrap
- [ ] Visit `/dashboard/account` → _Danger Zone_. **Stop here. Do not delete.**
- [ ] Take any final notes.
- [ ] Open [FEEDBACK_FORM.md](FEEDBACK_FORM.md) and fill in the **Overall Reactions** section at the end.

### Watch-fors

1. **Long-tail discoverability**: were features like archiving, prerequisites, and training sessions easy to find?
2. **Multi-org polish**: did switching between orgs feel seamless?
3. **Prerequisite gating**: was it clear that incomplete prereqs blocked scheduling?
4. **Edge case grace**: did the system handle bad inputs (expired links, wrong names) without scaring you?

### Wrap-up

🛑 **Fill in [FEEDBACK_FORM.md](FEEDBACK_FORM.md) → Phase 6 section AND the Overall Reactions section at the end.**

---

## You're Done!

Final steps:

1. **Send the completed [FEEDBACK_FORM.md](FEEDBACK_FORM.md) back to Jason** (paste the markdown into a message, attach as a file, or share via the channel he prefers).
2. **Do NOT delete your test org** until Jason confirms he's pulled the data he needs.
3. **Reply to Jason's thank-you note** with any additional gut reactions that didn't fit the form. Even one-line gut feels are useful.

Thank you for spending real time on this. The feedback you give is going to make this a much better product for the next church that uses it.

— Jason

---

## Appendix — Common Issues & What to Do

| Symptom | Likely cause | Note in feedback as |
|---------|--------------|---------------------|
| Page is blank or stuck loading >10s | API call failing | Bug — include URL, browser, time |
| Got a 500 error | Server crashed | Bug — high severity, capture screenshot |
| Email never arrived | Spam folder, or email not firing | Confusion — say which email, check spam first |
| SMS never arrived (Pro tier) | Twilio sandbox limits, or feature off | Confusion or bug, depending |
| Couldn't find a button mentioned in the test plan | Either UI changed or label is unclear | Confusion — note exact phrasing you expected |
| Tier gate didn't fire when you expected | Either it's not gated yet or the gate is broken | Bug — note which feature |
| Dashboard "Setup Guide" doesn't appear | You may have dismissed it earlier | OK — re-trigger via Settings if needed |
| Sidebar item missing | Tier gate, or you're a non-admin user | Check role and tier first; if still wrong, bug |

---

## Appendix — Quick Reference: URLs for Direct Testing

These URLs let you skip navigation if you're testing a specific feature:

| URL | What it shows |
|-----|---------------|
| `/dashboard` | Admin dashboard home |
| `/dashboard/people` | People management |
| `/dashboard/services-events` | Services + Events |
| `/dashboard/schedules` | Schedules list |
| `/dashboard/scheduling-dashboard` | Operational scheduling dashboard |
| `/dashboard/my-schedule` | Volunteer schedule view |
| `/dashboard/my-availability` | Volunteer availability self-service |
| `/dashboard/inbox` | In-app inbox |
| `/dashboard/account` | User account / profile / calendar feeds |
| `/dashboard/my-orgs` | Multi-org management |
| `/dashboard/onboarding` | Prerequisites + pipeline |
| `/dashboard/volunteer-health` | Health classification dashboard |
| `/dashboard/help` | Help Center |
| `/dashboard/worship/songs` | Song library (Pro) |
| `/dashboard/worship/plans` | Service plans (Pro) |
| `/dashboard/worship/reports` | Song usage reports (Pro) |
| `/dashboard/checkin` | Children's check-in admin (Pro) |
| `/dashboard/checkin/households` | Household management (Pro) |
| `/dashboard/checkin/reports` | Check-in reports (Pro) |
| `/dashboard/rooms` | Rooms & bookings (Pro) |
| `/dashboard/rooms/requests` | Room approval queue (Pro) |
| `/dashboard/org/teams` | Teams settings |
| `/dashboard/org/campuses` | Campuses + Shared Facilities |
| `/dashboard/org/billing` | Billing (read-only — don't touch!) |
| `/dashboard/short-links` | Short links (tier-gated) |
| `/checkin?church_id=[id]` | Children's check-in kiosk (no login) |
| `/guardian` | Guardian portal (token URL) |
| `/display/room/[roomId]` | Wall-mounted room display |
| `/calendar/public?token=...` | Public room calendar |
