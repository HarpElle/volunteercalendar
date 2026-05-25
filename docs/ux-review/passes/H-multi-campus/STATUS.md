# Pass H — Multi-Campus — Status

Single-page tracker of where Pass H stands. Updated at the close of each phase
plus on every Codex round-trip.

---

## Phase summary

| Phase | Scope | PRs | Last commit | Status |
|-------|-------|-----|-------------|--------|
| **1** | Campus context + sidebar selector + badge primitive | #66 #67 | `ed51165` | ✅ Closed |
| **2** | Schedules + Service Day campus filter | #68 #69 | `ff10fba` | ✅ Closed |
| **3** | People + retention/health/onboarding campus filter | #70 #71 #72 #73 #74 #75 | `4227b03` | ✅ Closed |
| **4** | Public events + emails + iCal + `Event.campus_id` | #76 #77 #78 | `8e412c6` | ✅ Closed |
| **5** | Campus delete safeguards (block delete when entities scoped; offer reassignment) | — | — | ⏸ Queued |
| **6** | Codex full sweep across Phases 1–5 | — | — | ⏸ Queued |

---

## Schema additions

| Field | Doc | Default | Notes |
|-------|-----|---------|-------|
| `Membership.default_campus_id` | `memberships/{id}` | absent | Per-membership preferred campus; persisted alongside localStorage. |
| `Service.campus_id` | `churches/{c}/services/{id}` | null | `null` = org-wide (universal across every campus view). |
| `Person.campus_ids` | `churches/{c}/people/{id}` | `[]` | Pre-existing array; `[]` treated as universal. |
| `Event.campus_id` | `churches/{c}/events/{id}` | null | Phase 4. Universal when null. |
| `CalendarFeed.campus_id` | `churches/{c}/calendar_feeds/{id}` | null | Phase 4. Per-feed scope; null = "All campuses". |
| `event_signups.volunteer_id` | `event_signups/{id}` | "" (legacy) | Now populated on new authenticated signups (Phase 4 hotfix). |

---

## Decisions baked in

| Decision | Phase | Rationale |
|----------|-------|-----------|
| `null`/empty campus_id = **universal** | 2/3/4 | Keeps data visible during rollout when admins haven't tagged everything yet. Symmetric for services, events, people, feeds. |
| `pendingInviteTotal` + Families count stay **global** | 3 | Invites/households aren't yet tagged with a campus; Codex's call. |
| Schedule detail (matrix) doesn't dynamically filter while open | 2 | A schedule is a generated artifact tied to specific services; filter is the list, not the open page. |
| Per-feed campus picker (not always-on) | 4 | Per signoff: lets multi-campus volunteers carve per-campus feeds. |
| iCal personal feeds include **service assignments + event signups** under campus scope | 4 hotfix #1 | Matches Service Day mental model. |
| Identity join in iCal: `volunteer_id === targetId` OR `user_id === target.user_id` | 4 hotfix #2 | Backwards compat with legacy signups that have empty `volunteer_id`. |

---

## Open Codex findings

None as of `8e412c6` (Phase 4 closed by Codex 2026-05-25).

---

## Manual deploy steps that landed

- `firebase deploy --only firestore:rules` was run after PR #74 (households rule
  change). All subsequent Phase 4 PRs touched only client + Admin SDK code so
  no further rules deploys were needed.

---

## Next up

**Phase 5** — Campus delete safeguards. See the questions/decisions block in
Claude's handoff message before starting.
