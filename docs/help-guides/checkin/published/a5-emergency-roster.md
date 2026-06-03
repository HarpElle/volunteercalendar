# A5 — `a5-emergency-roster`

## The emergency roster

The emergency roster is the single view that gives you everything you need in an actual emergency — a fire drill, an evacuation, a missing child. It lists every checked-in child across all rooms, with full medical and contact information, and prints cleanly for a first responder.

**Before you start:** you'll need an admin or owner role, and there need to be children currently checked in.

---

### What it's for

This view shows complete medical information for every child, regardless of the visibility settings that normally limit what staff can see. That's deliberate: an EMT or an evacuation marshal needs the full picture, immediately, with nothing held back.

---

### Every access is recorded

Each time someone opens this page, the system records it along with any reason given. This isn't punitive. It exists so your church leadership can match each access to a real incident afterward.

---

### Getting there

From `/dashboard/checkin`, tap the **Emergency Roster** tile. The tile is visible only to admin and owner roles.

[SCREENSHOT: a5-emergency-tile-admin-view]

On first open, a short confirmation appears with an optional reason field — for example, "Fire drill" or "Missing child report." Whatever you enter is saved with the access record. Tap **Open roster** to continue.

[SCREENSHOT: a5-consent-modal]

---

### What the roster shows

Children are grouped by room. Each row includes:

- Name, grade, and a checkbox to mark the child as accounted for (this is just for your own head count as you confirm children)
- An **ALERT** badge if any medical information is on file
- A bold amber **REPORTED ABSENT FROM ROOM** badge if a teacher has marked the child as not actually in the room
- A subtle sage **Confirmed present** badge if a teacher has marked them present
- Full allergies, medications, and medical notes
- The parent's name and full phone number
- Every authorized pickup contact — name, relationship, and phone

[SCREENSHOT: a5-roster-typical]

[SCREENSHOT: a5-roster-with-reported-absent-badge]

---

### What "Reported absent from room" means

A teacher has indicated the child was checked in but isn't physically in their room. For a marshal, that means: don't spend search time looking in that room. Check elsewhere — a bathroom, the lobby, the parking lot.

---

### Printing a copy

Tap the print button (or use your browser's File → Print). The printed version is built for paper and monochrome: it drops the navigation, lays each child out for a standard page, and converts the badges into bordered black-and-white shapes that stay readable. Hand the printout to the marshal or the EMT.

[SCREENSHOT: a5-roster-print-preview]

---

### Things to know

**It shows fewer children than expected.** Only children currently checked in appear. Any who've already been checked out drop off. To account for everyone who was in the building today, including those who left, use the history on the regular Check-In dashboard.

**Can I use it on a phone?** Yes. The screen view works on mobile; the print layout is the part optimized for paper.

---

### Messages you might see

- **"Admin or owner role required"** — the tile is hidden for other roles, and opening the link directly is blocked
- A **"Data load failed"** row inside the roster — one child or household record didn't load. The row still shows the session ID and room, so a marshal knows to ask the kiosk operator for that child

---

### Related

- **A4 — Admin per-room drill-down** (for routine monitoring)
- **B5 — Attendance-taking** (how the absent flag gets set)
- **Audit log access**
