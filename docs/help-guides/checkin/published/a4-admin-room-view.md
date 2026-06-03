# A4 — `a4-admin-room-view`

## Checking on a room from the admin dashboard

This is how you keep an eye on the whole building during a service — see how full each room is, who's staffing it, and reach a parent if you need to. You can do it from a laptop or from an iPad as you walk around.

**Before you start:** you'll need an admin or owner role, and today's services need to be underway.

---

### Where you start

Open `/dashboard/checkin` for the live Check-In dashboard. It shows:

- Total children checked in today
- A breakdown bar for each room, showing children in vs. capacity, with a color that tells you fullness at a glance: **sage** under 80%, **amber** 80–99%, **coral** at 100% or over
- Recent check-in activity

[SCREENSHOT: a4-checkin-dashboard-with-clickable-rooms]

---

### Drilling into a room

Each room card is clickable. Tapping one opens that room's view for today.

[SCREENSHOT: a4-room-drilldown-typical]

The room page shows:

- The room name and capacity
- Totals: children present, adults on duty, children checked out
- **Adults on duty** — every volunteer checked into the room, with the time they checked in. **If this section is empty, a warning banner appears** — your ratio policy is at risk
- **Children present** — each child's name, grade, and check-in time, the parent's name, and a tappable phone number. As an admin you see the full, unmasked number (the masking volunteers see doesn't apply to you). Medical alerts show a badge and the full details

The page refreshes every 30 seconds.

[SCREENSHOT: a4-room-drilldown-with-medical-alerts]

---

### When "Adults on duty" is empty

[SCREENSHOT: a4-room-drilldown-no-adults-warning]

It means one of two things: a volunteer is in the room but forgot to check themselves in at the kiosk, or no one is actually there. Walk over and confirm. Then either re-check the volunteer in at the kiosk, or assign a backup.

---

### Getting around

A back link returns you to `/dashboard/checkin`. On a phone, the parent's phone number is tappable — tap it to dial.

---

### A note on permissions

Only admin and owner roles can open this page. For an iPad mounted on the wall inside a classroom, use the wall-display view instead (`/checkin/room/...` with its token) — that's the surface built for that job.

---

### If the numbers don't match what you see

**"The room shows 3 children but the volunteer says 4 are here."** The count is based on kiosk check-ins. A child standing in the room who never got checked in won't appear. Walk to the kiosk and check them in.

**"The room shows 0 capacity."** Capacity is set in `Settings → Check-In → Rooms`. Give it a real number so the ratio bars work.

---

### Messages you might see

- **"Room not found"** — the link is stale or the room was deleted
- **"Admin or owner role required"** — volunteers without that role don't see this page

---

### Related

- **A5 — Emergency / first-responder roster** (when you need the cross-room view)
- **A2 — Running the kiosk** (where this data comes from)
- **Volunteer ratio policy**
