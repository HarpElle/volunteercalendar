# Functionality Testing — Onboarding

Everything from "user signs up" through "they have access to the right things in the right org."

## Prerequisites

- Production deployed with the latest commits (✅)
- You have a fresh email alias for test signups. Recommended: Gmail's `+suffix` trick (`yourname+vctest1@gmail.com`, `+vctest2@gmail.com`, etc.) — they all route to your inbox but Firebase treats them as different accounts.
- You're logged out of any prior test sessions in incognito.

---

## Test 1 — Self-signup creates a new owner

**Steps**
1. Open incognito window → <https://volunteercal.com>
2. Click **Start Free Today** (or **Sign Up**)
3. Use email `you+vc-onboard1@gmail.com`, full name, real phone (your own — used for SMS later)
4. Submit. Wait for the dashboard to load.

**Expected**
- Dashboard renders, not the login page
- "Setup guide" panel visible with step 1 ("Set up your organization") complete and step 2 ("Create a team") highlighted
- Inbox: welcome email arrives within ~30 seconds (check spam if missing)

**Verify**
| Where | What to check |
|---|---|
| Firestore `users/{uid}` | Doc exists with email + display_name |
| Firestore `churches/{uid}` | New church doc with `subscription_tier: "free"` and `created_at` matching now |
| Firestore `memberships/{uid}_{uid}` | Status `active`, role `owner` |
| Activity page (`/dashboard/org/activity`) | _Will not show org.create yet — that hook fires only on org-delete; signup audit is membership-level pending Track D server migration_ |
| Email | Welcome email from `noreply@harpelle.com` |

☐ **Pass / Fail**: ___ Notes: ___

---

## Test 2 — Sign in / sign out / sign back in

**Steps**
1. From the test account: click your avatar → Sign out
2. Verify you're on `/login`
3. Sign back in with the same credentials

**Expected**
- Sign-out redirects to `/login` cleanly
- No stale dashboard shell flashes
- Sign-in lands you back on `/dashboard` with all your prior org data

**Failure mode to watch for**
- If the sign-out leaves you on a half-loaded dashboard or the sign-back-in shows the wrong org → service worker cache issue. Tell me, that's a regression.

☐ **Pass / Fail**: ___

---

## Test 3 — Create a team (ministry)

**Steps**
1. From dashboard → Setup guide → "Create a team" → click into Teams
2. Add a team named "Worship" with description and color
3. Save

**Expected**
- Team appears in the list
- Setup guide step 2 marked complete
- Repeat 3 more times: Tech, Children, Greeters, Hospitality. End with 5 teams.

**Verify**
| Where | What |
|---|---|
| Firestore `churches/{churchId}/ministries` | 5 docs, one per team, each with `name`, `created_at` |

☐ **Pass / Fail**: ___

---

## Test 4 — Generate a join link

**Steps**
1. People → Invites tab (or wherever join links live in your dashboard)
2. Generate a join link for the org
3. Copy the URL (looks like `/join/{churchId}?token=xxx`)

**Expected**
- Join URL displayed and copyable
- Link is shareable / publicly resolvable in incognito

☐ **Pass / Fail**: ___

---

## Test 5 — Volunteer self-signup via join link

**Steps**
1. New incognito window → paste join URL from Test 4
2. Click "Sign up to join" with email `you+vc-vol1@gmail.com`
3. Complete sign-up
4. After registration, you should land on a "pending approval" or "welcome" screen

**Expected**
- Membership created in `pending_org_approval` status
- Owner (your Test 1 account) sees a notification banner: "1 person waiting for approval"

**Verify**
| Where | What |
|---|---|
| Firestore `memberships/{newUid}_{churchId}` | Doc exists, status `pending_org_approval`, role `volunteer` |
| Owner dashboard | Approval banner visible |

☐ **Pass / Fail**: ___

---

## Test 6 — Owner approves the volunteer

**Steps**
1. From owner account → click the approval banner OR navigate to Memberships
2. Find the pending volunteer
3. Click Approve

**Expected**
- Status flips to `active`
- Volunteer can now log in and see the dashboard scoped to that church
- Welcome-to-org email arrives at the volunteer's inbox

**Verify**
| Where | What |
|---|---|
| Firestore `memberships/{volUid}_{churchId}` | Status flipped to `active` |
| Firestore `churches/{churchId}/people` | A `people` doc was created for this volunteer (auto-sync runs on next dashboard load) |
| Volunteer's email | Welcome-to-org email |
| Activity page | Approval action — _Phase 2: appears once Track D membership server migration lands_ |

☐ **Pass / Fail**: ___

---

## Test 7 — Admin invites a volunteer by email

**Steps**
1. From owner → invite a new volunteer by email: `you+vc-vol2@gmail.com`
2. The new email gets an invitation
3. Open the invite link in a third incognito window
4. Sign up

**Expected**
- Status starts at `pending_volunteer_approval`
- After signup, status flips to `active` automatically (no admin approval needed for invited users)
- Volunteer lands on the dashboard

**Verify**
| Where | What |
|---|---|
| Email `you+vc-vol2@gmail.com` | Invitation email |
| Firestore `memberships/...` | Goes from `pending_volunteer_approval` → `active` after the invitee signs up |

☐ **Pass / Fail**: ___

---

## Test 8 — Multi-org membership

**Steps**
1. Create a second org from the volunteer account (Test 5's volunteer): they're a member of org-1, now own org-2
2. Verify they can switch between orgs in the sidebar
3. Switch to org-2 — confirm they see only org-2 data (no leakage from org-1)

**Expected**
- Org switcher in sidebar shows both
- Switching changes context cleanly
- Dashboard data, schedules, people, etc. are all scoped to the active org

**Verify**
| Where | What |
|---|---|
| Firestore `memberships/{uid}_{org1}` and `memberships/{uid}_{org2}` | Both exist with appropriate roles |
| URL after switching | No data from the other org appears |

☐ **Pass / Fail**: ___

---

## Test 9 — Promote a volunteer to admin

**Steps**
1. From owner of org-1 → People → find your `+vc-vol1` volunteer → change role to **admin**
2. From the volunteer's account in their other window → refresh the dashboard

**Expected**
- Volunteer now sees admin-only sidebar items (Settings, Activity, Platform Feedback link, etc.)
- They can edit teams, view all volunteers, change settings

**Verify**
| Where | What |
|---|---|
| Firestore `memberships/{volUid}_{org1}` | `role` field flipped from `volunteer` → `admin` |
| Volunteer's sidebar | Settings menu now visible |

☐ **Pass / Fail**: ___

---

## Test 10 — Demote / remove a volunteer

**Steps**
1. Owner → People → demote `+vc-vol1` back to volunteer
2. Owner → People → remove `+vc-vol2` entirely

**Expected**
- `+vc-vol1`'s sidebar collapses back to volunteer-only items
- `+vc-vol2` loses access; their dashboard either shows "No Organization" or they see an "access removed" message

**Verify**
| Where | What |
|---|---|
| `memberships/{vol1Uid}_{org1}` | Role reverted to `volunteer` |
| `memberships/{vol2Uid}_{org1}` | Either deleted entirely or status `inactive` |

☐ **Pass / Fail**: ___

---

## Failure modes to specifically watch

- **Spinner-stuck dashboard** after creating a team or saving settings → service worker still caching authenticated nav. Force a hard refresh (Cmd+Shift+R) and tell me if it persists.
- **"Account already exists" error** during signup that comes after a long pause → the account WAS created but UI didn't reflect it. Try logging in. Document the timing if it happens.
- **Welcome email lands in junk** → expected for Yahoo, possible for Outlook. Mark "not junk" and proceed.
- **Wrong org shown after switching** → tell me immediately. That's a tenant-isolation regression.

## What I can't test for you

- The actual email-arrival timing (depends on Resend deliverability)
- Whether the join URL renders well in iMessage / WhatsApp previews
- Whether the password-reset email actually triggers (you'd need to receive it)
