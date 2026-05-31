# Next.js 16 app-router bundler bug: `[param]/static/[param]/route.ts` corrupts unrelated Vercel function bundles

## TL;DR

A `route.ts` file at a path of the shape `[param]/static-literal/[param]/route.ts` (two dynamic segments separated by a literal segment) causes EVERY Firebase-backed Vercel function in the same deployment to hang ~30 seconds at cold start with zero response bytes — including functions that don't import the offending route. Reverting the file restores service.

We reproduced the bug with a 3-line empty handler at exactly that path. Workaround: flatten to a single dynamic segment with the other ID moved to the request body.

This doc is the seed for an upstream Next.js GitHub issue. It captures the bisect evidence so it can be filed with high signal.

## Environment

- **Next.js:** 16.1.7
- **App router:** yes (this is an app-router route handler bug)
- **Hosting:** Vercel (production deployment)
- **Runtime:** Node (serverless functions)
- **Other relevant:** `withSentryConfig` for source-map upload at build (may be relevant — see "Theories ruled out" below)

## Repro

The offending path pattern (from our incident, anonymized):

```
src/app/api/admin/checkin/children/[personId]/authorized-pickups/[pickupId]/route.ts
                                ^^^^^^^^^^^^                       ^^^^^^^^^^
                                dynamic #1                         dynamic #2
                                            ^^^^^^^^^^^^^^^^^^^^^
                                            literal segment between them
```

The reproducing minimal case (PR #154 in our repo, since reverted):

```ts
// src/app/api/admin/checkin/children/[personId]/authorized-pickups/[pickupId]/route.ts
export async function GET() {
  return new Response(null, { status: 204 });
}
```

That three-line file alone, shipped to production, caused:

- `GET /api/og?title=Probe` (no Firebase imports) → still 200 OK (~300ms)
- `GET /api/church-info?id=ABC123` (independent file, doesn't import the new route) → HANG, 30s timeout, 0 bytes
- `GET /api/platform/stats` (independent file, Firebase Admin) → HANG, 30s timeout, 0 bytes

Reverting the file → service restored on next deploy.

## Bisect path (our timeline)

1. PR #146 (`176ef9a`) — full P0-2 households-UI sub-PR shipped. ~12 new files including 8 new `route.ts` handlers under `/api/admin/checkin/children/[personId]/...` and `/api/admin/checkin/blocked-pickups/...`. Production: ALL Firebase routes hung. Emergency revert (PR #147 / `ef8def2`).
2. Ruled out: env var changes, `firebase-admin` SDK changes, `package.json` drift, `vercel.json` changes, `middleware.ts` changes, Vercel platform issue (cache-busted redeploy of `176ef9a` did not restore service; reverting code did).
3. Hypothesized: 2-level dynamic-segment nesting in the new admin routes — no other route in the repo had two `[param]` segments. PR #154 shipped ONE three-line empty file at exactly the suspected path and reproduced the hang.
4. PR #155 reverted the empty file; service restored.
5. Workaround designed: flatten to `authorized-pickups/[id]/route.ts` and move `child_id` to the request body. Four follow-up PRs (#156, #157, #158, plus subsequent E/F/G work) re-shipped the original P0-2 functionality on the flat path with zero recurrence.

## Theories ruled out

Detailed evidence in our internal STATUS doc; the short list:

- **Cold-start init of `firebase-admin`** — would only affect routes that import it; `/api/og` was fine.
- **Sentry source-map upload (`withSentryConfig`)** — the bug reproduced with the 3-line empty file that has no Sentry-instrumentable code, so source maps are not the proximate cause. (Sentry instrumentation may still be involved as an aggravating factor — see "Possible mechanism" below.)
- **`firestore.rules` or storage rules changes** — these don't affect the function bundle.
- **Vercel platform coincidence** — re-deploying the bad SHA without code changes did not restore service; reverting the code did. So it's deterministic, not environmental.
- **2-level dynamic-segment routes in general** — `[param]/[param]/route.ts` (no literal between) is fine in our codebase. The bug specifically wants a literal segment between two dynamics.

## Possible mechanism (speculative — for an issue filer to refute or refine)

The Next.js app-router bundler walks the `app/` directory and emits per-route function bundles. There's a shared layer (Sentry instrumentation, the server runtime, the Firestore Admin SDK static analysis). Our hypothesis is that the `[param]/static/[param]/route.ts` shape triggers a code-path in the bundler that produces a malformed shared chunk — one that the Firebase Admin SDK's lazy init walks during cold start and that hangs forever (e.g. circular `await` or never-resolving Promise).

We can't prove this without a debug build of Next.js or Vercel server logs. But:
- The bug is global (touches functions that don't import the new route) → shared layer.
- The bug is structural (a 3-line empty file reproduces) → not user-code-driven.
- The bug is shape-specific (`[param]/[param]/route.ts` is fine; `[param]/literal/[param]/route.ts` is not) → routing-table or path-pattern code, not bundle-content code.

## Workaround

Flatten the route to a single dynamic segment. Move the other ID into:
- the request body (POST/PATCH/DELETE), or
- a query string parameter (GET), or
- a path segment further up the tree where it sits next to a different literal.

Concretely: `[a]/literal/[b]/route.ts` → `literal/[b]/route.ts` + `a` in body/query.

This costs nothing semantically — the gate/auth/validation logic is identical, only the URL shape changes — but Next.js needs to handle the original shape correctly. The bug is reproducible enough that we feel confident filing it upstream.

## Status

- Open as of 2026-05-31 against Next.js 16.1.7
- Not yet filed with the Next.js maintainers — Jason will submit when convenient (task #31)
- All our P0-2 work shipped against the flat-path workaround; no recurrence

## Steps for an upstream issue

1. Confirm with `npx create-next-app@latest --typescript` (Next 16.x) that a minimal repro on Vercel reproduces.
2. File at https://github.com/vercel/next.js/issues with this writeup + the repro repo URL.
3. Tag `area: app-router` and `area: build`.
4. Reference Vercel deployment logs if Vercel support can attach them.
