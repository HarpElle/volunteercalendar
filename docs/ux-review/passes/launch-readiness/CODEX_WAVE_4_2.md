# Codex Retest — Wave 4.2 (TOTP MFA opt-in with recovery codes)

> PR #115 (will land at commit X after merge). Verify after Vercel deploys the merge (2–5 min).
>
> **Auth-touching PR — Jason should eyeball the UI flow before sending to Codex.**

---

## What's in this PR

Firebase TOTP MFA + recovery codes layered on top (Firebase doesn't include recovery codes natively). Free for everyone, every-sign-in challenge.

7 new locations:
- `/api/account/mfa/recovery-codes` POST + DELETE — authed
- `/api/account/mfa/verify-recovery-code` POST — **unauthed**, rate-limited
- Account → Security card on `/dashboard/account`
- 3-step enrollment modal
- Disable modal (password + current MFA code re-auth)
- Sign-in challenge modal (TOTP + recovery-code fallback)
- 4 new AuditActions: `auth.mfa_enrolled`, `auth.mfa_disabled`, `auth.mfa_recovery_codes_regenerated`, `auth.mfa_recovery_code_used`

Firestore: new `user_recovery_codes/{uid}` collection — deny-client rule (server-only via Admin SDK).

---

## Scope of regression checks

### 1. Account → Security card behaviour

Use a throwaway test account. Sign in, navigate to `/dashboard/account`.

| # | Setup | Expected |
|---|-------|----------|
| 1.1 | Account with no MFA enrolled | Card shows "Off" badge + "Enable" button. No Regenerate/Disable buttons visible. |
| 1.2 | Account with MFA enrolled | Card shows "Enabled" badge + Regenerate + Disable buttons. No Enable button. |
| 1.3 | Click Enable → modal opens | Step 1: QR code renders (192px SVG). Manual secret expandable below. |
| 1.4 | Click "I've scanned the code" | Step 2: 6-digit code input with `inputMode="numeric"` + `autoComplete="one-time-code"`. |
| 1.5 | Enter wrong code → Verify & enable | Error: "That code didn't work. Try the next one your app shows." Modal stays open. |
| 1.6 | Enter correct code → Verify & enable | Step 3: 8 recovery codes in 2-col grid. Red warning banner. Checkbox. "Done" is disabled. |
| 1.7 | Click Copy All | Toast/button text flips to "Copied!" for 2s; clipboard has 8 codes separated by newlines. |
| 1.8 | Click Download .txt | File `volunteercal-recovery-codes.txt` downloads with formatted content + 8 codes. |
| 1.9 | Try to close modal (X or click overlay) without ticking checkbox | Confirm dialog: "Close without confirming you saved the recovery codes?" |
| 1.10 | Tick checkbox → Done enables → click | Modal closes; card now shows "Enabled" badge. |

### 2. Sign-in MFA challenge

| # | Setup | Expected |
|---|-------|----------|
| 2.1 | Sign out, sign back in with correct password | MFA challenge modal opens with "Verification code" input. No error banner. |
| 2.2 | Enter correct 6-digit code → Verify | Modal closes, redirected to `/dashboard`. |
| 2.3 | Enter wrong code → Verify | Error: "That code didn't work. Try the next one your app shows." Modal stays. |
| 2.4 | Click "Lost your phone? Use a recovery code" | Modal switches to recovery-code mode. Input is text, not numeric. |
| 2.5 | Click "Back to authenticator code" | Modal switches back to TOTP. State preserved nicely. |
| 2.6 | Submit a recovery code | On success: client retries password sign-in, lands on dashboard. MFA is now disabled. |
| 2.7 | After 2.6, /dashboard/account → Security card shows "Off" again | (Recovery-code use disables MFA per design — user should re-enroll.) |

### 3. Disable flow

| # | Setup | Expected |
|---|-------|----------|
| 3.1 | Re-enable MFA, then click Disable in the card | Modal: password input + 6-digit MFA code input. Red advisory banner. |
| 3.2 | Wrong password + correct code | Error: "Password is incorrect." |
| 3.3 | Correct password + wrong code | Error: "That code didn't work. Try the next one your app shows." |
| 3.4 | Both correct → Disable MFA | Modal closes. Card shows "Off". Firebase MFA is unenrolled (sign-out + sign-in should not challenge). |

### 4. Regenerate codes

| # | Setup | Expected |
|---|-------|----------|
| 4.1 | MFA enrolled, click Regenerate codes | Browser confirm: "Generate fresh recovery codes? Your existing codes will stop working immediately." |
| 4.2 | Confirm | Fresh 8 codes appear inline in the card (below the buttons). "I've saved them" button appears. |
| 4.3 | Previously-saved codes from enrollment should no longer work in the sign-in flow | Test: regenerate, sign out, sign in, use one of the OLD codes via recovery flow → "Recovery code not recognized" |

### 5. Endpoint behavior (curl with real Firebase tokens)

| # | Endpoint | Auth | Expected |
|---|----------|------|----------|
| 5.1 | POST /api/account/mfa/recovery-codes `{action:"enroll"}` | No bearer | 401 |
| 5.2 | Same | Bearer token | 200, `{ codes: string[8] }`, each matches `^[A-Z0-9]{5}-[A-Z0-9]{5}$` |
| 5.3 | POST same with `{action:"invalid"}` | Bearer | 400 |
| 5.4 | DELETE /api/account/mfa/recovery-codes | Bearer | 200, `user_recovery_codes/{uid}` doc gone, audit row written |
| 5.5 | POST /api/account/mfa/verify-recovery-code with valid email + valid code | None | 200, MFA disabled, doc wiped |
| 5.6 | Same with valid email + wrong code | None | 422, `{ error: "invalid" }` |
| 5.7 | Same with ghost email | None | 422 with **identical** error to 5.6 (no account enumeration) |
| 5.8 | Repeat 5.6 six times from same IP, same email | None | 6th call returns 429 (5/email/hr rate limit) |
| 5.9 | `user_recovery_codes` direct client read attempt via Firestore SDK | Signed-in user | Denied by rules — even the user's own doc isn't readable client-side |

### 6. Audit emissions (verify via /dashboard/settings/activity)

| Action performed | Expected audit row |
|---|---|
| Complete MFA enrollment (including recovery codes save) | `auth.mfa_enrolled` with `code_count: 8` |
| Disable MFA from Account card | `auth.mfa_disabled` with `metadata.path: "user_disabled"` |
| Regenerate recovery codes | `auth.mfa_recovery_codes_regenerated` |
| Use a recovery code at sign-in | TWO rows: `auth.mfa_recovery_code_used` + `auth.mfa_disabled` with `metadata.path: "recovery_code_used"` |

### 7. Known intentional behaviors (don't flag)

- **No tier gate** — MFA is free at every tier (Free → Enterprise).
- **No SMS option** — TOTP only per Wave 4.2 decision (SIM-swap risk).
- **Recovery-code use ALWAYS disables MFA** — the user re-enrolls after. Simpler than partial state.
- **`auth/requires-recent-login`** during enrollment is surfaced as a sign-out-and-back-in instruction. Not a bug.
- **Sign-in retry after recovery** — recovery success doesn't auto-navigate; client re-attempts the original signIn (no MFA challenge this time). Sub-second.
- **Same modal for enroll + regenerate codes display** — `RecoveryCodesDisplay` component. Reuse is intentional.
- **`user_recovery_codes` collection is deny-client** — even the user's own doc isn't readable from the browser. All access flows through `/api/account/mfa/*`.

### 8. Severity rubric

- **Sev 1**: MFA bypass (sign in without challenge when enrolled), recovery code from User A works on User B's account, unauthed call to `/api/account/mfa/recovery-codes` succeeds, account enumeration via verify-recovery-code error variance
- **Sev 2**: enrollment succeeds but recovery codes never persist (or vice versa), recovery code persists after successful use (replay possible), Firebase MFA fails to unenroll on disable, audit row missing
- **Sev 3**: UI shows wrong enrolled state, regenerate doesn't invalidate old codes, "use recovery code" toggle in challenge modal doesn't switch back cleanly
- **Sev 4**: copy/download fails on a specific browser, QR rendering size off, modal layout glitch on mobile

---

## Save results to

`docs/ux-review/passes/launch-readiness/CODEX_WAVE_4_2_RESULTS.md`

This PR has more user-facing surface than the other Wave 4 PRs. Manual + scripted retest combined.
