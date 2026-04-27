# Functionality Testing — Room Signage / Wall Displays

The `/display/room/[roomId]` page on a wall-mounted tablet shows live room status. Polls every 30s, locks the screen on with wake-lock, color-coded by status.

## Prerequisites

- At least one room created (see `jason-functionality-testing-room-scheduling.md` Test 1)
- That room has reservations on today's date (any status)
- A spare iPad / Android tablet / old laptop for the display. Or just a separate browser window for desk-testing.

---

## Test 1 — Get the display URL

**Steps**
1. `Dashboard → Rooms → [room]` → look for "Display URL" button
2. Click → URL is copied to clipboard

**Expected**
- URL format: `https://volunteercal.com/display/room/{roomId}?token={calendar_token}&church_id={churchId}`
- Same `calendar_token` as the iCal feed (intentional — one capability URL covers both)

**Verify**
| Where | What |
|---|---|
| URL in your clipboard | Has all three params filled in |

☐ **Pass / Fail**: ___

---

## Test 2 — Open the display in a browser

**Steps**
1. Paste URL into a separate browser window (not incognito — wake-lock is more permissive in regular)
2. Press F11 / cmd-shift-F for fullscreen

**Expected**
- Room name in large text
- "Available" / "In Use" / "Starting Soon" status badge with a color
- Sage green = available, coral red = in use, amber = starting soon (within 15 min)
- Today's schedule listed below
- Live clock showing current time
- Page polls server every 30 seconds (not visible — but check network tab to confirm `/api/display/room/.../route.ts` requests fire)

**Verify**
| Where | What |
|---|---|
| Browser network tab | Requests to `/api/display/room/{roomId}` every ~30 seconds |
| Status color | Matches the current time vs. reservations |

☐ **Pass / Fail**: ___

---

## Test 3 — Status transitions

**Steps**
1. Add a NEW reservation in that room starting in 10 minutes from now (use admin to inject)
2. Watch the display

**Expected** (within ~30 seconds of refresh)
- Status flips to "Starting Soon" with amber color and a countdown
- At T-0 (start time), status flips to "In Use" with coral color
- After end_time, status flips back to "Available"

☐ **Pass / Fail**: ___

---

## Test 4 — Wake-lock holds the screen on

**Steps**
1. Leave the display open on the tablet, screen on, in fullscreen
2. Walk away for **30+ minutes**
3. Come back

**Expected**
- Screen still on (no auto-sleep)
- Display still showing accurate status — has been polling every 30s in the background
- No "session expired" or auth errors

**Failure mode**: if the screen goes black, the `useWakeLock` hook isn't holding. Check browser console for wake-lock-acquired log lines on initial load.

☐ **Pass / Fail**: ___ Duration tested: ___

---

## Test 5 — Token validation

**Steps**
1. Try to load the display URL with a bad token: replace `token=...` with `token=garbage`

**Expected**
- Error message: "Unauthorized" or similar — the page shouldn't render real data
- Server response is 401 or 403

**Verify** that the calendar_token check in `/api/display/room/[roomId]/route.ts` actually validates.

☐ **Pass / Fail**: ___

---

## Test 6 — Mobile-friendly fallback

**Steps**
1. Open the display URL on your phone in landscape
2. Open it in portrait

**Expected**
- Landscape: looks proportional, not cropped
- Portrait: layout adjusts, readable
- Touch any element doesn't break the layout (the display is intended for view-only)

☐ **Pass / Fail**: ___

---

## Test 7 — Multi-room signage (one tablet per room)

**Steps**
1. Get display URLs for 2-3 different rooms
2. Open each in a separate browser tab
3. Optionally: tile them on a TV or use a kiosk-mode app to rotate between them

**Expected**
- Each shows the right room's data
- No data leakage between tabs

☐ **Pass / Fail**: ___

---

## Test 8 — Behavior when network drops

**Steps**
1. Display open and showing fresh data
2. Disable Wi-Fi on the tablet for 2 minutes
3. Re-enable Wi-Fi

**Expected**
- During the outage: data goes stale (last good fetch shown), maybe a small "reconnecting" indicator
- After Wi-Fi returns: next 30s poll succeeds, data refreshes
- Page does NOT crash or show a JS error

☐ **Pass / Fail**: ___

---

## Test 9 — Token rotation kills the display

**Steps**
1. As admin, regenerate the room's calendar_token (rotate it)
2. Watch the display

**Expected**
- Within ~30 seconds (next poll), display gets a 401 from the server
- Display shows an error or redirects somehow
- New token works when reapplied

**Verify**
| Where | What |
|---|---|
| Firestore `churches/{churchId}/rooms/{roomId}` | `calendar_token` value changed |
| Display network tab | After rotation, requests return 401 |

☐ **Pass / Fail**: ___

---

## Test 10 — Long-form reservation rendering

**Steps**
1. Create a reservation with:
   - Long title (100 chars): "Wednesday Night Worship Practice and Sound Check Setup with Full Band Rehearsal"
   - Long setup notes
   - Multiple equipment items
2. View on the display

**Expected**
- Title truncates gracefully (ellipsis), or wraps cleanly
- Doesn't break the layout
- All equipment items shown or "+ N more"

☐ **Pass / Fail**: ___

---

## Failure modes to watch

- **Auth lapses after a few hours** — token-based auth doesn't expire (we never set one), so this should NOT happen. If it does, regression in token-handling.
- **Wake-lock fails on iOS Safari** — Safari's wake-lock support is more limited; might require user interaction first. If you can't keep iPad screen on with the standard hook, that's a known iOS limitation, not a bug.
- **Status color doesn't update** — polling broken. Check network tab.
- **Wrong room shown** — `roomId` in URL not matching. Check URL.

## Recommended deployment for production

- iPad in landscape, mounted next to each major room's door
- Use **Guided Access** on iOS to lock the device to the display URL only (Settings → Accessibility → Guided Access)
- Keep Wi-Fi on, charger plugged in
- Use a "kiosk mode" app like **Kiosk Pro** if you want to disable the home button entirely and prevent navigation away from the display URL

## What I can't test for you

- iPad Guided Access setup
- Wall-mount hardware
- Wi-Fi reliability at the church
- Whether a 32" wall-mounted display reads cleanly from across a hallway
