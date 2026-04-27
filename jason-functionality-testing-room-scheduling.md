# Functionality Testing — Room & Resource Scheduling

Room creation, single + recurring reservations, conflict detection, the new transactional path, and approval workflow.

## Prerequisites

- Onboarding done; org on Growth tier or higher
- Admin or scheduler role
- At least one team (ministry) created

---

## Test 1 — Create rooms

**Steps**
1. `Dashboard → Rooms → New Room`
2. Create: "Sanctuary" (capacity 200), "Fellowship Hall" (capacity 80), "Conference Room A" (capacity 12), "Youth Room" (capacity 30)
3. For each: add equipment (chairs, projector, sound), an image (optional), a calendar token (auto-generated)

**Expected**
- 4 room docs created
- Each room has a unique `calendar_token` field for the iCal feed + display URL

**Verify**
| Where | What |
|---|---|
| Firestore `churches/{churchId}/rooms` | 4 docs, each with `name`, `capacity`, `equipment`, `calendar_token` |

☐ **Pass / Fail**: ___

---

## Test 2 — Configure room settings

**Steps**
1. Rooms settings page → toggle "Require approval for reservations"
2. Set advance-booking window: 90 days
3. Save

**Verify**
| Where | What |
|---|---|
| Firestore `churches/{churchId}/roomSettings/config` | `require_approval: true` |

☐ **Pass / Fail**: ___

---

## Test 3 — Create a single reservation (no conflict)

**Steps**
1. Rooms → Sanctuary → New Reservation
2. Title: "Wednesday prayer", Wed 6:00–7:30 PM, ministry: any team
3. Submit

**Expected**
- If approval is required: reservation status is `pending_approval`
- Otherwise: status is `confirmed`
- No conflict warning

**Verify**
| Where | What |
|---|---|
| Firestore `churches/{churchId}/reservations` | New doc with the right time + status |

☐ **Pass / Fail**: ___

---

## Test 4 — Create a single reservation that conflicts

**Steps**
1. Try to book Sanctuary again Wed 6:30–7:00 PM (overlaps with Test 3)
2. Submit

**Expected**
- Conflict warning shown
- Reservation created with status `pending_approval` and `conflict_with_ids` populated
- A `reservation_request` doc is created listing both reservations

**Verify**
| Where | What |
|---|---|
| New reservation doc | `conflict_with_ids` array contains the Test 3 reservation id |
| Firestore `churches/{churchId}/reservation_requests` | New request doc, `status: pending` |

☐ **Pass / Fail**: ___

---

## Test 5 — Concurrency safety (Track E.2)

**Manual concurrency test using curl:**

This proves Track E.2 — two simultaneous bookings can't both succeed.

```bash
# Replace TOKEN, CHURCH_ID, ROOM_ID with real values
TOKEN="<your Firebase ID token from devtools>"
CHURCH_ID="<your church id>"
ROOM_ID="<sanctuary room id>"
PAYLOAD='{
  "church_id": "'"$CHURCH_ID"'",
  "room_id": "'"$ROOM_ID"'",
  "title": "Concurrent test",
  "date": "2026-05-10",
  "start_time": "14:00",
  "end_time": "15:00"
}'

# Fire two simultaneous requests
curl -X POST https://volunteercal.com/api/reservations \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD" &

curl -X POST https://volunteercal.com/api/reservations \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD" &

wait
```

**Expected**
- One returns `confirmed` (or `pending_approval` if approval enabled)
- The other returns with `has_conflict: true` and the first reservation's id in `conflict_with_ids`
- Firestore shows exactly TWO docs (the second one as pending/conflicting), NOT two confirmed bookings overlapping

This is what Track E.2 guarantees. Without the transaction, both could pass conflict-check simultaneously and both write — leading to actual double-booked rooms.

☐ **Pass / Fail**: ___

---

## Test 6 — Recurring reservation

**Steps**
1. Sanctuary → New Reservation
2. Title: "Sunday service prep", Sunday 8:00–9:00 AM, ministry: Worship
3. Recurrence: weekly, 6 weeks, ending Sun YYYY-MM-DD
4. Submit

**Expected**
- 6 reservation docs created, all sharing the same `group_id`
- Some confirmed, others pending if conflicts existed
- All visible on the Sanctuary's calendar view

**Verify**
| Where | What |
|---|---|
| Firestore `churches/{churchId}/reservations` | 6 new docs with same `group_id`, ascending dates |

**Note (deferred)**: Per-occurrence Firestore transactions for recurring reservations is **Phase 2** of E.2 — for now the recurring path uses the non-transactional iteration, so concurrent recurring booking attempts can theoretically race. Single-occurrence path is hardened.

☐ **Pass / Fail**: ___

---

## Test 7 — Approve a pending reservation

**Steps**
1. As admin → Rooms → Pending Requests
2. Find Test 3's `pending_approval` reservation
3. Click Approve

**Expected**
- Status flips to `confirmed`
- Original requestor receives email notification

**Verify**
| Where | What |
|---|---|
| Firestore `churches/{churchId}/reservations/{id}` | `status: "confirmed"`, `approved_at` set |
| Email | Approval email to requestor |

☐ **Pass / Fail**: ___

---

## Test 8 — Deny a reservation request

**Steps**
1. Find a conflicting `pending_approval` reservation
2. Click Deny → optional reason

**Expected**
- Status flips to `denied`
- Requestor gets a notification with reason

**Verify**
| Where | What |
|---|---|
| Firestore reservation doc | `status: "denied"`, `denied_reason` set |

☐ **Pass / Fail**: ___

---

## Test 9 — Cancel your own reservation

**Steps**
1. As the requestor (volunteer) → My Reservations → cancel one

**Expected**
- Status: `cancelled`
- Conflict counts adjust (others might no longer conflict)
- Calendar feed reflects the cancellation

☐ **Pass / Fail**: ___

---

## Test 10 — Edit reservation details

**Steps**
1. Edit Test 3's reservation: change title, add equipment requested
2. Save

**Expected**
- Updated fields persist
- Time/room change triggers re-validation (conflicts re-checked)

☐ **Pass / Fail**: ___

---

## Test 11 — Public calendar feed

**Steps**
1. Get the room's iCal URL (Settings → Rooms → [Sanctuary] → "iCal feed URL")
2. Subscribe in Apple Calendar / Google Calendar

**Expected**
- Subscribed calendar shows all confirmed reservations for that room
- Updates within Apple/Google's refresh window (~5 min – 1 hour)

**Verify**: see `jason-functionality-testing-calendar-feeds.md`

☐ **Pass / Fail**: ___

---

## Test 12 — Filter / search reservations

**Steps**
1. Reservations list → filter by ministry (Worship)
2. Filter by date range
3. Filter by status (confirmed, pending, denied)

**Expected**
- Filters update the table without page reload
- Results scoped correctly

☐ **Pass / Fail**: ___

---

## Test 13 — Tier limits

**Steps** (use the Starter tier for this — it allows 5 rooms; Free has 0)
1. Set test org to Starter
2. Try to create a 6th room

**Expected**
- Error: "Your Starter plan allows 5 rooms. Upgrade to add more."

**Verify**
| Where | What |
|---|---|
| API response | 403 with tier-limit error message |

☐ **Pass / Fail**: ___

---

## Test 14 — Shared facility scheduling (Phase 2 — multi-org)

If your church is part of a `facility_groups` shared-resource arrangement with another org:

**Steps**
1. Settings → Facility Sharing → join a shared group
2. View rooms across both orgs

**Expected**
- See rooms from member orgs in your reservations UI (read-only or bookable depending on permissions)

**Note**: this whole feature relies on the `facility_groups` collection still being auth-readable (Track A.3 trade-off). Marked Phase 2 for tightening.

☐ **Pass / Fail**: ___

---

## Failure modes to watch

- **Both concurrent bookings succeed without conflict_with_ids** — Track E.2 transaction broken. Tell me immediately.
- **Recurring reservation creates fewer occurrences than expected** — date math regression; check timezone handling.
- **Pending request never gets approved despite admin clicking** — write rule denial. Check Firestore rules for `reservations` and `reservation_requests`.
- **Tier limit not enforced** — server-side check missing or client bypass. Tell me.

## What I can't test for you

- Real-world calendar subscription latency (Google sometimes caches feeds for 24h)
- Visual room display on a real wall-mounted tablet (covered separately in `jason-functionality-testing-room-signage.md`)
- Multi-org facility sharing with another live church
