# Pass H — Multi-Campus — Status

> ## ✅ Pass H is CLOSED
>
> Codex PASS on Phase 6 hotfix retest (2026-05-25) against production head
> `f15708c`. All six phases shipped, all open findings resolved, all PRs
> merged.

Single-page tracker of where Pass H stands. Frozen at closure.

---

## Phase summary

| Phase | Scope | PRs | Last commit | Status |
|-------|-------|-----|-------------|--------|
| **1** | Campus context + sidebar selector + badge primitive | #66 #67 | `ed51165` | ✅ Closed |
| **2** | Schedules + Service Day campus filter | #68 #69 | `ff10fba` | ✅ Closed |
| **3** | People + retention/health/onboarding campus filter | #70 #71 #72 #73 #74 #75 | `4227b03` | ✅ Closed |
| **4** | Public events + emails + iCal + `Event.campus_id` | #76 #77 #78 | `8e412c6` | ✅ Closed |
| **5** | Campus delete safeguards (audit + reassign/convert + cascade) | #80 | `2554cd1` | ✅ Closed |
| **6** | Codex full sweep across Phases 1–5 + identity-join hotfixes | #83 #84 | `f15708c` | ✅ Closed |

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
| `campuses.{id}` delete rule | `firestore.rules` | `if false` | Phase 5. Forces deletes through `/api/campuses/[id]` cascade. |

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
| Reassign **OR** convert-to-org-wide on campus delete | 5 | User signoff. Never block delete entirely — always give a path forward. |
| Last remaining campus deletable via convert | 5 | User signoff. Org returns to single-campus mode; sidebar selector auto-hides. |
| Calendar feeds **always** go to `null` on campus delete (both modes) | 5 | User signoff. Avoids silently re-pointing a user's iCal subscription to a different campus. |
| Direct client-side `campuses` delete blocked by rules | 5 | Forces all deletes through `/api/campuses/[id]` cascade (server-side, transactional, audit-aware). |
| `event_signup` ownership identity-join: `volunteer_id` first, fall back to `person_id` (legacy field) and `user_id` (legacy logged-in signups) | 6 hotfix | Same pattern applied to `/api/calendar`, `/api/roster/self-remove`, `/api/notify/absence`, `/api/attendance`. Codex caught self-remove first; audit follow-up found the other three. |

---

## Open Codex findings

None as of `f15708c` (Phase 6 hotfix retest PASS, 2026-05-25). Pass H closed.

---

## Manual deploy steps that landed

- `firebase deploy --only firestore:rules` was run after PR #74 (households rule
  change) and again after PR #80 (campuses delete rule tightening). Phase 4 PRs
  in between touched only client + Admin SDK code so no rules deploy was needed
  for them.
- Phase 6 hotfixes (#83, #84) did not touch rules — no deploy needed.
- **Going forward**: PR #82 (merged) installs a GitHub Action that auto-runs
  `firebase deploy --only firestore:rules,firestore:indexes,storage:rules` on
  every merge that touches those files. The manual step is retired (provided
  the `FIREBASE_SERVICE_ACCOUNT` secret + `FIREBASE_PROJECT_ID` variable are
  configured in repo settings).

---

## Next up

Pass H is closed. The launch-readiness queue resumes:

- Sentry instrumentation
- MFA (multi-factor auth)
- CSP enforcement (currently report-only)
- Real "notify ministry leads" endpoint (deferred from Codex QA, Pass G)
- Branded `/account/suspended` page (deferred from Pass G Phase 5)
- Backend perf optimization of the assignment-rule `get()` call
  (deferred from Codex QA 2026-05-15, acceptable for current scale)

The GitHub Action for auto-deploying Firebase rules is already in place
(PR #82). Future PRs touching `firestore.rules`, `firestore.indexes.json`,
or `storage.rules` deploy automatically on merge — the manual step that
bit Pass G Phase 6 and Pass H PRs #74 / #80 is retired.

## Retrospective (closed)

10 PRs + 1 docs PR + 1 CI workflow + 1 closure doc = 13 merges total
across 5 weeks of cadence. Codex caught one Sev 2 per phase on average
(Phase 1: selector visibility for volunteers; Phase 2: chip order;
Phase 3: Families crash chain + counts; Phase 4: identity-join in iCal;
Phase 5: clean PASS; Phase 6: identity-join in self-remove). The single
recurring class of bug across the whole pass was field-name
inconsistencies after renamed schemas (`person_id` → `volunteer_id` on
event_signups); the Phase 6 audit caught the last two consumers
preemptively before Codex bounced them back.
