# Functionality Testing — Children's Check-In

The full kiosk flow: enroll a station → activate device → register a family → check children in → check out. Highest-stakes feature in the app (children's PII), most extensively hardened in the launch sprint.

## Prerequisites

- Onboarding done
- Org is on **Growth tier** or higher (free/starter don't include check-in). Use the platform-admin tier override to bump your test org to Growth temporarily.
- A second device for the kiosk: an iPad in landscape, OR a separate browser window (incognito) on a laptop.
- Sentry env vars set (Action A in `SHOULD_DO.md`) — so you can see kiosk errors if they happen.
- Optional: Twilio configured (for guardian SMS testing).

---

## Test 1 — Configure check-in settings

**Steps**
1. As admin → `Settings → Check-Ins → Children` tab
2. Enable check-in
3. Add a service time (Sunday 9:00 AM – 10:30 AM, "Service 1")
4. Set capacity SMS recipient phone (your real number) — used when a room overflows
5. Save

**Expected**
- Settings persist on reload
- A `checkinSettings/config` doc exists for this church

**Verify**
| Where | What |
|---|---|
| Firestore `churches/{churchId}/checkinSettings/config` | Doc with `service_times[]`, `capacity_sms_recipient_phone` |

☐ **Pass / Fail**: ___

---

## Test 2 — Configure rooms

**Steps**
1. `Dashboard → Check-In → Rooms` (or via `Settings → Check-Ins → Children → Manage rooms`)
2. Create rooms: "Nursery (0-2)", "Toddlers (3-4)", "Preschool (5-6)", "Elementary (7-12)"
3. For each: set capacity (e.g., 12), grade range, equipment
4. Set "Toddlers" overflow room → "Preschool" (so when toddlers fills up, kids auto-route)

**Verify**
| Where | What |
|---|---|
| Firestore `churches/{churchId}/rooms` | 4 docs, each with `name`, `capacity`, `grade_min/max`, `overflow_room_id` |

☐ **Pass / Fail**: ___

---

## Test 3 — Enroll a kiosk station (admin)

**Steps**
1. `Settings → Check-Ins → Stations` tab
2. Click "Enroll new station"
3. Name: "Lobby iPad"
4. Submit

**Expected**
- An 8-character activation code appears in a modal (e.g., `A3F5E8D9`)
- Modal shows minutes-left countdown (~10 minutes)
- Station listed below as "Awaiting activation"

**Verify**
| Where | What |
|---|---|
| Firestore `kiosk_stations/{stationId}` | New doc, `status: "active"`, `active_token_id: null` |
| Firestore `kiosk_activations/{code}` | New doc, expires in 10 min, `consumed_at: null` |
| Activity page | New `kiosk.station_create` entry |

**Capture the activation code now** — you'll need it in Test 4.

☐ **Pass / Fail**: ___ Code: _______

---

## Test 4 — Activate the kiosk on a device

**Steps**
1. On a separate browser/device → go to `https://volunteercal.com/kiosk`
2. Enter the 8-character activation code
3. Click "Activate kiosk"

**Expected**
- Brief "Activated as Lobby iPad" success message
- After ~1 second, redirect to `/checkin` showing the kiosk welcome screen

**Verify**
| Where | What |
|---|---|
| Firestore `kiosk_tokens/{tokenId}` | New doc, `revoked_at: null`, scope array includes lookup/checkin/etc. |
| Firestore `kiosk_stations/{stationId}` | Status still `active`, but now `active_token_id` is populated, `last_used_at` set |
| Firestore `kiosk_activations/{code}` | `consumed_at` is now set; this code can never be used again |
| LocalStorage on the kiosk device | Keys `vc_kiosk_token`, `vc_kiosk_church_id`, `vc_kiosk_station_id` populated |
| Admin Stations tab | Station now shows "Active · Last used just now" |

☐ **Pass / Fail**: ___

---

## Test 5 — Try to reuse a consumed code

**Steps**
1. From yet another browser → `/kiosk`
2. Enter the same activation code from Test 3

**Expected**
- Error: "That code was already used. Ask your admin to issue a new one."

**Verify**: this proves the one-time-use guarantee.

☐ **Pass / Fail**: ___

---

## Test 6 — Reissue an activation code

**Steps**
1. Admin → Stations tab → click "New activation code" on the existing Lobby iPad station
2. Confirm
3. Note the new code

**Expected**
- Old activation code stays valid until expiry, but the new one is also valid
- New code's modal shows full 10 minutes
- An `kiosk.station_reissue_code` entry appears in Activity

**Verify**
| Where | What |
|---|---|
| Firestore `kiosk_activations/{newCode}` | New doc |
| Activity | `kiosk.station_reissue_code` entry |

☐ **Pass / Fail**: ___

---

## Test 7 — Register a walk-up family

**Steps** (back on the kiosk device from Test 4)
1. On the kiosk welcome screen, tap "New family" or equivalent
2. Enter: primary guardian name "Test Parent", phone (your real number, formatted), 2 children with first names "Sam" and "Alex", grades 1st and 3rd
3. Add an allergy on Sam: "Peanuts"
4. Submit

**Expected**
- Success screen with QR token shown (or family added)
- Activity page logs `kiosk.register_visitor` entry

**Verify**
| Where | What |
|---|---|
| Firestore `churches/{churchId}/checkin_households/{hhId}` | New household doc with normalized phone (E.164 format) |
| Firestore `churches/{churchId}/children` | 2 new docs with `has_alerts: true` for Sam |
| Activity | `kiosk.register_visitor` with `children_count: 2`, `any_alerts: true` |

☐ **Pass / Fail**: ___

---

## Test 8 — Duplicate detection on register

**Steps**
1. On the kiosk → "New family" again
2. Use the SAME primary phone number from Test 7
3. Submit

**Expected**
- The system detects the duplicate and returns the existing household instead of creating a new one
- Response includes `duplicate: true` flag

**Verify**
| Where | What |
|---|---|
| Firestore `churches/{churchId}/checkin_households` | Still only ONE household for that phone |
| Activity | A new `kiosk.register_visitor` entry with `outcome_detail: "duplicate_phone_match"` |

☐ **Pass / Fail**: ___

---

## Test 9 — Family lookup by phone (last 4)

**Steps**
1. Kiosk welcome screen → "Returning family"
2. Enter the last 4 digits of the test phone
3. Confirm

**Expected**
- Family from Test 7 appears with both children listed
- Sam's row has an "alerts" indicator (the dot/badge) but the **allergy text is NOT shown** at this stage — that's Track B.4 hygiene
- You see the children's names + photo if any + room assignments

**Verify**
| Where | What |
|---|---|
| Network tab on the kiosk | Lookup response shows `has_alerts: true` for Sam but no `allergies` or `medical_notes` fields |

☐ **Pass / Fail**: ___

---

## Test 10 — Check in with allergy reveal

**Steps**
1. Continue from Test 9: tap both children to select
2. Tap continue → you should hit the "AllergyConfirm" screen
3. The allergy text "Peanuts" now appears, asking the operator to acknowledge
4. Tap "I confirm"

**Expected**
- The kiosk fetches medical detail at this step (NOT during lookup)
- After acknowledging, both kids check in
- Security code shown
- Print labels (if printer configured) or label-payload printed to a parent stub

**Verify**
| Where | What |
|---|---|
| Activity | `kiosk.medical_data_revealed` entry with `count: 1` and Sam's child_id (NOT the medical content itself) |
| Activity | `kiosk.checkin` entry with `children_count: 2`, `had_alerts: true` |
| Firestore `churches/{churchId}/checkInSessions` | 2 new session docs, one per child, with `security_code` matching |

☐ **Pass / Fail**: ___ Security code: _______

---

## Test 11 — Guardian SMS on check-in

**Skip this test if Twilio isn't configured.**

If `checkinSettings.guardian_sms_on_checkin` is true:

**Expected**
- The phone number entered in Test 7 receives an SMS within ~30 seconds
- Message includes child names, room, security code

**Verify**
| Where | What |
|---|---|
| Firestore `churches/{churchId}/checkin_households/{hhId}` | `first_sms_sent: true` |
| Twilio dashboard | Outbound SMS log entry |

☐ **Pass / Fail**: ___

---

## Test 12 — Capacity overflow auto-redirect

**Steps**
1. Manually populate Toddlers room to capacity-1 (e.g. via Firestore or via repeated kiosk checkins of test households)
2. Check in one more toddler-aged child

**Expected**
- That child gets auto-redirected to the overflow room (Preschool from Test 2)
- Capacity SMS goes to the recipient phone configured in Test 1

☐ **Pass / Fail**: ___ (skip if too tedious to set up)

---

## Test 13 — Check out with security code

**Steps**
1. Kiosk welcome → "Check out" mode
2. Enter the security code from Test 10
3. Confirm

**Expected**
- Both kids checked out at once
- Success screen showing names and rooms
- Guardian receives a checkout SMS (if Twilio configured)

**Verify**
| Where | What |
|---|---|
| Firestore `churches/{churchId}/checkInSessions/{sessionId}` | `checked_out_at` populated for both |
| Activity | `kiosk.checkout` entry — _Phase 2: not yet wired; tell me if it appears_ |

☐ **Pass / Fail**: ___

---

## Test 14 — Wrong / expired security code

**Steps**
1. Kiosk → check out → enter a wrong 4-character code

**Expected**
- "Code does not match. Please see a staff member."
- An alert is logged to `checkinAlerts` (admin can review)

**Verify**
| Where | What |
|---|---|
| Firestore `churches/{churchId}/checkinAlerts` | New alert doc with `alert_type: "wrong_code"` |

☐ **Pass / Fail**: ___

---

## Test 15 — Revoke the kiosk station

**Steps**
1. Admin → Stations tab → click "Revoke" on Lobby iPad → confirm
2. On the kiosk device → try to look up a family

**Expected**
- The kiosk's next API call returns 401
- The kiosk's local creds get cleared
- Redirect back to `/kiosk` activation page

**Verify**
| Where | What |
|---|---|
| Firestore `kiosk_stations/{stationId}` | Status `revoked`, `revoked_at` set, `active_token_id: null` |
| Firestore `kiosk_tokens/{tokenId}` | `revoked_at` set |
| Activity | `kiosk.station_revoke` entry |
| Kiosk localStorage | All `vc_kiosk_*` keys cleared |

☐ **Pass / Fail**: ___

---

## Test 16 — Re-enroll the same station

**Steps**
1. Admin → Stations tab → enroll a new station "Lobby iPad" again (or rename)
2. Activate on the kiosk with the new code

**Expected**
- New token issued
- Old token stays revoked forever
- Kiosk works again with the new credentials

☐ **Pass / Fail**: ___

---

## Failure modes to watch

- **Lookup returns medical text** — Track B.4 hygiene regression. The lookup response should NEVER include `allergies` or `medical_notes` fields. Check the network tab.
- **Check-in succeeds without operator allergy acknowledgment** — kiosk should force a stop on the AllergyConfirm screen for any child with `has_alerts: true`.
- **Activation code accepted twice** — one-time-use guarantee broken. Tell me immediately.
- **Revoked kiosk still works** — token verification not respecting the revoke. Tell me.
- **Children/household docs created from random anonymous calls to /api/checkin/register** — would mean the kiosk gate isn't enforced. Try `curl -X POST https://volunteercal.com/api/checkin/register -H "Content-Type: application/json" -d '{"church_id":"...","primary_guardian_name":"hax"}'` — must return 401 (no kiosk token).

## What I can't test for you

- Real iPad hardware: pinch/zoom behavior, on-screen keyboard, landscape lock
- Bluetooth printer pairing (Brother / Zebra / Dymo native SDK paths)
- Family experience: 4-year-old not running off while parent enters info
- Actual SMS delivery latency (depends on Twilio + mobile carriers)
- Wake-lock holding the iPad screen on for a 90-minute service
