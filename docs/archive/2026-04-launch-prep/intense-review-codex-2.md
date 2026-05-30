# VolunteerCal Intense Review - Codex Synthesis Audit

Date: 2026-04-25

Audience: engineering leadership and the development team responsible for hardening VolunteerCal before broader production scale.

Reviewer posture: external audit team covering application security, SaaS architecture, backend reliability, Vercel operations, frontend UX, product clarity, and maintainability.

Inputs synthesized:
- Direct Codex repo inspection of the VolunteerCal codebase.
- Prior report: `intense-review-codex.md`.
- External report: `intense-review-claude.md`.
- External report: `intense-review-gemini.md`.
- Official Vercel documentation search for cron behavior and recommended `CRON_SECRET` protection patterns.

Access limits:
- Local source code, config, Firebase rules, selected scripts, and package metadata were inspected.
- Hosted Vercel project settings, production environment variable scoping, deployed runtime logs, Firebase console settings, sender reputation, and live traffic were not directly verified.
- Any deployment-environment claims below are therefore marked as confirmed from code, likely from code shape, or unverified.

## 0. Synthesis Notes: What Changed From The First Codex Review

The second-pass review materially changes the priority order. The original Codex report correctly identified public check-in risk, duplicated authorization, Firestore overbreadth, service worker caching, cron hardening, open redirects, lint failure, and test absence. The Claude and Gemini reports add two findings that should move near the top:

- `src/app/api/welcome/route.ts` is an unauthenticated Resend-backed email sender. It is an open email relay risk and sender-reputation risk.
- `src/app/api/checkin/register/route.ts` is unauthenticated and creates households and children. That is not just "public kiosk convenience"; it is unauthenticated data injection into sensitive child/household collections.

Several external claims were challenged or corrected:

- The claim that `.env.local` is committed is not confirmed. `git ls-files -- .env.local .env.example` showed `.env.example`, not `.env.local`, and a Git history check did not show `.env.local` in the checked local repository. Treat this as a secret-hygiene risk, not a proven committed-secret incident.
- The claim that `motion` is unused is false. `motion/react` is imported across landing, dashboard help, drawer, modal, tooltip, PWA install, and scheduling components.
- The recommendation to solve API security with Next.js middleware is incomplete. Middleware can be useful as a coarse UI/session gate, but Firebase Admin SDK verification and role/tenant authorization must remain in Node route handlers or server functions. A centralized server authz helper is the safer fix.
- The recommendation to move to `shadcn/ui` or Radix conflicts with the project instruction: "No component library - hand-built components in `src/components/ui/`." The practical recommendation is to harden the existing primitives first; adopt low-level accessibility primitives only if the team explicitly changes that convention.
- Gemini's claim that cron routes are "properly secured" is contradicted by `src/app/api/cron/propresenter-export/route.ts`, which fails open if `CRON_SECRET` is missing.
- Vercel preview cron execution risk should be stated precisely. Official Vercel docs say cron jobs are only active in production deployments, not preview deployments. The remaining preview risk is not preview crons; it is preview deployments exposing API routes that can write to production data if production Firebase/secret env vars are shared.

## 1. Executive Assessment

VolunteerCal is not a toy. The codebase shows real product depth: scheduling, service plans, check-in, rooms, facility sharing, notifications, billing, exports, reports, onboarding, and a coherent warm editorial UI. The platform is already beyond a simple MVP. That is exactly why the risk profile is higher: the product is handling minors, household data, phone numbers, volunteer participation, church operations, billing, calendar tokens, SMS, email, and multi-tenant organization data.

The core technical problem is uneven trust-boundary design. Sensitive surfaces exist as public or weakly scoped endpoints because each feature grew its own local security model. Some flows use Firebase ID tokens and role checks; some rely on Firestore rules; some rely on URL tokens; some rely on in-memory IP rate limiting; some are explicitly unauthenticated kiosk endpoints. That pattern is not acceptable for a multi-tenant SaaS product that stores child medical/allergy notes and household data.

VolunteerCal is suitable for a tightly controlled beta where every tenant is known, traffic is small, and the team can manually watch behavior. It is not ready for broad self-serve production until the child check-in trust model, Firestore tenant isolation, email abuse controls, server authorization layer, validation, rate limiting, observability, and critical tests are hardened.

### Overall Grades

| Area | Grade | Rationale |
|---|---:|---|
| Product/content | B | Strong domain understanding and useful workflows; terminology and onboarding clarity need tightening as the feature set sprawls. |
| Architecture | C | Solid stack and file organization, but no centralized server authorization/data access layer and heavy client-side fetching. |
| Backend | C | Many flows are implemented, but validation, idempotency, transactions, and error handling are inconsistent across a large API surface. |
| Security | D | Public child/household check-in endpoints, open email relay, broad Firestore reads, URL-token surfaces, open redirects, and weak rate limiting block production trust. |
| UX/design | B- | Warm, coherent brand and useful mobile work; accessibility primitives, empty states, and dashboard information density need focused repair. |
| Performance | C | Dashboard and people flows over-fetch and compute client-side; route count and client-component count create future bundle and cost pressure. |
| Maintainability | C | TypeScript passes, but lint fails with real hook-rule errors; no visible test harness; domain logic and authz are duplicated. |
| Production readiness | D+ | Controlled beta only. Too many sensitive paths depend on local conventions instead of enforceable platform-wide safeguards. |

## 2. Top 15 Issues

### 1. Unauthenticated check-in lookup exposes child and household data

Severity: Critical

Area: Security / Backend

Status: Confirmed.

Why it matters:
`/api/checkin/lookup` is explicitly an unauthenticated kiosk endpoint. It accepts `church_id` plus QR token, last four phone digits, or full phone number. In the unified people path, last-four lookup scans all adult people in a church and expands matches to full family records. The response can include child names, photos, room assignments, alert flags, allergies, and medical notes. A 4-digit phone lookup space is only 10,000 values; the current in-memory per-IP limiter does not provide serious abuse resistance on Vercel.

Evidence:
- `src/app/api/checkin/lookup/route.ts:7-14` documents and implements an unauthenticated endpoint with only `rateLimit`.
- `src/app/api/checkin/lookup/route.ts:73-81` fetches all adult people and filters by last four phone digits.
- `src/app/api/checkin/lookup/route.ts:142-156` returns child details including `photo_url`, `default_room_id`, `has_alerts`, `allergies`, and `medical_notes`.
- `src/app/api/checkin/lookup/route.ts:181-193` legacy lookup scans all check-in households for last-four matches.
- `src/lib/utils/rate-limit.ts:8-35` uses an in-memory Map keyed by IP and route, which is not distributed and is weak against serverless instance rotation and shared NAT behavior.

Recommended fix:
- Introduce a kiosk station trust model.
- Require a short-lived kiosk session token or station token for lookup.
- Bind kiosk tokens to `church_id`, station/device, allowed endpoint scopes, and expiry.
- Rotate and revoke station tokens from the admin dashboard.
- Remove last-four lookup as a raw enumeration endpoint. If it must remain, require a trusted kiosk token and return only minimal match candidates.
- Never return allergies or medical notes during lookup. Return an alert indicator, then reveal detail only after a trusted check-in operator confirms the specific child.
- Add distributed rate limiting keyed by IP + church + station + lookup method + normalized lookup value.
- Add audit events for lookup attempts, no-match spikes, and suspicious enumeration patterns.

Effort:
Larger refactor. The fastest safe mitigation is to require a church-scoped kiosk token before any lookup and suppress medical detail from lookup responses.

### 2. Unauthenticated visitor registration writes households and children

Severity: Critical

Area: Security / Data Integrity

Status: Confirmed.

Why it matters:
`/api/checkin/register` lets any caller create `checkin_households` and `children` for any valid `church_id`. This allows database pollution, fake children, malicious allergy/medical note injection, cost amplification, and operational confusion during check-in.

Evidence:
- `src/app/api/checkin/register/route.ts:7-14` documents the endpoint as unauthenticated and rate-limited to 10/min.
- `src/app/api/checkin/register/route.ts:18-40` trusts client-supplied guardian and child fields.
- `src/app/api/checkin/register/route.ts:54-62` only validates that the church exists.
- `src/app/api/checkin/register/route.ts:73-96` creates the household.
- `src/app/api/checkin/register/route.ts:101-124` creates child documents including allergy and medical note fields.
- `src/app/api/checkin/register/route.ts:132-136` returns the household ID and QR token to the unauthenticated caller.

Recommended fix:
- Require trusted kiosk station context or an admin-created registration link.
- Add a "pending visitor registration" state that must be approved or checked in by an authorized operator before becoming durable child/household records.
- Validate body shape with a schema. Enforce max lengths, allowed grades, phone normalization, child count limits, and explicit rejection of unexpected fields.
- Write registration attempts to a quarantine collection first, then promote via server action/API after staff approval.
- Add duplicate detection by normalized phone + guardian name + child names.
- Add audit events and abuse counters.

Effort:
Quick mitigation plus medium refactor. A token gate can land quickly; pending-review workflow is the durable fix.

### 3. Unauthenticated check-in/check-out paths can create operational records

Severity: Critical

Area: Security / Backend

Status: Confirmed from code shape and route search; deepest evidence from prior Codex review.

Why it matters:
Check-in is not just a convenience workflow. It creates attendance/session records and security codes, can trigger SMS, and affects child release safety. If an attacker can create false sessions or abuse security-code flows, the app can produce misleading room counts, labels, guardian messaging, and pickup states.

Evidence:
- `src/app/api/checkin/checkin/route.ts` is described in the original Codex review as an unauthenticated kiosk endpoint.
- Route search confirms it uses only `rateLimit(req, { limit: 30, windowMs: 60_000 })` at `src/app/api/checkin/checkin/route.ts:20`.
- Related public check-in routes include `lookup`, `register`, `services`, `room`, `print`, `checkout`, `printer-config`, `vcard`, and `room-checkout`; several rely on `church_id`, room IDs, QR tokens, or security codes rather than authenticated users.

Recommended fix:
- Treat check-in as a separate authenticated subsystem, not a collection of public APIs.
- Add kiosk station activation: an admin creates a station session from the dashboard; the kiosk receives a scoped token with expiry and revocation.
- Split permissions: lookup, register visitor, check in, print label, room checkout, admin checkout, and report access should be separate scopes.
- Verify household-child-church relationships server-side for every operation.
- Use transactions for session creation, room capacity, duplicate check-in prevention, and checkout state changes.
- Log sensitive operations to an audit collection.

Effort:
Larger refactor. This is one of the hard gates before scaling to organizations using children's check-in.

### 4. Firestore rules allow overbroad multi-tenant reads

Severity: Critical

Area: Security / Tenant Isolation

Status: Confirmed.

Why it matters:
Firestore rules are the final line of defense for client SDK access. The current rules grant active members broad read access to all church subcollections and nested subcollections. That likely includes sensitive operational, household, children, settings, invite, feedback, schedule, and report data unless individual server routes avoid exposing it. Client-side filtering is not tenant isolation.

Evidence:
- `firestore.rules:159-166` allows `isActiveMember(churchId)` to read any `churches/{churchId}/{subcollection}/{docId}`.
- `firestore.rules:168-172` allows active members to read nested subcollections.
- `firestore.rules:175-193` allows any authenticated user to read all `facility_groups` and group members.
- `firestore.rules:209-212` makes `stage_sync_live` publicly readable and treats the document token as auth.
- `firestore.rules:73-75` permits anonymous `waitlist` creation.

Recommended fix:
- Replace catch-all subcollection read rules with collection-specific rules.
- Define a role/scope matrix:
  - Volunteer: own profile, own assignments, public service metadata, limited directory fields where intentionally enabled.
  - Scheduler: schedule and assignment management for authorized teams.
  - Check-in worker: check-in household/children data only when granted check-in permission.
  - Room admin: room/reservation scopes.
  - Owner/admin: org settings, billing, members, reports.
- Move sensitive aggregate reads behind server routes using Admin SDK.
- For `facility_groups`, require membership in the specific group, not just any authenticated user.
- For `stage_sync_live`, use short-lived tokens or scoped display tokens and avoid storing sensitive service-plan data in publicly readable documents.
- Add Firestore emulator tests for every role and cross-tenant denial.

Effort:
Larger refactor, but it can be staged by first locking sensitive collections and replacing client reads with server routes.

### 5. `/api/welcome` is an open email relay

Severity: High

Area: Security / Ops / Abuse

Status: Confirmed.

Why it matters:
The endpoint accepts an arbitrary email address and sends through Resend without authentication, rate limiting, CAPTCHA, or a user/session binding. This can be abused to spam arbitrary recipients and damage the sender reputation for `noreply@harpelle.com` / VolunteerCal mail.

Evidence:
- `src/app/api/welcome/route.ts:7-9` accepts `name`, `email`, and `redirect` from unauthenticated JSON.
- `src/app/api/welcome/route.ts:31-38` sends email to the supplied address.
- There is no `rateLimit`, Firebase auth verification, Turnstile/reCAPTCHA, user creation webhook verification, or idempotency.

Recommended fix:
- Remove this as a public callable endpoint.
- Send welcome/account-created email from a trusted server flow after successful Firebase Auth account creation or organization join.
- If the endpoint remains, require Firebase ID token where decoded user email matches the destination email.
- Add distributed rate limiting per user, email, IP, and route.
- Add idempotency so one account only receives the welcome email once per relevant event.
- Log and alert on send spikes and bounce/complaint rates.

Effort:
Quick win. This can be locked down before larger architecture work.

### 6. Cron authentication is inconsistent and one route fails open

Severity: High

Area: Ops / Security

Status: Confirmed.

Why it matters:
Official Vercel docs recommend failing closed when `CRON_SECRET` is absent or the authorization header does not match. `propresenter-export` only rejects mismatches when the env var exists. If `CRON_SECRET` is absent in any deployment, the route runs for anyone and iterates all churches.

Evidence:
- `src/app/api/cron/propresenter-export/route.ts:13-19` uses `if (cronSecret && authHeader !== \`Bearer ${cronSecret}\`)`, so missing `CRON_SECRET` permits execution.
- `vercel.json:15-18` schedules `/api/cron/propresenter-export`.
- Official Vercel docs show the fail-closed pattern: `if (!cronSecret || authHeader !== \`Bearer ${cronSecret}\`) return 401`.
- Official Vercel docs state cron jobs are only active in production deployments, not preview deployments. This lowers preview-cron risk but does not protect manually invoked preview API routes.

Recommended fix:
- Create `src/lib/server/cron.ts` with `requireCronSecret(req)`.
- Require `CRON_SECRET` to exist and match exactly.
- Use a timing-safe compare after checking both strings exist and are same length.
- Apply to every cron/internal scheduled route.
- Add tests that assert each cron route returns 401 when the env var is missing.
- Consider structured cron run records: start time, end time, status, count processed, count failed, error summary.

Effort:
Quick win for guard changes; medium for operational run records.

Sources:
- Vercel Cron quickstart: https://vercel.com/docs/cron-jobs/quickstart
- Vercel Cron management/security example: https://vercel.com/docs/cron-jobs/manage-cron-jobs

### 7. Authorization is duplicated route-by-route

Severity: High

Area: Architecture / Security

Status: Confirmed.

Why it matters:
The app has 133 API route files. Many manually parse Bearer tokens, verify Firebase ID tokens, fetch memberships, and apply role/permission checks. That is already drifting: check-in public endpoints, open welcome email, cron guard inconsistency, multiple permissions utilities, and route-specific membership patterns. Human memory is not a reliable control plane.

Evidence:
- Route search shows `adminAuth.verifyIdToken` repeated throughout `src/app/api/**`.
- `src/lib/auth/permissions.ts`, `src/lib/utils/permissions.ts`, and `src/lib/utils/checkin-permissions.ts` split permission logic.
- `src/app/api/rooms/route.ts`, `src/app/api/people-data/route.ts`, `src/app/api/reservations/route.ts`, `src/app/api/platform/*`, and notification routes use local authorization patterns.
- Public exceptions are not enumerated in one registry.

Recommended fix:
- Create a server-only authorization module:
  - `requireUser(req)`
  - `requireMembership(req, churchId)`
  - `requireRole(req, churchId, roles)`
  - `requirePermission(req, churchId, permission)`
  - `requirePlatformAdmin(req)`
  - `requireCronSecret(req)`
  - `requireKioskSession(req, churchId, scope)`
- Return consistent 401/403/404 errors.
- Add audit metadata from the authz result: actor UID, church ID, membership role, permission path.
- Migrate high-risk routes first: check-in, welcome/notify, billing, invites, platform admin, org deletion, reservations, exports.
- Keep Next.js middleware narrow. Use it for coarse dashboard routing/session checks if session cookies are introduced, but do not rely on middleware as the primary authorization mechanism for Admin SDK route logic.

Effort:
Medium-to-large refactor, but can be incremental.

### 8. Dashboard and people flows over-fetch and compute client-side

Severity: High

Area: Performance / Architecture / Cost

Status: Confirmed.

Why it matters:
Dashboard summary metrics should not require downloading broad raw collections to the browser. This creates slow first loads, larger bundles, more Firestore reads, worse mobile UX, and a larger blast radius from permissive Firestore rules.

Evidence:
- `src/app/dashboard/page.tsx:1` is a client component.
- `src/app/dashboard/page.tsx:43-65` fetches active people, all ministries, all services, all schedules, recent assignments, and the church document client-side.
- `src/app/dashboard/page.tsx:76-172` computes maps, active schedules, fill rate, volunteer counts, upcoming service summaries, top volunteers, and retention client-side.
- `src/app/dashboard/page.tsx:183-202` performs another authenticated fetch for memberships.
- Route search shows extensive client-side Firebase reads in `src/lib/firebase/firestore.ts` and `src/lib/api/people.ts`.

Recommended fix:
- Move dashboard aggregation to a server route or Server Component.
- Return a compact `DashboardStatsDTO`, not raw collections.
- Use Firestore aggregation/count queries where appropriate and/or maintain `church_stats` documents.
- Cache server-side by church and role with short TTLs or tag-based invalidation.
- Keep interactive widgets as client components, but load initial data server-side.
- Repeat this pattern for people data, volunteer health, scheduling dashboards, and check-in reports.

Effort:
Medium refactor. Dashboard home is the best first migration target.

### 9. Reservation and recurring booking conflict checks are race-prone

Severity: High

Area: Backend / Reliability

Status: Confirmed from prior inspection.

Why it matters:
Room/resource scheduling is a core paid workflow. If two requests check for conflicts and then write outside a transaction, both can pass and double-book a room. Recurring reservations multiply the failure mode.

Evidence:
- `src/app/api/reservations/route.ts` contains conflict lookup followed by writes.
- `src/lib/utils/recurrence.ts:95-153` materializes recurring reservations and cancellation behavior.
- Prior Codex review found `findConflicts()` query/write separation in `src/app/api/reservations/route.ts`.

Recommended fix:
- Use deterministic occupancy/lock documents per church + room/resource + date + time bucket.
- Use Firestore transactions for conflict check and reservation creation.
- For recurring reservations, either create all occurrence locks transactionally in bounded batches or mark the series pending until all occurrences are reconciled.
- Add tests for concurrent booking attempts.

Effort:
Larger refactor.

### 10. Public URL-token surfaces lack lifecycle management

Severity: Medium-High

Area: Security / Product

Status: Confirmed from route structure and prior review.

Why it matters:
Calendar feeds, room feeds, stage sync, guardian household QR flows, and short links rely on bearer-style URL tokens. Some of that is unavoidable for iCal clients, but URL tokens leak through browser history, logs, referrers, screenshots, shared links, and support tickets. The current product needs better token lifecycle UX.

Evidence:
- Calendar feed routes include tokens in path: `src/app/api/calendar/church/[churchId]/[calendarToken]/route.ts`, `src/app/api/calendar/ministry/[ministryId]/[calendarToken]/route.ts`, `src/app/api/calendar/room/[roomId]/[calendarToken]/route.ts`.
- `firestore.rules:209-212` makes `stage_sync_live/{token}` publicly readable.
- `src/app/api/checkin/register/route.ts:132-136` returns a QR token to the unauthenticated caller.
- `src/app/api/short-links/route.ts:65-159` stores `target_url`; `src/app/s/[slug]/page.tsx:29` redirects to it.

Recommended fix:
- Create token inventory and lifecycle policy: scope, entropy, expiry, rotation, revocation, last accessed, created by, purpose.
- Add admin UI to rotate calendar/room/check-in/stage tokens.
- For non-iCal APIs, prefer header tokens or authenticated access rather than URL path tokens.
- For public display/stage tokens, minimize the document data exposed and allow instant revocation.
- Add cache headers carefully: iCal can use short private caching; sensitive JSON should not be publicly cached.

Effort:
Medium.

### 11. Short links are open redirects

Severity: Medium

Area: Security / Product

Status: Confirmed.

Why it matters:
A trusted VolunteerCal short URL can redirect to a phishing page or malicious destination. The endpoint requires auth to create links, but a compromised admin account or malicious tenant can weaponize the product brand.

Evidence:
- `src/app/api/short-links/route.ts:65-79` accepts `target_url`.
- `src/app/api/short-links/route.ts:156-159` stores `target_url`.
- `src/app/s/[slug]/page.tsx:29` calls `redirect(data.target_url)`.

Recommended fix:
- Default to relative internal VolunteerCal paths only.
- If external URLs are needed, require an explicit allowlist per org or product-level allowlist.
- Show an interstitial warning for external destinations.
- Add audit logging for external redirect creation.

Effort:
Quick win.

### 12. Service worker caches authenticated navigations

Severity: Medium

Area: Security / UX / Reliability

Status: Confirmed.

Why it matters:
The service worker pre-caches `/dashboard` and caches navigation responses. On shared devices, after logout, org switch, or permission change, stale authenticated app shells can appear offline or from cache. Even if API data is protected, the UX can show stale private structure.

Evidence:
- `public/sw.js:9-15` pre-caches `"/dashboard"`.
- `public/sw.js:40-52` caches successful navigation responses and serves cached pages on failure.

Recommended fix:
- Remove `/dashboard` from pre-cache.
- Do not cache authenticated navigation responses.
- Cache static assets and `/offline` only.
- Clear VolunteerCal caches during logout and account deletion.
- Consider bypassing SW navigation cache for all `/dashboard`, `/account`, `/checkin`, `/admin`, `/api`, and tokenized routes.

Effort:
Quick win.

### 13. Server-side validation is ad hoc and schema-less

Severity: Medium

Area: Backend / Security / Maintainability

Status: Confirmed.

Why it matters:
The API surface is too large for hand-written `if (!field)` validation. The app writes data to Firestore from many routes and several public endpoints. Without schema parsing, unexpected fields, type confusion, invalid timestamps, oversized strings, and malformed nested structures can leak into persistent state.

Evidence:
- No `zod` usage was found in dependencies or source.
- `src/app/api/checkin/register/route.ts:18-40` type-casts the request body to an expected shape.
- `src/app/api/welcome/route.ts:9-13` validates only presence of email.
- Many API routes parse JSON bodies locally and validate inline.

Recommended fix:
- Add a schema layer, preferably `zod`.
- Define route input schemas near routes or domain modules.
- Standardize a `parseJson(req, schema)` helper.
- Enforce unknown-field rejection on public and sensitive routes.
- Add max string lengths, enum validation, ISO timestamp validation, and cross-field validation.
- Migrate top routes first: check-in, welcome/notifications, invite, org setup/deletion, reservations, billing, publish, exports.

Effort:
Medium. The helper can be quick; migration is incremental.

### 14. Observability and auditability are insufficient for production support

Severity: Medium-High

Area: Ops / Security / Reliability

Status: Likely confirmed from source/package search.

Why it matters:
For a B2B SaaS used by churches, the team will need to answer: who changed this schedule, who sent these texts, why did the cron miss, who exported data, who accessed child records, and why was a reservation approved. Current code relies heavily on `console.error` and local route responses. That does not produce a searchable operational narrative or security audit trail.

Evidence:
- Package/source search found no Sentry, pino, winston, Logtail-style structured logger, `audit_logs`, `outbox`, or comparable audit primitive.
- Route search shows many direct `console.error` calls.
- Sensitive operations exist: check-in, checkout, role changes, invites, org deletion, exports, billing tier override, publish, SMS/email sends, reservation approval.

Recommended fix:
- Add structured logging with request IDs and actor/church metadata.
- Add an append-only `audit_logs` collection:
  - actor UID
  - church ID
  - actor role/permission
  - action
  - target type/id
  - source route
  - timestamp
  - request ID
  - metadata with strict redaction
- Add Sentry or equivalent error aggregation.
- Add cron run records and alerts for non-2xx or partial failures.
- Add an admin-visible Activity page later, but start with backend logging.

Effort:
Medium.

### 15. Lint fails and there are no visible critical-flow tests

Severity: Medium

Area: Maintainability / Reliability

Status: Confirmed from prior local runs and package/source inspection.

Why it matters:
TypeScript passing is necessary, not sufficient. The current lint failure includes hook-order errors, which are correctness bugs. The absence of a visible automated test harness means future security and rules refactors will be made blind.

Evidence:
- Prior local run: `npx tsc --noEmit` passed.
- Prior local run: `npm run lint` failed with 129 problems: 52 errors and 77 warnings.
- Hook-order errors were reported in `src/app/dashboard/page.tsx` and `src/components/ui/short-link-creator.tsx`.
- No meaningful Jest/Vitest/Playwright/Firebase emulator test setup was visible in the audit.

Recommended fix:
- Fix hook-rule errors before feature work.
- Decide which React Compiler lint rules are blockers and tune the config intentionally.
- Add CI jobs for `npx tsc --noEmit`, lint, and tests.
- Add Firestore emulator tests for tenant isolation and role matrix.
- Add route tests for high-risk APIs.
- Add Playwright smoke tests for login, dashboard, schedule publish, check-in kiosk, reservation booking, and billing portal entry.

Effort:
Quick win for hook-rule repair; medium for proper test harness.

## 3. Detailed Findings By Category

### 3.1 Product and Content

Positive:
- The product understands its domain. The schedule, volunteer, check-in, rooms, training, and onboarding flows reflect real church operations.
- The warm editorial brand is a real differentiator against generic scheduling SaaS.
- The dashboard setup guide is useful and task-oriented.
- Notification center and mobile navigation show product maturity beyond a CRUD MVP.

Risks:
- Terminology drifts between "teams", "ministries", "services", "events", "rooms", "resources", "check-in", and "schedules". Some drift is unavoidable internally, but the user-facing model should be sharper.
- The product surface now contains many expansions. The IA needs opinionated "primary jobs" per role: owner, scheduler, team lead, check-in worker, volunteer, room admin, platform admin.
- Empty states are uneven. Some give the next action; others report absence and stop.
- Public marketing and app content may over-promise if security, check-in, and reliability hardening are not complete.

Recommendations:
- Create a product language glossary:
  - User-facing term.
  - Internal collection/type name.
  - Where it appears.
  - Deprecated synonyms.
- Rewrite empty states around the next action:
  - "No upcoming services" should include "Create service" or "Generate schedule".
  - "No organization" should explain account state without suggesting account deletion as a peer action to getting started.
- Add role-specific landing dashboards:
  - Owner/admin: org health, plan, setup, pending approvals, risk alerts.
  - Scheduler: next services, unfilled roles, review queue, availability conflicts.
  - Check-in: today's rooms, active sessions, alerts.
  - Volunteer: assignments, availability, journey/prereqs.

### 3.2 Information Architecture and Structure

Positive:
- The app uses a recognizable Next.js App Router structure.
- Domain areas are mostly discoverable under `src/app/dashboard/**`.
- Firebase client helpers and type definitions exist and are reused.
- Deprecated path redirects in middleware show care for navigation continuity.

Weaknesses:
- `src/app/api` has 133 route files. That is not automatically bad, but the lack of a shared server policy layer makes it hard to reason about safety.
- API routes mix authentication, authorization, validation, domain logic, Firestore access, notification side effects, and response formatting.
- Client components are very common. The audit saw 166 `"use client"` files across app/components.
- Direct Firestore client reads still drive important dashboard screens.
- Business logic is split between API routes, components, `src/lib/firebase/firestore.ts`, `src/lib/api/people.ts`, and domain utilities.

Recommendations:
- Introduce layers without a big-bang rewrite:
  - `src/lib/server/authz.ts` for identity, membership, role, permission, platform, cron, and kiosk checks.
  - `src/lib/server/validation.ts` for schema parsing.
  - `src/lib/server/audit.ts` for audit events.
  - `src/lib/server/rate-limit.ts` for distributed rate limiting.
  - `src/lib/domain/*` for scheduling/check-in/reservations/notifications rules.
  - `src/lib/repositories/*` only where repeated Firestore access patterns are becoming dangerous.
- Document public API exceptions in one file:
  - webhooks
  - cron
  - waitlist
  - public invite/join
  - calendar feed
  - kiosk station bootstrap
- Prefer Server Components and compact server DTOs for read-heavy dashboards.

### 3.3 Backend and Data Flow

Positive:
- The stack choice is viable for the current stage: Next.js + Firebase Admin SDK + Firestore + Vercel works for a beta SaaS.
- There is evidence of batch operations and atomic increments in parts of the codebase.
- Several routes already use Firebase ID tokens and role checks.
- Firestore indexes are explicitly maintained.

Weaknesses:
- Several public endpoints write or expose sensitive state.
- Validation is local and inconsistent.
- Some workflows mix the durable write and external side effect in one request path.
- Long-running cron jobs iterate tenants/collections without robust pagination, idempotency, or run records.
- Recurring/reservation flows need transactional conflict protection.

Recommendations:
- Implement transactional outbox for emails/SMS:
  - Schedule publish writes assignment changes and outbox rows in the same batch.
  - A cron/worker sends messages, marks rows sent, retries failures, and dead-letters permanently failing rows.
- Add idempotency keys to externally visible mutations:
  - check-in session creation
  - visitor registration
  - reservation create/approve
  - invite send
  - notification send
  - billing webhook side effects
- Bound collection scans:
  - Use `limit`.
  - Use cursors.
  - Persist progress for cron jobs that can exceed a single function window.
- Add route-level schemas.
- Use transactions for conflict-prone writes.

### 3.4 Security

Confirmed severe risks:
- Public check-in lookup exposes sensitive child/household data.
- Public check-in registration writes child/household records.
- Public welcome email route can be abused for mail sending.
- Firestore rules are too broad for least-privilege multi-tenant access.
- In-memory rate limiting is weak for serverless and sensitive endpoints.
- Short links are open redirects.
- Cron guard inconsistency can expose an internal route if `CRON_SECRET` is absent.

Likely risks:
- URL-token lifecycle is underdeveloped.
- Sensitive child medical/allergy fields need stricter access boundaries than current check-in flows appear to enforce.
- Admin/platform operations lack durable audit logs.
- Preview deployments could touch production Firebase if Vercel env scoping is not strict.

Recommendations:
- Create a written security model:
  - Authentication methods: Firebase user, session cookie if added, cron secret, webhook signature, public feed token, kiosk token.
  - Authorization subjects: user, membership, kiosk station, public subscriber, webhook provider.
  - Data classes: public marketing, org metadata, volunteer data, child data, medical/allergy data, billing data, platform admin data.
  - Allowed access by role and token type.
- Lock down check-in first. It is the most sensitive area.
- Add distributed rate limiting. Use Upstash Redis, Vercel KV/Redis equivalent, or another managed store; do not depend on in-memory Map for abuse prevention.
- Add secret scanning to CI and pre-commit. Even though `.env.local` was not confirmed in current Git history, local secret files are too sensitive to leave unguarded.
- Add security headers in `next.config.ts`:
  - `Content-Security-Policy`
  - `Referrer-Policy`
  - `X-Content-Type-Options`
  - `Permissions-Policy`
  - `frame-ancestors` through CSP
- Redact PII from logs.

### 3.5 Robustness and Resilience

Risks:
- Cron jobs can partially fail without durable retry.
- Publish/notify and invite/notify flows likely lack transactional outbox guarantees.
- Reservation conflict checks need transactions.
- Service worker can serve stale authenticated navigation shells.
- Error states often collapse to generic "Something went wrong" without recovery guidance.
- External providers such as Resend/Twilio/Stripe need stronger retry, idempotency, and alerting behavior.

Recommendations:
- Add durable job/run records:
  - `cron_runs`
  - `notification_outbox`
  - `notification_failures`
  - `audit_logs`
- Add operational dashboards for failed sends, failed crons, and check-in anomalies.
- Add explicit fallback UX:
  - provider down
  - offline
  - permission denied
  - stale token
  - expired invite
  - no org
- Clear service worker caches on logout and avoid caching authenticated navigations.

### 3.6 Design and UX

Positive:
- The visual brand is coherent and warmer than typical SaaS admin tools.
- The app is clearly mobile-conscious.
- Bottom navigation and role-aware navigation are valuable.
- Landing pages use Motion and brand tokens consistently.

Weaknesses:
- Accessibility primitives need work. The custom `Input` renders errors but does not connect them to inputs with ARIA.
- Focus management in custom modals/drawers should be verified and hardened.
- Coral-on-warm backgrounds and muted labels should be contrast-tested against actual tokens.
- Dense dashboards need better progressive disclosure, role-based prioritization, and skeleton loading.

Evidence:
- `src/components/ui/input.tsx:23-31` renders error text without `aria-invalid`, `aria-describedby`, or an error ID.
- `src/app/dashboard/page.tsx:204-230` no-organization state is clear but emotionally blunt and odd in pairing "create org" with "delete account".
- `src/app/dashboard/page.tsx:427-430` uses badge color combinations that should be contrast-tested.

Recommendations:
- Patch UI primitives first:
  - `Input`
  - `Select`
  - `Modal`
  - `Drawer`
  - `Button`
  - tabs/segmented controls
  - icon-only nav items
- Add axe checks to Playwright smoke tests.
- Add a dashboard information hierarchy pass per role.
- Maintain the no-component-library convention, but treat accessibility in `src/components/ui/` as platform infrastructure, not page-level polish.

### 3.7 Performance

Risks:
- Client-side Firestore reads scale poorly with tenant size.
- Dashboard summary metrics are computed from broad raw collections.
- Large client-component count raises bundle and hydration risk.
- Calendar and token feeds need intentional cache headers.
- Cron jobs need pagination/concurrency limits as tenant count grows.

Recommendations:
- Move high-traffic summaries to server DTOs.
- Add aggregate/stat documents for dashboard home.
- Split heavy client-only modules with dynamic imports where user-triggered.
- Add `next/image` where media is rendered.
- Add Vercel Speed Insights and production traces to identify real bottlenecks. If already installed, make sure the team actually reviews dashboards and budgets.
- Define performance budgets:
  - dashboard initial JS
  - dashboard first data payload
  - Firestore reads per dashboard load
  - cron max duration
  - check-in lookup p95

### 3.8 Code Quality and Maintainability

Positive:
- Type definitions are centralized and comprehensive.
- The codebase follows project naming conventions reasonably well.
- Domain utilities exist for scheduling, permissions, retention, recurrence, and notifications.

Weaknesses:
- Lint failure is not acceptable for production.
- Hook-order errors must be fixed immediately.
- Route count is large enough that conventions need enforcement, not tribal memory.
- No obvious test harness means risky refactors will be slow and manually verified.
- Console logging is not enough for operational debugging.

Recommendations:
- Make lint and TypeScript required checks.
- Add tests in this order:
  - Firestore rules emulator tests.
  - Authz helper unit tests.
  - Check-in API route tests.
  - Reservation conflict tests.
  - Billing webhook idempotency tests.
  - Schedule publish/outbox tests.
  - Playwright smoke tests for role-specific flows.
- Add a route checklist to PR review:
  - auth method
  - authorization check
  - input schema
  - rate limit
  - audit event
  - idempotency
  - transaction requirement
  - PII redaction
  - tests

### 3.9 Vercel / Platform

Confirmed:
- `vercel.json` defines crons for reminders, songselect sync, propresenter export, notification cleanup, and stats refresh.
- Official Vercel docs say cron jobs are production-only.
- Official Vercel docs recommend fail-closed `CRON_SECRET` checks.
- The app has at least one cron route that does not fail closed when `CRON_SECRET` is missing.

Unverified:
- Whether Production, Preview, and Development use separate Firebase projects.
- Whether Preview deployments have production secrets.
- Whether Vercel Firewall, WAF, Bot Protection, or Attack Challenge Mode is configured.
- Whether Vercel Observability / Speed Insights / Web Analytics are active and reviewed.
- Whether environment variables are scoped least-privilege by environment.

Recommendations:
- Create separate Firebase projects:
  - `volunteercal-prod`
  - `volunteercal-staging`
  - `volunteercal-dev`
- Scope Vercel env vars by environment. Preview must never write production Firestore.
- Use different Resend/Twilio/Stripe keys for test/staging/prod.
- Use Vercel project protection for previews if real data can be reached.
- Add Vercel Firewall or equivalent rules for abusive public endpoints after they are reduced and scoped.
- Add cron run logging and alerting on non-2xx.
- Use fail-closed cron helper everywhere.
- Do not move Firebase Admin verification to Edge Middleware; keep Node route handlers for Admin SDK work.

## 4. Vercel-Specific Findings

### V1. Cron secret pattern is not uniformly fail-closed

Official Vercel guidance uses:

```ts
const authHeader = request.headers.get("authorization");
const cronSecret = process.env.CRON_SECRET;

if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
  return new Response("Unauthorized", { status: 401 });
}
```

VolunteerCal violates this in `src/app/api/cron/propresenter-export/route.ts:17-19`.

Fix:
- Add a shared helper and test it.

### V2. Cron jobs are production-only, but preview API exposure still matters

Vercel docs state cron jobs are only active in production deployments. This challenges the broad claim that preview crons themselves will run. However, preview deployments still expose route handlers; if previews share production Firebase or API keys, manually invoked routes can still affect production data.

Fix:
- Scope environment variables by Vercel environment.
- Use staging Firebase for Preview.
- Protect previews.

### V3. Long-running cron routes need pagination and durable state

`propresenter-export` iterates all churches. Other cron routes from prior review also process broad sets. Serverless functions need bounded units of work.

Fix:
- Add pagination/cursors.
- Persist cron run progress where needed.
- Add idempotency keys.
- Add `maxDuration` only after confirming Vercel plan limits and route runtime needs; do not use duration increases as a substitute for bounded work.

### V4. Middleware should remain coarse

Middleware is not the right place to perform Firebase Admin SDK authorization. If session cookies are introduced, middleware can redirect unauthenticated dashboard users and reject obviously unauthenticated API calls. Role, tenant, and resource authorization should still occur in Node route handlers through shared server helpers.

Fix:
- Build server authz first.
- Add middleware only for UX and coarse protection.

### V5. Security headers are underdeveloped

`next.config.ts` appears minimal from the first audit. For a SaaS handling PII, headers should be explicit.

Fix:
- Add CSP tuned to Firebase, Resend-hosted assets if any, analytics, and app origins.
- Set Referrer-Policy to reduce token leakage.
- Add frame protections.
- Review `connect-src` for Firebase/Google APIs.

## 5. What I Would Fix First

### This Week

1. Lock down check-in lookup.
   - Require a kiosk/station token on `/api/checkin/lookup`.
   - Remove allergy/medical note details from lookup responses.
   - Disable last-four lookup unless station-authenticated.

2. Lock down check-in registration.
   - Require kiosk/station token or convert to pending registration.
   - Add schema validation and max lengths.
   - Add duplicate detection.

3. Close the email relay.
   - Require Firebase auth where decoded email matches destination, or send only from trusted account-created flows.
   - Add rate limiting and idempotency.

4. Fix cron fail-open behavior.
   - Add `requireCronSecret`.
   - Patch `propresenter-export`.
   - Test missing `CRON_SECRET` returns 401.

5. Remove `/dashboard` from service worker caching.
   - Stop caching authenticated navigation responses.
   - Clear caches on logout.

6. Fix lint hook-rule errors.
   - Prioritize `src/app/dashboard/page.tsx` and `src/components/ui/short-link-creator.tsx`.

7. Verify secret hygiene.
   - Confirm `.env.local` is ignored and absent from Git history.
   - Add secret scanning to CI/pre-commit.
   - Rotate secrets if the file was ever shared, copied into a ticket, or exposed outside the developer machine.

### Next 2 Weeks

1. Build `src/lib/server/authz.ts`.
   - Migrate check-in, welcome, billing, invites, platform, exports, reservations, and org deletion first.

2. Split Firestore rules by sensitivity.
   - Remove catch-all active-member read for sensitive collections.
   - Add emulator tests.

3. Introduce schema validation.
   - Add Zod or equivalent.
   - Convert public/sensitive routes first.

4. Replace in-memory rate limiting on sensitive routes.
   - Use a distributed store.
   - Key by IP + actor + church + route + identifier where appropriate.

5. Create audit logging.
   - Start with check-in, role changes, invites, exports, org deletion, billing tier override, reservation approval, and schedule publish.

6. Move dashboard home to server aggregation.
   - Return compact stats.
   - Reduce raw Firestore reads and browser computation.

7. Patch UI primitives for accessibility.
   - `Input` should set `aria-invalid`, `aria-describedby`, and stable error IDs.
   - Verify focus trapping/restoration for modal/drawer.

### This Month

1. Redesign check-in trust model.
   - Station activation.
   - Scoped station tokens.
   - Token revocation.
   - Sensitive-data reveal only in authorized contexts.

2. Implement transactional outbox.
   - Publish, invite, welcome, reminders, SMS, and role-change notification sends should be retry-safe.

3. Fix reservation concurrency.
   - Occupancy lock documents.
   - Firestore transactions.
   - Concurrent booking tests.

4. Add critical tests.
   - Firestore rules emulator.
   - Authz helper.
   - Check-in endpoints.
   - Reservation conflict.
   - Billing webhook.
   - Schedule publish/outbox.

5. Add operational visibility.
   - Error aggregation.
   - Structured logs.
   - Cron run records.
   - Alerting.

6. Review Vercel environment separation.
   - Separate Firebase projects.
   - Preview protection.
   - Separate Stripe/Resend/Twilio test keys.

## 6. Refactor Opportunities

These are not all urgent bugs, but they would materially improve the codebase.

1. Server authz module.
   - This is the highest-leverage architectural refactor.
   - It reduces route drift and makes future audits easier.

2. Kiosk/check-in subsystem boundary.
   - Check-in should have its own trust model, station sessions, scopes, and audit log.

3. Route validation helper.
   - A small schema helper will improve security, docs, and maintainability.

4. Server-side dashboard data model.
   - Dashboard should consume purpose-built stats DTOs.

5. Firestore rules test suite.
   - Treat rules as code, not config.

6. Transactional notification outbox.
   - Decouples user-visible writes from provider reliability.

7. Reservation occupancy locks.
   - Eliminates the most likely paid-feature data race.

8. Public token lifecycle management.
   - One inventory for calendar, stage, room display, guardian, short link, and kiosk tokens.

9. UI primitive hardening.
   - Keep the hand-built UI system, but make accessibility guarantees centralized.

10. Logging/audit infrastructure.
   - Stop scattering `console.error`; make operational telemetry a platform feature.

11. Domain/repository split for repeated Firestore access.
   - Avoid premature abstraction, but extract repeated sensitive access patterns.

12. CI quality gate.
   - TypeScript, lint, tests, Firestore emulator, and secret scanning should be required.

## 7. Positive Findings

- The product has real domain depth and solves real operational problems for churches/nonprofits.
- The brand system is coherent: warm ivory, coral, sage, sand, and Plus Jakarta Sans feel intentionally designed.
- Type definitions are extensive and centralized.
- The project has documented conventions and phase history in `PROJECT_OVERVIEW.md`.
- The dashboard and onboarding work show strong product thinking.
- Mobile navigation and volunteer/admin split indicate real attention to actual users.
- Firebase Admin SDK is used in many server routes rather than relying entirely on client access.
- Stripe webhook signing was previously identified as present and correctly oriented.
- Firestore indexes are explicitly maintained.
- Motion usage is real and supports the intended warm editorial UI.
- Vercel cron configuration exists in `vercel.json`; the platform choice is reasonable for this product stage once route hardening and env separation are handled.

## 8. External Findings Accepted, Challenged, Or Revised

### Accepted from Claude

- Broad Firestore read rules are a serious tenant-isolation risk.
- Lack of observability/audit trail is production-blocking for support and security.
- Absence of schema validation is a material backend weakness.
- Cron jobs need idempotency, pagination, and failure persistence.
- Public URL tokens need lifecycle management.
- Accessibility gaps in custom primitives need focused remediation.
- A staging Firebase project and Vercel env separation are necessary.

### Accepted from Gemini

- `/api/checkin/lookup` is the highest-risk PII exposure.
- `/api/checkin/register` is an unauthenticated data-injection path.
- `/api/welcome` is an open email relay risk.
- Dashboard over-fetching is a real performance and cost issue.
- `Input` accessibility gaps are confirmed.
- Business logic and authz are too scattered.

### Challenged or revised

- "Committed live secrets" is not confirmed from the current local Git evidence. Keep secret scanning and rotation discipline, but do not state this as proven.
- "Motion is unused" is false. `motion/react` is actively imported.
- "Secure all API routes in middleware" is incomplete. Middleware cannot replace route-level tenant/resource authorization with Firebase Admin.
- "Use shadcn/Radix" conflicts with project instructions. Harden the existing UI primitives first.
- "Cron setup is properly secured" is false for at least `propresenter-export`.
- "Preview cron jobs run" is not supported by Vercel docs. Cron jobs are production-only, but preview API exposure and env sharing remain serious operational risks.

## 9. Final Instruction Answers

### The 3 highest-risk issues

1. Public children/household check-in surfaces.
   - `lookup`, `register`, and related kiosk routes expose or mutate sensitive child operational data with weak public trust controls.

2. Overbroad Firestore tenant access.
   - Catch-all active-member reads and auth-only facility group reads are incompatible with least-privilege multi-tenant SaaS.

3. Abuse-prone public/server routes.
   - The welcome email relay, fail-open cron guard, weak in-memory rate limiting, short-link open redirect, and token-in-URL surfaces create avoidable abuse and data leakage paths.

### The 3 highest-leverage improvements

1. Build shared server security primitives.
   - `authz`, `validation`, `rate-limit`, `audit`, and `cron` helpers will prevent the same class of bug across 133 API route files.

2. Redesign check-in as a scoped kiosk subsystem.
   - Station tokens, revocation, scoped actions, minimal lookup responses, and audit logs directly reduce the app's highest-liability exposure.

3. Move read-heavy dashboards to server aggregation.
   - This improves performance, reduces Firestore cost, reduces client data exposure, and creates a natural place for authorization and caching.

### Blunt answer: what would make me hesitate to scale or trust this app in production?

I would hesitate because the app currently treats trust boundaries as route-local implementation details instead of product architecture. That is tolerable for internal beta workflows; it is not tolerable when the product stores child names, photos, allergy/medical notes, household phone numbers, church operations, and billing data.

The specific blockers are the unauthenticated check-in surface, broad Firestore reads, open email relay, inconsistent cron protection, weak distributed abuse controls, and lack of audit/observability. Any one of those can be fixed. Together, they show the app has outgrown its original security model. Before scale, VolunteerCal needs a hardening sprint that turns security, validation, rate limiting, audit logging, and operational visibility into shared infrastructure rather than per-feature craftsmanship.
