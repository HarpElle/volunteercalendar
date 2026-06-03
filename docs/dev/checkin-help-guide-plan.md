# Check-In Help Guide — Coordination Kit

**Audience:** Jason (admin) → routes asks to Claude Chat (copy)
and Codex (screenshots) → returns artifacts to Claude Code
(me) for incorporation into `src/app/dashboard/help/page.tsx`.

**Goal:** complete coverage of the Check-In feature surface for
Anchor Falls testing onward.

Last updated: 2026-06-02 (post attendance-taking ship)

---

## Existing coverage (already in `/dashboard/help`)

The current "Children's Check-In" entry (page.tsx line 1075) covers:
- ✅ Setting up Check-In (service times, printers)
- ✅ Registering households
- ✅ Running the kiosk (returning + new families, allergy ack, security code)
- ✅ Pick-up / checkout (security code matching)
- ✅ Printer setup (Brother QL / Zebra)

**Gap: needs significant expansion to cover everything shipped in the
last 48 hours.** The existing copy is correct but incomplete.

---

## Journeys to add or expand

### Tier 1 — Highest value for tomorrow's Anchor Falls test

| ID | Journey | Audience | Status | Why tier 1 |
|---|---|---|---|---|
| **A1** | First-time kiosk setup (enrollment) | Admin | Update existing | Jason will do this LIVE tomorrow |
| **A2** | Running the kiosk on Sunday morning (check-in flow walkthrough) | Volunteer at kiosk | Update existing + add screenshots | Parents will interact with it |
| **A3** | Teacher view — what you see when checked into a room | Volunteer (teacher) | **NEW** | Just-shipped W10-2 surface; hidden behind a nav tile now (#228) |
| **A4** | Admin per-room view — drilling into a classroom from the dashboard | Admin | **NEW** | Just-shipped #229 |
| **A5** | Emergency roster — accessing + reading + printing | Admin | **NEW** | Just-shipped nav surfacing #228; pre-existing functionality |

### Tier 2 — Important but not blocking tomorrow

| ID | Journey | Audience | Status | Why tier 2 |
|---|---|---|---|---|
| **B1** | Apple Wallet family pass — adding it, what it does, location-aware | Parent | **NEW** | Just-shipped #227 (location-aware). Parents won't ALL use this immediately |
| **B2** | Parent-arrival pickup ping | Parent + Teacher (two-sided) | **NEW** | The KidCheck killer (#231+#232). Useful Sunday onward |
| **B3** | Sending an alert/notification to a parent (Page Parent SMS) | Volunteer (teacher) | **NEW** | W10-3 surface; teachers may not discover without docs |
| **B4** | Blocked-pickup awareness + photo verification | Admin (setup) + Volunteer (operator) | **NEW** | Just-shipped #230 (discreet indicator). Sensitive topic — copy needs care |
| **B5** | Teacher attendance-taking — present / not-in-room | Volunteer (teacher) | **NEW** | Just-shipped #235. Tie into the emergency-roster story |

### Tier 3 — Operational completeness (can ship over the next 2 weeks)

| ID | Journey | Audience | Notes |
|---|---|---|---|
| **C1** | Changing a household (edit, add child, remove child) | Admin | Existing households page UX; needs walkthrough |
| **C2** | Annual grade roll-up (advancing children) | Admin | Confirm whether we have an automated tool. If not, document the manual process and queue the tool as future work |
| **C3** | First-time / visitor family at the kiosk | Volunteer (operator) | Visitor registration flow already exists |
| **C4** | Multi-campus differences (campus selector, per-campus rooms) | Admin | If a church has more than one campus |
| **C5** | Recovery scenarios: lost code, lost phone, second guardian arriving instead | Volunteer (operator) | Edge-case handbook for SunMorning issues |
| **C6** | Parent self-service (managing authorized pickups, viewing security code on phone) | Parent | Existing /dashboard/account/family/pickups page; needs walkthrough |
| **C7** | Volunteer scheduling for check-in (assigning teachers to rooms) | Admin / scheduler | Cross-references scheduling docs |
| **C8** | Staffed vs self-service kiosks (the W10-1 distinction) | Admin (setup) | Quick conceptual primer |

---

## Per-journey briefs

Each section below is **the thing Jason hands to Claude Chat for copy authoring** and **the screenshot list for Codex**.

### A1 — First-time kiosk setup (UPDATE EXISTING)

**Audience:** Admin who's never set up Check-In before.

**Outcome:** A working kiosk station running on an iPad at the church's front lobby, bound to the right church + assigned the right type.

**Steps to document:**
1. Admin opens Settings → Check-In → Stations
2. Click "Add Station" → choose type (staffed vs self-service — explain the difference)
3. Click "Generate code" → 8-character activation code appears, expires in 10 min
4. On the iPad, open `https://volunteercal.com/checkin` in Safari → enrollment screen appears
5. Enter the activation code → station is bound; landing screen appears
6. Optional: bookmark the kiosk URL to home screen as a PWA for full-screen mode

**Open design questions for copy author:**
- How to explain staffed vs self-service in one sentence?
- What's the tone for the "if it doesn't work, do X" troubleshooting copy?

**Screenshots Codex needs to capture:**
1. Settings → Check-In → Stations page, with one existing station + the "Add Station" button visible
2. Add Station modal showing the staffed vs self-service toggle
3. 8-character activation code display with the expiry timer
4. iPad-sized screenshot of the enrollment screen (volunteercal.com/checkin in fresh-load state)
5. iPad-sized screenshot of the enrollment screen WITH the code entered (the example from Jason's screenshot earlier: "A3F5 E8D9")
6. iPad-sized screenshot of the kiosk landing screen after successful enrollment (with the church name visible)

---

### A2 — Running the kiosk on Sunday morning (UPDATE EXISTING)

**Audience:** Volunteer staffing the kiosk station.

**Outcome:** Can check in a returning family, a new family, and a family with allergies; understands what the security code is for.

**Steps to document:**
- Returning family by QR scan
- Returning family by last-4 phone lookup
- Returning family by Apple Wallet pass scan (NEW)
- New family registration flow
- Selecting which children to check in
- Acknowledging allergy / medical alerts
- Allergy & blocked-pickup badges visible on child cards
- Recipient selection (who's picking up today)
- Security code SMS + receipt label
- What "I'm here for pickup" button does (NEW — see B2 also)

**Screenshots Codex needs to capture:**
1. Kiosk lookup screen — empty state with QR / phone / Apple Wallet entry points
2. Kiosk lookup screen — QR scanner active (camera viewfinder)
3. Kiosk child-selection screen with two children, ONE child showing the "Allergy" badge AND the new amber "Pickup note" badge (need a test household for this — Jason has one)
4. Allergy confirm screen (the moment the operator acknowledges)
5. Recipient selection screen
6. Success screen with the 4-character security code visible
7. The receipt label printout (physical photo — Jason captures from Brother QL)

---

### A3 — Teacher view (NEW)

**Audience:** Volunteer who's serving in a children's room.

**Outcome:** Can see the children in their room, allergies, parent contact (masked), ratio status, and acts on parent-pickup pings.

**Steps to document:**
1. Volunteer checks themselves into the room at the kiosk first (point to a "Room Volunteer Check-In" guide if it doesn't exist — flag if it needs writing)
2. On their phone, navigate to /dashboard/checkin → tap the "Teacher View" tile (new!) → lands on /dashboard/teacher/rooms
3. Each room they're checked into shows its roster
4. Each child row shows: name, grade, parent phone (masked: ***1234), allergies / medical notes (subject to org's medical_visibility config), ratio status
5. The two attendance pills: Present / Not in room (NEW — see B5)
6. "Page parent" button — when to use it, cooldown explanation
7. "On my way" button appears when a parent fires the pickup-ready ping (NEW — see B2)
8. Page auto-refreshes every 30s

**Open design questions for copy author:**
- How to explain the "masked phone" so the operator knows it's intentional
- Tone for the "Page parent" guidance (it's an SMS; don't trigger casually)

**Screenshots Codex needs to capture:**
1. /dashboard/checkin showing the new "Teacher View" tile in the QuickActions grid
2. /dashboard/teacher/rooms — empty state ("You're not checked in to any rooms")
3. /dashboard/teacher/rooms with one room + 3 children, one with allergies + alert badge
4. The same view with one child in "Parent here for pickup" state (coral row + "On my way" button)
5. The same view with the row in "Acknowledged" state (sage)
6. Page Parent modal open

---

### A4 — Admin per-room view (NEW)

**Audience:** Admin running Sunday morning, monitoring rooms.

**Outcome:** Can drill into any room from /dashboard/checkin to see its full roster, identify staffing gaps, find a child's parent quickly.

**Steps to document:**
1. /dashboard/checkin shows the "Rooms" section with capacity bars
2. **Click any room card** → drills into /dashboard/checkin/rooms/[id]/today
3. Page shows: room totals, adults on duty (warning if zero!), children present with full details (name, grade, parent name + tappable phone, medical alerts expanded)
4. Auto-refreshes every 30s
5. Back link returns to /dashboard/checkin

**Screenshots Codex needs to capture:**
1. /dashboard/checkin with the Rooms section + room cards (showing capacity bars at different fill levels)
2. The drill-down page for a typical room (3-5 children + 2 adults on duty)
3. The drill-down page showing a child with a medical alert (expanded allergies/medications block)
4. The drill-down page with zero adults on duty (warning banner visible)

---

### A5 — Emergency roster (NEW)

**Audience:** Admin during an emergency (fire drill, evacuation, missing child).

**Outcome:** Can access the cross-room sweep view with full medical data + parent contact regardless of normal visibility config; can print for a marshal.

**Steps to document:**
- Sensitive context: this is the legally-material access path. Audit row fires every time.
- /dashboard/checkin → "Emergency Roster" tile (admin only)
- Consent modal: required acknowledgment + optional reason text
- Page layout: children grouped by room, full medical fields, parent contact
- "Reported absent from room" amber badge — when it appears + what to do (NEW — links to attendance-taking)
- Print: dedicated stylesheet for monochrome legibility

**Open design questions for copy author:**
- How to set the right tone (this is a real-emergency tool, not for casual browsing)
- Clear statement that access IS audited

**Screenshots Codex needs to capture:**
1. /dashboard/checkin showing the "Emergency Roster" tile (admin-only — confirm it's NOT visible to non-admin)
2. The consent modal in its initial state
3. The roster page with rooms collapsed
4. The roster page with one child showing the amber "REPORTED ABSENT FROM ROOM" badge
5. Print preview (browser File → Print) showing the print stylesheet output

---

### B1 — Apple Wallet family pass (NEW)

**Audience:** Parent.

**Outcome:** Pass on their iPhone Wallet, auto-appears at the church.

**Steps to document:**
- What it is (persistent per household, auto-update note: NOT automatic on data changes today)
- How to get it: open the guardian portal link → tap Add to Wallet
- The location-aware pop-up when they arrive at the church
- What the pickup code is (rotates per check-in; not on the pass)
- What to do when household data changes (re-tap Add to Wallet to refresh)

**Screenshots Codex needs to capture:**
1. Guardian portal screen with the Add to Apple Wallet button visible
2. The iOS Wallet "Add" sheet rendering the pass with church logo on the strip
3. The pass on the iPhone lock screen when within ~100m of the church (Jason will capture this physically at Anchor Falls)

---

### B2 — Parent-arrival pickup ping (NEW)

**Audience:** Parent AND Teacher (two-sided).

**Outcome:** Replaces the radio-the-teacher workflow. Parent scans at kiosk → teacher's dashboard lights up → teacher acks → brings child.

**Steps to document (parent side):**
- Walk up to kiosk
- Look up household (QR / phone / wallet pass)
- Tap "I'm here for pickup" button (sage green)
- Success screen confirms which children + tells parent to wait with pickup code

**Steps to document (teacher side):**
- Child's row turns coral with "Parent here for pickup" header
- Tap "On my way" → row turns sage with "Acknowledged" header
- Bring child to lobby + present pickup code as usual

**Tie-in:** Note this is a SIGNAL only — the security code at checkout is still the actual release.

**Screenshots Codex needs to capture:**
1. Kiosk ChildSelection screen with the new sage "I'm here for pickup" button visible
2. Kiosk success screen for pickup-ready: "We've let the teacher know — bringing {names} out..."
3. Teacher dashboard: child row in coral "Parent here for pickup" state
4. Teacher dashboard: same row after tapping "On my way" (sage "Acknowledged")

---

### B3 — Page Parent SMS (NEW)

**Audience:** Volunteer (teacher).

**Outcome:** Can SMS a parent for non-emergency communication (e.g., "your child is asking for you").

**Steps to document:**
- From teacher dashboard, tap "Page parent" on a child's row
- Modal opens with optional note field (200 char max)
- Tap Send → SMS fans out to primary guardian + all `present_recipients` for that session
- 60-second cooldown per teacher per session to prevent spam
- What gets sent (sample SMS text)

**Screenshots Codex needs to capture:**
1. Teacher dashboard with a "Page parent" button visible on a child row
2. Page Parent modal open with empty note field
3. Page Parent modal with a sample note typed in
4. Cooldown state (button disabled, secs remaining shown)

---

### B4 — Blocked-pickup awareness (NEW — sensitive)

**Audience:** Admin (setup) + Volunteer (kiosk operator at checkout).

**Outcome:** Admin can add a court-ordered blocked-pickup person with photo + docs. Operator at kiosk sees photo + name at the checkout-confirmation step BEFORE releasing a child.

**Sensitive copy notes:**
- This is custody / court-order territory. Tone should be clinical, factual, not emotional.
- Mention legal-defensibility: every action is audit-logged.

**Steps to document (admin):**
- Navigate to household detail → scroll to "Not authorized for pickup"
- "Add entry" — fields: name, phone, scope (child / household), reason, optional photo, optional court-order PDF
- Photos are stored privately; only the kiosk operator sees them at the checkout confirmation moment

**Steps to document (operator):**
- At check-IN: child card shows a small amber "Pickup note" badge (discreet — peace of mind that it's on file, no specifics shown)
- At check-OUT: a full-screen modal appears showing every blocked person on file with photos + names + reasons
- Operator visually compares the person standing in front of them
- If blocked person attempting: tap "Person IS on this list" → ERT escalation fires (SMS to Emergency Response Team)
- If NOT on list: tap "Confirm — not on the list" → proceeds to security-code checkout

**Screenshots Codex needs to capture:**
1. Household detail page with "Authorized for pickup" + "Not authorized for pickup" sections
2. Add blocked-pickup modal in its empty state
3. Add blocked-pickup modal with a fake entry filled in (don't use real custody details)
4. Kiosk child card with the small amber "Pickup note" badge
5. Kiosk BlockedPickupReview modal at checkout (full-screen, photos + names visible)

---

### B5 — Teacher attendance-taking (NEW)

**Audience:** Volunteer (teacher).

**Outcome:** Can mark each child as Present / Not in room / cleared. Result surfaces on emergency roster.

**Steps to document:**
- Why this matters: emergency-roster discrepancy detection. If a child was checked in but isn't physically here, the EMT/marshal needs to know not to search.
- On teacher dashboard, each child row has two pills: [✓ Present] [⚠ Not in room]
- Tap to set, tap again to clear. Color-coded.
- Result flows to emergency roster as a badge

**Screenshots Codex needs to capture:**
1. Teacher dashboard with attendance pills in default (unmarked) state
2. With "Present" active (sage)
3. With "Not in room" active (amber)
4. Emergency roster showing a child with the "REPORTED ABSENT" badge

---

## What Jason hands to Claude Chat (per-journey)

For each tier-1 + tier-2 journey above, Jason copies the journey brief (audience, outcome, steps, design questions, screenshot list) into a message to Claude Chat with a prompt like:

> Polish the copy for this VolunteerCal Check-In help guide entry. Audience and outcome are at the top; rewrite the step list in plain, scannable language a non-technical church volunteer can follow on their phone at 9:55am on a Sunday. Keep the existing structure. Don't invent feature details beyond what's listed. Output as markdown ready to drop into a React component as JSX text.

## What Jason hands to Codex

A single message with the full list of screenshots from all tier-1 + tier-2 sections, organized as:

> Capture these screenshots in production (volunteercal.com) using my Anchor Falls account. For each, the URL is given + the action to take before the screenshot. Save each as PNG, 2x DPR, with a filename matching the slug.

Each screenshot entry should have:
- Slug (e.g. `a3-teacher-view-pickup-ready-state.png`)
- URL
- Pre-screenshot setup (e.g. "Sign in as a teacher, check yourself into Room A, have another browser tab fire a pickup-ready ping for one of Room A's children, wait 5s")
- Crop hints if applicable

I can produce the assembled Codex screenshot brief as a separate file once Jason confirms the journey scope.

## Incorporation flow (back to me)

When Jason returns with:
- Polished copy from Claude Chat (one block per journey)
- Screenshots from Codex (PNGs in a folder)

I'll:
1. Place screenshots in `public/help/checkin/`
2. Update `src/app/dashboard/help/page.tsx` — extend or replace the existing "Children's Check-In" entry with the full journey set
3. Add new top-level guide entries where a journey is meaty enough to stand alone (e.g. "Emergency Roster — for admin emergencies", "Teacher View")
4. Open a single PR for review

---

## Suggested next concrete action

Jason picks ONE of these to do next:
- **Option A** — Approve this plan and send the tier-1 briefs to Claude Chat for copy + Codex for screenshots. I wait, then incorporate.
- **Option B** — Have me write the *placeholder copy* myself for tier-1 (rough but accurate from code), ship the new structure now, then iterate on polish in a follow-up.
- **Option C** — Have me write the full Codex screenshot brief as a standalone file (the "tell Codex everything they need" doc), ready to hand off.

Default if no response: **Option B** — I draft serviceable copy + placeholder image refs, ship the structure, and Jason can route to Claude Chat for polish whenever it fits.
