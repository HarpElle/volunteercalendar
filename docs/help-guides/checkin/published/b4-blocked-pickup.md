# B4 — `b4-blocked-pickup`

## Blocked-pickup entries and checkout verification

Some households have a person who must not pick up a child — often under a court order. VolunteerCal records these privately and surfaces them to the kiosk operator at checkout. This guide covers adding an entry (for admins) and verifying at checkout (for volunteers). Every action described here is recorded in the audit log.

---

## For admins: adding an entry

1. Open the household's detail page and scroll to the **Not authorized for pickup** section
2. Tap **Add entry**

[SCREENSHOT: b4-household-detail-pickup-sections]

The entry has these fields:

- **Name** and **phone** of the person not authorized
- **Scope** — child or household. Household scope applies the restriction to every sibling, which is appropriate when a court order covers them all
- **Reason** — court order, household decision, or other
- **Photo** (optional) — a photo of the person
- **Supporting document** (optional) — for example, a PDF of the court order

[SCREENSHOT: b4-add-blocked-modal]

Photos are stored privately and are visible only to kiosk operators, and only at the checkout-confirmation step. To change or remove an entry, edit it the same way. Both additions and removals are recorded in the audit log.

---

## For kiosk operators: verifying at checkout

**At check-in:** the child's card shows a small amber **Pickup note** badge with a lock icon. It's intentionally discreet so a child glancing at the screen won't see any details. It only means there's something on file that the system will handle at checkout.

[SCREENSHOT: a2-kiosk-child-selection-with-badges]

**At checkout:** the kiosk shows a full-screen review with every blocked-pickup entry for the household — photos, names, and reasons. Compare the person standing in front of you to the photo.

[SCREENSHOT: b4-kiosk-blocked-review-modal]

- **If you recognize the person as someone on the list,** tap **Person IS on this list**. This alerts the church's Emergency Response Team by text and does not release the child
- **If the person is not on the list,** tap **Confirm — not on the list**. The child continues to the normal security-code checkout

---

### Policy notes

- This check is only as strong as the entries behind it. An entry with a photo can be verified; a name-only entry is much harder to act on
- If you aren't certain the person matches the photo, find another staff member. Never release a child when there's doubt
- Self-service kiosks cannot clear a blocked-pickup entry. A household with a blocked entry must check out at a staffed kiosk

---

### Related

- **A2 — Running the kiosk**
- **A5 — Emergency / first-responder roster**
