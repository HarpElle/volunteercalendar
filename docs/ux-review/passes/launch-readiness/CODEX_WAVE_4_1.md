# Codex Retest — Wave 4.1 (audit_logs coverage)

> PR #110 shipped (commit will be the squash merge of `launch/wave-4-1-audit-coverage`).
> Verify after Vercel deploys (2–5 min after merge — confirm via `gh api repos/HarpElle/volunteercalendar/deployments` or by watching the dashboard).

---

## What's in this PR

A new server endpoint `/api/memberships/[id]` (PATCH + DELETE) replaces direct-client-SDK writes to the memberships collection so every lifecycle change writes an `audit_logs` row. Plus `audit()` calls retrofitted onto 11 endpoints that previously mutated state silently:

- Membership: invite, batch invite, approve, accept_invite, role_change, deactivate, remove
- Org: create
- Platform: tier_override (+ resulting org.tier_change)
- Kiosk: activate, checkout (both code-only batch and session-specific)
- Exports: attendance CSV, song_usage CSV, assignments CSV+JSON
- Short link: only when target is an allowlist external domain (relative + own-domain don't audit)

`src/lib/firebase/firestore.ts` helpers (`updateMembershipStatus/Role/Permissions`, `deleteMembership`) now call the API endpoint via `callAuthedApi()` instead of writing directly. So the People page, my-orgs page, and `/invites/[id]` accept page should all still work — they just route through the server now.

---

## Scope of regression checks

### 1. New `/api/memberships/[id]` endpoint behavior

For each case, hit it with curl (or any client) using a real Firebase ID token. Expect responses + verify `audit_logs` writes via Firestore console or `/dashboard/settings/activity`.

| # | Action | Caller | Expected status | Expected audit |
|---|--------|--------|-----------------|----------------|
| 1.1 | PATCH `{ status: "active" }` on a `pending_org_approval` membership | Active admin/owner of that church | 200 | `membership.approve` with `from_status=pending_org_approval, to_status=active, self=false` |
| 1.2 | PATCH `{ status: "active" }` on a `pending_volunteer_approval` membership | The membership's own user (NOT an admin) | 200 | `membership.accept_invite` with `self=true` |
| 1.3 | PATCH `{ role: "scheduler", ministry_scope: ["m-x"] }` on a volunteer | Active admin/owner | 200 | `membership.role_change` with `from_role=volunteer, to_role=scheduler, ministry_scope=["m-x"]` |
| 1.4 | PATCH `{ status: "inactive" }` on a member | Active admin/owner | 200 | `membership.deactivate` |
| 1.5 | PATCH `{ role: "admin" }` on own membership | Volunteer (self) | 403 | None |
| 1.6 | PATCH on someone else's membership | Different church's admin (cross-tenant) | 403 | None |
| 1.7 | PATCH without `Authorization: Bearer ...` | Anonymous | 401 | None |
| 1.8 | PATCH on a non-existent membership id | Active admin | 404 | None |
| 1.9 | PATCH `{ reminder_preferences: { channels: ["sms"] } }` only | Self | 200 | **None** (intentional — user-settings churn) |
| 1.10 | DELETE on own membership | Volunteer (self) | 200 | `membership.remove` with `self=true` |
| 1.11 | DELETE on a volunteer | Active admin/owner | 200 | `membership.remove` with `self=false` |
| 1.12 | DELETE on own owner membership | The church owner | 400 (would orphan church) | None |
| 1.13 | DELETE on another admin's membership | Plain admin (not owner) | 403 | None |
| 1.14 | DELETE on another admin's membership | The church owner | 200 | `membership.remove` |

### 2. Dashboard regression (helpers now call API, not Firestore)

These pages previously direct-wrote to Firestore via `firestore.ts` helpers. Confirm they still work end-to-end:

- **People page → approve a pending member** (`/dashboard/people` → click ✓ on a pending row). Should set status active + create an `audit_logs` row.
- **People page → change a member's role** (open member, change role dropdown, save). Should change role + emit `membership.role_change`.
- **People page → remove a member** (open member, click Remove). Should delete + emit `membership.remove`.
- **My Orgs page → accept invite at `/invites/[id]`** (using a test invite). Should activate the membership + emit `membership.accept_invite`.
- **Account page → reminder channel toggle** (Account → Notifications → toggle SMS). Should update without emitting an audit row.

### 3. New audit emissions on existing endpoints

For each, perform the action in production and verify the `audit_logs` row appears in `/dashboard/settings/activity`:

| Action to perform | Expected audit row |
|---|---|
| Create an org from scratch via `/dashboard/onboarding/create-org` | `org.create` with metadata.name + org_type + workflow_mode + timezone + first_org bool |
| Send a single invite from `/dashboard/people` → Invite | `membership.invite` with email + role + invitee_user_id (if existed) |
| Batch-approve from `/dashboard/people/invites` (the queue page) | One `membership.invite` per approved item (with batch_existing_user or batch_pending_registration in metadata.path) |
| Self-register against an existing org link, then admin approves from People | `membership.approve` with path=invite_approved_self_registered (single-invite) or batch_approved_self_registered (batch) |
| Activate a kiosk station via `/dashboard/checkin/kiosk` settings → generate code → enter on the kiosk URL | `kiosk.activate` with station_name + has_fingerprint |
| Check a child in then check them out (security code flow on the kiosk) | `kiosk.checkout` per session (one per child if multi-checkin), with mode=code_only_batch or session_specific |
| Download check-in CSV from `/dashboard/checkin` → Reports → any tab → CSV | `export.attendance` with report_type + date range |
| Download song usage CSV from `/dashboard/worship/songs` → Usage Reports → Export | `export.song_usage` with from/to + record_count |
| Open Service Day → Export schedule (CSV button) | `export.assignments` with format=csv + assignment_count |
| Print schedule (PDF preview) | `export.assignments` with format=json |
| Create a short link with target `https://docs.google.com/...` | `short_link.create_external` with target_kind=allowlist |
| Create a short link with target `/dashboard/whatever` (relative) | **None** — relative links are not audited |
| Platform admin: set a church to Pro tier via `/dashboard/platform/orgs/[id]` Override Tier | TWO rows — `platform.tier_override` (set_override mode) + `org.tier_change` (only if tier actually changed) |
| Platform admin: Remove Override on that same church | `platform.tier_override` (remove_override mode) + `org.tier_change` (only if reverting from non-free) |

### 4. Known intentional behaviors (not bugs — please don't report)

- **`kiosk.lookup` is NOT audited.** Too high-volume per Sunday (every child swipe). The existing `kiosk.medical_data_revealed` audit covers the sensitive subset.
- **`schedule.unpublish` / `schedule.delete` are NOT audited.** No dedicated server endpoints exist — client deletes go through generic `removeChurchDocument`. Deferred until a real route lands.
- **`org.transfer_ownership` is NOT audited.** Feature not built yet.
- **Reminder preferences PATCH does NOT audit.** Intentional — user settings churn is noise in the Activity feed.
- **Relative/own-domain short links do NOT audit.** Only `target_kind === "allowlist"` (genuine external domain) gets `short_link.create_external`.
- **`audit()` writes are fire-and-forget.** If a row doesn't appear within 1–2 seconds, it's a real bug; the helper polls 50ms intervals up to 1.5s in tests.

### 5. Severity rubric

- **Sev 1**: any case 1.x returns wrong status (auth bypass) OR audit row written to wrong church (cross-tenant) OR PII in metadata
- **Sev 2**: any case 1.x returns correct status but no audit row written when one was expected
- **Sev 3**: dashboard page (section 2) silently fails to update OR fires the wrong audit action
- **Sev 4**: metadata fields missing/wrong/extra in an otherwise correct audit row

---

## Save retest results to

`docs/ux-review/passes/launch-readiness/CODEX_WAVE_4_1_RESULTS.md`

(That file should not exist yet — Codex creates it.)
