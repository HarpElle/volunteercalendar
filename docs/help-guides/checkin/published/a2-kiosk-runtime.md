# A2 — `a2-kiosk-runtime`

## Running the kiosk on Sunday morning

This is the screen you'll work from all morning. It covers checking in a returning family, registering a new one, handling allergy and medical alerts, choosing who can pick up, and what the security code is for.

**Before you start:** the kiosk should be enrolled and powered on, and your service times set so check-in is open.

---

### Finding a family — three ways

At the start screen, a family can be looked up one of three ways. Use whichever is fastest.

[SCREENSHOT: a2-kiosk-start-screen]

- **Apple Wallet pass scan** — the quickest. The parent taps their pass on their iPhone and holds it up to the kiosk camera, which reads the code. Works for families who've already added the pass.
- **Printed QR card** — if the family carries their household QR card (created from their household page in the admin), scan it the same way.
- **Last 4 digits of phone** — the reliable fallback. Tap **Find by phone**, enter the last four digits, and the kiosk lists matching families. Collisions are rare; if two families match, ask for the full number.

[SCREENSHOT: a2-kiosk-qr-scanner-active]

[SCREENSHOT: a2-kiosk-phone-last4]

**First time here?** Tap **New family** on the start screen to register them on the spot.

---

### Choosing who's checking in

Once the household is found, each child shows as a tappable card.

[SCREENSHOT: a2-kiosk-child-selection-with-badges]

Each card has a photo (or an initial in a circle), the child's name, a grade chip, and their assigned room. Some cards carry a badge:

- **Allergy** (red) — the child has a medical alert on file. You'll see the details on the next step
- **Pickup note** (amber, with a lock icon) — the household has a pickup restriction on file. It's intentionally discreet so a child or parent glancing at the screen won't see private details. You don't do anything about it now — the system handles it at checkout
- **Pre-checked in** (sage) — the family completed check-in online before arriving. (This appears once online pre-check-in is available.)

Tap a card to select it. Tap several cards to check in siblings together.

---

### Acknowledging allergy and medical alerts

If any selected child has alerts, the kiosk shows the actual details — allergies, medications, medical notes — and asks you to tap **Acknowledged** before you can continue.

[SCREENSHOT: a2-kiosk-allergy-confirm]

This step matters. Your acknowledgment is recorded, which is what protects everyone if a child has a reaction later. Don't skip past it.

---

### Choosing who can pick up

Ask the parent, "Who will be picking up today?" Tap each adult or authorized contact who'll be there at pickup.

[SCREENSHOT: a2-kiosk-recipient-selection]

The security-code text message goes to everyone you select, plus the primary guardian automatically. This is how a grandparent doing pickup gets the code on their own phone.

---

### The success screen and the security code

A 4-character security code appears.

[SCREENSHOT: a2-kiosk-success-with-code]

If a label printer is set up, the kiosk also prints the labels automatically: one large name tag per child, plus one guardian receipt showing the security code. The kiosk resets itself after 30 seconds.

**What the code is for:** it's the release authorization. When the parent comes back, the volunteer at a staffed kiosk asks for the code — from their text message or printed receipt — and matches it to the code on the child's name tag. A match means the child is released.

---

### The "I'm here for pickup" button

On the child-selection screen, next to **Next**, there's a sage-green **I'm here for pickup** button.

[SCREENSHOT: a2-kiosk-pickup-ready-button-visible]

This is for a parent who isn't checking in — they're arriving to collect their child. Tapping it sends a ping to the teacher's dashboard so they can bring the child to the lobby. It does not release the child on its own; the security code at a staffed kiosk is still the actual release step.

---

### If something doesn't go as expected

**"I scanned the QR but nothing happened."** Try better lighting on the code, or fall back to the last 4 digits of the phone.

**"What do I do about the Pickup note badge?"** Nothing at check-in. The full details come up automatically at checkout.

**"The pass scanned but showed the wrong family."** Unusual — re-scan. If it keeps happening, the family may have an old pass that was generated for a different household.

**"Do I have to print labels?"** Only if your church has the printer set up. The security code is the real gate; labels are a convenience.

---

### Messages you might see

- **"Household not found"** — try the next lookup method, or tap **New family**
- **"Allergy data load failed"** — select fewer children and try again. Don't skip the alert step

---

### Related

- **A1 — First-time kiosk setup**
- **B1 — Apple Wallet family pass** (for parents)
- **B2 — Parent-arrival pickup ping** (the "I'm here for pickup" path)
- **Label printing**
- **Registering households**
