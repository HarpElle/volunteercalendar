# Wave 11: Org Branding — multi-PR plan

**Status:** Planning. No code yet. Read tomorrow morning before approving.
**Date drafted:** 2026-06-01 (Monday evening session close-out)
**Author:** Claude (with Jason's W10-5A wallet-pass design feedback as the primary input)
**Time-cost estimate:** 5 sub-PRs, ~6-10 hours total dev time, realistically 1.5-2 days.

---

## What problem this solves

Today, every parent-facing surface in VolunteerCal carries the VolunteerCal brand mark. The user's first wallet-pass design pass made this clear: parents don't know "VolunteerCal" — they know "Anchor Falls Church." When the church's pass shows up in their wallet, it should read as **the church's pass, powered by VolunteerCal**, not as a VolunteerCal pass that happens to mention the church.

This is the W10-5A V6 design philosophy generalized across every surface a parent or volunteer sees:

- The check-in kiosk welcome screen
- The /guardian magic-link portal
- The Apple Wallet family pass
- Email reminders (check-in confirmation, schedule notifications, etc.)
- Printed check-in labels
- Printable schedule PDFs

When a church uploads a logo, **the church's logo replaces the VolunteerCal mark** on these surfaces; VolunteerCal moves to a quieter "powered by" footer. When no logo is uploaded, surfaces keep the current behavior (VolunteerCal or the Check-In Badge as appropriate).

---

## Infrastructure gap audit

What exists today that we can lean on:
- ✅ Firebase Admin SDK (server-side writes)
- ✅ Sharp (image processing, used in wallet-pass asset generation)
- ✅ Settings → Organization page (somewhere to put the upload UI)
- ✅ Audit primitive (`org.brand_logo_updated` would be a new code)

What does NOT exist and needs to be built:
- ❌ **Firebase Storage** — no `firebase.storage()` calls anywhere in the codebase. Person photos appear to round-trip through API routes as base64. The Storage bucket itself may or may not be enabled in the Firebase project; needs verification.
- ❌ **Storage rules** — `storage.rules` doesn't exist; only `firestore.rules`.
- ❌ **Client-side upload helper** — no `getDownloadURL` / `uploadBytes` patterns anywhere.
- ❌ **Image-input UI component** — no drag-drop file uploader exists; would need to build one.

The infrastructure gap is the real cost of this Wave. The surface sweep is straightforward once Storage is wired.

---

## Sub-PR breakdown

### Sub-PR A — Storage layer + upload API + Settings UI (the foundation)

**Goal:** an admin can upload a PNG/JPG/SVG logo through the Settings UI. The file is stored in Firebase Storage. The URL is persisted on the `Church` doc as `logo_url`. **No surface uses the URL yet** — this PR is testable in isolation by verifying the upload round-trip + the Settings UI shows a preview.

**Scope:**
- Enable Firebase Storage on the project (manual step — Jason does this in Firebase Console; one-time)
- New `storage.rules` file:
  - `churches/{churchId}/branding/*` → admin-of-that-church can write; public can read
- New API route `POST /api/admin/org/branding/logo` — accepts multipart upload, validates (≤2MB, PNG/JPG/SVG, dimensions ≥256×256), uploads to Firebase Storage at `churches/{churchId}/branding/logo-{timestamp}.{ext}`, returns `{ logo_url }`
  - Sharp-validates the upload server-side (rejects malformed images; auto-detects format)
  - Replaces any previous logo (deletes the old object to keep storage tidy)
  - Updates `churches/{churchId}.logo_url` in Firestore
- New API route `DELETE /api/admin/org/branding/logo` — deletes the storage object + nulls `logo_url`
- New audit code `org.brand_logo_updated` and `org.brand_logo_removed`
- Type: `Church.logo_url: string | null`
- UI: New "Branding" section on Settings → Organization
  - Drag-drop file zone + file picker fallback
  - Live preview of uploaded image
  - "Replace" + "Remove" actions
  - File-size + format guidance copy
  - Loading + error states
- Unit tests for the upload validator (size / format / dimensions edge cases)

**Files touched:** ~6 new (`storage.rules`, upload route, delete route, settings section, unit tests, types) + Church interface edit.

**Estimated:** 3-4 hours including the manual Firebase Storage enablement.

**Risk:** Firebase Storage enablement requires a `firebase deploy --only storage` step we've never run before. If the project's billing tier doesn't include Storage, that's a config blocker outside my reach.

---

### Sub-PR B — Wallet pass uses church logo (highest-visibility swap)

**Goal:** when the church has a logo uploaded, the Apple Wallet family pass displays the church's logo in the icon + logo slot instead of the VolunteerCal Check-In Badge. The badge stays as the fallback when no logo is uploaded. The "Powered by VolunteerCal" footer on the back of the pass remains either way.

**Scope:**
- `src/lib/server/wallet-pass/builder.ts` — load the church logo at build time if `logo_url` is set on the church doc, fetch the image bytes, resize to PassKit icon sizes (29/58/87) and logo sizes (60×50 / 120×100) via sharp, substitute into the buffers map
- Falls back to the existing CheckInBadge PNG when `logo_url` is null
- Update the unit tests to cover both branches (logo-present and logo-absent)
- Migration consideration: existing wallet passes won't update unless re-downloaded (no webServiceURL in v1)

**Files touched:** 2 (builder + tests).

**Estimated:** 1-1.5 hours.

**Risk:** church logos won't always be square / won't always sit nicely on the rounded indigo square pattern. Need to decide: do we letterbox? Stretch? Crop center? My recommendation: **fit-inside** (preserves aspect, may have transparent padding). This means if a church uploads a wide wordmark, the wallet pass shows the wordmark with transparent padding on top/bottom — not ideal but predictable.

---

### Sub-PR C — Email templates use church logo header

**Goal:** transactional emails sent to parents and volunteers (check-in confirmations, schedule notifications, reminder emails, invite emails) carry the church's logo at the top of the email body instead of the VolunteerCal mark. The footer adds "Powered by VolunteerCal — volunteercal.com" when the org has a custom logo.

**Scope:**
- Find the email-template plumbing in `src/lib/services/email.ts` — identify the shared header partial used across all transactional emails
- Modify the shared header to accept a `logo_url` (defaults to VolunteerCal's)
- Pass `church.logo_url` from each email-sending caller (~10 call sites by my count; needs grep)
- "Powered by VolunteerCal" footer added when custom logo is in use

**Files touched:** ~12 (1 template + ~10 caller sites + 1 helper to resolve church logo URL).

**Estimated:** 2 hours.

**Risk:** the email template plumbing may have multiple shared partials. The sweep needs to be careful — missing one caller means inconsistent branding.

---

### Sub-PR D — /guardian portal + kiosk welcome screen use church logo

**Goal:** parent-facing in-app surfaces show the church's logo as the primary identity mark.

**Scope:**
- `/guardian` portal header — currently shows CheckInBadge + church name (W11 Badge Rollout from earlier today). When `logo_url` is set, show that instead of the badge; badge moves to a small "Powered by" footer.
- Kiosk welcome screen (`src/components/checkin/family-lookup.tsx`) — same swap.
- Kiosk room display (`/checkin/room/[roomId]`) — same swap.
- Pass `church.logo_url` through from the data-loading endpoints (most already return church info, just need to add the URL field).

**Files touched:** 3 components + 2-3 API responses extended.

**Estimated:** 1-1.5 hours.

---

### Sub-PR E (optional / can defer) — printed labels + schedule PDFs

**Goal:** the printed kiosk label and any printable schedule PDFs carry the church's logo.

**Scope:**
- `src/lib/services/printing/*` — the label-builder adapters (Brother QL, Zebra, Dymo) accept a logo to render. Sharp-render the church logo to a printable monochrome bitmap at upload time and cache the result; embed in label commands.
- Schedule PDF generation (if any exists; needs research).

**Files touched:** 3 printer adapters + 1 PDF helper.

**Estimated:** 2-3 hours.

**Risk:** label printers have constrained resolutions and color depths. Brother QL prints monochrome at 300dpi; rendering a color church logo as 1-bit ditherable needs sharp's threshold mode. Some logos won't render well. Test on Jason's QL-820NWB first.

**Recommendation:** defer this sub-PR. The wallet pass + emails + /guardian + kiosk give 90% of the visible value. Printed labels are a polish nice-to-have.

---

## Recommended execution order

1. **Sub-PR A first** — the foundation. Without it nothing else can land.
2. **Sub-PR B (wallet pass) second** — highest visible impact, smallest change.
3. **Sub-PR C (emails) third** — biggest call-site sweep but each caller is small.
4. **Sub-PR D (in-app surfaces) fourth** — completes the parent journey.
5. **Sub-PR E (labels) maybe** — defer unless a beta church requests it.

If we ship Sub-PRs A through D before Sunday, Jason can upload Anchor Falls' logo and validate the full white-label experience at the church test. That's ~6-8 focused hours of dev work, doable Tuesday + Wednesday.

---

## Open questions for Jason

1. **Single logo or light/dark variants?** Today every surface is light-bg (cream pass, white emails, cream portal). One logo is enough. If we ever ship a dark-mode wallet pass, we'd need a dark variant. Decision: single logo for V1.
2. **Brand color?** Should churches also set an accent color, or should we always use vc-coral? Decision: skip for V1 — only logo. Color customization can be Wave 12.
3. **Existing churches without logos** — keep showing VolunteerCal Check-In Badge / mark. Eventually we may want to email them prompting "upload your logo to brand the family pass" — that's a Wave 12 onboarding play.
4. **Storage costs** — Firebase Storage charges ~$0.026/GB/month + egress. For 100 churches × 200KB logos × 2x copies = ~40MB total. Roughly $0.001/month. Not a concern.

---

## Sub-PR A skeleton (what I'd write first thing tomorrow)

Just so the path is concrete:

```
src/app/api/admin/org/branding/logo/route.ts     # POST upload, DELETE remove
src/components/settings/branding-section.tsx     # Settings → Org → Branding UI
src/lib/server/storage.ts                        # Firebase Storage helper (init, upload, delete)
storage.rules                                    # NEW file
tests/unit/branding-upload-validation.test.ts    # size/format/dim edge cases
src/lib/types/index.ts                           # Church.logo_url field
src/lib/server/audit.ts                          # 2 new audit codes
```

Plus one Firebase manual step (Jason): enable Storage in the Firebase Console, deploy `storage.rules` via `firebase deploy --only storage`.

That's the actionable starting point.
