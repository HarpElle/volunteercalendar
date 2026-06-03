# A1 — `a1-kiosk-setup`

## Set up your first check-in kiosk

This guide walks you through turning an iPad into a working check-in station for your church's lobby. By the end you'll have a kiosk bound to your church, set to the right type, and ready to check families in.

You'll do most of this at a desk on your laptop, with the iPad you're enrolling sitting next to you.

**Before you start, you'll need:**

- Your VolunteerCal organization created
- A plan on Growth tier or above (check-in requires it)
- At least one iPad or Android tablet
- That tablet on the same Wi-Fi as the rest of your church network

---

### First, what a "station" is

Each physical iPad in your lobby is a **station**. Two things are true of every station, and both are set when you enroll it:

- **It's bound to one church.** If you run more than one organization, a station tied to one church can't accidentally check families into the other.
- **It has a type** — staffed or self-service — that controls what it's allowed to do.

**The station type can't be changed after enrollment.** If you pick the wrong one, you'll revoke the station and re-enroll the iPad with a fresh code. So it's worth getting right the first time. The next section covers the choice.

---

### Choose a station type

This is the most important decision in setup. There are two types.

**Staffed kiosk** — a volunteer stands at the kiosk and supervises every check-in. Staffed stations can do everything:

- Regular check-in
- Pickup verification at checkout, including the blocked-pickup photo comparison
- Overriding the blocked-pickup gate when the operator confirms the person standing there isn't the blocked individual
- The "I'm here for pickup" ping button

**Self-service kiosk** — placed at a turnstile-style entrance where families check themselves in without a volunteer present. A self-service station:

- **Can** do regular check-in
- **Cannot** do checkout — releasing a child always happens at a staffed kiosk, because the security gate is the parent's code, not the device
- **Cannot** override the blocked-pickup gate — if a block fires, that family has to go to a staffed station

**Recommendation:** start with a staffed kiosk for your first deployment. You can add self-service stations later if your check-in volume calls for it.

---

### Generate the activation code

[SCREENSHOT: a1-add-station-modal]

1. Go to `Settings → Check-In → Stations`
2. Click **Add station**
3. Pick the station type (staffed or self-service, per above)
4. Optionally give it a name — `Lobby 1`, `Children's wing`, anything that helps you tell stations apart. It's only for your reference
5. Click **Generate code**

An 8-character code appears with a **10-minute countdown**.

[SCREENSHOT: a1-activation-code-display]

Codes expire after 10 minutes for security. If yours runs out before you've entered it, just click **Generate code** again — the modal stays open and gives you a fresh one.

---

### Enroll the iPad

[SCREENSHOT: a1-ipad-enrollment-empty]

1. On the iPad, open **Safari**. Not Chrome — the location-aware Apple Wallet pass and the full-screen install both need Safari to work
2. Go to `https://volunteercal.com/checkin`
3. You'll see the **Enroll this kiosk** screen with an 8-character input box
4. Type or paste in the activation code. Capitalization doesn't matter

[SCREENSHOT: a1-ipad-enrollment-with-code]

5. Tap **Activate kiosk**

The iPad binds to your church and switches to the kiosk landing screen. That's a working station.

[SCREENSHOT: a1-kiosk-landing-after-activation]

---

### Add it to the Home Screen (recommended)

This step is optional, but it makes the kiosk feel like a real app instead of a browser tab — full screen, no Safari toolbar, and the kiosk address saved so you never have to retype it.

[SCREENSHOT: a1-ipad-pwa-add-to-home-screen]

1. On the kiosk landing screen, tap the Safari **share button** (the square with an arrow pointing up)
2. Choose **Add to Home Screen**
3. Name it `Check-In` (or whatever you like) and tap **Add**

From now on, open the kiosk from that home screen icon for full-screen mode.

---

### Finish your check-in setup

The station is ready, but a few settings make Sunday morning run smoothly. Set these before your first service:

- **Service times** — `Settings → Check-In → Service Times`. This tells the kiosk when to open and close check-in, and when to start treating a child as arriving late
- **Rooms** — `Settings → Check-In → Rooms`. With rooms configured, children get auto-assigned by grade at check-in
- **Label printer (optional)** — `Settings → Check-In → Printers`. VolunteerCal supports the Brother QL-820NWB, Zebra ZD, and Dymo printers. See the **Label printing** guide for the full walkthrough

---

### If something doesn't go as expected

**"I generated a code but didn't enter it in time."** Generate another. The modal stays open and the old code simply stops working.

**"I picked the wrong station type."** Revoke the station from `Settings → Check-In → Stations`, generate a new code with the correct type, and re-enroll the iPad with it.

**"The iPad says 'Invalid activation code.'"** Most often the code expired (codes last 10 minutes). Generate a fresh one and try again.

**"The iPad just shows a spinner that never finishes."** The tablet needs internet — check that it's connected to Wi-Fi. If it's online and still spinning, Safari may be holding onto stale sign-in data. Open one Safari Private window, then close it, and reload the kiosk page to reset.

---

### Messages you might see

- **"Invalid code format"** — the code has to be exactly 8 characters. Re-check what you typed
- **"Code expired"** — the 10-minute window passed. Generate a new code from the Stations settings page
- **"Code already used"** — each code works once. Generate a new one to enroll another station

---

### Related

- **A2 — Running the kiosk on Sunday morning** (what to do once the station is live)
- **Label printing setup** (optional)
- **Service times configuration**
