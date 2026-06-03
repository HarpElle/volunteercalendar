# Briefs for Codex — Check-In Help Guide Screenshots

**Purpose:** Every screenshot referenced by the help guides, with
exact URL, pre-screenshot setup, viewport, and output filename.

**Output location:** `docs/help-guides/checkin/inbox-codex/`
**Output format:** PNG, 2x DPR (Retina), filename = slug + `.png`

**Production context:**
- URL base: `https://volunteercal.com`
- Account: Jason's admin (`jpaschall@gmail.com`) on Anchor Falls Church
- Test households: Anchor Falls has at least one (the Paschall family)
  — if a screenshot needs specific state (medical alerts, blocked
  pickups, etc.), the brief specifies how to set it up

**General setup tips:**
- For admin-facing screenshots: log in as the admin, then navigate
- For kiosk-facing screenshots: enroll a fresh staffed station per
  the steps in `briefs-claude-chat.md` A1, OR if a test station is
  already enrolled, use that. Visit `/checkin` with the station token
  cookie set
- For teacher-facing screenshots: log in as a volunteer who's been
  checked in to a room (use the room-volunteer check-in flow at the
  kiosk first)
- For parent-facing screenshots (`/guardian?...`): use a guardian
  portal magic-link URL — the household detail page in admin has a
  "Send via SMS" button that generates one; copy the URL from the
  network tab

**Viewports:**
- Admin dashboards: 1440 × 900
- Kiosk screens: 768 × 1024 (iPad portrait)
- Teacher / parent phone surfaces: 390 × 844 (iPhone 14 Pro)

**Cleanup after the run:** delete synthetic test households / sessions
/ blocked-pickup entries you created. Don't leave fixtures sitting in
prod.

If you can't capture a particular screenshot (test fixture won't
behave, an unrelated bug blocks, etc.), skip it and add a single
line to `docs/help-guides/checkin/inbox-codex/SKIPPED.md` explaining
why. Don't fake the image.

---

# Tier 1 — for Anchor Falls testing

## A1 — First-time kiosk setup

### `a1-add-station-modal`
- **URL:** `/dashboard/settings` then click the Check-In tab → Stations sub-tab
- **Setup:** Click "Add Station" button
- **Viewport:** 1440 × 900 (admin)
- **Capture:** The modal with the staffed/self-service toggle visible
  and Name field empty
- **Crop hints:** Modal-focused crop with a bit of dimmed-page context
  around it

### `a1-activation-code-display`
- **URL:** Same as above
- **Setup:** In the Add Station modal, pick "Staffed", optionally
  name it "Test Lobby Kiosk", click "Generate code"
- **Viewport:** 1440 × 900
- **Capture:** The 8-character code prominently with the 10-min
  countdown timer visible
- **Crop hints:** Modal-focused

### `a1-ipad-enrollment-empty`
- **URL:** `https://volunteercal.com/checkin` (with NO existing kiosk
  token cookie — clear cookies for the domain first, OR use a fresh
  iPad simulator)
- **Setup:** Fresh load, no input typed yet
- **Viewport:** 768 × 1024 (iPad portrait)
- **Capture:** The "Enroll this kiosk" screen with empty 8-char
  input + Activate button

### `a1-ipad-enrollment-with-code`
- **URL:** Same as above
- **Setup:** Type the code from `a1-activation-code-display` into
  the input — don't tap Activate yet
- **Viewport:** 768 × 1024
- **Capture:** Same screen with `A3F5 E8D9`-style code visible in
  the input

### `a1-kiosk-landing-after-activation`
- **URL:** `https://volunteercal.com/checkin`
- **Setup:** Successfully activated the kiosk (tap Activate; wait
  for the transition)
- **Viewport:** 768 × 1024
- **Capture:** The kiosk landing screen with the church name + the
  initial lookup options visible

### `a1-ipad-pwa-add-to-home-screen`
- **URL:** `https://volunteercal.com/checkin`
- **Setup:** Tap the Safari share icon → scroll to find "Add to Home
  Screen"
- **Viewport:** 768 × 1024
- **Capture:** The Safari share sheet with "Add to Home Screen"
  highlighted/visible
- **Notes:** This is iOS chrome, not just our app. May need to be
  captured on a real iPad — Codex may need to skip this one if
  the iOS share sheet isn't programmable. If skipped, Jason will
  capture manually

---

## A2 — Running the kiosk on Sunday morning

### `a2-kiosk-start-screen`
- **URL:** `/checkin` (kiosk-token cookie set, on a fresh session)
- **Setup:** Wait for any inactivity timer to reset; should show the
  initial lookup screen
- **Viewport:** 768 × 1024
- **Capture:** The full start screen showing all three lookup
  options (QR scanner, phone, Apple Wallet) + "New family" button

### `a2-kiosk-qr-scanner-active`
- **URL:** `/checkin`
- **Setup:** Tap the QR scan option; the camera viewfinder appears
- **Viewport:** 768 × 1024
- **Capture:** Camera viewfinder UI (don't worry about the actual
  camera feed content; aim it at a blank wall or use a permission-
  denied state if needed — the QR-frame overlay is the important part)

### `a2-kiosk-phone-last4`
- **URL:** `/checkin`
- **Setup:** Tap "Find by phone" → enter the last 4 of an existing
  test family's phone
- **Viewport:** 768 × 1024
- **Capture:** The phone-last-4 entry view with the 4 digits typed

### `a2-kiosk-child-selection-with-badges`
- **URL:** `/checkin` — after successful household lookup
- **Setup:** Look up a test household that has at least one child
  with allergies AND at least one blocked-pickup entry (either
  scope=child or scope=household). For Anchor Falls: Jason can
  add a synthetic block on the Paschall household for a child like
  "Test Block" with reason="other"
- **Viewport:** 768 × 1024
- **Capture:** The child-selection grid with one or more cards
  showing BOTH the red "Allergy" badge AND the amber "Pickup note"
  badge with lock icon
- **Cleanup:** Remove the synthetic block after capture

### `a2-kiosk-allergy-confirm`
- **URL:** `/checkin` — after selecting a child with allergies on
  child-selection screen, the next step
- **Setup:** Select a child with `has_alerts: true` whose medical
  data is loaded
- **Viewport:** 768 × 1024
- **Capture:** The allergy confirmation screen showing allergies +
  medical notes + the "Acknowledged" button

### `a2-kiosk-recipient-selection`
- **URL:** `/checkin` — after allergy confirmation
- **Setup:** Continue the flow with at least one authorized pickup
  contact on the household so the list isn't empty
- **Viewport:** 768 × 1024
- **Capture:** The recipient selection screen with a few tappable
  contact rows

### `a2-kiosk-success-with-code`
- **URL:** `/checkin` — after submitting check-in
- **Setup:** Complete the full check-in for at least one child
- **Viewport:** 768 × 1024
- **Capture:** The success screen with the 4-character security code
  prominently displayed

### `a2-kiosk-pickup-ready-button-visible`
- **URL:** `/checkin` — child-selection screen
- **Setup:** Look up a household that has at least one currently-
  checked-in child today (since the pickup-ready button only makes
  sense when sessions are open)
- **Viewport:** 768 × 1024
- **Capture:** The full child-selection screen showing the new sage
  "I'm here for pickup" button above the Back/Next row

---

## A3 — Teacher view

### `a3-checkin-quickactions-with-teacher-view`
- **URL:** `/dashboard/checkin`
- **Setup:** Log in as admin
- **Viewport:** 1440 × 900
- **Capture:** The QuickActions section showing 6 tiles with the
  new "Teacher View" tile clearly visible alongside the others
- **Crop hints:** Focus on the QuickActions area

### `a3-teacher-view-empty-state`
- **URL:** `/dashboard/teacher/rooms`
- **Setup:** Log in as a volunteer who is NOT currently checked
  into any room (or check yourself out at the kiosk first)
- **Viewport:** 390 × 844 (phone)
- **Capture:** The empty-state message ("You're not checked in...")

### `a3-teacher-view-with-children`
- **URL:** `/dashboard/teacher/rooms`
- **Setup:**
  1. Log in as a volunteer
  2. At the kiosk, check the volunteer into a specific room
  3. Ensure the room has at least 3 children checked in (mix of
     with and without allergies)
- **Viewport:** 390 × 844
- **Capture:** The full teacher dashboard with one room expanded
  showing several children, at least one with an Allergy badge

### `a3-teacher-view-pickup-ready-state`
- **URL:** `/dashboard/teacher/rooms`
- **Setup:** Same as above, then fire a pickup-ready ping for one
  of the children in this room from another browser tab:
  - Make a POST to `/api/checkin/pickup-ready` with the kiosk token
    + that household's id
- **Viewport:** 390 × 844
- **Capture:** The teacher dashboard with one child row in the
  coral "Parent here for pickup" state with the sage "On my way"
  button visible

### `a3-teacher-view-acknowledged-state`
- **URL:** `/dashboard/teacher/rooms`
- **Setup:** Continue from the previous state, tap the "On my way"
  button (or POST to `/api/teacher/pickup-ack`)
- **Viewport:** 390 × 844
- **Capture:** The same row now in the sage "Acknowledged — bring
  child to lobby" state

### `a3-page-parent-modal`
- **URL:** `/dashboard/teacher/rooms`
- **Setup:** From the teacher view, tap "Page parent" on any child's
  row
- **Viewport:** 390 × 844
- **Capture:** The Page Parent modal open with the empty 200-char
  note field + Send button

---

## A4 — Admin per-room drill-down

### `a4-checkin-dashboard-with-clickable-rooms`
- **URL:** `/dashboard/checkin`
- **Setup:** Log in as admin. Ensure at least 3 rooms have children
  checked in today, at different capacity levels (one near full,
  one mid, one low). If needed, synthetically check in test
  children to populate the bars
- **Viewport:** 1440 × 900
- **Capture:** The Rooms breakdown section showing the cards as
  visibly clickable (hover state on one would be ideal)

### `a4-room-drilldown-typical`
- **URL:** `/dashboard/checkin/rooms/{roomId}/today` where `{roomId}`
  is a populated room from above
- **Setup:** Navigate to a room with ~3-5 children and 1-2 adults
  on duty
- **Viewport:** 1440 × 900
- **Capture:** The full drill-down page showing room name, totals,
  adults section, children section

### `a4-room-drilldown-no-adults-warning`
- **URL:** `/dashboard/checkin/rooms/{roomId}/today`
- **Setup:** Find or set up a room with children checked in but NO
  adult volunteers checked in (rare in production — Codex may
  need to synthetically check out the adults to force this state).
  If too risky to manipulate prod, skip and note in SKIPPED.md
- **Viewport:** 1440 × 900
- **Capture:** The page showing the warning banner ("No adults
  checked in to this room")

### `a4-room-drilldown-with-medical-alerts`
- **URL:** `/dashboard/checkin/rooms/{roomId}/today`
- **Setup:** Navigate to a room with at least one child who has
  medical alerts (Anchor Falls test data should have at least one)
- **Viewport:** 1440 × 900
- **Capture:** A child row with the Medical alert badge + the
  expanded allergies/medications/notes block visible

---

## A5 — Emergency / first-responder roster

### `a5-emergency-tile-admin-view`
- **URL:** `/dashboard/checkin`
- **Setup:** Log in as admin
- **Viewport:** 1440 × 900
- **Capture:** The QuickActions section with the "Emergency Roster"
  tile visible (admin-only — confirm it's NOT visible to non-admin
  in a sibling screenshot if needed)

### `a5-consent-modal`
- **URL:** `/dashboard/checkin/emergency-roster`
- **Setup:** Fresh visit (so the consent modal appears)
- **Viewport:** 1440 × 900
- **Capture:** The consent modal in its initial state with the
  acknowledgment checkbox + optional reason field empty

### `a5-roster-typical`
- **URL:** `/dashboard/checkin/emergency-roster`
- **Setup:** Confirm consent → roster loads. Ensure at least 2
  rooms have children with mixed alert/no-alert
- **Viewport:** 1440 × 900
- **Capture:** The roster page showing multiple rooms with their
  child rows, at least one Medical ALERT badge visible

### `a5-roster-with-reported-absent-badge`
- **URL:** `/dashboard/checkin/emergency-roster`
- **Setup:**
  1. As a teacher in some room, mark a child as not_in_room via
     the attendance pills (B5 flow)
  2. Switch back to admin, refresh the emergency roster
- **Viewport:** 1440 × 900
- **Capture:** The child row showing the bold amber "REPORTED ABSENT
  FROM ROOM" badge alongside the child's name

### `a5-roster-print-preview`
- **URL:** `/dashboard/checkin/emergency-roster`
- **Setup:** With the roster populated, open browser File → Print
  (or Cmd+P)
- **Viewport:** 1440 × 900
- **Capture:** The browser's print preview pane showing how the
  roster renders in monochrome with the print stylesheet
- **Notes:** If Codex can't easily capture browser chrome (print
  preview is OS-level UI), the next-best is a screenshot of the
  page in the browser with `@media print` applied via devtools
  emulation

---

# Tier 2

## B1 — Apple Wallet family pass

### `b1-guardian-portal-add-button`
- **URL:** `/guardian?church_id=...&token=...` (use a real magic-link
  generated from the household detail page's "Send via SMS" button —
  grab the URL from the network tab)
- **Setup:** Open in any browser
- **Viewport:** 390 × 844 (phone — this is parent-facing)
- **Capture:** The guardian portal with the "Add to Apple Wallet"
  button visible and the family info section

### `b1-ios-wallet-add-sheet`
- **URL:** `/guardian?...` — same magic link, opened on a real iPhone
  in Safari
- **Setup:** Tap the "Add to Apple Wallet" button; the iOS Wallet
  "Add" sheet appears
- **Viewport:** 390 × 844 (iPhone)
- **Notes:** This is iOS chrome — Codex likely can't capture this
  programmatically. Skip and Jason captures manually on his iPhone

### `b1-pass-on-lock-screen-near-church`
- **Notes:** Requires being physically near the church campus with
  the pass installed. Cannot be captured by Codex. Skip — Jason
  captures manually at Anchor Falls

---

## B2 — Parent-arrival ping (reuses A2 + A3 captures)

### `b2-kiosk-pickup-ready-success`
- **URL:** `/checkin`
- **Setup:**
  1. Look up a household with at least one currently-checked-in
     child
  2. On the child-selection screen, tap "I'm here for pickup"
- **Viewport:** 768 × 1024
- **Capture:** The success screen showing the sage checkmark,
  "We've let the teacher know..." copy with child names, the
  pickup-code reminder, and the Done button

---

## B3 — Page Parent SMS (reuses A3 page-parent-modal)

### `b3-page-parent-button`
- **URL:** `/dashboard/teacher/rooms`
- **Setup:** Same as `a3-teacher-view-with-children`
- **Viewport:** 390 × 844
- **Capture:** Crop tighter to a single child row showing the
  coral "Page parent" button at the row's right side

### `b3-page-parent-cooldown-state`
- **URL:** `/dashboard/teacher/rooms`
- **Setup:** Submit the Page Parent modal once, then immediately
  observe the cooldown
- **Viewport:** 390 × 844
- **Capture:** The "Page parent" button in disabled cooldown state
  with remaining seconds visible

---

## B4 — Blocked-pickup awareness

### `b4-household-detail-pickup-sections`
- **URL:** `/dashboard/checkin/households/{householdId}`
- **Setup:** Open a household with at least one authorized pickup
  contact AND at least one blocked-pickup entry (synthetic if
  needed; cleanup after)
- **Viewport:** 1440 × 900
- **Capture:** The "Authorized for pickup" + "Not authorized for
  pickup" sections both visible with entries

### `b4-add-blocked-modal`
- **URL:** Same as above
- **Setup:** Click "Add entry" in the "Not authorized for pickup"
  section
- **Viewport:** 1440 × 900
- **Capture:** The modal in empty state showing all fields (name,
  phone, scope, reason, photo upload, document upload)

### `b4-kiosk-blocked-review-modal`
- **URL:** `/checkin` checkout flow
- **Setup:**
  1. Check in a child for the test household (so there's an open
     session)
  2. Walk through the checkout flow (enter the security code, get
     to the pickup-person confirmation step)
  3. The BlockedPickupReview modal appears because the household
     has blocked entries
- **Viewport:** 768 × 1024
- **Capture:** The full-screen modal with the blocked person's
  photo (thumbnail), name, reason badge, phone, notes, and the
  "Person IS on this list" / "Confirm — not on the list" actions

---

## B5 — Teacher attendance-taking

### `b5-attendance-pills-unmarked`
- **URL:** `/dashboard/teacher/rooms`
- **Setup:** Same as `a3-teacher-view-with-children`. Child with
  no attendance marked
- **Viewport:** 390 × 844
- **Capture:** Crop to a single child row showing both pills in
  the neutral / unmarked state

### `b5-attendance-pills-present`
- **URL:** Same
- **Setup:** Tap "Present" on a child's row
- **Viewport:** 390 × 844
- **Capture:** Single child row showing the sage "Present" pill
  active

### `b5-attendance-pills-not-in-room`
- **URL:** Same
- **Setup:** Tap "Not in room" on a child's row
- **Viewport:** 390 × 844
- **Capture:** Single child row showing the amber "Not in room"
  pill active

---

# Tier 3 — screenshots noted by reference

Tier 3 guides are shorter and reuse much of the screenshot pool
above. CC will reference specific slugs from tier 1 + 2 where
applicable. Codex doesn't need to capture additional screenshots
specifically for tier 3 unless CC's drafts surface new needs.

If new screenshots emerge from tier 3 copy, Jason adds them to a
"Tier 3 supplements" section below in this file and re-routes to
Codex for capture.

---

# Standing instructions for Codex

- Always 2x DPR (Retina-quality)
- Light mode for all dashboard screenshots (we don't ship dark mode
  yet and the help guides should match production)
- For modals and dialogs: include enough surrounding context that the
  reader can see what page they were on, but focus the visual weight
  on the modal
- For sensitive content (custody/blocked-pickup): use clearly-
  synthetic test fixtures with names like "Test Block" — never
  use realistic-looking custody scenarios that could be confused
  with real data
- Clean up after capture. Delete synthetic households, sessions,
  blocked-pickup entries, room volunteer check-ins
- If Anchor Falls' real data appears in any capture, redact or
  reshoot with synthetic data instead — these images go into
  production help guides
