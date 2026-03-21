# VolunteerCal — Test Plan

A reusable checklist for verifying full app functionality. Reset checkboxes each time you run through the plan.

**Time estimates:** Critical Path ~30 min | Full Suite ~3.5 hours | Post-Deploy Smoke ~5 min

---

## 1. Prerequisites & Setup

Before testing, make sure you have:

- [ ] **Environment running** — `npm run dev` (localhost:3000) or production (volunteercal.com)
- [ ] **Test accounts ready** — You need at least:
  - 1 owner account (creates the org)
  - 1 fresh email for new registration testing
  - Optionally: 1 admin, 1 scheduler, 1 volunteer (can create during testing)
- [ ] **Browser DevTools open** — Chrome → F12 → Console tab (watch for red errors) + Network tab (watch for failed requests)
- [ ] **Resend dashboard open** — [resend.com/emails](https://resend.com/emails) — verify emails actually send
- [ ] **Firebase Console open** — [console.firebase.google.com](https://console.firebase.google.com) — check Firestore data if something seems wrong
- [ ] **Stripe test mode** (for billing tests only) — Use test card: `4242 4242 4242 4242`, any future expiry, any CVC

> **Tip:** Keep DevTools Console open the entire time. If something doesn't work, check there first — most errors will show up as red text.

---

## 2. Critical Path Tests (~30 min)

**Run these after every significant change.** They cover the core user journeys.

### 2.1 Authentication
- [x] **Register** — Go to `/register`, create account with a fresh email → redirected to dashboard
- [x] **Check welcome email** — Open Resend dashboard, verify welcome email was sent
- [ISSUE] **Logout** — Click avatar → Sign Out → redirected to landing page
  - I was redirected to the Login Screen
- [ ] **Login** — Go to `/login`, sign in with the account you just created → dashboard loads
- [ ] **Password reset** — Go to `/password-reset`, enter email → check for reset email → click link → set new password → login with new password

### 2.2 Organization Setup
- [x] **Create org** — First-time user sees setup page → enter org name, pick type (Church/Nonprofit/Other), set timezone
- [x] **Dashboard loads** — After setup, dashboard shows org name, all stats at zero
- [x] **Create ministry** — Go to Organization → Ministries → Add ministry with name and color

### 2.3 People Management
- [ ] **Add individual** — People page → Add People → Add Person → fill name/email → appears in roster
- [ ] **CSV import** — Add People → Import CSV → upload a test CSV with `name,email` columns → items appear in **review queue** (not directly in roster)
- [ ] **Review queue** — Banner shows "N people pending review" → click Review Queue → select all → Approve → click Send Invites
- [ ] **Check invite emails** — Verify invite emails sent in Resend dashboard

### 2.4 Services
- [ ] **Create service** — Services & Events → Add Service → set name, day of week, time, recurrence (weekly)
- [ ] **Add roles** — Edit service → add roles (e.g., "Sound Tech" ×2, "Camera" ×1)

### 2.5 Schedule Workflow
- [ ] **Generate draft** — Schedules → Create Schedule → pick date range → draft generated with assignments
- [ ] **Review matrix** — Schedule matrix loads showing services × volunteers
- [ ] **Publish** — Transition Draft → In Review → Approved → Published
- [ ] **Confirmation emails sent** — Check Resend dashboard for confirmation emails to assigned volunteers

### 2.6 Volunteer Confirmation
- [ ] **Open confirmation link** — Click the link from the confirmation email → page shows assignment details
- [ ] **Confirm assignment** — Click "I'll Be There!" → success message → status updated
- [ ] **Double-confirm blocked** — Click link again → shows "Already Responded"

### 2.7 Account Deletion
- [ ] **Delete test account** — Account Settings → Danger Zone → type DELETE → confirm → redirected to home, signed out
- [ ] **Verify cleanup** — Check Firebase Console: user doc removed, memberships removed

---

## 3. Full Feature Tests (~2.5 hours)

### A. Public Pages (~10 min)

- [ ] **Landing page** — Visit `/` → hero, features, pricing, waitlist form all render
- [ ] **Waitlist form** — Submit email → success message
- [ ] **Login page** — Visit `/login` → form renders, "Forgot password?" link works
- [ ] **Register page** — Visit `/register` → form renders, terms/privacy links work
- [ ] **Privacy page** — Visit `/privacy` → content loads
- [ ] **Terms page** — Visit `/terms` → content loads
- [ ] **Join link** — Visit `/join/[a-valid-churchId]` → shows org name, signup form
- [ ] **Join link (invalid)** — Visit `/join/nonexistent` → error/not found
- [ ] **Short link** — Visit `/s/[a-valid-slug]` → redirects to target
- [ ] **Short link (expired/invalid)** — Visit `/s/bogus` → 404 page
- [ ] **Confirm link (invalid)** — Visit `/confirm/badtoken` → error message

### B. Authentication & Onboarding (~15 min)

- [ ] **Register with new email** — Fill form → account created → redirected to dashboard
- [ ] **Welcome email received** — Check Resend
- [ ] **Login with valid credentials** — Sign in → dashboard loads with correct user name
- [ ] **Login with wrong password** — Error message appears (not a crash)
- [ ] **Login with non-existent email** — Error message appears
- [ ] **Password reset flow** — Request reset → email arrives → click link → set new password → login works
- [ ] **First-time setup** — New user with no org → sees "Create Organization" prompt
- [ ] **Create org** — Fill name/type/timezone → org created → dashboard shows org data
- [ ] **Owner membership auto-created** — Check that user is listed as Owner in People page

### C. Organization Management (~15 min)

- [ ] **Edit org name** — Organization page → change name → save → name updates everywhere
- [ ] **Edit org type** — Change between Church/Nonprofit/Other → terminology updates (e.g., "Ministries" vs "Teams")
- [ ] **Edit timezone** — Change timezone → save
- [ ] **Create ministry** — Add ministry with name, color, optional description and lead
- [ ] **Edit ministry** — Change name/color → save → verify update in roster
- [ ] **Delete ministry** — Delete → confirm → ministry removed
- [ ] **Workflow mode** — All four modes selectable (Centralized, Team-First, Hybrid, Self-Service). Free tier limited to Centralized only; Starter+ has all modes
- [ ] **Create short link** — Enter slug, target URL, label → created with expiry
- [ ] **Short link slug validation** — Try reserved slug (e.g., "dashboard") → rejected
- [ ] **Short link redirect** — Visit `/s/[your-slug]` → redirects correctly
- [ ] **Delete short link** — Delete → slug no longer redirects
- [ ] **Short link tier limit** — On free tier, try creating more than 0 → rejected with upgrade prompt

### D. People Management (~20 min)

**Roster Tab:**
- [ ] **Volunteers listed** — All roster entries visible with name, email, phone, role, ministries
- [ ] **Search works** — Type a name → list filters
- [ ] **Edit volunteer** — Click Edit → change name/email/phone/ministries → Save
- [ ] **Delete volunteer** — Click Delete → confirm → removed from roster

**Add People:**
- [ ] **Add Individual** — Fill name + email → person appears in roster immediately
- [ ] **CSV Import to Queue** — Upload CSV → "Added N people to review queue" message → banner shows queue count
- [ ] **Queue Review** — Open queue → see imported names/emails → select all → Approve
- [ ] **Send Approved Invites** — Click "Send N Invites" → progress indicator → invites sent
- [ ] **Check invite emails** — Verify in Resend dashboard
- [ ] **Skip queue items** — Select items → Skip → items removed from queue
- [ ] **Edit role in queue** — Change a person's role from Volunteer to Scheduler before approving

**ChMS Import (if you have PCO/Breeze credentials):**
- [ ] **Select provider** — Choose Planning Center, Breeze, or Rock RMS
- [ ] **Enter credentials** — Fill API key/secret fields
- [ ] **Test connection** — Click Test → "Connected" success message
- [ ] **Preview teams** — Click Preview → see team names with member counts
- [ ] **Select teams** — Uncheck "All Teams" → select specific teams
- [ ] **Import to queue** — Click Import → "N people added to review queue"
- [ ] **Review and send** — Same queue workflow as CSV

**Invites Tab:**
- [ ] **Send individual invite** — Enter email, pick role → "Invitation sent!"
- [ ] **Invite with scheduler scope** — Pick Scheduler role → team access picker appears → select specific teams
- [ ] **Accept invite** — Open invite email → click link → accept → membership becomes active
- [ ] **Pending requests visible** — Self-registered user appears with "Awaiting Approval" badge
- [ ] **Approve pending** — Click Approve → status changes to Active → approval email sent

**Role Management:**
- [ ] **Change role** — Click ... menu → change Volunteer to Scheduler → role updates
- [ ] **Scope chips visible** — Scheduler with specific teams shows team name chips
- [ ] **Manage team access** — Click ... → "Manage team access" → toggle teams → Save
- [ ] **Promotion email** — After promoting, check Resend for role promotion email
- [ ] **Remove member** — Click ... → Remove → confirm → member removed

### E. Services & Events (~15 min)

**Services:**
- [ ] **Create service** — Set name, day of week, start/end time, recurrence (weekly)
- [ ] **Add roles** — Add role names with counts (e.g., "Vocalist" ×3)
- [ ] **Multi-ministry** — Add second ministry to service with its own roles
- [ ] **Per-ministry time override** — Set different start/end time for a ministry
- [ ] **Edit service** — Change name/time/recurrence → save
- [ ] **View service roster** — Click Roster → ServiceRoster modal opens for next upcoming date → shows assigned volunteers
- [ ] **Service attendance** — Roster modal Attendance tab → mark individual or "Mark all present" → save → attendance recorded
- [ ] **Future date attendance** — Open Roster for a future service date → Attendance tab visible and functional (not gated to past/today)
- [ ] **Delete service** — Delete → confirm → service removed from list

**Events:**
- [ ] **Create event** — Set name, date, visibility (Internal or Public), signup mode (Open/Scheduled/Hybrid)
- [ ] **Add event roles** — Add roles with capacity limits
- [ ] **Public event signup** — Copy signup URL → open in incognito → fill name/email → signup confirmed
- [ ] **Signup confirmation email** — Check Resend for confirmation
- [ ] **Event visible on dashboard** — Event appears in upcoming events list

### F. Schedule Workflow (~25 min)

> **This is the most complex flow.** Take your time.

- [ ] **Create draft** — Schedules → New Schedule → pick date range (e.g., next 4 weeks) → click Generate
- [ ] **Matrix loads** — Grid shows services as rows, dates as columns, volunteer names in cells
- [ ] **Filter by ministry** — Select a ministry filter → matrix shows only that ministry's assignments
- [ ] **Conflicts panel** — Check for issues: unfilled roles, overbooking, availability violations
- [ ] **Reassign volunteer** — If conflicts exist, try manually changing an assignment in the matrix
- [ ] **View stats** — Fill rate %, fairness score, total slots vs filled
- [ ] **Transition to In Review** — Click "Submit for Review" → status changes
- [ ] **Ministry approval** — Approve each ministry's section (if multi-ministry)
- [ ] **Transition to Approved** — All ministries approved → click Approve
- [ ] **Publish schedule** — Click Publish → confirmation emails sent to all assigned volunteers
- [ ] **Verify emails** — Check Resend: each assigned volunteer got a confirmation email with unique token link
- [ ] **Confirm assignment** — Click confirmation link → page loads → click "I'll Be There!" → success
- [ ] **Decline assignment** — Use different volunteer's link → click Decline → status updated
- [ ] **Dashboard stats update** — Confirmation rate reflects new confirms/declines
- [ ] **Calendar feed** — Account → Calendar Feeds → create personal feed → copy iCal URL → paste into Google Calendar → assignments appear as events
- [ ] **Export** — Export schedule as CSV → download contains assignment data

### G. Multi-Org Support (~10 min)

- [ ] **Create Org 1** — User A creates organization (becomes owner)
- [ ] **Invite User A to Org 2** — From a different owner's account, invite User A as scheduler
- [ ] **Accept Org 2 invite** — User A opens invite → accepts → now member of 2 orgs
- [ ] **Switch orgs** — My Organizations page → click Org 2 → dashboard shows Org 2 data
- [ ] **Permissions are org-specific** — As scheduler in Org 2, cannot access Organization settings. Switch to Org 1, can access everything as owner.
- [ ] **Leave org** — On My Organizations, leave Org 2 → only Org 1 remains

### H. Account Management (~15 min)

**Profile:**
- [ ] **Edit display name** — Change name → save → name updates in avatar/header
- [ ] **Edit phone** — Add phone number → save

**Password:**
- [ ] **Change password** — Enter current password + new password → save → logout → login with new password works
- [ ] **Wrong current password** — Enter wrong current password → error message

**Calendar Feeds:**
- [ ] **Create personal feed** — Click "Create Feed" → iCal URL generated
- [ ] **Subscribe in calendar app** — Copy URL → add to Google Calendar → events appear
- [ ] **Delete feed** — Delete feed → URL stops working (calendar shows error on next sync)

**Account Deletion:**
- [ ] **Non-owner deletion** — Log in as a non-owner member → Account → Danger Zone visible → type DELETE → confirm → account deleted, farewell email sent
- [ ] **Sole-admin warning** — Log in as sole owner → try deleting → warning: "You're the only admin of [Org]" → see options: "Promote someone first" or "Delete everything"
- [ ] **Promote first option** — Click "Promote someone first" → navigated to People page
- [ ] **Delete everything option** — Click "Delete everything" → org cascade-deleted + account deleted → all members notified

### I. Billing (~10 min)

> **Requires Stripe test mode.** Use card number `4242 4242 4242 4242`, any future expiry, any 3-digit CVC.

- [ ] **View pricing** — Landing page pricing section shows all tiers with prices
- [ ] **Start checkout** — Organization → Billing → choose Starter tier → Stripe checkout page opens
- [ ] **Complete payment** — Fill test card details → submit → redirected back to app
- [ ] **Tier updated** — Organization page shows new tier (Starter)
- [ ] **Thank-you email** — Check Resend for purchase confirmation email
- [ ] **Tier limits active** — Can now create up to 5 ministries, 3 short links, 100 volunteers
- [ ] **Billing portal** — Click "Manage Billing" → Stripe portal opens showing subscription
- [ ] **Cancel subscription** — Cancel in Stripe portal → tier reverts to Free
- [ ] **Free tier limits re-applied** — Short link limit drops to 0, ministry limit to 1

### J. Notifications & Emails (~15 min)

Trigger each email and verify it arrives in the Resend dashboard:

| # | Email | How to trigger |
|---|-------|----------------|
| - [ ] | Welcome | Register a new account |
| - [ ] | Invite | Send an invitation from People → Invites tab |
| - [ ] | Membership Approved | Approve a pending member |
| - [ ] | Role Promotion | Promote volunteer → scheduler |
| - [ ] | Welcome to Org | Self-register via `/join/[churchId]` link |
| - [ ] | Schedule Confirmation | Publish a schedule |
| - [ ] | Reminder | Hit `/api/cron/reminders` endpoint (or wait for cron) |
| - [ ] | Event Invite | Send event invitation from Services & Events |
| - [ ] | Org Deleted (owner) | Delete an organization |
| - [ ] | Org Deleted (members) | Same — check other members got notified |
| - [ ] | Account Deleted | Delete an account |
| - [ ] | Vacancy Alert | Delete account of volunteer with future assignments |
| - [ ] | Absence Alert | Volunteer clicks "Can't Make It" on My Schedule |
| - [ ] | Self-Removal Alert | Volunteer removes themselves from a roster slot |

### K. Edge Cases & Error Handling (~10 min)

- [ ] **Unauthenticated dashboard access** — Visit `/dashboard` while logged out → redirected to `/login`
- [ ] **Volunteer accessing admin pages** — Log in as volunteer → try visiting `/dashboard/organization` → "Access Denied" or redirect
- [ ] **Empty required fields** — Try submitting forms with blank required fields → validation errors shown (not a crash)
- [ ] **Bad CSV import** — Upload a CSV with no "name" column → helpful error: "CSV must have a 'name' column"
- [ ] **Non-existent join link** — Visit `/join/doesnotexist` → error message (not a crash)
- [ ] **Expired short link** — Create a short link, wait for expiry (or set to past in Firestore) → visit → 404
- [ ] **Double confirmation** — Click confirmation link twice → second time shows "Already Responded"
- [ ] **Wrong org name for deletion** — Try deleting org with wrong name typed → "Name doesn't match" error
- [ ] **URL redirects work** — Visit `/dashboard/volunteers` → redirected to `/dashboard/people`
- [ ] **Rate limit test** — Hit a public endpoint (e.g., `/api/waitlist`) 6+ times rapidly → 429 "Too many requests" response
- [ ] **Mutation error visibility** — Disconnect network (DevTools → Network → Offline) → try saving a ministry or service → red error banner shown (not silent failure)

### L. Check-In Methods (~20 min)

**QR Code Check-In**

- [ ] **Generate check-in code** — Scheduling dashboard → click QR icon on an upcoming service → QR code modal opens
- [ ] **QR code renders** — Modal shows a valid QR code with the check-in URL
- [ ] **Copy check-in URL** — Copy the URL from the modal
- [ ] **Self-check-in (logged in)** — Visit `/check-in/[code]` as a logged-in volunteer → "Check In Now" button appears → click → success with name and date
- [ ] **Auto-redirect** — After success, 5-second countdown appears → auto-redirects to My Schedule
- [ ] **View My Schedule link** — "View My Schedule" link works as immediate action (doesn't wait for countdown)
- [ ] **Not logged in** — Visit check-in URL while logged out → "Sign In" button shown with redirect back to check-in page
- [ ] **Invalid/expired code** — Visit `/check-in/badcode` → error message

**Smart/Self Check-In (Time-Aware)**

- [ ] **Banner appears in window** — Create confirmed assignment for today with service start within window → open dashboard → coral SmartCheckInBanner appears with service name and time
- [ ] **Check-in succeeds** — Click "Check In" → loading state → success checkmark → banner hides → assignment.attended = true, check_in_method = "self"
- [ ] **Dismiss persists** — Click "Not now" → banner hides → refresh page → banner remains hidden for that assignment (localStorage)
- [ ] **Outside window (too early)** — Assignment start is 2+ hours away → banner does not appear
- [ ] **Outside window (too late)** — Assignment start was 45+ minutes ago → banner does not appear
- [ ] **Setting disabled** — Disable self-check-in in org settings → banner does not appear for any volunteer

**Proximity Check-In**

- [ ] **Proximity copy shown** — Enable proximity + campus with coordinates → visit app near campus within time window → banner shows "You're at [Campus Name]" proximity copy
- [ ] **Method recorded** — Check in via proximity banner → assignment.check_in_method = "proximity"
- [ ] **Fallback without location** — Deny geolocation permission → banner falls back to standard time-based prompt (method = "self")
- [ ] **Proximity toggle** — Disable proximity in org settings → banner only shows time-based copy even when near campus

**Address Autocomplete & Check-In Settings**

- [ ] **Autocomplete dropdown** — With NEXT_PUBLIC_GOOGLE_MAPS_API_KEY set → edit campus → type address → Google Places dropdown appears
- [ ] **Lat/lng captured** — Select address from dropdown → campus saved with location coordinates (check Firestore document)
- [ ] **Graceful fallback** — Without API key → campus address field is a plain text input (no errors)
- [ ] **Check-in settings save** — Toggle self-check-in → adjust window before/after → save → reload → values persist
- [ ] **Proximity settings conditional** — Proximity toggle only appears when at least one campus has location coordinates

### M. Volunteer Health Dashboard (~10 min)

- [ ] **Page loads** — Navigate to Volunteer Health → stats row shows health distribution
- [ ] **Classification** — Verify volunteers are classified into categories: healthy, at-risk, declining, inactive, no-show
- [ ] **At-risk list** — At-risk volunteers shown with details about why they're flagged
- [ ] **Email outreach** — Click email icon on an at-risk volunteer row → opens mailto: with pre-filled subject
- [ ] **Responsive layout** — Resize to mobile → volunteer rows stack vertically (not cut off)
- [ ] **Skeleton loading** — On slow connection (DevTools throttle), skeleton loader appears before data

### N. Onboarding Pipeline (~15 min)

- [ ] **Tabs visible** — Navigate to Onboarding → "Volunteer Progress" and "Manage Prerequisites" tabs visible (admin only)
- [ ] **Org-wide prerequisites** — Manage Prerequisites tab → add an org-wide prerequisite → saves to church document
- [ ] **Team-specific prerequisites** — Manage Prerequisites tab → expand a team → add a prerequisite → saves to ministry document
- [ ] **Prerequisite types** — Verify all types available: class, background check, minimum service, ministry tenure, custom
- [ ] **Pipeline merges both** — Volunteer Progress tab shows org-wide + team prereqs combined per team with "(X org-wide + Y team)" count
- [ ] **Track progress** — Expand a volunteer → update org-wide step status → progress bar updates
- [ ] **Org Settings link** — Organization page → ministry form shows prerequisites via shared editor + link to Onboarding page
- [ ] **Scheduler gates** — Volunteer with incomplete org-wide prerequisite is NOT scheduled by auto-draft
- [ ] **Setup guide step** — Dashboard shows optional "Set up onboarding prerequisites" step with Optional badge

### O. Attendance & Absence Alerts (~15 min)

**Attendance Status Types**

- [ ] **Mark present** — Service roster → Attendance tab → toggle volunteer to "Present" → green checkmark shown → Firestore `attended: true`, `attendance_status: "present"`
- [ ] **Mark no-show** — Toggle to "No-Show" → red X shown → `attendance_status: "no_show"`
- [ ] **Mark excused** — Toggle to "Excused" → yellow icon shown → `attendance_status: "excused"`
- [ ] **Clear status** — Toggle again to unmark → status returns to "Not Marked"
- [ ] **Mark all present** — Click "Mark all present" button → all volunteers in roster marked present at once
- [ ] **Shared toggle component** — Verify the same AttendanceToggle renders consistently in service roster modal and scheduling dashboard attendance sections

**Absence Alerts ("Can't Make It")**

- [ ] **Volunteer submits** — My Schedule → upcoming assignment → click "Can't Make It" → modal opens → add optional note → submit → assignment marked with `cant_make_it: true`
- [ ] **Scheduler notified (email)** — Scheduler(s) for that ministry receive absence alert email with volunteer name, service, date, and note
- [ ] **Scheduler notified (SMS)** — On Starter+ tier with SMS enabled in scheduler preferences → scheduler also receives SMS
- [ ] **Preference-gated** — Scheduler with `absence_alert` disabled in notification preferences → does NOT receive alert
- [ ] **Ministry scope** — Scheduler with ministry scope set → only receives alerts for their scoped ministries
- [ ] **Multiple schedulers** — Multiple schedulers for same ministry → each receives alert per their own preferences

**Scheduler Notification Preferences**

- [ ] **Section visible** — Account Settings → "Scheduler Notifications" section visible for scheduler/admin/owner roles
- [ ] **Hidden for volunteers** — Log in as volunteer → section not visible
- [ ] **Toggle notification types** — Toggle absence_alert, self_removal, swap_request, swap_resolved → checkboxes save to Firestore membership doc
- [ ] **Standard channel** — Set standard channel to Email or None → save → verify preference persists on reload
- [ ] **Urgent channel** — Set urgent channel to Email, SMS, or None → save → verify persistence
- [ ] **SMS gated to tier** — On Free tier → SMS option disabled with "Starter+ plan required" message
- [ ] **SMS available on Starter+** — On Starter or higher tier → SMS toggle enabled for urgent channel
- [ ] **Ministry scope** — Select specific ministries → save → only receive alerts for those ministries
- [ ] **All ministries (default)** — Leave scope empty → receive alerts for all ministries

### P. Shift Swap (~10 min)

- [ ] **Request swap** — As a volunteer, request a shift swap on an upcoming assignment
- [ ] **Eligible replacements** — System lists eligible volunteers who could take the shift
- [ ] **Accept swap** — As replacement volunteer, accept the swap request
- [ ] **Admin approval** — As admin, approve the pending swap → assignment transfers
- [ ] **Cancel swap** — Request a swap then cancel before anyone accepts → status shows cancelled

### Q. Multi-Site / Campus (~5 min)

- [ ] **Create campus** — Organization page → add a campus with name and optional address
- [ ] **Assign service to campus** — Create/edit a service → optionally assign to a campus
- [ ] **Campus list** — Multiple campuses shown in organization settings
- [ ] **Delete campus** — Remove a campus → confirm → campus removed

### R. Household Scheduling (~10 min)

- [ ] **Families tab visible** — People page → "Families" tab visible alongside Roster and Invites
- [ ] **Create household** — Families tab → "Add Family" → name + select members + set constraints → save
- [ ] **Constraint: never_same_service** — Enable "Never same service" → generate schedule → family members not scheduled to same service on same date
- [ ] **Constraint: never_same_time** — Enable "Never same time" → generate schedule → family members not scheduled to ANY service on same date
- [ ] **Constraint: prefer_same_service** — Enable "Prefer same service" → generate schedule → family members scheduled together when possible
- [ ] **Edit household** — Change members or constraints → save → next schedule respects updated constraints
- [ ] **Delete household** — Remove household → confirm → constraints no longer applied
- [ ] **Conflict card in schedule review** — After generating schedule, household conflict card appears if any violations exist

### S. Workflow Modes & Availability Campaigns (~15 min)

- [ ] **Schedule wizard 3-step** — Create Schedule → Step 1: workflow mode picker → Step 2: date range + availability window → Step 3: review summary
- [ ] **Centralized mode** — Default behavior; admin drafts, reviews, publishes
- [ ] **Team-first mode** — Schedule filtered to scheduler's ministry scope
- [ ] **Hybrid mode** — Master schedule with per-ministry edit sections
- [ ] **Availability due date** — Set due date in wizard → schedule shows availability window metadata
- [ ] **Send availability broadcast** — Click "Send Availability Request" on draft schedule → email sent to all active volunteers
- [ ] **Volunteer banner** — Volunteer with active availability window sees campaign banner on dashboard with "Submit Availability" CTA
- [ ] **Banner dismissal** — Dismiss banner → stays dismissed

### T. Multi-Stage Approval (~10 min)

- [ ] **Submit for review** — Draft schedule → click "Submit for Review" → status changes to `in_review`
- [ ] **Approval countdown** — In-review schedule shows countdown to target approval date
- [ ] **Ministry approval grid** — Grid shows each ministry with approved/pending status
- [ ] **Ministry lead approves** — Ministry lead clicks approve for their ministry → status updates
- [ ] **Cross-team coordination** — Click "Coordinate with other teams" → modal shows shared volunteers across ministries
- [ ] **All approved → publish** — All ministries approved → "Publish Now" button active → publish → confirmation emails sent
- [ ] **Partial approval visible** — "2 of 3 teams approved" shown on schedule card

### U. Worship Module — Song Library (~15 min)

> **Requires Growth tier or above.** Worship nav section hidden on Free/Starter.

- [ ] **Nav gating** — On Free/Starter tier, Worship nav section not visible. On Growth+, Songs/Service Plans/Reports links appear
- [ ] **Song library loads** — Navigate to Worship → Songs → page loads with empty state or song list
- [ ] **Add song** — Click "Add Song" → fill title, CCLI number, default key, tags → save → song appears in list
- [ ] **Edit song** — Click song → edit fields → save → changes reflected
- [ ] **Archive song** — Click archive → song moves to Archived tab
- [ ] **Search songs** — Type in search → list filters by title
- [ ] **Filter tabs** — All / In Rotation / Archived tabs filter correctly
- [ ] **CCLI metadata** — Song shows CCLI number, publisher, copyright info when provided

### V. Worship Module — Service Plans (~15 min)

- [ ] **Plans list** — Worship → Service Plans → upcoming plans shown (or empty state)
- [ ] **Create plan** — Click "New Plan" → select service, set date, optional theme/speaker → plan created
- [ ] **Add song to plan** — In plan editor, add a song item → song appears in order of service
- [ ] **Add non-song item** — Add prayer, announcement, sermon, offering, video, or custom item
- [ ] **Reorder items** — Drag items to reorder → sequence numbers update
- [ ] **Key override** — Set a different key for a song in this plan (vs default)
- [ ] **Publish plan** — Click Publish → plan marked published → SongUsageRecord entries created for each song
- [ ] **Song usage tracked** — After publishing, song's use_count incremented and last_used_date updated
- [ ] **Delete unpublished** — Delete a draft plan → plan removed
- [ ] **Cannot delete published** — Published plan delete button disabled or warns

### W. SongSelect Integration (~10 min)

> **Requires Growth tier or above.** SongSelect credentials from your CCLI account.

- [ ] **Connect SongSelect** — Worship → Songs → "Connect SongSelect" → enter CCLI credentials → save → "Connected" confirmation shown
- [ ] **Search songs** — With SongSelect connected, use "Import from SongSelect" → type a song title → results appear from SongSelect catalog
- [ ] **Import song** — Select a song from search results → click Import → song added to library with CCLI metadata pre-filled
- [ ] **Duplicate detection** — Import the same song again → warning: "This song already exists in your library" → import blocked or flagged
- [ ] **Imported song editable** — Open the imported song → all fields editable (key, tags, notes)
- [ ] **Disconnect SongSelect** — Worship → Songs → "Disconnect SongSelect" → credentials removed → search no longer available
- [ ] **Cron sync** — Verify `/api/cron/songselect-sync` endpoint returns 200 with valid cron secret → syncs updated metadata for previously imported songs

### X. Stage Sync (~10 min)

> **Requires Growth tier or above.** Best tested with two browser windows (conductor + participant).

- [ ] **Enable session** — Open a published service plan → click "Start Stage Sync" → session enabled → share modal appears with QR code and URL
- [ ] **Conductor view** — Open conductor page → current item highlighted → next/previous controls visible
- [ ] **Participant view** — Open participant URL in second browser/device → current item displayed in large format
- [ ] **Advance item** — Conductor clicks Next → participant view updates in real time to show the next item
- [ ] **Keyboard shortcuts** — On conductor page: Right Arrow / Space = next, Left Arrow = previous → items advance correctly
- [ ] **QR sharing** — Share modal QR code scans correctly on a phone → opens participant view
- [ ] **Reconnection** — Participant: disconnect network briefly → reconnect → view resumes at current item (no stale state)

### Y. Song Usage Reports & ProPresenter Export (~10 min)

> **Requires Growth tier or above.** Publish at least one service plan with songs before testing.

- [ ] **Reports page loads** — Worship → Reports → page loads with date range picker and song usage table
- [ ] **Date range filter** — Select a custom date range → table updates to show only songs used within that period
- [ ] **Aggregation correct** — Song use counts match the number of published plans containing each song in the selected range
- [ ] **CSV export** — Click "Export CSV" → file downloads with song title, CCLI number, use count, and date columns
- [ ] **ProPresenter export** — Service Plans → open a plan → click "Export for ProPresenter" → JSON file downloads with plan items in ProPresenter-compatible format
- [ ] **Cron email** — Verify `/api/cron/propresenter-export` endpoint returns 200 with valid cron secret → sends email with export attachment to configured recipients
- [ ] **Empty state** — Select a date range with no published plans → table shows "No song usage data for this period" (not a crash)

---

## 4. Post-Deploy Smoke Test (~5 min)

Quick sanity check after deploying to production:

- [ ] Landing page loads at volunteercal.com
- [ ] Can log in with existing account
- [ ] Dashboard shows org data (not blank/error)
- [ ] Can navigate to People, Services, Schedules pages
- [ ] Can create a draft schedule (algorithm runs)
- [ ] Can publish schedule and confirmation email arrives
- [ ] Short link redirects work
- [ ] Join link loads correctly
- [ ] QR check-in page loads at `/check-in/[valid-code]`
- [ ] Smart check-in banner appears on dashboard for volunteers with today's assignments
- [ ] Privacy and Terms pages load

---

## 5. Claude's Code Verification Checklist

Ask Claude to run these checks (no browser needed):

- [ ] `npx tsc --noEmit` passes — no TypeScript errors
- [ ] All email templates export correctly from `src/lib/utils/emails/index.ts`
- [ ] All API routes have Bearer token auth checks (no unprotected admin endpoints)
- [ ] Firestore rules match expected access patterns (admin-only writes, member reads)
- [ ] No `.env` files or credentials committed to git
- [ ] All `@/` imports resolve to real files
- [ ] Cascade delete (`org-cascade-delete.ts`) covers all subcollections
- [ ] Stripe webhook handles: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`
- [ ] No `console.log` with sensitive data (tokens, passwords)
- [ ] All server-side API routes use Admin SDK (`adminDb`/`adminAuth` from `@/lib/firebase/admin`), not client Firebase SDK
- [ ] Rate limiting applied to all public endpoints: `/api/waitlist`, `/api/signup`, `/api/confirm`, `/api/short-links/check`
- [ ] Stripe webhook validates `church_id` and `tier` metadata before Firestore writes
- [ ] Cron secret comparison uses timing-safe comparison (`safeCompare` from `@/lib/utils/safe-compare`)
- [ ] Client-side cache invalidates on write operations (`addChurchDocument`, `updateChurchDocument`, `removeChurchDocument`)
- [ ] No annual billing references in pricing or billing UI copy
- [ ] No references to deleted `.StartupIdeas/` directory

---

## How to Use This Plan

1. **After a big code change:** Run Section 2 (Critical Path) — takes ~30 min
2. **Before a release:** Run Sections 2 + 3 (Full Suite) — takes ~2.5 hours
3. **After deploying:** Run Section 4 (Smoke Test) — takes ~5 min
4. **Anytime (ask Claude):** Run Section 5 (Code Verification) — takes ~2 min
5. **Reset checkboxes** when starting a new test run

> **Pro tip:** If something fails, check the browser Console (F12) first. Most errors show up there with a helpful message. If you see a red error, copy the full message and share it — that's usually enough to diagnose the issue.
