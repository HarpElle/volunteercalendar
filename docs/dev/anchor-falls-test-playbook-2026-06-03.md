# Anchor Falls Church — VolunteerCal Test Playbook

**Test date:** Wednesday evening, June 3, 2026 (then possibly Sunday June 7 as backup)
**Tester:** Jason (primary), plus the Anchor Falls children's check-in lead (observer)
**Hardware under test:** Brother QL-820NWB label printer + an iPad or tablet (kiosk device) + your iPhone (Apple Wallet)
**Production SHA at time of test:** Whatever's on `main` (currently `536a0ff` after today's work)

---

## TL;DR — the order

1. **Before leaving home**: pre-flight checklist (15 min)
2. **At church, setup phase**: connect printer to WiFi → set up kiosk device → run printer setup wizard → test print (30-45 min)
3. **At church, test phase**: walk through 4 scenarios, capture screenshots of anything weird (45-60 min)
4. **After the test**: send me whatever broke; we'll fix before Sunday

Expect ~2 hours total at church if everything goes smoothly. Build in buffer for printer-WiFi pairing — that's historically the gnarliest part.

---

## Section 0 — Before you leave home

### 0.1 Hardware checklist

- [ ] **Brother QL-820NWB** printer + power cable
- [ ] **At least one roll of labels** — the QL-820NWB ships with a starter roll (62mm continuous DK-2205 or similar). For check-in stickers, **DK-2205 (62mm continuous)** is what the existing code targets. If you have die-cut rolls, those work too — the printer auto-detects.
- [ ] **Spare label roll** if you have one (Murphy's law on first tests)
- [ ] **Network cable** for the printer (optional — WiFi is preferred, but Ethernet works if church WiFi is finicky)
- [ ] **An iPad, tablet, or laptop** to use as the kiosk — modern Safari or Chrome required
- [ ] **Your iPhone** (with Apple Wallet) for the wallet-pass tests
- [ ] **A USB-C or Lightning charger** for the kiosk device
- [ ] **A power strip** in case church outlets are tight

### 0.2 Account / access checklist

- [ ] You can sign in to `https://volunteercal.com` as the **owner** of Anchor Falls Church
- [ ] You can reach Anchor Falls' church admin pages without VPN
- [ ] You know the Wi-Fi name + password at the church (for printer + kiosk + your phone)
- [ ] Your iPhone has the existing Paschall Family wallet pass installed (from our test) OR you're ready to re-add via the /guardian portal

### 0.3 Pre-flight admin pass

Sign in to `https://volunteercal.com` on your laptop and visit:

- `https://volunteercal.com/dashboard/checkin` — the check-in admin landing page
  - This page has the **"Generate kiosk activation code"** flow. You'll come back here at church.
- `https://volunteercal.com/dashboard/checkin/rooms` — confirm Anchor Falls has at least one check-in room configured
  - If empty, click "Add Room" and create a test room (e.g., "Kids Room" with grade range "K-5th")
  - Without a room, children can't check in (the lookup endpoint will surface them with no `room_name` and the success screen won't print a meaningful label)
- `https://volunteercal.com/dashboard/checkin/households` — confirm the Paschall family is there
  - If not, you may need to add a test household + child (or reuse one of the Codex test seeds if any are still around)
- `https://volunteercal.com/dashboard/checkin/settings` — confirm:
  - Pre-check-in window is set (default 30 min)
  - "Self-service check-in" is enabled (so the kiosk allows phone-number lookup)
  - Guardian SMS on check-in is enabled (so check-in confirms via text)

If any of these are missing, fix them BEFORE you leave so you don't burn church time on config.

### 0.4 Print + bring this guide

You'll want this guide accessible at church. Either:
- Print it to PDF and email to yourself
- Or just keep this file open on your laptop while you work

---

## Section 1 — At church, set up the printer (15-30 min)

### 1.1 Power on + connect to WiFi

1. Plug the QL-820NWB into a power outlet near where the kiosk will live (within ~6 ft is ideal — even though it's WiFi, you may need to physically reach it).
2. Press the power button. Wait ~10 seconds for it to boot. The display will show "Ready" when ready.
3. On the printer LCD:
   - Press **Menu** button
   - Navigate to **WLAN** → **WLAN Enable** → **On**
   - Navigate to **WLAN** → **Setup Wizard**
   - Select your church's WiFi network from the list
   - Enter the WiFi password using the printer's keypad (slow, but works)
   - Wait for "Connected" confirmation (~30 sec)
4. **Note the printer's IP address** — Menu → WLAN → Status. Write it down. You'll need it in step 2.4.
   - Format: `192.168.X.Y` (where X.Y depends on the church router)
   - If the IP looks like `169.254.X.Y`, the printer FAILED to get a real DHCP lease — retry the WiFi setup or fall back to Ethernet (1.5 below)

### 1.2 (Optional fallback) Ethernet instead of WiFi

If WiFi pairing is flaky:
1. Plug a network cable from the church router/switch directly into the printer's Ethernet port.
2. The printer auto-DHCPs over Ethernet. Check Menu → WLAN → Status for the IP (same field whether WiFi or wired).
3. Note the IP for step 2.4.

### 1.3 Load a label roll

1. Open the printer's top cover.
2. Insert the label roll (DK-2205 if 62mm continuous; DK-1202 if die-cut shipping labels).
3. Close the cover firmly. The printer auto-detects the roll and you'll hear a brief calibration.

### 1.4 Print a test page from the printer itself

1. Menu → Settings → Print Configuration
2. The printer prints its own status report (showing IP, MAC, firmware version)
3. **This confirms the printer + label roll work in isolation.** If this fails, the issue is hardware/labels, not VolunteerCal.

---

## Section 2 — At church, set up the kiosk device (15 min)

### 2.1 On your laptop (admin side): generate an activation code

1. Sign in to `https://volunteercal.com` as the Anchor Falls owner.
2. Go to `https://volunteercal.com/dashboard/checkin`.
3. In the kiosk-stations area (it's on the page somewhere — likely the right column or a "Stations" section), click **"Generate kiosk activation code"** or **"Add a new station"**.
4. Give the station a name (e.g., "Wednesday Test Kiosk").
5. You'll see an **8-character activation code** (letters A-F and digits 0-9). It looks like `7F3A2B91`.
6. **Write this code down.** It expires in ~10 minutes, so you have time to walk to the kiosk device, but don't dawdle.

### 2.2 On the kiosk device (iPad/tablet): activate

1. Open Safari or Chrome.
2. Navigate to `https://volunteercal.com/kiosk`.
3. You'll see an "Enter activation code" form.
4. Type the 8-character code from step 2.1.
5. Tap **Activate**.
6. The page will redirect to `/checkin` with a "Lookup" screen showing the church name + "Children's Check-In" heading + the new CheckInBadge (the indigo calendar-with-checkmark icon shipped today).

**If activation fails:**
- "Code is invalid or expired" → generate a fresh one from /dashboard/checkin
- "Could not save credentials" → the device might be in private/incognito browsing mode (localStorage blocked); switch to a regular browser session

### 2.3 PWA install (optional but recommended for a real kiosk)

1. On iPad Safari: tap the share button → **Add to Home Screen** → name it "VolunteerCal Kiosk"
2. The kiosk app now opens full-screen from the home icon, hiding the browser chrome — feels like a real kiosk app.

### 2.4 Run the printer setup wizard

The kiosk needs to know about the printer. From the kiosk's check-in lookup screen:

1. Tap the **Settings** gear icon (corner of the screen)
2. Tap **Set Up Printer**
3. **Step "Brand"**: pick **Brother**
4. **Step "Connection"**: pick **WiFi** (or Bluetooth if you went that route — unlikely for QL-820NWB)
5. **Step "Discover"**: the kiosk scans the local network for printers
   - If your QL-820NWB shows up in the list, tap it
   - If not, you can manually enter the IP address you wrote down in step 1.4
6. **Step "Test"**: tap **Send test label**
   - The printer should print a tiny 1x1 white PNG (the test payload from the wizard code)
   - Yes, it's a placeholder — real labels look different. The test just confirms the print pipeline works.
7. **Step "Done"**: the wizard saves the config to Firestore + localStorage and returns you to the kiosk lookup screen.

**If the test print fails:**
- "Printer not reachable" → confirm the printer IP, confirm both devices are on the same WiFi subnet
- "Print job sent but nothing came out" → check that the label roll loaded correctly + the printer LED isn't flashing red

---

## Section 3 — Test 1: Standard check-in flow (15 min)

**Goal:** confirm the end-to-end check-in works: phone lookup → child selection → allergy → recipient → submit → label prints → success screen.

### 3.1 Initiate

1. On the kiosk: tap the phone-number entry field
2. Type the last 4 digits of the Paschall household's phone (you may need to look this up in `/dashboard/checkin/households`)
3. Tap **Enter** or the submit button
4. The kiosk should call `/api/checkin/lookup` and resolve to the Paschall family

**Watch for:** The header shows the new CheckInBadge above the church name + "Children's Check-In" + the prompt copy

### 3.2 Select children

1. Tap the **Ellianna** card → tap **Harper** card (or whichever)
2. Tap **Continue**

### 3.3 Allergy / medical alert (if any)

If your test children have allergies set, you'll see a confirmation modal — tap **Acknowledged**.

If not, this step is skipped automatically.

### 3.4 Recipient selection

This is the W10-1 step (live in production since June 1):

1. The screen shows "Who will pick them up today?" with cards for:
   - Primary guardian (default selected, can't deselect)
   - Other adults associated with the household
   - Authorized pickups
2. Tap any toggles to add additional pickup people for today
3. Tap **Continue**

### 3.5 Submit + label prints

1. Tap **Check In**
2. Wait ~3-5 seconds
3. **Watch the printer.** It should print a label per child:
   - Top line (largest): the child's first name (using the W10-R default `first_name_last_initial` format, so "Sarah J." or in your case "Ellianna J.")
   - Below: room name, date, security code
   - Bottom: parent-tear stub area
4. **Watch the kiosk screen.** It should transition to the Success screen:
   - Large CheckInBadge at the top (replaces the old generic green checkmark)
   - "Success" chip below the badge
   - "Checked In!" heading
   - Child names listed
   - Big security code
   - Print status: "Labels sent to printer" → "Sent" (sage green)
   - **NEW: Family Pass QR code** with "Save your family pass" copy
   - Auto-reset countdown (20 seconds when the QR is shown, 8s otherwise)

**Capture screenshots / photos of:**
- The printed label (especially: is the name readable? is the security code crisp? is the QR code on the parent stub scannable?)
- The kiosk success screen

### 3.6 (Important printer-specific things to validate)

- [ ] Label paper does NOT skip or misfeed
- [ ] Print is crisp at the top (no toner-bleed / overlap)
- [ ] Cutter (if your printer model has one) separates the label cleanly
- [ ] If you printed for 2+ children, both labels printed without manual intervention

---

## Section 4 — Test 2: Add to Apple Wallet via post-check-in QR (10 min)

**Goal:** validate the W10-5A-UI B path — the success-screen QR leads to the /guardian portal where parents can save their pass.

### 4.1 From the success screen on the kiosk

1. On your iPhone, open the Camera app
2. Point it at the QR code on the kiosk's success screen
3. Tap the notification banner that appears ("Open in Safari")
4. Safari opens to `https://volunteercal.com/guardian?church_id=…&token=…`
5. The page renders:
   - CheckInBadge + church name + "Paschall Family" in the header (new from today's PR #211)
   - Children listed
   - Your Check-In QR Code
   - **Family Pass card** with "Add to Apple Wallet" button
   - Recent Check-Ins (your test check-in should show here)
6. Tap **Add to Apple Wallet**
7. The Wallet sheet appears at the bottom — tap **Add** in the top-right
8. The Wallet pass is added — confirm it shows the V6 design (cream bg, dark indigo strip, "Paschall Family", "4TH Ellianna  6TH Harper" side by side, QR + UU7HUS at the bottom)

**If you already have the pass installed:** opening the URL will REPLACE the existing pass (same serialNumber = same household_id). No duplicate.

---

## Section 5 — Test 3: The payoff — wallet pass scan at the kiosk (10 min)

**Goal:** validate W10-5A-UI C — open the Wallet pass, hold it up to the kiosk's camera, household resolves instantly.

### 5.1 Open the pass on your phone

1. On the kiosk, return to the Lookup screen (tap "Start over" or wait for auto-reset)
2. Open Apple Wallet on your iPhone
3. Tap the Paschall Family pass to open it
4. The QR code becomes large + scannable

### 5.2 Scan at the kiosk

1. On the kiosk lookup screen, tap **Scan QR** (this opens the existing camera scanner)
2. Position your iPhone (with the open pass) about 6-12 inches from the kiosk's camera
3. The kiosk should beep / show a recognition cue
4. The household instantly resolves — you should land on the child-selection screen with both children listed (no phone-number typing involved)

**If the scan fails:**
- "Scanned but no household" → the kiosk parsed it as `household_id` correctly, but the lookup failed. Check audit logs (`/dashboard/settings/activity` → look for `kiosk.lookup` with method `wallet_pass`)
- "Camera didn't recognize the QR" → reposition. iPad cameras work better in good light.
- "Scanner not opening" → camera permission may not have been granted; check iPad Settings → Safari → Camera

### 5.3 Complete a check-in via the scanned path

1. Select children → continue → allergy → recipient → submit
2. This is a duplicate check-in for today, so the server should return "Already Checked In" with the alreadyCheckedInNames populated
3. The success screen still shows the QR + success badge (no NEW security code since no NEW sessions)

---

## Section 6 — Test 4 (optional): Checkout flow (10 min)

**Goal:** sanity-check the checkout flow + the W10-1 checkout SMS fan-out.

### 6.1 Initiate checkout

1. On the kiosk: tap the mode toggle from "Check In" to "Check Out"
2. Type the security code from the printed label OR scan its parent-stub QR
3. Tap **Continue**
4. The checkout screen lists the checked-in children
5. Tap the children to check out
6. Tap **Confirm Checkout**

### 6.2 Watch the SMS

If `guardian_sms_on_checkout` is enabled in settings AND the primary guardian has a phone:
- The primary guardian phone receives a text: "Ellianna, Harper has been checked out from Kids Room. Pickup authorized: …"

### 6.3 The W10-1 recipient list

The body should include "Pickup authorized: …" listing the recipients you selected at check-in time. If you only selected the primary guardian, no "Pickup authorized" line should appear.

---

## Section 7 — What to capture for me to review

For each test, jot down:

1. **What worked**
2. **What looked weird or broken**
3. **Screenshots of:**
   - Any error toasts
   - The printed labels (close-up)
   - The kiosk success screen
   - The wallet pass after re-download
4. **Timing observations:**
   - How long did check-in take end-to-end?
   - How fast did the printer respond?
   - Did the WiFi feel slow?
5. **Things your check-in lead noticed** that surprised them — they're your beta user for UX

Send these to me when you get home. We have until Sunday to fix anything serious, and 2+ weeks to address polish items after.

---

## Section 8 — Known issues / non-issues to set expectations

### Known: the printer test page is a tiny 1x1 white PNG
The printer-setup wizard's "test print" sends a placeholder image, not a real label. **The test only confirms the print pipeline is reachable.** Real labels render via the brother_ql adapter at full size during actual check-ins.

### Known: existing wallet passes don't auto-update
If you already have a Paschall pass installed from earlier tonight, the V6 design is what you have. Re-downloading via /guardian or the kiosk QR will REPLACE it in place (same serialNumber). No webServiceURL = no push updates from server.

### Known: QR code on the pass is always black
Apple Wallet hard-fixes barcode color for scanner reliability. The QR will always be black-on-white, not VolunteerCal indigo. Documented in the builder.

### Known: 6+ children = "+N more" overflow on the front
Paschall has 2 children, so this doesn't matter for your test. But if you add 5+ test children, only first 3 show on the front + an "ALSO / +N more" slot. Full list is on the back.

### Non-issue: kiosk lookup screen flickers on first load
If the kiosk takes 1-2 seconds to render the church name after activation, that's the SSR resolving the church doc. Not a bug.

---

## Section 9 — If something is broken at church

### Quick triage decision tree

**Printer prints nothing:**
1. Test print via the printer's own status report (Menu → Settings → Print Configuration)
   - Fails → hardware issue (label roll, power, jam)
   - Works → kiosk-to-printer issue. Re-run printer setup wizard with correct IP.

**Kiosk activation fails:**
1. Code expired? Generate a fresh one.
2. Browser blocks localStorage? Switch from private mode to regular Safari.
3. The activation API returns 4xx? Capture the error message and send to me.

**Family lookup returns "No family found":**
1. Confirm Paschall is in `/dashboard/checkin/households` (or whichever family you're using)
2. Confirm phone last-4 matches what's on the household record
3. If wallet-pass scan fails: capture the audit log entry (method = wallet_pass) — it'll tell me what went wrong

**Wallet pass doesn't add:**
1. Check the URL Safari opened — should start with `https://volunteercal.com/api/wallet/family-pass?...`
2. Confirm iPhone's iOS version supports PassKit (any iPhone from the last 10 years does)
3. If Safari shows the .pkpass as a download instead of the Wallet sheet, that's a Safari version quirk — tap the download, then "Open with Wallet"

**The whole kiosk is unresponsive:**
1. Pull-to-refresh in Safari (or fully close and re-open the bookmark)
2. If still unresponsive, the Vercel deploy may have an issue. Check `https://volunteercal.com/status`.

**You can't fix it on-site:**
- Text me with what you tried + what error message you saw
- I'll either fix-forward + redeploy or talk you through a workaround

---

## Section 10 — After the test

When you're back home:

1. **Send me your notes** — what worked, what didn't, screenshots
2. **List your top 3 friction points** — these become Wednesday-night-to-Sunday hotfixes
3. **Decide if Sunday testing is needed** — if Wednesday went smoothly, Sunday could be a real check-in with families instead of a test
4. **Update Anchor Falls' production data** based on what you learned (e.g., add real rooms, real volunteers, etc.)

If anything looks like a major regression I should know about same-night, text me — I can hotfix it Wednesday late-night for a Thursday/Friday Vercel deploy.

---

## Quick reference — URLs you'll need

| What | URL |
|---|---|
| Admin overview | `https://volunteercal.com/dashboard/checkin` |
| Add a check-in room | `https://volunteercal.com/dashboard/checkin/rooms` |
| Households list | `https://volunteercal.com/dashboard/checkin/households` |
| Kiosk stations admin | `https://volunteercal.com/dashboard/checkin/settings?tab=stations` |
| Check-in settings | `https://volunteercal.com/dashboard/checkin/settings` |
| Kiosk activation (on the iPad) | `https://volunteercal.com/kiosk` |
| Kiosk check-in app | `https://volunteercal.com/checkin` (auto-redirects from `/kiosk` after activation) |
| Audit log viewer | `https://volunteercal.com/dashboard/settings/activity` |
| Production status | `https://volunteercal.com/status` |

---

Good luck on Wednesday. If you have ANY question while you're there and I can answer in a few minutes — text me.
