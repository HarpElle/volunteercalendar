# VolunteerCal: Comprehensive Technical & Security Synthesis Report

**Date:** 2026-04-25
**Audience:** VolunteerCal Engineering & Leadership Teams
**Methodology:** This report synthesizes findings from three independent technical audits (Gemini, Claude, and Codex), providing a unified, prioritized roadmap for hardening the VolunteerCal SaaS platform.

---

## 1. Executive Synthesis

VolunteerCal has successfully reached a feature-rich state that demonstrates deep domain expertise. The application structure, type discipline, and visual branding are genuinely impressive for a platform of this scale. 

However, the consensus across all three audits is clear: **VolunteerCal is a highly capable beta, but it is fundamentally unsafe for broad, multi-tenant production in its current state.** 

The architecture suffers from the classic symptoms of rapid MVP iteration:
1. **Scattered Enforcement:** Security, authorization, and validation are handled inconsistently on a per-route basis rather than through a robust, centralized gateway.
2. **"Trust the Client" Naivety:** Critical operations (check-in, large-scale data fetching) rely on client-side constraints and overly permissive database rules, leaking PII and tenant data.
3. **Operational Black Box:** A lack of structured logging, audit trails, and idempotency guarantees means the team will be flying blind when distributed race conditions and cron timeouts occur at scale.

**The Blunt Verdict:** Do not onboard new organizations until the P0/P1 issues below are resolved.

---

## 2. Critical Security & Data Integrity (P0/P1)
*These items represent immediate threats to customer data privacy, system integrity, or organizational security. They must be fixed this week.*

### 2.1. Compromised Production Secrets in Version Control
- **The Issue:** Production secrets (`STRIPE_SECRET_KEY`, `RESEND_API_KEY`, `TWILIO_AUTH_TOKEN`, `CRON_SECRET`) appear to be committed to `.env.local` in the repository history. If true, any leaked clone or past contributor has full financial and communication authority over the platform.
- **The Fix:** 
  1. Immediately rotate **every** API key currently in use.
  2. Run `git filter-repo` or BFG to completely scrub `.env.local` from the git history.
  3. Move all secrets to Vercel Environment Variables, strictly isolated between Development, Preview, and Production.

### 2.2. Unauthenticated Check-in APIs Exposing Child PII
- **The Issue:** The kiosk APIs (`/api/checkin/lookup` and `/api/checkin/checkin`) are currently public. An attacker can use simple parameters (like guessing a 4-digit phone PIN or `church_id`) to scrape children's names, room assignments, medical notes, and allergies, or inject fake attendance records to trigger guardian SMS alerts. Rate limiting by IP is insufficient to prevent this.
- **The Fix:** Treat the kiosk as a distinct, hardened security boundary. Require a server-issued, revocable `kiosk_session_token` to access these endpoints. Never return medical/allergy data in a generic lookup response until the operator has explicitly authorized a check-in action.

### 2.3. Tenant Isolation Bleed via Over-permissive Firestore Rules
- **The Issue:** The multi-tenant isolation model is broken at the database layer. `firestore.rules` grants blanket read access to almost all `churches/{churchId}/{subcollections}` based solely on an `isActiveMember(churchId)` check. A technical volunteer can bypass the UI and download the entire church directory, private phone numbers, and operational records.
- **The Fix:** Scope rules tightly to the user's role. Volunteers should only be able to read their own profiles, public schedules, and specific assignments. Move broad organizational data aggregations to the secure backend (Admin SDK) rather than relying on client-side SDK reads.

### 2.4. The "Swiss Cheese" API & Open Email Relays
- **The Issue:** Next.js `middleware.ts` is only used for UI redirects, leaving authentication up to individual API routes. When developers forget to call `verifyIdToken()` (e.g., in `/api/welcome`), it results in severe vulnerabilities like an open email relay capable of destroying your domain's sender reputation.
- **The Fix:** Create a centralized `src/lib/server/authz.ts` library containing strict validators (`requireMembership`, `requireRole`, `requirePlatformAdmin`). Furthermore, adopt schema validation (like Zod) across all ~150 API routes to prevent malformed data from corrupting the database.

---

## 3. Architecture & Scalability Debt (P2)
*These issues will cause the application to break, freeze, or incur massive infrastructure costs as user counts grow.*

### 3.1. Massive Client-Side Data Over-fetching
- **The Issue:** The application completely bypasses Next.js 16 Server Components. Dashboards (`DashboardPage`) and data endpoints (`/api/people-data`) fetch entire collections of people, ministries, services, and assignments at once to compute basic UI states. As churches scale to 1,000+ members, this will transfer megabytes of JSON per page load, freezing mobile browsers and skyrocketing Firestore read costs.
- **The Fix:** Move heavy data aggregation to the server. Use Firestore `count()` queries or maintain running counter documents via Firebase Triggers. Gradually migrate the top 5 most-trafficked dashboard views to React Server Components.

### 3.2. Concurrency, Race Conditions, and the Transactional Outbox
- **The Issue:** System logic is race-prone. For example, room reservations check for conflicts and then write the reservation *outside* of a transaction. Similarly, schedule publishing writes assignments and then directly fires notification emails; if the email fails, the schedule is published but volunteers are never notified.
- **The Fix:** 
  1. Wrap room reservation and attendance checks in strict Firestore transactions.
  2. Implement a **Transactional Outbox pattern**: when publishing a schedule, write a `notification_outbox` document in the same transaction. Let a background worker drain the outbox to guarantee reliable email/SMS delivery.

### 3.3. Cron Job Vulnerabilities & Timeouts
- **The Issue:** Cron jobs like `stats-refresh` and `propresenter-export` iterate over *all* churches sequentially. Vercel's 60-second limit will inevitably kill these processes at scale, causing silent, partial failures. Furthermore, if `CRON_SECRET` is missing in an environment, some crons default to executing anyway.
- **The Fix:** 
  1. Make all cron endpoints fail closed if `CRON_SECRET` is absent.
  2. Set `export const maxDuration = 300` on cron routes.
  3. Chunk cron processing using parallel `Promise.all` batches with concurrency caps, and use pagination cursors for large assignment scans.

---

## 4. Operations, Observability & Maintainability (P2)

### 4.1. The Black Box Problem
- **The Issue:** The platform has zero production observability. There is no Sentry, no structured logger, and ~200 `console.log` statements. Crucially, there are no audit logs for sensitive operations. If an admin asks "Who deleted the Sunday schedule?" or "Why did a child get checked out?", you cannot answer.
- **The Fix:** Install Sentry immediately. Build an append-only `audit_logs` Firestore collection and hook it into major lifecycle events (publish/unpublish, role changes, member removal, billing tier changes).

### 4.2. Failing Lint & Missing Test Infrastructure
- **The Issue:** While TypeScript types are excellent, ESLint fails with dozens of hook-order violations (a source of major React bugs). Furthermore, there is no automated test suite (Vitest/Playwright) or Firestore emulator setup for core business logic.
- **The Fix:** Resolve hook-rule lint errors and block CI on lint failures. Introduce a testing harness prioritizing the most complex logic: `firestore.rules`, the scheduler engine, and role permissions.

---

## 5. UX, Design & Product Completeness (P3)

### 5.1. Accessibility (a11y) & Contrast Failures
- **The Issue:** Custom UI components lack standard ARIA attributes (e.g., `Input` components don't link errors via `aria-describedby`), focus rings are missing, and "coral on warm background" badges fail WCAG contrast ratios. This is a compliance risk for nonprofit/church clients.
- **The Fix:** Run `axe-core` across primary flows. Restore visible focus rings. Consider migrating foundational components to a robust primitive library like Radix UI or `shadcn/ui` to inherit accessibility for free.

### 5.2. Short Links are Open Redirects
- **The Issue:** The `/api/short-links` feature accepts any external `target_url`, allowing malicious actors to use your trusted domain for phishing redirects.
- **The Fix:** Restrict short links to relative app paths by default, or implement a strict allowlist for external domains.

---

## 6. The Synthesized 30-Day Master Plan

### Week 1: Stop the Bleeding (Security)
1. **Rotate Secrets & Scrub Git:** Assume `.env.local` is compromised. Rotate Stripe, Resend, Twilio, and Cron secrets. Configure proper Vercel Environment Variables.
2. **Lock down the Kiosk:** Implement scoped session tokens for `/api/checkin/*` endpoints. Stop returning allergy/medical data on raw lookups.
3. **Fix Open Relays:** Audit all `/api/*` endpoints for missing auth. Secure `/api/welcome` and fix the `CRON_SECRET` fail-open logic.
4. **Fix React Bugs:** Resolve all ESLint hook-order violations.

### Week 2: Authorization & Data Integrity
1. **Unified Authz Middleware:** Create `src/lib/server/authz.ts` and refactor the top 20 API routes to use standard `requireMembership` and `requireRole` guards.
2. **Zod Validation:** Introduce Zod schemas to strictly type and validate incoming API payloads, starting with billing, reservations, and check-in.
3. **Rewrite Firestore Rules:** Remove broad `isActiveMember` subcollection reads. Scope rules tightly to user IDs and explicitly define admin-only collections.

### Week 3: Reliability & Observability
1. **Install Sentry:** Add application monitoring to catch unhandled errors.
2. **Audit Logs:** Build the `audit_logs` primitive and track sensitive mutations (role changes, schedule deletions).
3. **Cron Job Hardening:** Add `maxDuration`, parallel batching, and idempotency keys to reminder and stat-refresh crons.
4. **Fix Open Redirects:** Restrict short-link targets.

### Week 4: Performance & Polish
1. **Server-Side Aggregation:** Rewrite `DashboardPage` and `/api/people-data` to utilize server-side aggregation, preventing massive client-side data waterfalls.
2. **The Transactional Outbox:** Refactor the schedule publish flow to use an outbox pattern for guaranteed email/SMS delivery.
3. **Accessibility Pass:** Add `aria-labels` to mobile navs, fix contrast ratios, and establish proper form error linking.
