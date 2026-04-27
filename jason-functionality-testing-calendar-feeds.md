# Functionality Testing — Calendar Feeds, Volunteers JSON API, Short Links

iCal/ICS feeds for various scopes, the JSON volunteers feed for external integrations, and short-link redirection.

## Prerequisites

- Onboarding done; you have schedules + reservations + ministries to publish
- Apple Calendar / Google Calendar / Outlook for testing iCal subscriptions

---

## Test 1 — Personal volunteer iCal feed

**Steps**
1. As a volunteer who has been scheduled → Account → "Calendar feed" → copy URL
2. Subscribe in Apple Calendar (File → New Calendar Subscription) or Google Calendar (Other calendars → From URL)

**Expected**
- URL pattern: `/api/calendar/personal/{userId}/{token}` or similar
- Shows only your assignments
- Refreshes within Apple/Google's window (~5 min – 1 hour)

**Verify**
| Where | What |
|---|---|
| Calendar app | Events appear with correct dates, times, role titles |
| `Cache-Control` response header | `private, max-age=300` (recommended; check via curl) |

☐ **Pass / Fail**: ___

---

## Test 2 — Church-wide iCal feed (admin)

**Steps**
1. Admin → Settings → Calendar Feeds → "Church-wide feed" → copy URL
2. Subscribe in calendar app

**Expected**
- All published assignments across the church visible
- Volunteers and roles in event titles

☐ **Pass / Fail**: ___

---

## Test 3 — Per-ministry iCal feed

**Steps**
1. Settings → Calendar Feeds → per-ministry → copy URL for "Worship"
2. Subscribe

**Expected**
- Only Worship team's assignments visible
- Other ministries' volunteers don't appear

☐ **Pass / Fail**: ___

---

## Test 4 — Per-room iCal feed

**Steps**
1. Rooms → [room] → "iCal feed URL" → copy
2. Subscribe

**Expected**
- All confirmed reservations for that room appear as events
- Same `calendar_token` is reused for the room display URL

☐ **Pass / Fail**: ___

---

## Test 5 — Token-based authorization

**Steps**
1. Take a working calendar URL
2. Replace `{token}` with garbage
3. Try to load it

**Expected**
- 401 / 403 / 404 — does NOT return data
- Calendar app fails to subscribe

**Verify** that the lookup in `/api/calendar/...` properly validates the token against the stored `calendar_token` field.

☐ **Pass / Fail**: ___

---

## Test 6 — Token rotation invalidates old subscribers

**Steps**
1. Subscribed and working in your calendar app
2. Admin → rotate the calendar token (regenerate from settings)
3. Wait for the next refresh (or force in your calendar)

**Expected**
- The old URL now 401s; events disappear from your calendar (or stop refreshing)
- New URL works

**Verify**
| Where | What |
|---|---|
| Firestore room or settings doc | `calendar_token` value changed |

☐ **Pass / Fail**: ___

---

## Test 7 — Public service date JSON feed (volunteers integration)

**Steps**
```bash
curl "https://volunteercal.com/api/volunteers?church_id=YOUR_CHURCH_ID&service_date=2026-05-10&token=YOUR_PUBLIC_TOKEN"
```

(Set up the public token first via the integration settings if it exists; or this endpoint is the existing integration with `ergunkodesh.org`.)

**Expected**
- JSON response with assigned volunteers + roles for that service date
- Token is required; without it → 401

**Verify** in Network tab that response includes:
- volunteer names
- role titles
- service times

**Failure mode**: 
- If the endpoint returns volunteer email or phone → that's a privacy regression. The JSON should be name + role only.

☐ **Pass / Fail**: ___

---

## Test 8 — Short link create (relative path)

**Steps** (admin, paid tier)
1. `Dashboard → Short Links → New Short Link`
2. Slug: `welcome`, target_url: `/dashboard/welcome` (relative), label: "Welcome new members"
3. Save

**Expected**
- Short link created with `target_kind: "relative"`
- Test the redirect: `https://volunteercal.com/s/welcome` → redirects to `/dashboard/welcome`

**Verify**
| Where | What |
|---|---|
| Firestore `short_links` | Doc with `church_id`, `slug: "welcome"`, `target_url: "/dashboard/welcome"`, `target_kind: "relative"` |

☐ **Pass / Fail**: ___

---

## Test 9 — Short link create (allowlisted external)

**Steps**
1. New Short Link → slug: `signup-form`, target_url: `https://docs.google.com/forms/d/abc123/...`
2. Save

**Expected**
- Saved with `target_kind: "allowlist"`
- Redirect to the Google Forms URL works

☐ **Pass / Fail**: ___

---

## Test 10 — Short link reject (NOT allowlisted)

**Steps**
1. New Short Link → slug: `evil`, target_url: `https://evil.example.com`
2. Save

**Expected**
- 400 error: "External destination not on the trusted allowlist..."
- No doc created in Firestore

This is Track A.5's open-redirect defense. CRITICAL that this fails as expected.

**Test variants to try** (all should fail):
- `target_url: "javascript:alert(1)"` (XSS attempt)
- `target_url: "//evil.example.com"` (protocol-relative)
- `target_url: "ftp://malicious.com"` (non-http protocol)
- `target_url: " https://docs.google.com/..."` (leading whitespace — should it pass?)

**Verify**
| Where | What |
|---|---|
| API response | 400 with allowlist error |
| Firestore `short_links` | No new doc |

☐ **Pass / Fail**: ___

---

## Test 11 — Defense-in-depth at redirect time

**Steps**
1. Manually edit a short_link doc in Firestore via the console: change `target_url` to `https://evil.example.com`
2. Visit `/s/{slug}`

**Expected**
- 404 / not found page (NOT a redirect to evil.com)
- The redirect-time validation catches the tampered data

This is the second layer of A.5 — if a doc somehow gets a disallowed URL, the redirect handler refuses to redirect.

☐ **Pass / Fail**: ___

---

## Test 12 — Tier limits on short links

**Steps**
1. On Starter tier (3-link limit): create 3 short links → try to create a 4th
2. On Free tier: try to create any short link

**Expected**
- Starter: 4th creation returns 403 with "Your starter plan allows 3 active short links..."
- Free: any creation returns 403 with "Short links are available on paid plans..."

☐ **Pass / Fail**: ___

---

## Test 13 — Short link expiry

**Steps**
1. Create a short link with `expires_in_days: 1`
2. Wait 24+ hours OR manually edit `expires_at` in Firestore to be in the past
3. Visit `/s/{slug}`

**Expected**
- 404 not found
- The redirect handler filters by `expires_at > now`

☐ **Pass / Fail**: ___

---

## Test 14 — Bulk delete short links

**Steps**
1. Short Links list → delete 2-3 entries

**Expected**
- Each deletion immediate (no confirmation if obvious; soft confirm if destructive)
- Firestore docs gone

☐ **Pass / Fail**: ___

---

## Failure modes to watch

- **Calendar subscription leaks data across tenants** — calendar URL for org A returns events from org B. CRITICAL — tell me immediately.
- **JSON volunteers endpoint returns more data than expected** — names + role only; if you see email/phone/addresses, that's a privacy regression.
- **External short link target accepted that shouldn't be** — Track A.5 broken. Tell me what URL was accepted.
- **Calendar feed doesn't update for hours** — caching issue. Set `Cache-Control: private, max-age=300` (5 min) instead of `no-cache` (the latter wastes bandwidth).
- **Token rotation doesn't actually invalidate** — old token still works. Backend isn't reading the latest doc.

## What I can't test for you

- Real-world calendar subscription latency (Apple cache, Google polling intervals)
- Whether your specific calendar app handles iCal correctly (esp. recurring events with exclusions)
- Whether the JSON consumer (ergunkodesh.org or whoever) is satisfied with the response shape

## Allowlisted external short-link domains

The current allowlist (per `src/lib/utils/short-link-target.ts`):

- Google: docs.google.com, forms.gle, calendar.google.com, drive.google.com, meet.google.com
- Video: youtu.be, www.youtube.com, youtube.com, vimeo.com
- Church platforms: subsplash.com, tithely.com, givelify.com, pushpay.com, planningcenteronline.com
- Social: instagram.com, facebook.com, fb.me
- Maps: maps.google.com, goo.gl
- Events: eventbrite.com, www.eventbrite.com
- Own domains: volunteercal.com, www.volunteercal.com, harpelle.com, www.harpelle.com

To add to the allowlist (when you get customer requests), tell me the host and we'll add it.
