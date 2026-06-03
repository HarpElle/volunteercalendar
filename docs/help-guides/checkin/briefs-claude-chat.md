# Briefs for Claude Chat — Check-In Help Guide Authoring

**Purpose:** Give Claude Chat everything it needs to know about each
Check-In journey so it can write polished help-center copy. Each
journey section is structured the same way; CC produces one polished
markdown file per journey, named after the slug at the top of the
section.

**How to write each guide:**
- Audience is at the top — adjust register / reading conditions
- Outcome is what the reader walks away able to do
- Prerequisites are what they need to have done first (and where to
  point them if they haven't)
- Content section is the canonical fact list — every nuance, every
  feature visible on the surface, every common confusion. Don't omit
  things to keep it short; precision matters more than length
- Insert `[SCREENSHOT: slug]` placeholders inline where a screenshot
  will help (slug list is the same as in `briefs-codex.md`)
- End each guide with "Related" cross-references to other journeys
- Output format: markdown (no JSX, no triple-backticks). One file
  per journey saved to `inbox-claude-chat/{slug}.md`

**Why these specific journeys:** see `docs/dev/checkin-help-guide-plan.md`
for the prioritization rationale. Tier 1 is what's needed for
tomorrow's Anchor Falls test; tier 2 is important polish for Sunday;
tier 3 is operational completeness.

**Voice notes (in addition to the user's Brand & Voice document):**
- VolunteerCal serves churches but isn't itself religious copy. Keep
  it operationally crisp
- The user-facing term for the volunteer-grouping concept is **Team**
  (the code calls it "ministry" internally — don't surface that to
  users)
- Service times, ratios, allergies, custody orders are real adult
  responsibilities. Treat them with appropriate weight without
  being grim
- The platform is "warm editorial" aesthetic. Headings are
  Plus Jakarta Sans display weight; body is Plus Jakarta Sans
  regular. Color palette has indigo for trust, coral for warmth,
  sage for confirmation. Reference these tones via copy, not by
  naming the hex codes

---

# TIER 1 — for tomorrow's Anchor Falls test

## A1 — First-time kiosk setup

**Slug:** `a1-kiosk-setup`

**Audience:** Admin (church staff member or volunteer coordinator)
who has just signed up for VolunteerCal or is configuring Check-In
for the first time. Comfortable with web apps but not technical
(doesn't know what an "iframe" is). Reading on a laptop at a desk,
likely with the actual iPad they're about to enroll sitting on the
desk next to them.

**Outcome:** A working kiosk station running on an iPad in the
church's lobby, bound to their church, set to the correct type
(staffed or self-service), ready to check families in.

**Prerequisites:**
- Has created their VolunteerCal organization
- Is on Growth tier or above (Check-In requires this)
- Has at least one iPad / Android tablet available
- iPad is on the same Wi-Fi as the rest of the church's network

**Content:**

1. **Why kiosk stations exist as a concept.** Each physical iPad in
   the lobby is a "station." Each station is bound to a specific
   church (so a multi-church family running both orgs can't
   accidentally mix them) and has a specific "type" that controls
   what it can do. The station type can NOT be changed after
   enrollment — pick carefully.

2. **Station types — staffed vs self-service.** This is the most
   important decision:
   - **Staffed kiosk** — a church volunteer stands at the kiosk
     and supervises every check-in. Staffed stations have ALL
     capabilities: regular check-in, blocked-pickup verification
     at checkout (with photos), overriding the blocked-pickup
     gate when the operator confirms it's not actually a blocked
     person standing there, and the new "I'm here for pickup" ping
     button. Most churches start with staffed kiosks.
   - **Self-service kiosk** — set up at a turnstile-style entrance
     where families check themselves in without a volunteer hovering.
     CAN do regular check-in. CANNOT do checkout (parents need a
     staffed kiosk to release a child — security gate is the
     security code, not the device). CANNOT override the
     blocked-pickup gate — if a block fires, the family must go to
     a staffed station.
   - Recommend staffed for first deployment; self-service can be
     added later for high-volume churches.

3. **Generating the activation code.**
   - Navigate to **Settings → Check-In tab → Stations**
   - Click **Add station**
   - Pick the station type (staffed/self-service per above)
   - Optionally name it ("Lobby 1", "Children's wing", etc.) —
     just for the admin's reference
   - Click **Generate code** — an 8-character code appears with a
     10-minute countdown timer
   - Codes expire after 10 minutes for security. If yours expires,
     just generate another from the same modal

4. **Enrolling the iPad.**
   - On the iPad, open Safari (NOT Chrome — Apple's location-aware
     pass features and PWA install all require Safari)
   - Go to `https://volunteercal.com/checkin`
   - The "Enroll this kiosk" screen appears with an 8-character
     input box
   - Type or paste the activation code (case-insensitive)
   - Tap **Activate kiosk** — the iPad binds to the church and
     transitions to the kiosk landing screen

5. **Bookmarking as a PWA (optional but recommended).**
   - On the kiosk landing screen, tap the Safari share button
     (the square with the up arrow)
   - Choose **Add to Home Screen**
   - Name it ("Check-In" or similar) → Add
   - Open from the home screen icon for full-screen mode (no
     Safari browser chrome). The kiosk URL is bookmarked
     persistently.

6. **First-time setup checklist (admin should also do):**
   - Configure service times in **Settings → Check-In → Service Times**
     so the kiosk knows when to start/stop check-in windows and when
     to consider a child "late"
   - Configure rooms in **Settings → Check-In → Rooms** so children
     can be auto-assigned by grade
   - Optionally configure a label printer in **Settings → Check-In →
     Printers** (Brother QL-820NWB, Zebra ZD, or Dymo). See the
     "Label printing" guide for full setup.

**Common confusions to address:**

- "I generated a code but didn't enter it in time" → just generate
  another, the modal stays open
- "I picked the wrong station type" → revoke the station from
  Settings, generate a new code with the correct type, re-enroll
  the iPad
- "My iPad shows 'Invalid activation code'" → most often the code
  expired (10 min). Generate another
- "The iPad just shows a spinner forever" → the iPad needs internet.
  Check Wi-Fi. Also, if this is Safari ITP eating the auth iframe
  cookies, opening in a private window once + closing it can reset
  the state

**Error states:**

- 400 "Invalid code format" — code must be exactly 8 chars
- 401 "Code expired" — regenerate from the admin Settings page
- 403 "Code already used" — each code is single-use, regenerate

**Insert screenshots at these points:** `a1-add-station-modal`,
`a1-activation-code-display`, `a1-ipad-enrollment-empty`,
`a1-ipad-enrollment-with-code`, `a1-kiosk-landing-after-activation`,
`a1-ipad-pwa-add-to-home-screen`

**Related:**
- A2 "Running the kiosk on Sunday morning" (what to do after enrollment)
- "Label printing setup" (existing guide; optional)
- "Service times configuration" (existing guide)

---

## A2 — Running the kiosk on Sunday morning

**Slug:** `a2-kiosk-runtime`

**Audience:** Volunteer staffing the kiosk on a Sunday morning.
Variable tech literacy. Has likely been shown the kiosk once during
training but is now standing alone at 9:55am with a line of families
walking through the door. Reading on the kiosk itself OR on their
phone right next to the kiosk.

**Outcome:** Can confidently check in a returning family by any
of the three lookup methods, register a new family, acknowledge
allergy / medical alerts, select recipients, and explain the
security code to parents.

**Prerequisites:**
- Kiosk station is enrolled and powered on
- Service times are configured (so check-in is open)
- Volunteer has been briefly introduced to the layout

**Content:**

1. **The three lookup methods.** At the start screen, parents
   identify their household one of three ways:
   - **Apple Wallet pass scan** — fastest. Parent taps the pass on
     their iPhone wallet → kiosk camera reads the QR. Works for
     families who've previously added the pass
   - **QR code from a tag** — if the family carries a printed
     household QR card (we generate this in the admin household
     detail page)
   - **Last 4 digits of phone** — fallback. Tap "Find by phone" →
     enter last 4 → kiosk lists matching families (rare to have a
     collision; if so, the volunteer asks for the full number)
   - **First-time visitor** — there's a "New family" button on the
     start screen for first-timers

2. **The child-selection screen.** After the household is found, every
   child shows as a tappable card with:
   - Photo (or initial in a circle if no photo)
   - Name + grade chip + assigned room
   - **Allergy** badge (red) if the child has any medical alerts on
     file. Tap to expand details at the next step
   - **Pickup note** badge (amber, with a lock icon) if the
     household has any blocked-pickup entries on file. Discreet — a
     parent or child glancing at the card won't see custody specifics.
     Operator-trained: this just signals "there are restrictions
     we'll verify at checkout"
   - **Pre-checked in** badge (sage) if the family pre-checked-in
     online before arrival (when that feature ships)
   - Tap a card to toggle selection. Tap multiple cards for sibling
     groups checking in together

3. **The allergy / medical confirm screen.** If any selected child
   has alerts, the kiosk shows the actual content (allergies,
   medications, medical notes) and requires the volunteer to tap
   "Acknowledged" before proceeding. The act of acknowledgment is
   audit-logged — important if a child has a reaction later

4. **The recipient selection screen.** Operator asks the parent "who
   will be picking up today?" Tap each adult/authorized contact who
   will be present at pickup. The security-code SMS fans out to
   everyone selected (plus the primary guardian always). This is
   how a grandparent doing pickup gets the code on THEIR phone

5. **The success screen.** A 4-character security code appears. The
   kiosk also automatically prints the label set (if a label printer
   is configured): one large name tag per child + one guardian
   receipt with the security code. The kiosk auto-resets after 30
   seconds of inactivity

6. **The "I'm here for pickup" button.** New addition. On the
   child-selection screen, alongside the regular Next button, a
   sage-green button labeled "I'm here for pickup". This is for
   parents who are NOT checking in — they're arriving to pick up.
   Tapping it fires a ping to the teacher's dashboard so they bring
   the child to the lobby. Distinct from checkout: the actual
   release still requires the security code at a staffed kiosk

7. **What the security code is for.** It's the release authorization.
   When the parent arrives to pick up, the staffed-kiosk volunteer
   asks for the code (from the parent's SMS or printed receipt) and
   matches it to the code on the child's name tag. Match = release

**Common confusions to address:**

- "I scanned the QR but nothing happened" → try better lighting on
  the QR; or fall back to phone last 4
- "The 'Pickup note' badge — what do I do?" → nothing at check-in;
  the system will surface the full details at checkout
- "The Apple Wallet pass scanned but showed the wrong family" →
  unusual. Re-scan; if it persists, the family may have an old pass
  that was generated for a different household
- "Do I need to print labels?" → only if your church has the
  hardware configured. The security code is the actual gate;
  labels are convenience

**Error states:**

- "Household not found" — try the next lookup method, or "New family"
- "Allergy data load failed" — escape hatch: select fewer children
  and retry. Don't skip the alert step

**Insert screenshots:** `a2-kiosk-start-screen`,
`a2-kiosk-qr-scanner-active`, `a2-kiosk-phone-last4`,
`a2-kiosk-child-selection-with-badges`, `a2-kiosk-allergy-confirm`,
`a2-kiosk-recipient-selection`, `a2-kiosk-success-with-code`,
`a2-kiosk-pickup-ready-button-visible`

**Related:**
- A1 (kiosk setup)
- B1 (Apple Wallet family pass — for parents)
- B2 (parent-arrival ping — explains the "I'm here for pickup" path)
- "Label printing" (existing)
- "Registering households" (existing)

---

## A3 — Teacher view

**Slug:** `a3-teacher-view`

**Audience:** Volunteer serving in a children's room. Their phone is
in their pocket; they pull it out when they need to know something
or take an action. Could be in the middle of corralling 12
five-year-olds, so reading time is short.

**Outcome:** Can quickly see who's in their room, what their alerts
are, contact a parent, and acknowledge a parent-arrival ping.

**Prerequisites:**
- Volunteer has already checked themselves into the room at the
  kiosk first ("Room Volunteer Check-In" — if no guide for this
  exists, flag it as missing)
- Church is on Growth tier or above

**Content:**

1. **Getting to the dashboard.** From the main dashboard sidebar,
   tap **Check-In** → on the Check-In landing page, tap the new
   **Teacher View** tile in the Quick Actions area. Lands at
   `/dashboard/teacher/rooms`

2. **What the page shows.** Each room the volunteer is currently
   checked into appears as a section, with:
   - Room name + total children count
   - Ratio status indicator (OK / Warning / Violation) based on
     the children:adult ratio policy
   - List of children in the room

3. **Each child row contains:**
   - Name + grade
   - Allergy badge if any
   - Allergies, medications, medical notes (the org's
     medical-visibility config governs which of these the teacher
     sees vs which are tap-to-reveal — admin sets this in Settings)
   - Parent contact: phone number, displayed masked (`***1234`) for
     privacy
   - **Page parent** button (coral) — see B3 guide
   - When applicable: a coral background + ring + "Parent here for
     pickup" header + an "On my way" button (see B2 guide)
   - When applicable: attendance pills below the parent line —
     "Present" / "Not in room" (see B5 guide)

4. **Auto-refresh.** The page polls every 30 seconds while the
   tab is visible. If the volunteer's phone screen sleeps, the
   poll pauses to spare the battery; resumes on wake

5. **Sign-out and check-out.** Teacher leaves the room by checking
   themselves out at the kiosk OR via the existing volunteer
   checkout flow. After checkout, this dashboard stops showing
   their roster

**Common confusions:**

- "Why is the phone masked?" — Privacy. Tap "Page parent" to
  contact them via SMS; you don't need to dial directly
- "I see a coral row but no action buttons" — you may not be
  checked in. Re-check via the kiosk
- "I don't see the children for the room across the hall" — this
  view only shows rooms YOU're checked into. Each teacher sees their
  own assignments

**Error states:**

- "You're not checked in to any rooms" — directs the volunteer to
  the kiosk to check in first
- 30s of stale data — pull-to-refresh works; otherwise wait for
  the next poll cycle

**Insert screenshots:** `a3-checkin-quickactions-with-teacher-view`,
`a3-teacher-view-empty-state`, `a3-teacher-view-with-children`,
`a3-teacher-view-pickup-ready-state`, `a3-teacher-view-acknowledged-state`,
`a3-page-parent-modal`

**Related:**
- A1 (kiosk setup)
- B2 (parent-arrival ping — the cross-side view)
- B3 (Page Parent SMS — full details)
- B5 (attendance pills — full details)

---

## A4 — Admin per-room drill-down

**Slug:** `a4-admin-room-view`

**Audience:** Admin (church staff or coordinator) running Sunday
morning operations. Reading on a laptop OR an iPad they walk around
the building with. Often interrupted, often switching contexts.

**Outcome:** Can drill into any room from `/dashboard/checkin` to see
its full roster + who's staffing it, identify staffing gaps in real
time, and reach a parent quickly if needed.

**Prerequisites:**
- Has admin or owner role in the church
- Today's services are in progress (rooms have children + adults
  checked in)

**Content:**

1. **Starting point.** `/dashboard/checkin` shows the live Check-In
   dashboard with: total checked in today, room breakdown bars
   (each room shows checked_in / capacity with a color bar — sage
   under 80%, amber 80-99%, coral 100%+), recent sessions

2. **Drilling into a room.** Each room card in the breakdown is now
   clickable → navigates to
   `/dashboard/checkin/rooms/{roomId}/today`. The drill-down page
   shows:
   - Room name + capacity
   - Totals: children present, adults on duty, children checked out
   - **Adults on duty** section — each volunteer checked in to the
     room with their check-in time. **A warning banner appears if
     this section is empty** — ratio policy at risk
   - **Children present** section — each child's name, grade,
     check-in time, parent name + tappable phone link (admin sees
     the full unmasked number — admin role bypasses the volunteer-
     side masking), medical alert badge when present + the expanded
     details
   - Page auto-refreshes every 30 seconds

3. **What to do when adults-on-duty is empty.** Either the volunteer
   forgot to check themselves into the room at the kiosk, or no
   volunteer is actually there. The fix: walk to the room, confirm,
   either re-check the volunteer in at the kiosk or assign a backup

4. **Linking from here.** A back link returns to
   `/dashboard/checkin`. From the room view, the parent phone is
   tappable — tap to dial directly from a phone

5. **Permissions.** Only admin and owner roles see this page. The
   kiosk wall-display variant (different surface — `/checkin/room/...`
   with a token) is still the right tool for a wall-mounted iPad
   inside the classroom itself

**Common confusions:**

- "I see 3 children but the volunteer says 4 are physically here" →
  ratio is based on KIOSK check-ins; a child standing in the room
  who didn't get checked in won't appear. Walk to the kiosk and
  check them in
- "The room shows 0 capacity" → capacity is configured in Settings →
  Check-In → Rooms. Set a real number for the ratio bars to work

**Error states:**

- 404 "Room not found" — link is stale or room was deleted
- 403 "Admin or owner role required" — non-admin volunteers don't
  see the page (and the tile that links to it is hidden for them)

**Insert screenshots:** `a4-checkin-dashboard-with-clickable-rooms`,
`a4-room-drilldown-typical`,
`a4-room-drilldown-no-adults-warning`, `a4-room-drilldown-with-medical-alerts`

**Related:**
- A5 (emergency roster — when you need the cross-room view)
- A2 (kiosk runtime — where the data comes from)
- "Volunteer ratio policy" (existing)

---

## A5 — Emergency / first-responder roster

**Slug:** `a5-emergency-roster`

**Audience:** Admin (admin or owner role only — strictly gated).
During an emergency: fire drill, evacuation, missing child.
Reading conditions: stressful, possibly outside in a parking lot,
possibly handing the device or a printed copy to a first responder.

**Outcome:** Can pull up a cross-room sweep of every checked-in
child, see their medical alerts + parent contact regardless of
the normal visibility config, print a paper copy for a marshal.

**Prerequisites:**
- Admin or owner role
- Today's service has children checked in

**Content:**

1. **What this is for.** The Emergency Roster is the legally-material
   "give me everything I need RIGHT NOW" view. It bypasses the
   normal medical-visibility gating (admin sees all medical fields
   regardless of org config) because EMTs and the evacuation marshal
   need full information in an actual emergency

2. **Important note: every access IS audited.** Every time someone
   opens this page, an audit row fires with the optional reason
   they provided. This isn't punitive — it's so a church board
   can correlate accesses to actual incidents

3. **Getting there.** From `/dashboard/checkin`, tap the
   **Emergency Roster** tile (admin/owner only — the tile is hidden
   for non-admins). Lands at `/dashboard/checkin/emergency-roster`

4. **The consent modal.** On first open, a modal appears requiring
   acknowledgment + an optional reason text field (e.g. "Fire
   drill", "Missing child report"). The reason is captured in the
   audit row. Tap "Open roster" to proceed

5. **What the roster shows.** Children grouped by room, with each
   row containing:
   - Name + grade + accounted-for checkbox (client-side only —
     for the marshal to head-count as children are confirmed)
   - **ALERT** badge if any medical info exists
   - **REPORTED ABSENT FROM ROOM** badge (amber, bold) if the
     teacher has marked the child as not actually in the room (see
     B5 guide — attendance-taking)
   - **Confirmed present** badge (sage, subtle) if the teacher has
     marked them as in the room
   - Allergies, medications, medical notes — full text
   - Parent name + unmasked phone (admin sees the real number)
   - All authorized pickup contacts — name + relationship + phone

6. **Printing.** Tap the print button (or browser File → Print).
   A dedicated print stylesheet renders for monochrome: strips the
   nav, formats child rows for an A4/Letter page, badges become
   bordered black-on-white shapes that stay legible on paper. Hand
   the printout to the marshal or EMT

7. **What "REPORTED ABSENT" means for the marshal.** A teacher has
   said "this child was checked in but isn't physically in our
   room." Don't waste search time on that child in their assigned
   room; check elsewhere (bathroom, lobby, parking lot)

**Common confusions:**

- "I clicked in but it shows fewer children than I expected" — only
  CURRENTLY CHECKED IN children appear. Already-checked-out
  children don't surface here. If a marshal needs to count
  everyone who was in the building today (including those who
  left), use the regular Check-In dashboard's history
- "Can I see this from a phone?" — yes, but the print stylesheet
  is optimized for paper. The screen view is functional on mobile

**Error states:**

- 403 — non-admin/owner — the tile is hidden but a direct URL
  bounces with this error
- The "Data load failed" stub row inside the roster — happens when
  a specific session's child or household doc didn't load. Marshal
  still sees the session ID and room so they know to ask the
  kiosk operator

**Insert screenshots:** `a5-emergency-tile-admin-view`,
`a5-consent-modal`,
`a5-roster-typical`, `a5-roster-with-reported-absent-badge`,
`a5-roster-print-preview`

**Related:**
- A4 (admin per-room drill-down — non-emergency monitoring)
- B5 (attendance-taking — how the absent flag gets set)
- "Audit log access" (admin docs)

---

# TIER 2 — Important for Sunday onward

## B1 — Apple Wallet family pass

**Slug:** `b1-apple-wallet-pass`

**Audience:** Parent / guardian. Reading conditions: at home, casual.

**Outcome:** Pass on their iPhone Wallet, ready to scan at the
kiosk. Understands what location-aware does.

**Prerequisites:**
- Has been registered as a guardian in the church's household
  records
- Has an iPhone (Android Wallet is on the queue, not shipped yet)

**Content:**
- What the pass is: a persistent identification for their household;
  scans at the kiosk in place of phone-last-4 or the printed QR card
- How to add it: open the guardian portal link the church sent
  (`/guardian?...`) → tap **Add to Apple Wallet** → tap **Add** on
  the iOS sheet
- The location-aware magic: when the iPhone's location indicates
  they're within ~100m of the church campus, the pass auto-appears
  on the lock screen with "Check in at {campus name}". Single tap
  opens the pass in Wallet, ready to scan at the kiosk
- What's on the pass: family name, list of children's first names,
  household ID barcode. Church logo on the strip (if uploaded)
- Security code rotation: the 4-character pickup code rotates per
  check-in and is SMS'd separately. It is NOT on the pass — the
  pass identifies the household, the code authorizes release
- Updating when household data changes: today, the pass is static
  once installed. If a household name changes or a new child joins,
  the parent should re-tap **Add to Apple Wallet** from the guardian
  portal to refresh. (Future enhancement: auto-update push.)

**Insert screenshots:** `b1-guardian-portal-add-button`,
`b1-ios-wallet-add-sheet`, `b1-pass-on-lock-screen-near-church`

**Related:** A2 (kiosk runtime — the pass-scan path)

---

## B2 — Parent-arrival pickup ping

**Slug:** `b2-pickup-ready-ping`

**Audience:** Both parents AND teachers. Two-sided content. Author
two clear sections.

**Outcome:** Parent fires the ping; teacher sees it; child gets to
the lobby quickly.

**Content (parent side):**
- Why this exists: when the children's-ministry area is secured and
  parents can't walk to the classroom (key fob required), this
  replaces "find a staff member to radio the teacher"
- Steps: walk up to the kiosk, identify the household (any lookup
  method), tap **I'm here for pickup** (sage green button on the
  child-selection screen, above Back / Next), wait in the lobby
  with the pickup code ready
- Distinct from checkout: the ping is just a signal. The security
  code is still the actual release gate — the staffed kiosk
  matches the code to the child's name tag before handing the
  child over

**Content (teacher side):**
- The teacher dashboard at `/dashboard/teacher/rooms` polls every
  30 seconds; when a parent fires the ping, the relevant child's
  row transitions to a coral background with a coral ring and a
  header line "⚠ Parent here for pickup"
- A sage-green **On my way** button appears at the start of the
  row's action buttons
- Tap **On my way** to flip the row to a sage "Acknowledged"
  state. This signals other teachers (and the admin watching the
  per-room view) that someone's on it
- Walk the child to the lobby and proceed with normal checkout

**Common confusions:**
- "I fired the ping but no teacher came" — they may not have
  acknowledged yet; the visible row state updates within 30s.
  If still no response after a few minutes, find a staff member
- "Two teachers tapped 'On my way' at the same time" — fine; the
  poll resolves to the latest. Both teachers' phones show the same
  acknowledged state on next refresh

**Insert screenshots:** `a2-kiosk-pickup-ready-button-visible` (reuse),
`b2-kiosk-pickup-ready-success`,
`a3-teacher-view-pickup-ready-state` (reuse),
`a3-teacher-view-acknowledged-state` (reuse)

**Related:** A2, A3

---

## B3 — Page Parent SMS

**Slug:** `b3-page-parent`

**Audience:** Volunteer (teacher) in a room. Phone in hand.

**Outcome:** Can SMS a parent for non-emergency communication.

**Content:**
- When to use: child is asking for a parent, child needs a
  diaper change you don't have supplies for, child is sick (but
  not emergency-sick — for emergencies, find a staff member)
- Where: each child row on the teacher dashboard has a coral
  **Page parent** button
- The modal: optional note field (200 char max). Examples of good
  notes to include
- Recipients: SMS fans out to the primary guardian + all
  authorized contacts the parent selected at check-in (the
  recipients selection step). De-duped by phone number
- Cooldown: 60 seconds per teacher per session (prevents accidental
  spam by tapping repeatedly)
- What the SMS looks like (sample text)

**Insert screenshots:** `b3-page-parent-button`, `b3-page-parent-modal`,
`b3-page-parent-cooldown-state`

**Related:** A3 (teacher view)

---

## B4 — Blocked-pickup awareness + verification

**Slug:** `b4-blocked-pickup`

**Audience:** Admin (setup) AND volunteer (checkout-time
verification). Two-section content.

**Tone notes:** This is custody / court-order territory. Keep the
voice clinical and factual, not emotional. Emphasize that every
action is audit-logged.

**Outcome:** Admin can add a blocked-pickup entry with photo + docs.
Volunteer at checkout sees the photo and uses it to verify.

**Content (admin):**
- Navigate to a household's detail page → scroll to
  **Not authorized for pickup** section
- Tap **Add entry** — fields: name, phone, scope (child / household —
  household-scope applies to every sibling in case of a custody
  order covering them all), reason (court_order / household_decision
  / other), optional photo upload, optional supporting document
  (PDF of court order)
- Photos are stored privately in Firebase Storage; only kiosk
  operators see them at the checkout-confirmation step
- Updating / removing: edit the entry the same way; both adds and
  removes are audit-logged

**Content (kiosk operator):**
- **At check-IN:** the child's card shows a small amber **Pickup
  note** badge with a lock icon — discreet so a child glancing at
  the card doesn't see custody specifics. This is just awareness
  that something's on file
- **At check-OUT:** the kiosk shows a full-screen prominent modal
  with every blocked-pickup entry for the household — photos,
  names, reasons. Visually compare the person standing in front
  of you to the photo
- **If you recognize the person on the list:** tap "Person IS on
  this list" — this fires an ERT escalation (SMS to the church's
  Emergency Response Team) and does NOT release the child
- **If NOT on the list:** tap "Confirm — not on the list" — the
  child proceeds to the normal security-code checkout step

**Important policy notes:**
- The blocked-pickup gate works only when admins actually add
  entries with photos. A name-only entry is harder to verify
- If you're unsure whether the person matches the photo, find
  another staff member; never release the child if there's doubt
- Self-service kiosks CANNOT override the blocked-pickup gate.
  Families with blocked entries must use a staffed kiosk

**Insert screenshots:** `b4-household-detail-pickup-sections`,
`b4-add-blocked-modal`,
`a2-kiosk-child-selection-with-badges` (reuse),
`b4-kiosk-blocked-review-modal`

**Related:** A2 (kiosk runtime), A5 (emergency roster)

---

## B5 — Teacher attendance-taking

**Slug:** `b5-attendance-taking`

**Audience:** Volunteer (teacher) in the room.

**Outcome:** Can mark each child Present / Not in room / cleared.
Result surfaces on the emergency roster.

**Content:**
- Why this matters: in an emergency, if a child was checked in but
  isn't physically in your room, the EMT or evacuation marshal
  needs to know not to search there
- Two pills on each child row in the teacher dashboard:
  **✓ Present** (sage when active) and **⚠ Not in room** (amber
  when active)
- Tap to set, tap the active pill again to clear back to unmarked
- Not a cycle — they're independent toggles; you can only have one
  active at a time (server-side enforces)
- The poll resolves races: if two teachers in the same room mark
  the same child differently within 30 seconds, the latest wins
- The result flows to the emergency roster: false → bold amber
  "REPORTED ABSENT FROM ROOM" badge; true → subtle sage "Confirmed
  present" badge; null (unmarked) → no badge

**When to mark:**
- Mark Present once you've physically counted the child in your
  room
- Mark Not in room if a child was checked in at the kiosk but
  hasn't actually appeared in your space (left with a sibling, in
  the bathroom for too long, slipped out, etc.)
- Clear if a marked-absent child shows up

**Insert screenshots:** `b5-attendance-pills-unmarked`,
`b5-attendance-pills-present`, `b5-attendance-pills-not-in-room`,
`a5-roster-with-reported-absent-badge` (reuse)

**Related:** A3 (teacher view), A5 (emergency roster)

---

# TIER 3 — Operational completeness (lighter outlines)

CC should write these as shorter guides — same structure but less
exhaustive than tier 1. Audience + outcome + content + screenshots.

## C1 — Editing a household
**Slug:** `c1-edit-household`
- Edit primary/secondary guardian info, add a child, remove a child
  (soft delete), change a child's grade or default room
- Screenshots: household edit modal, child add/remove confirms

## C2 — Annual grade roll-up
**Slug:** `c2-grade-rollup`
- Per Jason: needs research on whether VolunteerCal has an automated
  tool today. If yes: document. If no: document the manual process
  (export → edit → import) and flag the automated tool as a future
  feature request
- Author flag: please check the code or ask Jason before writing
  this

## C3 — First-time / visitor family at the kiosk
**Slug:** `c3-visitor-registration`
- Visitor registration flow — already exists in the kiosk; document
  the path: New family button → guardian info → add children → review

## C4 — Multi-campus differences
**Slug:** `c4-multi-campus`
- Campus selector, per-campus rooms, per-campus services
- Apple Wallet location-aware works for any campus the church has
  GPS coordinates set for

## C5 — Recovery scenarios
**Slug:** `c5-recovery-scenarios`
- Lost security code (parent doesn't have it): admin can look up
  the session and surface the code
- Lost phone (parent can't get their SMS): admin verifies identity
  with a separate check (drivers license, etc.) and releases
- Second guardian arriving instead of the one who checked in:
  authorized pickup list governs

## C6 — Parent self-service (authorized pickups, viewing security code)
**Slug:** `c6-parent-self-service`
- The `/dashboard/account/family/pickups` page — parents can add /
  request removal of authorized pickup contacts. Adds notify all
  guardians + audit-log
- Security code viewing on the parent's phone (when SMS doesn't
  arrive)

## C7 — Volunteer scheduling for check-in
**Slug:** `c7-checkin-scheduling`
- Assigning teachers/aides to specific rooms for a service
- Cross-references scheduling docs

## C8 — Staffed vs self-service kiosks (deeper dive)
**Slug:** `c8-station-types`
- The conceptual primer expanded from A1
- Specifically: what each type CAN and CAN'T do, regulatory
  defensibility (self-service can't make custody-release decisions),
  recommended use cases per type

---

# Standing instructions for CC

- Don't invent. If the brief is silent on something, ask back
- Don't translate technical terms unless they're user-facing. "Audit
  log" is fine; "Firestore document" is not. "Apple Wallet pass" is
  fine; ".pkpass file" is not
- Be deliberate about plural pronouns — "they/them" when role-neutral
  is good; "she/he/their" inflicted on individual roles can read
  awkward. "The volunteer", "the admin", "the parent" are safer
- Always include the "Why this matters" framing when documenting a
  workflow change (e.g. attendance-taking — open with the emergency-
  roster motivation)
- Keep medical and custody content factual and brief. No emojis,
  no exclamation points, no "Don't worry!" reassurances. The
  context is serious
