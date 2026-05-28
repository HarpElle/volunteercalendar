# Wave 5 Batch E — Design Doc

> Server Components for dashboard home + 4 hot admin pages, plus the deferred 2.2b assignment-rule lockdown.
>
> Status: APPROVED for implementation 2026-05-27 with Jason. Decisions baked in below.

## Decisions baked in

| Question | Decision |
|---|---|
| `/api/dashboard-summary` cache TTL | **60s edge cache.** Mutations that should re-read fresh use `revalidatePath('/dashboard')` after the change lands. Tunable later. |
| People-page endpoint | **Extend the existing `/api/people-data`** to cover the 3-4 collections it doesn't currently return. Single endpoint, single shape. |
| Codex retest gating | **One retest at the end** (after all 9 steps land). Single PR; full pattern verified in one pass. Faster ship-to-Codex cycle. |

---

## Goals

1. **Cut initial JS bundle by ≥40%** on the dashboard. Move data-fetch-then-render work from the browser to server-rendered RSC trees so the browser doesn't ship reducer logic, fetcher code, and Firestore client SDK paths for the initial paint.
2. **Cut Firestore reads per dashboard load by ≥70%.** Today each of the 5 pages parallelizes 6–10 client SDK reads on every mount. Server-rendered admin reads consolidate into single shaped responses, return cached results when warm, and skip the per-doc `_metadata` overhead the client SDK adds.
3. **Land the deferred Wave 2.2b assignment-rule lockdown** atomically with the My Schedule refactor. The rule currently allows volunteers to read any assignment in their church; tightening it to published/archived only — with the server-side My Schedule endpoint as the authorized read path — closes a long-standing defense-in-depth gap. See "Why coupled" below.

## Why these are coupled in one batch

Wave 2.2b proved that the rule change ALONE breaks volunteers' My Schedule because Firestore rejects a list query if ANY doc in the result set fails the rule. Drafts in the matched window kill the whole list. The Wave 5 prep notes in STATUS.md call this out: the rule needs the server-side data path to land first (or atomically), so volunteers never run a client list query that crosses the rule boundary again.

Splitting Batch E into E1 (server components) and E2 (rule) is possible but doubles the Codex retest count and risks deploying E2 before all the client read paths have been verified gone. Atomic ship is safer.

---

## The 5 pages + their new endpoints

| Page | Current pattern | New endpoint | What it returns |
|---|---|---|---|
| `/dashboard` (home) | 6 parallel client reads (people, ministries, services, schedules, assignments, church) | NEW `/api/dashboard-summary` | `{ stats, upcomingAssignments, recentActivity, pendingApprovals, setupSteps }` — everything the home page renders |
| `/dashboard/people` | 8 client reads + already has `/api/people-data` | EXTEND `/api/people-data` to cover what's missing (the page still does 3–4 extra client reads on top) | Same shape but now includes the missing collections |
| `/dashboard/schedules` | 6 client reads (schedules, services, people, ministries, households, church) | NEW `/api/schedules-data` | `{ schedules, services, peopleById, ministriesById, householdsByVolunteer }` — pre-joined |
| `/dashboard/service-day` | 7 client reads + the `getEventSignupsBatch` cron-style helper | NEW `/api/service-day` (date-param query) | `{ services, events, assignments, signupsByEvent, ministriesById }` for a given date |
| `/dashboard/my-schedule` | 8–10 client reads per active church (loops!) | NEW `/api/my-schedule` | `{ perChurch: [{ churchId, assignments, openSlots, selfServiceCarveOut }] }` — preserves the self-service draft carve-out via Admin SDK reads |

**All five new endpoints follow the established pattern:**
- `assertBearerToken → parseBody/parseQuery → requireMembership(req, churchId, "volunteer")` for auth
- Admin SDK reads
- Shaped JSON response designed for direct render with no further client fetches
- Cached at the edge for 60s where the data isn't user-specific (dashboard summary stats), bypass cache for per-user pages (My Schedule)

**The RSC migration on the page side:**
- Page becomes `async function Page({...})` (server component)
- Calls the new endpoint via `fetch()` with the user's session cookie
- Renders the shaped data into the existing JSX, wrapping only the interactive bits (modals, toggles, mutations) in client components
- Reducer state moves to URL params or smaller client islands

---

## Migration order

Each step ships AS its own commit on a single PR branch; merge happens at the end of the chain. Order minimizes "broken intermediate state" risk:

1. **`/api/dashboard-summary` endpoint** — write + test in isolation. Dashboard home keeps using client reads.
2. **Migrate dashboard home to consume the endpoint** — page is still client component but data path goes through endpoint. Validates the shape end-to-end without touching the RSC paradigm yet.
3. **Convert dashboard home to RSC** — flip the page to async server component. Mutation/interactive bits get extracted into small client islands. This is the visible architectural change.
4. **Repeat steps 1–3 for People, Schedules, Service Day** in that order (lowest blast radius first; Schedules is the most complex). One commit per page conversion.
5. **`/api/my-schedule` endpoint** with the self-service carve-out preserved. Write + test in isolation.
6. **Migrate `/dashboard/my-schedule` to consume the endpoint** — still client component during transition.
7. **Convert My Schedule to RSC.**
8. **Add the Firestore rule lockdown** to `firestore.rules` + the 8 emulator test cases from STATUS.md. Auto-deploys on merge.
9. **One final commit**: delete the now-dead client SDK read paths in the 5 pages (they were left in during transition as a safety net).

Steps 1–4 are safe to merge incrementally (no rule change, fall-back to client reads still works). Steps 5–9 ship as one atomic merge because that's when the rule changes — the My Schedule path MUST be on the server endpoint before the rule tightens.

---

## Firestore rule change

Verbatim from the Wave 2.2b prep notes (already proven in emulator):

```
match /assignments/{docId} {
  allow read: if isActiveMember(churchId) && (
    isSchedulerOrAbove(churchId) ||
    resource.data.get('schedule_status', '') in ['published', 'archived']
  );
  allow write: if isSchedulerOrAbove(churchId);
}
```

Uses `resource.data.get(field, '')` to safely handle docs missing the `schedule_status` field (rare legacy orphans) without throwing during list-query evaluation. Wave 2.2a backfilled 194 assignments to populate this field; any future orphan defaults to safe-deny.

Test cases to port into `tests/rules/firestore.rules.test.ts` (all 8 green in emulator with seeded data):

1. Volunteer's `/api/my-schedule` flow doesn't hit this rule (server uses Admin SDK)
2. Volunteer's direct client read of a published assignment via single `getDoc` → ALLOWED
3. Volunteer's direct client read of an archived assignment → ALLOWED
4. Volunteer's direct client read of a draft assignment → DENIED
5. Volunteer's direct client read of a legacy orphan (missing `schedule_status`) → DENIED
6. Cross-tenant: volunteer in church A reading assignment from church B → DENIED
7. Admin/scheduler client read of a draft assignment → ALLOWED (bypass branch)
8. Admin client list query across drafts → ALLOWED

## Risks + mitigations

| Risk | Mitigation |
|---|---|
| Server endpoint times out on large orgs (My Schedule loops across all churches) | Cap to 5 churches in the loop with a `next_cursor` for pagination. Anchor Falls has 1; the cap won't bite anyone in production today. |
| RSC conversion breaks active-campus filtering (volunteers see across-campus data) | The endpoint takes `?campus_id=` from the client's stored active campus and filters server-side. Migration step 2 validates this before step 3 flips to RSC. |
| The 60s edge cache on dashboard-summary serves stale stats to admins right after a mutation | Use `revalidatePath('/dashboard')` after mutations from People/Schedules/etc. Mutations already pass through API routes today, so the hook points exist. |
| Rule change blocks something the 5 pages don't query but other client code does | Audit grep for `getDocs.*assignments\|getDoc.*assignments` BEFORE merging step 8. Any direct-from-collection read needs to be either (a) routed through an endpoint or (b) tolerant of the rule. |
| Self-service mode regression on My Schedule | Step 5 endpoint must include the self-service carve-out unit test. Test that the volunteer's own draft claims appear even when `schedule_status === 'draft'`. |

---

## Codex retest scope

Bigger than recent batches because both architectural change and a rule change land. Send Codex after step 9 is in production:

### A. Visible behaviour parity (no regressions)
1. `/dashboard` home shows the same stats, upcoming assignments, pending approvals, setup guide state as before
2. People page renders identical row data + filtering
3. Schedules page renders identical list + status badges
4. Service Day page renders today's services + signups
5. My Schedule shows the same upcoming assignments, the self-service carve-out continues to work, open-slot claimability matches

### B. Performance verification
6. Lighthouse on `/dashboard` shows ≥40% reduction in initial JS transferred vs. pre-Batch-E baseline
7. Firestore read meter (per request, via Firebase Console) shows ≥70% reduction on a dashboard load

### C. Rule enforcement
8. Volunteer attempting direct client read of a draft assignment via Firebase console / curl → DENIED
9. Volunteer attempting list query across drafts → DENIED (this was the Wave 2.2b regression we worked around)
10. Admin / scheduler unchanged — can still read everything

### D. Sev rubric
- **Sev 1**: any visible regression — missing data, wrong data, broken view
- **Sev 2**: server endpoint returns 500 under load, edge cache serves wrong-user data
- **Sev 3**: stale data after mutation that should have triggered revalidation
- **Sev 4**: minor perf miss (40% target not hit but still measurable)

---

## Rollback plan

The five new endpoints are additive. The page-level RSC conversion is a single commit per page; reverting any one commit puts that page back to its previous client-render shape without affecting the others.

The rule change is the irreversible-feeling piece. To roll back: revert step 8's commit; the auto-deploy workflow re-pushes the relaxed rule. Volunteers regain client read access to drafts (back to today's state). Server endpoints continue to work either way.

---

## Effort estimate

Roughly 12–15 focused hours across the 9 steps. Likely split across two days of work, with Codex retest in between if anything looks risky.

## Pre-merge gate

Single PR (~12–15h, 9 commits). Auto-merge for routine pattern PRs doesn't apply — Jason eyeballs the diff before merge because:
- 5 new server endpoints + 5 page conversions = large blast radius
- Firestore rule change requires careful review even though it's pre-tested
- Codex retest covers the production runtime but not the diff review

Jason's go-ahead, then merge + Codex retest.
