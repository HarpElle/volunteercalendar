# VolunteerCal — Consolidated External Audit (v2)

**Audience:** VolunteerCal engineering leadership and the development team.
**Date:** 2026-04-25
**Sources synthesized:**
- `intense-review-claude.md` (this auditor's first pass — four-agent codebase exploration)
- `intense-review-codex.md` (Codex external audit)
- `intense-review-gemini.md` (Gemini external audit)
- Direct re-verification of the highest-impact claims against the working tree (cited inline)

**Method:** Reconcile the three independent reviews, verify the most consequential disputed or novel claims by reading source files directly, resolve disagreements with reasoning, and produce a single prioritized remediation plan with concrete code-level guidance.

---

## 0. What changed in this v2 review

After reading the Codex and Gemini reports and re-verifying claims directly, **my v1 grading was too generous in two places** and missed one finding that, alone, justifies pulling the app from any future self-serve rollout:

1. **The children's check-in surface (`/api/checkin/*`) is unauthenticated by design** and returns child PII — names, photos, allergies, medical notes, room assignments — keyed on a 4-digit phone suffix (≤10,000 combinations). I did not surface this in v1; both Codex and Gemini did. Verified at `src/app/api/checkin/lookup/route.ts:7-15`.
2. **`firestore.rules:160-166` grants every active member read access to *every* church subcollection** — including `people`, `children`, `households`, `attendance`, `feedback`, `audit-relevant data`. Combined with #1, an attacker with a single volunteer account (or a successful invite-spam) downloads the entire congregation's PII via the client SDK. My v1 caught the `facility_groups` / `stage_sync_live` / `waitlist` issues but missed the much bigger blanket-subcollection rule. Verified directly.
3. **`/api/welcome` is an open Resend relay** — no auth, no rate limit, no captcha — discovered by Gemini, verified at `src/app/api/welcome/route.ts:7-40`. This will get your sender domain blacklisted within hours of being noticed.

**Revised security grade: F** (was D+). Revised production-readiness: **D** (was C+). Everything else in v1 stands but is reordered below.

---

## 1. Executive Assessment (revised)

VolunteerCal is the most feature-mature solo-developer SaaS I've audited in this category. The codebase shows real discipline — central type system, atomic Firestore writes via batches, `FieldValue.increment()` for counters, Stripe webhook signature verification, deterministic membership IDs, default-deny storage rules, a coherent warm-editorial brand, thoughtful onboarding scaffolding, and ~150 API routes that follow a consistent (if hand-rolled) auth pattern. The product depth is real: scheduling, check-in, room reservations, worship planning, billing, training, notifications, audit-adjacent flows.

**That depth is the problem.** The control plane has not kept pace with the product surface. Authorization is hand-rolled per route. Validation is per-route. Rate limiting is in-memory and useless on Vercel's serverless platform. Firestore rules grant active members blanket subcollection reads. The kiosk check-in surface is intentionally public yet returns sensitive children's data. Cron endpoints fail open if `CRON_SECRET` is absent. There is no observability, no audit log, no test suite, no CI lint gate. Lint currently fails with hook-order errors. Production secrets appear to live in `.env.local`. The service worker pre-caches authenticated dashboard navigations on shared kiosk devices.

This is a feature-rich beta running on a control plane built for a prototype. **The path to production is not a rewrite — it is a focused 6-week hardening sprint** centered on three pillars: (a) a server-side authorization library and matching Firestore rules, (b) a separate trust boundary for kiosks and public surfaces, (c) observability + audit logging + emulator tests. Everything else (Zod, Server Components, transactional outbox, design polish) compounds on top of those three.

### Letter grades — reconciled

I weight Codex's grades more heavily on backend/security, and Gemini's on architecture/performance after re-verification. My original UX grade stands.

| Dimension | v1 (Claude) | Codex | Gemini | **v2 (consolidated)** | Drivers |
|---|---|---|---|---|---|
| Product / content | A− | B− | B | **B** | Codex correctly notes message/scope mismatch; v1 over-graded |
| Architecture | B+ | C+ | D | **C** | Hand-rolled per-route patterns at this scale = drift; missed it |
| Backend | B | C+ | C | **C** | Race conditions + GET-side mutations + zero schema validation |
| Security | D+ | C− | F | **F** | Children's PII + blanket Firestore reads + open relay = breach-class |
| UX / design | B+ | B− | B | **B** | a11y custom-input gaps confirmed; brand still strong |
| Performance | B− | C+ | D | **C−** | Dashboard over-fetch confirmed; client-side waterfalls real |
| Maintainability | A− | C | C | **C+** | Type discipline ≠ maintainability when lint fails + zero tests |
| **Production readiness** | C+ | C− | D | **D** | Multi-tenant SaaS with these holes is not production-ready |

If you onboard a third paying church before fixing items #1–#3 in §3, you are accepting breach risk, not deferring it.

---

## 2. The single chart that matters: cross-review issue map

Each row is a finding; columns mark which audit raised it. Rows with three checkmarks have unanimous agreement and should be treated as proven. Rows with one checkmark may still be valid — the right column is verification status.

| # | Finding | v1 Claude | Codex | Gemini | Verified? |
|---|---|:-:|:-:|:-:|:-:|
| 1 | `/api/checkin/lookup` unauth + leaks child PII | — | ✓ | ✓ | **YES** (`route.ts:7-15`) |
| 2 | `/api/checkin/checkin` & `/register` unauth, can mutate | — | ✓ | ✓ | YES (dir listing + Codex evidence) |
| 3 | `firestore.rules` blanket subcollection read for active members | partial | ✓ | ✓ | **YES** (`rules:160-166`) |
| 4 | `/api/welcome` open email relay, no auth, no rate limit | — | — | ✓ | **YES** (`welcome/route.ts:7-40`) |
| 5 | Production secrets in `.env.local` (Stripe, Resend, Twilio, CRON) | ✓ | — | — | Strongly indicated; rotate regardless |
| 6 | Cron route fails open if `CRON_SECRET` absent | — | ✓ | — | YES (Codex evidence) |
| 7 | `vercel.json` schedules a non-existent cron path | — | ✓ | — | **YES** — `/api/cron/songselect-sync` in `vercel.json:12` but no such directory in `src/app/api/cron/` |
| 8 | Reservation conflict check is race-prone (no transaction) | — | ✓ | — | YES (Codex evidence) |
| 9 | Authorization is duplicated/inconsistent across routes | partial | ✓ | ✓ | YES |
| 10 | No centralized auth middleware; each route hand-rolls | partial | ✓ | ✓ | YES |
| 11 | Service worker pre-caches `/dashboard` & all navigations | — | ✓ | — | **YES** (`public/sw.js:10, 41-54`) |
| 12 | Short links allow arbitrary `target_url` → open redirect | — | ✓ | — | **YES** (`s/[slug]/page.tsx:29`) |
| 13 | Lint fails (hook-order errors), TS passes | — | ✓ | — | Strongly indicated; verify locally |
| 14 | In-memory rate limiter useless on serverless | partial (IP angle only) | ✓ | — | **YES** (`rate-limit.ts:8` is `new Map()`) |
| 15 | Calendar tokens travel in URL paths, no rotation UI | ✓ | — | — | YES |
| 16 | Massive dashboard over-fetch (entire collections) | partial | ✓ | ✓ | YES |
| 17 | GET routes mutate data (`/api/people-data`) | — | ✓ | — | YES (Codex evidence) |
| 18 | `firestore.rules` `facility_groups` / `stage_sync_live` / `waitlist` permissive | ✓ | partial | — | **YES** (rules:74, 178, 209-211) |
| 19 | No security headers in `next.config.ts` | — | ✓ | — | **YES** (config is 7 lines, no `headers()`) |
| 20 | No structured logging / Sentry / audit log | ✓ | partial | — | YES |
| 21 | No automated tests for critical flows | partial | ✓ | — | YES |
| 22 | Zero Zod / schema validation across routes | ✓ | ✓ | — | YES |
| 23 | Cron jobs lack `maxDuration`, idempotency, dead-letter | ✓ | partial | — | YES |
| 24 | Publish→notify race / no transactional outbox | ✓ | partial | — | YES |
| 25 | Custom `Input` lacks `aria-invalid` / `aria-describedby` | ✓ | partial | ✓ | YES (Gemini evidence) |
| 26 | Heavy client-side rendering; `next/image` only used twice | ✓ | partial | ✓ | YES |
| 27 | `motion` package likely dead weight | ✓ | — | — | LIKELY (zero non-Hero imports) |
| 28 | UX/IA — feature density vs role clarity | partial | ✓ | — | YES |
| 29 | Stripe webhook signing correct | ✓ | ✓ | ✓ | YES (positive finding) |
| 30 | Atomic writes / counter increments correct | ✓ | partial | — | YES (positive finding) |

This synthesis is the rest of the report.

---

## 3. Top 12 Issues — prioritized for remediation

I expanded from 10 to 12 because the verified critical-class issues alone fill 7 slots. Each issue has: severity, area, why it matters with concrete attack scenario where applicable, evidence (file:line you can open), recommended fix at the design level, a concrete code sketch where useful, effort estimate, and rollout sequencing notes.

---

### Issue #1 — Children's check-in surface is publicly accessible and returns sensitive minor PII

**Severity:** **Critical** · **Area:** Security / Privacy / Compliance

**Why it matters.** This is a children's-data exposure on a public endpoint. The `/api/checkin/lookup` route is documented in code as an "Unauthenticated kiosk endpoint" (`src/app/api/checkin/lookup/route.ts:8`). It accepts `church_id` plus one of `qr_token`, `phone_last4`, or `phone_full`. The `phone_last4` mode means the entire keyspace for a known church is **10,000 values**. The response includes child names, `photo_url`, `default_room_id`, `has_alerts`, allergies, and medical notes (per Codex, evidence ranges in the same file). Rate limit is `30 req/minute` — but per Issue #14, that limiter is in-memory per warm Vercel instance, so a distributed attacker enumerates `0000`–`9999` in well under an hour even before considering parallel cold starts.

A second route, `/api/checkin/checkin`, accepts unauthenticated POSTs that write `checkInSessions` documents and trigger guardian SMS (`src/app/api/checkin/checkin/route.ts`, "Unauthenticated kiosk endpoint" per Codex). A third, `/api/checkin/register`, accepts arbitrary household + child creation. These are not theoretical risks — they are documented behaviors.

**Concrete attack scenarios:**
1. *Unauthenticated reconnaissance.* Attacker chooses any `church_id` (often discoverable from a public landing page, calendar feed, or short link). Loops `phone_last4 = '0000'..'9999'`, distributing requests across IPs to defeat the in-memory limiter. Harvests every household + child with a registered phone number ending in those digits — names, photos, allergies, medical notes.
2. *Guardian SMS abuse.* Attacker submits crafted `child_ids` to `/api/checkin/checkin`, triggering guardian SMS. Used for harassment, phishing, or to burn the church's Twilio quota.
3. *Database pollution.* Attacker hits `/api/checkin/register` repeatedly to create junk households / children, contaminating attendance reports.
4. *Compliance.* Even one of the above is a notifiable breach in many jurisdictions when minors' PII is involved (state-level SHIELD-like laws in NY, CA, TX, IL; GDPR Art. 33 if any EU subject).

**Evidence (verified directly):**
- `src/app/api/checkin/lookup/route.ts:7-15` — comment explicitly says "Unauthenticated kiosk endpoint." Only protection: `rateLimit(req, { limit: 30, windowMs: 60_000 })` (line 14).
- `src/app/api/checkin/checkin/route.ts` — same pattern (per Codex).
- `src/app/api/checkin/register/route.ts` — same pattern (per Gemini).
- `src/lib/utils/rate-limit.ts:8` — `const store = new Map<string, RateLimitEntry>();` — per-instance, defeated by serverless cold starts and distributed sources.

**Recommended fix — kiosk trust bootstrap pattern.**

Treat the kiosk as an enrolled, named, revocable principal — not as anonymous. Use the existing admin-authenticated API to issue a long-lived but revocable kiosk token that scopes a device to a specific church and station.

```ts
// src/lib/types/kiosk.ts
export interface KioskToken {
  token_id: string;          // public component (in cookie)
  token_hash: string;        // SHA-256 of secret half (stored in Firestore)
  church_id: string;
  station_id: string;
  created_by_uid: string;
  created_at: string;        // ISO
  last_used_at?: string;
  revoked_at?: string | null;
  scope: ('lookup' | 'checkin' | 'register' | 'checkout')[];
}
```

```ts
// src/lib/server/kiosk-auth.ts
import { adminDb } from '@/lib/firebase/admin';
import crypto from 'node:crypto';

export async function requireKioskToken(
  req: Request,
  required: KioskToken['scope'][number],
): Promise<KioskToken | Response> {
  const authz = req.headers.get('x-kiosk-token'); // or signed cookie; not URL
  if (!authz) return new Response('Missing kiosk token', { status: 401 });
  const [tokenId, secret] = authz.split('.');
  if (!tokenId || !secret) return new Response('Bad token format', { status: 401 });

  const snap = await adminDb.collection('kiosk_tokens').doc(tokenId).get();
  if (!snap.exists) return new Response('Unknown kiosk', { status: 401 });
  const tok = snap.data() as KioskToken;

  if (tok.revoked_at) return new Response('Revoked kiosk', { status: 401 });
  if (!tok.scope.includes(required)) return new Response('Wrong scope', { status: 403 });

  const presented = crypto.createHash('sha256').update(secret).digest('hex');
  if (!crypto.timingSafeEqual(Buffer.from(presented), Buffer.from(tok.token_hash))) {
    return new Response('Bad kiosk secret', { status: 401 });
  }

  // Bind: caller's church_id MUST match the kiosk's church_id
  return tok;
}
```

Then update lookup:

```ts
export async function POST(req: NextRequest) {
  const tok = await requireKioskToken(req, 'lookup');
  if (tok instanceof Response) return tok;

  const body = await req.json();
  const { qr_token, phone_last4, phone_full } = body;
  // IGNORE any client-supplied church_id — use the kiosk's bound church_id.
  const churchId = tok.church_id;
  // ... existing lookup logic, scoped to churchId ...
}
```

Additional changes:
- **Disable `phone_last4` for adversarial keyspaces.** Require last 7 digits, or *both* last 4 + a name initial. This raises the brute-force keyspace from 10⁴ to ~10⁶ × 26 ≈ 26M. Combined with kiosk scoping, this matters less, but it's a defense-in-depth.
- **Never return allergies / medical notes from `lookup`.** Return only enough data to present the operator with a candidate list. Reveal medical info *after* the operator confirms a match and a privileged check-in begins.
- **Audit-log every lookup, checkin, register, checkout** with kiosk_id, church_id, operator_uid (if available), and outcome. (See Issue #6.)
- **Move rate limiting to a real distributed store** (Issue #14). Then add per-`(kiosk_id, action)` and per-`(church_id, action)` buckets.
- **Kiosk enrollment UI.** Admin creates a station; server returns a one-time activation code; the kiosk POSTs the code from the device once and receives the kiosk token; the activation code is single-use and short-TTL. Add a revocation list in the admin Settings.

**Effort:** Larger refactor — call it 5–7 engineering days end-to-end including UI, rules, migration of legacy unauthenticated handlers behind the new boundary. **No path to production without this.**

**Sequencing:** Do this *concurrently* with Issue #3 (Firestore rules), because they share the assumption "anyone authenticated can read child docs." Both must change to close the surface.

---

### Issue #2 — Firestore rules grant every active member blanket read of every church subcollection

**Severity:** **Critical** · **Area:** Security / Multi-tenant Privacy

**Why it matters.** This is the single most consequential rule in the system. At `firestore.rules:160-166`:

```javascript
match /{subcollection}/{docId} {
  allow read: if isActiveMember(churchId);
  allow write: if isSchedulerOrAbove(churchId);
}

match /{subcollection}/{docId}/{nestedSub}/{nestedDocId} {
  allow read: if isActiveMember(churchId);
  allow write: if isSchedulerOrAbove(churchId);
}
```

This means: any user who has been approved as a volunteer for a given church can use the **client-side Firebase SDK directly from a browser console** to read every document under `churches/{churchId}/{anything}`. That includes:
- `people` (PII for every member)
- `children` (minor PII, allergies, medical notes, photos)
- `households` (addresses, phone numbers, guardians)
- `attendance` (presence/absence history)
- `feedback` (likely intended to be admin-only)
- `audit_logs` (when you add them, they'd leak too unless excluded)
- `reservations` (room booking patterns)
- `assignments` (full schedules across other people)
- `service_plans`, `event_signups`, `kiosk_tokens` (when added)

Combined with Issue #1, an attacker doesn't even need to exploit the kiosk endpoints — they can just submit the public self-registration form (`firestore.rules:101-105` allows any auth user to create `pending_org_approval` membership), wait for an admin to approve them as a volunteer, and then drain the whole org via the client SDK. The bigger concern: **a malicious or compromised volunteer account is a one-shot full data exfil for the entire church.**

This is also the root cause of Gemini's "Massive Dashboard Over-fetching" finding (Issue #16) — clients can read full collections, so the dashboard does. Tightening this rule will *force* the data-fetching refactor in a healthy direction.

**Evidence (verified directly):** `firestore.rules:159-172`. The catch-all wildcard `{subcollection}` matches every direct child of `churches/{churchId}`, including the most sensitive ones.

**Recommended fix — collection-by-collection rule rewrite, default-deny.**

Replace the wildcard with explicit per-collection rules that match the *actual* role each collection requires. Keep the Admin SDK as the ingest path for sensitive ops.

```javascript
// REMOVE the catch-all wildcard. Replace with per-collection rules.

match /churches/{churchId} {
  // Volunteer-readable, scheduler-writable: low-sensitivity ops data
  match /service_plans/{docId} {
    allow read: if isActiveMember(churchId);
    allow write: if isSchedulerOrAbove(churchId);
  }
  match /ministries/{docId} {
    allow read: if isActiveMember(churchId);
    allow write: if isSchedulerOrAbove(churchId);
  }
  match /assignments/{docId} {
    // Volunteers see only their own assignments; schedulers see all.
    allow read: if isSchedulerOrAbove(churchId)
      || (isActiveMember(churchId)
          && resource.data.person_uid == request.auth.uid);
    allow write: if isSchedulerOrAbove(churchId);
  }

  // People directory — limited fields via a public_profile mirror, full via Admin SDK
  match /people/{personId} {
    allow read: if isActiveMember(churchId);  // basic person data
    // Sensitive children / household / medical fields live under /children & /households below
    allow write: if isSchedulerOrAbove(churchId);
  }

  // Children — admin / check-in operator only
  match /children/{childId} {
    allow read, write: if false;   // Admin SDK only via /api/checkin/* + kiosk token
  }
  match /households/{hhId} {
    allow read, write: if false;   // Admin SDK only
  }
  match /attendance/{docId} {
    allow read: if isOrgAdmin(churchId);
    allow write: if false;          // server-only via /api/checkin
  }

  // Feedback / audit / billing / settings: admin / owner only
  match /feedback/{docId}      { allow read: if isOrgAdmin(churchId); allow write: if false; }
  match /audit_logs/{docId}    { allow read: if isOrgAdmin(churchId); allow write: if false; }
  match /billing/{docId}       { allow read: if isOrgOwner(churchId); allow write: if false; }
  match /settings/{docId}      { allow read: if isOrgAdmin(churchId); allow write: if isOrgAdmin(churchId); }

  // Calendar feeds, reservations, etc. — define explicitly, no wildcards
  match /calendar_feeds/{docId} { allow read, write: if false; } // Admin SDK only
  match /reservations/{docId} {
    allow read: if isActiveMember(churchId);
    allow write: if isSchedulerOrAbove(churchId);
  }
}

// Also fix the standalone collections flagged in v1
match /facility_groups/{groupId} {
  allow read: if request.auth != null
    && exists(/databases/$(database)/documents/memberships/$(request.auth.uid + '_' + resource.data.created_by_church_id));
  // ... member rule similarly tightened ...
}
match /stage_sync_live/{token} {
  // The token IS the auth, but you must rate-limit lookups at the API layer.
  // Better: route stage sync through a /api/stage/[token] endpoint with rate limit.
  allow read, write: if false;  // force through Admin SDK
}
match /waitlist/{docId} {
  // Stop allowing client-direct create. Move to /api/waitlist with reCAPTCHA.
  allow create, read, update, delete: if false;
}
```

**Critical companion work — Firestore emulator tests.**

Without tests, this rewrite *will* regress. Add `firestore.rules.test.ts` using `@firebase/rules-unit-testing`:

```ts
// firestore.rules.test.ts (sketch)
import { initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import fs from 'node:fs';

let env: RulesTestEnvironment;
beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'volunteercal-rules',
    firestore: { rules: fs.readFileSync('firestore.rules', 'utf8') },
  });
});

test('volunteer cannot read children of own church', async () => {
  const ctx = env.authenticatedContext('volunteerUid');
  // pre-seed membership as active volunteer
  await assertFails(ctx.firestore()
    .doc('churches/CHURCH_A/children/some-child-id').get());
});

test('volunteer cannot read other church people directory', async () => { ... });
test('admin can read assignments', async () => { ... });
test('volunteer reads only their own assignments', async () => { ... });
```

Run in CI on every PR touching `firestore.rules`. This is cheap (~30 minutes to set up, runs in seconds) and high-leverage.

**Effort:** 2–3 days for the rule rewrite + emulator tests. **This is a quick win in calendar time but high-impact in risk reduction.**

---

### Issue #3 — `/api/welcome` is an open Resend relay

**Severity:** **Critical** · **Area:** Security / Email Reputation

**Why it matters.** `src/app/api/welcome/route.ts:7-40` accepts a JSON `{ name, email, redirect }`, calls `resend.emails.send({ from: 'VolunteerCal <noreply@harpelle.com>', to: [email], ... })`, and returns success. There is no authentication, no rate limit, no captcha, no domain check. This is the textbook open-relay abuse vector. Two failure modes:

1. **Sender-reputation collapse.** A spammer scripts the endpoint to send millions of welcome emails to harvested addresses. Resend's deliverability scoring tanks; `noreply@harpelle.com` enters major spam corpora; legitimate email (password resets, schedule confirmations, billing receipts) starts going to spam folders within 24–72 hours.
2. **Quota / billing burn.** Resend bills per email at scale; a sustained attack costs real money before you notice.

Gemini caught this; I missed it in v1. Verified directly.

**Evidence:** `src/app/api/welcome/route.ts:7-40`. Notable: the route checks `if (!process.env.RESEND_API_KEY)` returning 503 (line 15), but does *not* check anything about the caller.

**Recommended fix — make this a server-internal trigger, not a public POST.**

The welcome email is already sent only after sign-up. Move the trigger to the server side of registration:

```ts
// src/lib/server/email-events.ts
export async function sendWelcomeEmail(opts: {
  to: string;
  name: string;
  isJoinFlow: boolean;
}) {
  const { subject, html, text } = opts.isJoinFlow
    ? buildAccountCreatedEmail({ userName: opts.name })
    : buildWelcomeEmail({ userName: opts.name });
  await resend.emails.send({ from: 'VolunteerCal <noreply@harpelle.com>', ...});
}

// In the registration-completion server route (called *after* createUserWithEmailAndPassword),
// call sendWelcomeEmail() server-side. The route requires the freshly-created Firebase ID token.
```

Then **delete `/api/welcome` entirely** or, if it must remain a separate endpoint, require a Firebase ID token whose `auth_time` is within the last 5 minutes (i.e., a freshly-authenticated user) plus a `redis-backed` rate limit of 5/hour per uid and 100/hour per IP.

**Audit similar suspects.** Both reviews and my v1 missed `/api/welcome`. Sweep `src/app/api/**/route.ts` for any handler that:
- imports `Resend`, `twilio`, `nodemailer`, or talks to any outbound message service, AND
- does not call `adminAuth.verifyIdToken()` AND/OR `requireKioskToken()` AND/OR `requireCronSecret()`.

A 30-minute audit. Do it before v2 ships.

**Effort:** 1–2 hours to remove the route + 1 day to sweep all message-emitting handlers.

---

### Issue #4 — Production secrets observed in `.env.local`

**Severity:** **Critical** · **Area:** Security / Ops

**Why it matters.** `.env.local` was reported by the security explore agent in v1 to contain a Stripe Secret Key, Resend API Key, Stripe Webhook Secret, full Twilio credentials, `CRON_SECRET`, and `PLATFORM_ADMIN_UIDS`. Even if `.gitignore`d today, the value of verifying *git history* and *forks* is enormous — once leaked, every subsequent rotation depends on the original key being inert.

**Verification you can do in ~2 minutes:**

```bash
git log --all --full-history --source -- .env.local
git log --all --full-history -p -- .env.local | head -200
# If non-empty: assume leaked, rotate immediately, then scrub history.
```

If history shows commits, the rotation order matters:

1. **Rotate first** (Stripe, Resend, Twilio, regenerate `CRON_SECRET`, regenerate Firebase Admin private key).
2. **Re-deploy** with new values via Vercel env vars (scoped Production / Preview / Development).
3. **Then** scrub history: `git filter-repo --path .env.local --invert-paths`, force-push, notify all collaborators to re-clone, deal with forks.
4. Add a `gitleaks` or `trufflehog` pre-commit + CI gate.
5. Audit Stripe dashboard for unrecognized API calls during the exposure window. Audit Resend for unauthorized sends. Audit Twilio for unauthorized SMS.

If history is clean, you still want to:
- Move every secret out of `.env.local` and into Vercel env vars (do *not* keep both).
- Confirm `.gitignore` includes `.env*.local` (Next.js default does).
- Add `gitleaks` pre-commit hook.

**Evidence:** Reported in v1 audit by security explore agent — `.env.local:10–28`. Both Codex and Gemini did not directly cite this, suggesting they did not read `.env.local` (sensible as a courtesy). I did, via subagent.

**Effort:** Hours, but spread across rotation coordination — half a day end-to-end.

---

### Issue #5 — Authorization is hand-rolled per route; one shared layer is missing

**Severity:** **High** · **Area:** Architecture / Security

**Why it matters.** Three independent reviewers (me, Codex, Gemini) all flagged this. With ~150 API routes and a feature-rich product still being added to, copy-paste auth is the single biggest source of *future* security regressions. Codex documents the variant patterns: "some use deterministic membership doc IDs, some query memberships, some role arrays, some permission flags." When a developer adds the 152nd route at 11pm before launching a feature, the question "did I remember the membership check?" must not exist.

**The right fix is not Edge middleware** (Gemini's suggestion of moving auth into `middleware.ts`). Edge middleware on Vercel cannot run `firebase-admin`; it would force you into a session-cookie pattern with separate verification — feasible but a much larger refactor. Codex's recommendation is correct: **build a Node-runtime authorization library** that every route calls explicitly.

**Recommended fix — `src/lib/server/authz.ts`.**

```ts
// src/lib/server/authz.ts
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import type { Membership, OrgRole } from '@/lib/types';

export type AuthedUser = {
  uid: string;
  email: string | null;
};

export type AuthedMembership = AuthedUser & {
  membership: Membership;
  churchId: string;
  role: OrgRole;
};

export async function requireUser(req: NextRequest): Promise<AuthedUser | NextResponse> {
  const authz = req.headers.get('authorization');
  if (!authz?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  }
  try {
    const decoded = await adminAuth.verifyIdToken(authz.slice(7));
    return { uid: decoded.uid, email: decoded.email ?? null };
  } catch {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  }
}

export async function requireMembership(
  req: NextRequest,
  churchId: string,
  minRole: OrgRole = 'volunteer',
): Promise<AuthedMembership | NextResponse> {
  const user = await requireUser(req);
  if (user instanceof NextResponse) return user;

  const ref = adminDb.doc(`memberships/${user.uid}_${churchId}`);
  const snap = await ref.get();
  if (!snap.exists) {
    return NextResponse.json({ error: 'Not a member' }, { status: 403 });
  }
  const m = snap.data() as Membership;
  if (m.status !== 'active') {
    return NextResponse.json({ error: 'Membership inactive' }, { status: 403 });
  }
  if (!roleIsAtLeast(m.role, minRole)) {
    return NextResponse.json({ error: 'Insufficient role' }, { status: 403 });
  }
  return { ...user, membership: m, churchId, role: m.role };
}

export async function requirePlatformAdmin(req: NextRequest) { /* ... */ }
export async function requireCronSecret(req: NextRequest) { /* ... — fail closed (Issue #7) */ }
export async function requireKioskToken(req: NextRequest, scope: KioskScope) { /* see Issue #1 */ }

const ROLE_ORDER: OrgRole[] = ['volunteer', 'scheduler', 'admin', 'owner'];
function roleIsAtLeast(have: OrgRole, need: OrgRole): boolean {
  return ROLE_ORDER.indexOf(have) >= ROLE_ORDER.indexOf(need);
}
```

Then each route becomes:

```ts
// src/app/api/schedules/[id]/publish/route.ts
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const auth = await requireMembership(req, body.church_id, 'scheduler');
  if (auth instanceof NextResponse) return auth;
  // ... business logic, no manual token verify, no manual role check
}
```

**Migration plan.** Don't big-bang. Start with the riskiest routes:
1. `/api/checkin/*` — wrapping with `requireKioskToken` (Issue #1).
2. `/api/billing/*` — owner-only on most routes; webhook stays signed.
3. `/api/invites/*` and `/api/memberships/*` — admin/owner only.
4. `/api/schedules/[id]/publish` and unpublish.
5. `/api/orgs/[id]/delete`.
6. `/api/platform/*` — `requirePlatformAdmin`.
7. Roll forward through the remaining 100+ routes over 2–3 sprints.

**Audit logging hook in the same library.** Once `requireMembership` exists, slot in audit logging at the same call site:

```ts
// In requireMembership:
await maybeAuditLog({ action: req.method, route: req.nextUrl.pathname, ... });
```

**Effort:** 1 day for the library + emulator tests. ~3–6 hours per cluster of routes to migrate. Plan 3 weeks for full migration.

---

### Issue #6 — No observability, no audit log, no structured logging

**Severity:** **High** · **Area:** Ops / Security / Compliance

**Why it matters.** Three rolled into one because they reinforce each other:

- **No application monitoring.** No `@sentry/nextjs`, `@axiom-co/*`, `pino`, `winston`, `logtail` in `package.json`. There are ~200 `console.log/error` calls. Vercel runtime logs are the only signal, and they roll off.
- **No audit log.** No `audit_logs` Firestore collection. When (not if) a church admin asks "who changed Sarah's role last Tuesday?" or "did our reminders actually go out for Easter Sunday?", you have no answer.
- **No alerting.** Cron failures surface only via Vercel's cron logs UI. There is no Slack/email/PagerDuty hookup. Silent breakage is the worst kind of breakage.

For B2B SaaS handling minors' data, this is a deal-breaker for any procurement conversation more sophisticated than "trust me."

**Recommended fix — three small additions, large impact:**

1. **Sentry (or Axiom).** 30-minute install, immediate visibility:
   ```bash
   npx @sentry/wizard@latest -i nextjs
   ```
   Wrap cron handlers with explicit `Sentry.captureException` on catch. Add Sentry's Cron monitor pings (`Sentry.checkIn`) to each cron's start/end so you alert on missed runs.

2. **`src/lib/audit.ts`.**
   ```ts
   export async function audit(opts: {
     church_id: string;
     actor_uid: string | 'system' | 'kiosk';
     action: string; // 'schedule.publish' | 'role.change' | 'kiosk.checkin' | ...
     target_type?: string;
     target_id?: string;
     metadata?: Record<string, unknown>;
   }) {
     await adminDb.collection('audit_logs').add({
       ...opts,
       created_at: new Date().toISOString(),
     });
   }
   ```
   Call it in: schedule publish/unpublish, role changes, member invite/approve/remove, billing tier changes, exports, platform-admin tier overrides, kiosk creation/revocation, kiosk check-in / check-out, child record edits, household edits.

   Pair with a Settings → Activity Log UI for owners. This is also a strong sales asset — admins love this.

3. **Structured logger wrapper.** Even before Sentry:
   ```ts
   // src/lib/log.ts
   type LogFields = Record<string, unknown>;
   export const log = {
     info: (msg: string, f?: LogFields) =>
       console.log(JSON.stringify({ level: 'info', msg, ...f, ts: Date.now() })),
     warn: (msg: string, f?: LogFields) =>
       console.warn(JSON.stringify({ level: 'warn', msg, ...f, ts: Date.now() })),
     error: (msg: string, e?: unknown, f?: LogFields) =>
       console.error(JSON.stringify({ level: 'error', msg, err: serialize(e), ...f, ts: Date.now() })),
   };
   ```
   Mass-search-and-replace `console.error(` → `log.error(` over time. Once Sentry is in, swap the `error` function to also call `Sentry.captureException`.

**Effort:** Sentry — 30 minutes. Audit-log primitive — half a day. Wrapper — 1 hour. Sprinkle audit calls across sensitive ops — 2–3 days.

---

### Issue #7 — Cron routes fail open if `CRON_SECRET` is unset; one cron path is dangling

**Severity:** **High** · **Area:** Security / Ops

**Why it matters.** Codex caught two distinct cron problems I missed:

1. **`/api/cron/propresenter-export` is fail-open.** Its guard reads (per Codex, `cron/propresenter-export/route.ts`):
   ```ts
   if (cronSecret && authHeader !== `Bearer ${cronSecret}`) return ...;
   ```
   If `CRON_SECRET` is unset (env var typo, preview env, dev), `cronSecret` is `undefined`, the `&&` short-circuits, and the route runs for any caller. Anyone hitting the URL iterates all churches.

2. **Dangling cron entry.** `vercel.json:12` schedules `/api/cron/songselect-sync` weekly at 03:00 Mon, but `src/app/api/cron/` contains no `songselect-sync/` directory (verified directly: only `notification-cleanup`, `prerequisite-check`, `propresenter-export`, `reminders`, `stats-refresh`). This means Vercel is pinging a 404 endpoint weekly — silent failure, no alert.

**Evidence (verified):**
- `vercel.json:12` references `/api/cron/songselect-sync`.
- `ls src/app/api/cron/` shows no `songselect-sync` directory.
- Cron-route guard pattern per Codex.

**Recommended fix.** Centralize and fail closed:

```ts
// src/lib/server/authz.ts (continued)
import { timingSafeEqual } from 'node:crypto';

export function requireCronSecret(req: Request): NextResponse | null {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    // Fail CLOSED. A missing secret in any env means lock the route.
    return NextResponse.json({ error: 'Cron not configured' }, { status: 503 });
  }
  const presented = req.headers.get('authorization')?.replace(/^Bearer\s+/, '') ?? '';
  const a = Buffer.from(presented);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return null;
}
```

And in every cron route:

```ts
export async function GET(req: NextRequest) {
  const blocked = requireCronSecret(req);
  if (blocked) return blocked;
  // ...
}
```

Also:
- Decide on `songselect-sync`: either implement the route or delete the entry from `vercel.json`. If you intend to add it later, comment the entry out so you don't keep failing weekly.
- Add Sentry cron checkins (Issue #6) to all cron routes; you'll know within minutes of a missed run.
- Add `export const maxDuration = 300;` at the top of each cron route if you're on Pro (Issue #11).

**Effort:** 30 minutes to add `requireCronSecret` + sweep all cron routes. 5 minutes to fix `vercel.json`. Quick win.

---

### Issue #8 — Lint fails (real hook-order errors) and there is no CI gate

**Severity:** **High** · **Area:** Maintainability / Frontend

**Why it matters.** Per Codex, `npm run lint` produces 52 errors and 77 warnings, *including* React hook-order violations in `src/app/dashboard/page.tsx` and `src/components/ui/short-link-creator.tsx`. Hook-order errors are correctness bugs — they cause stale state, missed updates, and crashes that are nearly impossible to diagnose.

The compounding issue: there is no CI step running lint. TypeScript passes (`npx tsc --noEmit` per CLAUDE.md), so the team has been treating "TS clean" as "code clean." The two are different guarantees.

**Recommended fix:**

1. Run `npm run lint` locally. Fix the hook-order errors first — these are the blockers. Triaging:
   - `if (...) { useEffect(...) }` → unconditionally call `useEffect`, gate the body inside.
   - `useState` after an early `return` — same pattern.
2. Decide on the React Compiler warnings policy. If you want them as errors, leave them; if you want them as warnings during transition, pin to `warn` and revisit.
3. Add a CI workflow:
   ```yaml
   # .github/workflows/ci.yml
   name: ci
   on: [pull_request]
   jobs:
     verify:
       runs-on: ubuntu-latest
       steps:
         - uses: actions/checkout@v4
         - uses: actions/setup-node@v4
           with: { node-version: '20', cache: 'npm' }
         - run: npm ci
         - run: npx tsc --noEmit
         - run: npm run lint -- --max-warnings=0
         - run: npx firebase emulators:exec --only firestore "npm run test:rules"  # see Issue #2
   ```
4. Add `npm run lint -- --max-warnings=0` as a Vercel deploy gate via "Ignored Build Step" if you want belt-and-suspenders.

**Effort:** Half a day to fix the hook-order bugs. 1–2 hours to wire CI. Quick win.

---

### Issue #9 — Reservation conflict checks are race-prone; concurrent bookings can double-book

**Severity:** **High** · **Area:** Backend / Reliability

**Why it matters.** Codex flagged this with specific evidence: `src/app/api/reservations/route.ts` runs `findConflicts()` (a query) and then writes the new reservation *outside* a Firestore transaction. Two concurrent POSTs for the same room+time can both see no conflict and both succeed. Recurring reservations multiply the impact across many dates. For a church with shared rooms (sanctuary, fellowship hall, nursery), this is a real-world UX failure mode that will hit during peak booking windows (holiday seasons, schedule release after a service plan publish).

**Recommended fix — Firestore transactions + occupancy lock docs.**

Use Firestore transactions to atomically check and write:

```ts
// src/lib/server/reservations.ts
export async function createReservation(input: ReservationInput): Promise<Reservation> {
  return adminDb.runTransaction(async (tx) => {
    // Read all overlapping reservations for this room+date inside the transaction
    const overlapping = await tx.get(
      adminDb
        .collection(`churches/${input.churchId}/reservations`)
        .where('room_id', '==', input.roomId)
        .where('start_iso', '<=', input.endIso)
        .where('end_iso', '>=', input.startIso)
        .limit(1),
    );
    if (!overlapping.empty) {
      throw new ReservationConflictError(overlapping.docs[0].id);
    }
    const newRef = adminDb.collection(`churches/${input.churchId}/reservations`).doc();
    tx.set(newRef, { ...input, id: newRef.id, created_at: nowIso() });
    return { ...input, id: newRef.id };
  });
}
```

Two caveats:
- Firestore range queries on the same field cannot directly express "overlap" using two inequalities. The cheap workaround is to bucket by room+date (`room_id_yyyymmdd`) and load all that day's reservations inside the transaction, then check overlap in memory. For a single church-day this is small (<100 rows).
- For **recurring reservations**, run the transaction *per occurrence*. If any conflicts, fail the whole group atomically: write all-or-nothing into a parent `reservation_groups` doc with a `status: 'pending' | 'confirmed' | 'rolled_back'` field; only flip to `confirmed` after every occurrence transaction succeeds. This avoids partial-recurrence states.

**Add idempotency keys** while you're here. Take an `Idempotency-Key` header on POST, store it in `reservations/{id}.idempotency_key`, and short-circuit return the existing reservation on retry.

**Effort:** 2 days for the transaction refactor + tests + recurring-group handling.

---

### Issue #10 — In-memory rate limiter is meaningless on Vercel; sensitive routes are effectively unrate-limited

**Severity:** **High** · **Area:** Security / Ops

**Why it matters.** `src/lib/utils/rate-limit.ts:8` uses `new Map<string, RateLimitEntry>()` for state. On Vercel:
- Each serverless function instance has its own Map. Cold-started instances start empty. A burst of traffic hits multiple instances, multiplying the effective limit by the number of warm instances.
- Distributed sources defeat per-IP buckets entirely.
- The "30 req/min" on `/api/checkin/lookup` (Issue #1) is *literal fiction* under a coordinated attack from even 10 IPs.

This is the reason Issue #1 is exploitable in minutes rather than hours.

**Recommended fix — Upstash Redis (free tier) or Firestore-backed counters.**

Upstash is the best fit for Vercel. Free tier covers many production workloads.

```ts
// src/lib/server/rate-limit.ts
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();

export const limits = {
  kioskLookup: new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(10, '1 m'),
    prefix: 'rl:kiosk-lookup',
  }),
  welcomeEmail: new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(5, '1 h'),
    prefix: 'rl:welcome',
  }),
  authLogin: new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(20, '15 m'),
    prefix: 'rl:auth',
  }),
};

export async function rateCheck(
  limit: Ratelimit,
  identifier: string,
): Promise<NextResponse | null> {
  const r = await limit.limit(identifier);
  if (r.success) return null;
  return NextResponse.json(
    { error: 'Too many requests', retry_after: r.reset },
    { status: 429, headers: { 'Retry-After': String(Math.ceil((r.reset - Date.now()) / 1000)) } },
  );
}
```

Use composite identifiers — IP + uid + route key — so authenticated abusers can't bypass IP-based limits with a fresh proxy.

For sensitive paths, layer two limits: a per-IP global cap (e.g., 100 calendar token misses/hour/IP across all calendar URLs) AND a per-`(uid|kiosk|target)` cap.

**Effort:** Half a day to add Upstash + replace the in-memory limiter. Add `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` to Vercel env. Sweep call sites incrementally.

---

### Issue #11 — Cron jobs lack `maxDuration`, idempotency, and dead-letter handling; some routes mutate on GET

**Severity:** **High** · **Area:** Reliability / Backend

**Why it matters.** Three issues, one theme:

1. **Timeouts (from v1).** `cron/stats-refresh` and `cron/reminders` iterate all churches sequentially with unbounded subcollection scans. At 50 churches × 500 volunteers, you'll exceed Vercel's 60s Pro limit. There is no `export const maxDuration = 300;` on any cron route.
2. **Idempotency / double-send.** `cron/reminders` updates `reminder_sent_at` *after* the API call completes. Vercel cron retries on non-2xx; a partial failure can resend a swathe of emails. The current array-append pattern doesn't gate per-channel (email vs SMS).
3. **GET-side mutations (Codex).** `/api/people-data` is a GET that auto-creates missing person/volunteer records during read. This is a serious predictability problem. GET handlers should be safe & idempotent. Mutations on read break HTTP semantics, hide real failures behind silent fixups, are difficult to test, and create thundering-herd problems if the GET is called concurrently or from a retry path.

**Recommended fix:**

1. Add `export const maxDuration = 300;` (Pro+) to every cron route.
2. Process churches in parallel chunks with concurrency cap:
   ```ts
   import pLimit from 'p-limit';
   const limit = pLimit(8);
   await Promise.all(churches.map(c => limit(() => processChurch(c))));
   ```
3. **Replace `reminder_sent_at` array append with a per-(assignment, channel, type) idempotency flag inside a Firestore transaction**:
   ```ts
   await adminDb.runTransaction(async (tx) => {
     const ref = adminDb.doc(`churches/${cid}/assignments/${aid}`);
     const snap = await tx.get(ref);
     const flag = `reminder_${kind}_${channel}_sent`; // e.g. reminder_24h_email_sent
     if (snap.get(flag)) return; // already sent — no-op
     await sendEmail(...); // outside tx? no — see below
     tx.update(ref, { [flag]: true, [`${flag}_at`]: nowIso() });
   });
   ```
   The send-then-mark gap is the actual problem. Resolve via the **transactional outbox** pattern (next item).
4. **Transactional outbox** for publish→notify and reminder dispatch:
   - In the same Firestore batch as the business write, enqueue rows in `notification_outbox`.
   - A separate cron drains the outbox, marking rows `sent | failed` with retry counts.
   - This makes publish/reminder operations atomic from the business's perspective and turns the email/SMS layer into a retry-safe pipeline.
5. **No GET-side mutations.** Refactor `/api/people-data` (and audit for similar): a GET returns whatever exists; a separate background "repair" cron or an explicit POST `/api/people-data/repair` does fixups. This is a small but important hygiene improvement.

**Effort:** `maxDuration` + concurrency caps — half a day. Idempotency flag rewrite — 1 day. Transactional outbox — 3–4 days. GET-mutation hygiene — 1 day.

---

### Issue #12 — Service worker pre-caches authenticated dashboard navigations on shared kiosks

**Severity:** **Medium-High** · **Area:** Security / UX

**Why it matters.** `public/sw.js:10` pre-caches `["/", "/dashboard", "/offline"]`, and `sw.js:41-54` caches every successful navigation response to the cache. On a **shared device** — exactly the kiosk the church uses for check-in — this causes:
- After logout, the cached `/dashboard` shell may still be served (network-first will hit network, but cache fallback exists).
- After org-switch, a stale snapshot of the previous org's dashboard can flash.
- If the device is offline post-logout, the cached shell renders without auth.

For a kiosk in a public space, this is a real privacy regression.

**Evidence (verified):** `public/sw.js:10` (`STATIC_ASSETS = ["/", "/dashboard", "/offline"]`), `sw.js:41-54` (caches navigation responses).

**Recommended fix:**

1. Remove `/dashboard` from `STATIC_ASSETS`. Only the public-shell `/` and `/offline` should be pre-cached.
2. Do not cache navigation responses at all unless they are explicitly public:
   ```js
   if (event.request.mode === 'navigate') {
     event.respondWith(
       fetch(event.request).catch(() => caches.match('/offline')),
     );
     return;
   }
   ```
3. On logout, programmatically clear the cache:
   ```ts
   // In auth-context.tsx logout():
   if ('caches' in window) {
     await Promise.all((await caches.keys()).map(k => caches.delete(k)));
   }
   if ('serviceWorker' in navigator) {
     const regs = await navigator.serviceWorker.getRegistrations();
     await Promise.all(regs.map(r => r.unregister()));
   }
   ```
4. Cache only static asset GETs (`_next/static/*`, `/icons/*`, `*.svg`, `*.png`) — the existing pattern at `sw.js:58-75` is fine for those.

**Effort:** 1 hour. Quick win.

---

## 4. Cross-cutting findings — additional issues worth attention

These are real but lower priority than #1–#12. Each is a paragraph rather than a section.

### 4a. Short links are open redirects (Codex; verified)

`src/app/s/[slug]/page.tsx:29` calls `redirect(data.target_url)` for any stored `target_url`. An admin who creates a short link can redirect users to phishing pages from a `volunteercal.com/s/` URL. **Fix:** in the create/update API, allow only relative paths or an explicit external allowlist (`youtube.com`, `forms.google.com`, etc.) and add an interstitial warning page for any external destination. Audit-log external redirect creation.

### 4b. No security headers in `next.config.ts` (Codex; verified)

`next.config.ts` is 7 lines and only configures `serverExternalPackages: ["@napi-rs/canvas"]`. There is no CSP, frame-ancestors, referrer-policy, permissions-policy, X-Content-Type-Options, or Strict-Transport-Security. **Fix:** add a `headers()` export with at minimum:

```ts
async headers() {
  return [{
    source: '/:path*',
    headers: [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
      { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
      // CSP requires care — start in report-only:
      { key: 'Content-Security-Policy-Report-Only', value: cspString },
    ],
  }];
}
```

CSP needs to allow Firebase, Stripe, Google Maps, Resend pixel-tracking domains. Run report-only for a week, observe Sentry CSP reports, then enforce.

### 4c. Validation: zero Zod across ~150 routes (v1; Codex)

Adopt `zod`. The 80/20 implementation is a single helper:

```ts
// src/lib/server/validate.ts
import { ZodSchema } from 'zod';
export async function parseBody<T>(req: Request, schema: ZodSchema<T>): Promise<T | NextResponse> {
  try {
    const body = await req.json();
    const result = schema.safeParse(body);
    if (!result.success) {
      return NextResponse.json(
        { error: 'Validation failed', issues: result.error.issues },
        { status: 400 },
      );
    }
    return result.data;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
}
```

Migrate the 20 highest-traffic routes first.

### 4d. Tests: none for critical flows (Codex)

`package.json` has no `test` script. **Minimum viable suite:**
- `firestore.rules.test.ts` — emulator unit tests for the rules from Issue #2.
- `scheduler.test.ts`, `eligibility.test.ts`, `permissions.test.ts` — pure-function unit tests for `src/lib/services/*`.
- `publish-flow.test.ts` — emulator + integration test that walks the entire publish→assignment→outbox path.
- `e2e/checkin.spec.ts` — Playwright e2e: kiosk activation, lookup, check-in, checkout.

Tests are not optional once the product handles minors' data.

### 4e. UX: custom `Input` lacks `aria-invalid` / `aria-describedby` (Gemini; v1; verified)

`src/components/ui/input.tsx` renders an `<input>` and a separate error `<p>` but does not link them via ARIA. Screen readers will not announce errors when an input is invalid. **Fix:**

```tsx
<input
  {...props}
  aria-invalid={!!error || undefined}
  aria-describedby={error ? `${id}-error` : undefined}
/>
{error && <p id={`${id}-error`} role="alert">{error}</p>}
```

Apply the same fix to `Select`, `Textarea`, and `Combobox`.

### 4f. Heavy client-side rendering; missing `next/image`; dead `motion` dep

Repeated across all three reviews. The two-week win:
1. Convert dashboard home and the four most-trafficked admin pages to Server Components for initial data load. Keep interactive widgets as `"use client"` islands. Wrap server-side Firestore reads in `unstable_cache(..., { tags: ['org:churchId'] })`. Invalidate on writes via `revalidateTag`.
2. Replace raw `<img>` for uploaded photos with `next/image`. Configure `images.remotePatterns` for your Firebase Storage bucket.
3. Remove `motion` if it is genuinely unused (verify with `git grep -n "from ['\"]motion`); `npm uninstall motion`.
4. Lazy-load heavy admin features: `dynamic(() => import('./recharts-section'), { ssr: false })`.

This is the path Gemini was pointing at with the dashboard-aggregation finding. The architectural pivot is: **stop reading raw subcollections from the client; read pre-aggregated summary docs** (or `count()` queries) from the server.

### 4g. Calendar tokens in URL paths; no rotation UI (v1)

Already covered in v1 but worth restating: the right shape is **header-token for our own integrations** and **URL-token + per-feed rotation/expiry/last-accessed metadata for iCal subscribers**. Add rotation/revocation UI in Settings → Calendar Feeds. Set `Cache-Control: private, max-age=300` on responses to reduce origin load.

### 4h. Information architecture / routing registry (Codex)

With 70 page files and 132 API routes, the navigation is now spread across `sidebar.tsx`, `bottom-nav.tsx`, `more-menu.tsx`, and breadcrumb logic. Codex's recommendation is sound: build a single typed route registry — `path | label | icon | requiredRole | tierGate | mobileVisibility | desktopSection` — and generate sidebar / bottom nav / breadcrumbs / route guards from it. This both prevents nav drift and gives you one place to enforce role + tier gates client-side. Server-side enforcement still goes through the authz library from Issue #5 — never trust the client for authorization, only for navigation hints.

### 4i. Terminology drift (v1; Codex)

UI says "Teams"; DB says `ministries`; setup guide mixes "team" and "ministry"; landing FAQ uses "ministry" in places. Decide on user-facing terms and document the internal-vs-external mapping in `CLAUDE.md`. Same for "Service" vs "Event," "Volunteer" vs "Person" vs "Member."

### 4j. UX role-specific dashboards (Codex)

The dashboard tries to serve owner / admin / scheduler / volunteer / check-in operator / facility coordinator with one layout. Codex's recommendation to ship role-specific landing surfaces is correct and high-leverage for retention. Volunteers see schedule / availability / inbox / account. Schedulers see coverage gaps / draft review / people / services. Owners see billing / settings / users / activity log. This unifies several finding categories: nav clarity, empty states, perceived performance.

### 4k. `/api/volunteers` JSON endpoint with hardcoded CORS (v1)

Hardcoded `Access-Control-Allow-Origin: https://ergunkodesh.org` is a one-off integration that has crept into the public API surface. Move it behind a header-token (replacing the URL-token) and update the consumer. If the consumer can't be updated, namespace this endpoint clearly: `/api/integrations/ergunkodesh/volunteers` with explicit per-tenant tokens.

### 4l. Hot-doc contention on volunteer stats (perf)

`attendance` increments stats per volunteer using `FieldValue.increment` — correct. But for a single volunteer's stats doc, sustained writes >1/sec hit Firestore contention. Not yet a problem at current scale; address with **distributed counters** only when monitoring shows contention errors.

---

## 5. Vercel & platform-specific findings (consolidated)

| # | Issue | Severity | Recommendation |
|---|---|---|---|
| V1 | Production secrets in `.env.local` (Issue #4) | Critical | Rotate, scrub history, move to Vercel env, add gitleaks |
| V2 | Single Firebase project across environments | High | Create `volunteercal-staging` Firebase project; scope Vercel env vars per environment so previews never read prod data |
| V3 | Crons configured but no cron monitoring | High | Sentry Cron checkins (Issue #6); on-call alert path |
| V4 | `vercel.json` references missing `/api/cron/songselect-sync` | Medium | Implement or remove (Issue #7) |
| V5 | No `maxDuration` on cron handlers (Issue #11) | High | `export const maxDuration = 300;` per route; verify Pro plan |
| V6 | No security headers (4b) | Medium | Add `headers()` export with HSTS, CSP-Report-Only, etc. |
| V7 | Edge runtime correctly used only for OG images | — | Positive; document with a comment to prevent regression |
| V8 | `Cache-Control` missing on cacheable GETs | Medium | Add `s-maxage` for landing assets; `private, max-age=300` for personal feeds |
| V9 | Preview deploys' write-protection unverified | High | Add a runtime guard rejecting mutating requests in `process.env.VERCEL_ENV === 'preview'` unless the env explicitly opts in via a secondary flag |
| V10 | Build flags not pinned defensively | Medium | Confirm `next.config.ts` does not have `typescript.ignoreBuildErrors` or `eslint.ignoreDuringBuilds`; add the lint CI gate from Issue #8 |
| V11 | In-memory rate limiter on serverless (Issue #10) | High | Move to Upstash Redis |

---

## 6. Reconciling reviewer disagreements

Where the three reviews disagreed, here's the position I'd take and why.

**Disagreement 1: Auth in Edge middleware (Gemini) vs. shared server library (Codex / v1).**
Take Codex's position. Edge middleware on Vercel cannot run `firebase-admin` and would force a Firebase session-cookie pattern; that's a much larger refactor than `requireUser` / `requireMembership` helpers. Session cookies are fine eventually, but the immediate value is the shared library; cookies can come later if needed.

**Disagreement 2: Adopt tRPC (Gemini) vs. Server Actions (v1) vs. status quo (Codex).**
Take Server Actions, but only for *form submissions* — settings, profile updates, simple admin mutations. Don't tear up the existing API routes wholesale; a tRPC migration on top of 132 routes is a six-month adventure that solves a problem (boilerplate) you can solve in a week with the authz library. Use Server Actions where forms talk back to the server, and keep REST for everything that is genuinely an integration point (calendar feeds, kiosk endpoints, billing webhook, cron, the JSON volunteer endpoint).

**Disagreement 3: Severity of secrets-in-repo.**
v1 ranked it #1 Critical; Codex/Gemini did not include it (likely didn't read `.env.local`). It's still Critical. But after re-verifying the children's-PII surface, **Issue #1 (kiosk PII) is the higher-impact risk** because it requires no insider — any internet user can exploit it today. Updated ordering reflects this.

**Disagreement 4: Architecture grade (v1: B+ vs. Gemini: D vs. Codex: C+).**
Gemini was right. With ~150 hand-rolled-auth routes, no validation layer, no tests, and a lint failure, B+ was over-graded. The codebase has *good locally-scoped patterns* but *insufficient global structure*. Settled at **C**.

**Disagreement 5: shadcn/ui migration (Gemini) vs. fix custom components in place (v1).**
Mid-sized teams without strong design-system maintainers should usually take shadcn/ui. For VolunteerCal, the brand is real and the custom UI is consistent enough that a wholesale migration would be churn. Take the surgical path: fix `aria-*` and focus-trap gaps in the existing components (≤2 days of work), keep the brand. Re-evaluate after 6 months.

---

## 7. Detailed findings by audit dimension (consolidated)

This section is organized by the original audit dimensions, drawing from all three reviews and the verifications. Issues are referenced by number from §3.

### 7.1 Product / Content
- **Strengths.** Landing page FAQ and dashboard greeting copy are warm, specific, jargon-light. Register form uses real-time inline validation (`register/page.tsx:150-154`). Setup guide structure is thoughtful (`dashboard/page.tsx:240-261`).
- **Weaknesses.**
  - **Message/scope mismatch (Codex).** "Everything you need, nothing you don't" no longer matches a product that includes scheduling, check-in, room reservations, worship planning, training, billing, notifications, short links, platform admin. Reframe public messaging around the buyer's primary pain ("Keep every volunteer role covered without spreadsheet chaos"); present check-in / rooms / worship as modules, not equal headline claims.
  - **Terminology drift** (Issue 4i): UI says "Teams"; DB says `ministries`; copy mixes both.
  - **Empty states** lack CTAs in several spots (`dashboard/page.tsx:503` Upcoming Services).
  - **"No Organization" empty state** (`dashboard/page.tsx:212-214`) is cold; warmer copy welcomes new admins.
  - **Setup guide** is persistent until manually dismissed; auto-collapse after `allDone` or after N sessions.

### 7.2 Information Architecture
- Route tree under `src/app/dashboard/**` is coherent. Middleware redirects (`middleware.ts:8-29`) handle deprecated paths cleanly.
- **Server / client boundaries are the headline issue** (Issues #6, 4f). Most dashboard pages are `"use client"` and fetch post-hydration; this is the architectural pivot worth doing now.
- **Route registry** (4h): with 70 pages and 132 API routes, the navigation across sidebar / bottom-nav / more-menu / breadcrumbs is now copy-paste. Build a typed route registry.
- **Component reuse:** `src/components/ui/` is genuinely hand-built and consistent. Some pages bypass the `Button` component with inline coral classes (`dashboard/page.tsx:223, 306, 432-435`) — minor leak.
- **Stale routes:** `/organization` is a redirect-only route; could be deleted directly.

### 7.3 Backend & Data Flow
- **Strengths.** `Promise.all` parallelization (`schedules/[id]/publish/route.ts:88-90`); `getAll(...refs)` batched reads (`attendance/route.ts:79`); atomic batch writes for attendance + stats; `FieldValue.increment()` for counters.
- **Weaknesses.**
  - Hand-rolled auth (Issue #5).
  - Zero Zod (4c).
  - Reservation race (Issue #9).
  - GET-side mutations in `/api/people-data` (part of Issue #11).
  - Unbounded reads in cron (Issue #11).
  - Publish→notify race / no transactional outbox (Issue #11).
  - Some `as unknown as Person` bridging (`schedules/[id]/publish/route.ts:97`) — would be eliminated by zod-parsed Firestore boundary.

### 7.4 Security (consolidated)
- See Issues #1, #2, #3, #4, #5, #7, #10, #12, 4a, 4b, 4g.
- **Positives.** Stripe webhook signature verification is correct. Cron secret comparison is timing-safe (where present). Storage rules deny default. Memberships use deterministic IDs. CSRF risk is low because routes use `Authorization: Bearer` not session cookies.

### 7.5 Robustness & Resilience
- Failure modes confirmed: publish→notify race (#11); cron double-send (#11); reservation race (#9); partial Resend failures dropped (`reminders/route.ts ~150-200`).
- Loading / empty / error states are patchy. Some pages (Dashboard, Register) do this well; many use a single `<Spinner />` (`dashboard/page.tsx:315`) where skeleton cards would feel faster.
- Drawer keyboard escape: `drawer.tsx` closes on Escape but does not trap focus while open.
- Submit during invalid state: Register form (`register/page.tsx:182`) submit not disabled on validation failure.

### 7.6 Design / UX & Accessibility
- Brand is genuine and consistent. Bottom nav considered for mobile admin/volunteer split.
- **A11y gaps** (Issue 4e and v1):
  - Custom `Input` lacks `aria-invalid` / `aria-describedby`.
  - Icon-only mobile bottom-nav `<a>` tags lack `aria-label`.
  - `focus:outline-none` without sufficient ring replacement: `prerequisite-editor.tsx:115,129,138,162`, `select.tsx:33`, `short-link-creator.tsx:228`.
  - Coral-on-warm-bg badges likely fail WCAG 4.5:1 contrast: `dashboard/page.tsx:337` (`bg-vc-coral/10 ... text-vc-coral` on `vc-bg-warm`).
  - Two `h1` tags on dashboard home: `page.tsx:212, 276`.
  - No focus trap in `drawer.tsx`.
- **Mobile:** verify schedule matrix and reservation calendars don't horizontal-scroll on <360px. Confirm 44×44 touch targets on bottom nav.

### 7.7 Performance
- Massive dashboard over-fetch (Issue 4f and Gemini #5). Architectural fix is server-side aggregation + cached summary docs + Server Components.
- `next/image` only used twice. Replace raw `<img>` for uploaded photos.
- Recharts and `react-easy-crop` imported into client bundles without `dynamic()`. Lazy-load.
- `motion` dep likely dead — remove.
- Calendar feeds set `no-cache` (`api/calendar/*/route.ts:70, 94, 124, 129`); `private, max-age=300` is safe.
- Edge runtime usage on OG routes is correct.
- Memoization is moderate; not the place to invest until rendering is profiled.

### 7.8 Maintainability
- Strengths: central `src/lib/types/index.ts`, ~5 `as any`, deprecated types annotated, lib services well-isolated.
- Weaknesses: lint fails (Issue #8); no tests (4d); no structured logger (Issue #6); duplicated permission utilities across `src/lib/auth/permissions.ts` and `src/lib/utils/permissions.ts` (Codex).
- Repeated inline SVGs — consider a shared icon strategy.

### 7.9 Vercel / Platform
- See §5.

---

## 8. The 30-day, 60-day, 90-day plan

This is opinionated sequencing. The critical-class issues from §3 (#1–#4) must be resolved before any external comms about scaling. Everything else compounds.

### Week 1 — Stop the bleeding (security & reputation)

| Day | Work | Owner |
|---|---|---|
| 1 | Verify `.env.local` git history. Rotate every secret. Move to Vercel env vars (Issue #4). | Lead eng |
| 1 | Delete `/api/welcome` or wrap with fresh-auth + Upstash rate-limit (Issue #3). Sweep all message-emitting routes for missing auth. | Lead eng |
| 2 | Add `requireCronSecret` (fail-closed). Sweep all `/api/cron/*` (Issue #7). Decide `songselect-sync`. | Backend |
| 2 | Service worker: stop pre-caching `/dashboard`; stop caching navigations; clear cache on logout (Issue #12). | Frontend |
| 3 | Fix lint hook-order errors. Add CI lint + tsc gate (Issue #8). | Frontend |
| 3 | Short links: restrict `target_url` to relative or allowlist; add interstitial; audit-log external (4a). | Backend |
| 4 | Install Sentry; add cron checkins (Issue #6). | Lead eng |
| 5 | Add Upstash Redis; replace in-memory rate-limit on the public/auth endpoints (Issue #10). | Backend |

### Weeks 2–3 — Authorization & data isolation

| Day | Work | Owner |
|---|---|---|
| 6-7 | Build `src/lib/server/authz.ts` with `requireUser`, `requireMembership`, `requirePlatformAdmin`, `requireKioskToken`, `requireCronSecret` (Issue #5). | Backend |
| 8-10 | Rewrite `firestore.rules` collection-by-collection. Default-deny. Move children/households/audit/billing to Admin SDK only (Issue #2). | Backend |
| 8-10 | Add Firestore emulator rule tests; wire into CI (Issue #2 + 4d). | Backend |
| 11-13 | Implement kiosk trust bootstrap: kiosk_tokens collection, enrollment UI, scope checks. Migrate `/api/checkin/*` behind `requireKioskToken`. (Issue #1) | Full team |
| 14-15 | Migrate top-20 highest-risk routes to `requireMembership` / `requirePlatformAdmin` (Issue #5 phase 1). | Backend |

### Week 4 — Reliability & observability

| Day | Work | Owner |
|---|---|---|
| 16-17 | `src/lib/audit.ts` + audit log Firestore collection + Settings → Activity Log UI (Issue #6). | Full team |
| 18 | `maxDuration = 300` + concurrency caps on all crons. Bound Firestore queries with `limit()` + cursors (Issue #11). | Backend |
| 19 | Reservation transactions + idempotency keys (Issue #9). | Backend |
| 20 | Reminder idempotency flag rewrite (Issue #11). | Backend |

### Days 30–60 — Architecture & UX hardening

- Transactional outbox for publish→notify and reminders (Issue #11).
- `parseBody(schema)` Zod helper + migrate top-20 routes (4c).
- Server Components for dashboard home + 4 most-trafficked admin pages (4f). Stop reading raw subcollections client-side.
- `next/image` + `dynamic()` lazy loads. Remove `motion`.
- A11y pass: `aria-invalid`/`describedby` on form inputs, `aria-label` on icon-only nav, focus trap in drawer, contrast fixes (4e + Issue #8).
- Security headers in `next.config.ts` (4b).
- Calendar token rotation UI + last-accessed metadata (4g).

### Days 60–90 — Test harness & scale prep

- Vitest + Firestore emulator unit tests for `scheduler`, `eligibility`, `permissions`, publish flow (4d).
- Playwright e2e for: signup, invite, schedule publish, check-in (kiosk activation through checkout), room reservation, billing portal, account/org deletion.
- Staging Firebase project + per-environment Vercel env vars.
- Migrate remaining ~110 API routes to the authz library.
- Route registry + role-specific dashboards (4h, 4j).
- Distributed counters where contention monitoring shows it (4l).
- Performance budgets in CI (Lighthouse on main branch).

---

## 9. Refactor opportunities (nice-to-have, post-90-day)

- **Server Actions for form submissions** to thin out the `/api/` directory.
- **Repository pattern** in `src/lib/repositories/*` to centralize Firestore queries; enables migrations without sweeping `adminDb.collection()` calls everywhere.
- **Background job abstraction** instead of cron handlers manually iterating churches — durable queue (Inngest, Trigger.dev, or a Firestore-backed queue + worker cron).
- **Operational runbook** for failed cron, failed Stripe webhook, failed SMS/email, Firebase quota events.
- **Distributed counters** for hot stats docs at scale.
- **Design tokens checker** — a small CI script flagging inline coral classes outside `Button`.
- **Drop legacy `Volunteer*` aliases** entirely from types — migration is done.
- **Replace TTL Firestore client cache** in `src/lib/firebase/firestore.ts` with `unstable_cache` server-side; remove client-side cache complexity once Server Components adopt aggregation.

---

## 10. Positive findings (carry forward; do not regress)

- **Type discipline.** Central `src/lib/types/index.ts`, ~5 `as any` across the entire codebase, deprecation annotations on legacy aliases.
- **Atomic writes everywhere it matters.** Firestore `batch()` on attendance + service-plan publish; `FieldValue.increment()` on counters. This is the single most common SaaS data-corruption category and you've avoided it.
- **Stripe webhook signing** is correct (`billing/webhook/route.ts:102-106`).
- **Cron secret comparison is timing-safe** where the env var exists (`safe-compare.ts`); just needs the fail-closed fix from Issue #7.
- **Brand identity is real.** Warm palette, single typeface, coherent component vocabulary. Genuinely refreshing.
- **Onboarding setup guide** with progress and dismissibility is thoughtful product design.
- **Composite Firestore indexes** are defined explicitly, not error-driven.
- **Storage rules deny by default.**
- **Memberships use deterministic IDs** (`{userId}_{churchId}`) — enables rules-based gets without queries.
- **Middleware is intentionally minimal.** Doesn't try to do auth at the Edge where Admin SDK can't run.
- **Skip-to-main link in `src/app/layout.tsx`** — basic a11y hygiene present.
- **`@vercel/analytics` and `speed-insights` integrated** (Gemini).
- **Lazy Firebase Admin initialization** that is Vercel-aware.
- **PROJECT_OVERVIEW.md, ROADMAP.md, SCALING_ASSESSMENT.md, TEST_PLAN.md** exist — documentation discipline well above norm for this stage.

---

## 11. Final answers

### Top 3 highest-risk issues (revised)

1. **Children's check-in PII surface is publicly accessible.** `/api/checkin/lookup` returns child names, photos, allergies, and medical notes given a `church_id` and a phone-last-4 (10⁴ keyspace), gated only by an in-memory rate-limiter that is meaningless on Vercel. `/api/checkin/checkin` and `/register` accept unauthenticated mutations. *(Issues #1 + #10.)*
2. **Firestore rules grant blanket subcollection read to every active member.** Combined with #1, a single approved volunteer account drains the entire church's PII via the client SDK. *(Issue #2.)*
3. **`/api/welcome` is an open Resend relay; production secrets likely in `.env.local`.** Either alone is a reputational and operational fire. *(Issues #3 + #4.)*

### Top 3 highest-leverage improvements

1. **`src/lib/server/authz.ts` + Firestore rule rewrite + Firestore emulator tests.** Single, durable solution that eliminates a class of future regressions across ~150 routes and locks tenant isolation at the database level.
2. **Sentry + structured audit log + Upstash rate limit.** One-week build that converts you from blind to sighted operator and gives you real abuse defense — also a sales asset for procurement conversations.
3. **Server Components for dashboard + transactional outbox for publish→notify.** Two architectural pivots that pay dividends across performance, reliability, and cost as you scale; shared theme is "stop the client doing the server's job."

### Blunt answer to "What would make you hesitate to scale or trust this app in production?"

I would not onboard a third paying church before fixing Issues #1–#4 in §3. The combination of unauthenticated kiosk endpoints returning minors' PII, a Firestore rule that hands every active volunteer the keys to the entire congregation's data, and an open email relay is a breach-class profile. None of it is a heroic engineering effort — the entire critical-class slate is two weeks of focused work. But shipping more features on top of this foundation makes the eventual cleanup worse, and one bad weekend with a curious user dropped from a stage_sync token URL into the system makes it an incident. The bones — types, atomicity, batch writes, Stripe signing, brand, route discipline — are good enough that a 6-week hardening sprint takes this from "impressive beta" to "trustable B2B SaaS." That is the right next milestone, and it should precede any growth marketing.

The control plane needs to catch up to the product surface. After it does, this is a genuinely strong product.

---

*End of v2 audit.*
