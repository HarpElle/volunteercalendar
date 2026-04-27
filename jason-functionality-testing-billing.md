# Functionality Testing — Billing & Subscriptions

End-to-end Stripe integration: tier upgrade, downgrade, refund, cancel, dunning grace, dispute. Live mode is active; treat with care.

## Prerequisites

- Stripe live mode active (✅ from prior sprint)
- Live products + prices created (Starter $29, Growth $69, Pro $119)
- Live webhook endpoint configured at `/api/billing/webhook`
- A real personal credit card you can use + refund yourself
- Budget: ~$5–10 in non-refundable Stripe fees across tests

---

## Test 1 — Free tier creates without a card

**Steps**
1. Sign up a fresh test account (use `you+vc-billing1@gmail.com`)
2. Don't go through any upgrade flow

**Expected**
- Org is on `subscription_tier: free`
- All paid-feature gates show "upgrade to Starter" prompts
- No Stripe customer created yet

**Verify**
| Where | What |
|---|---|
| Firestore `churches/{churchId}` | `subscription_tier: "free"`, no `stripe_customer_id` |
| Stripe Customers | No customer for this church yet |

☐ **Pass / Fail**: ___

---

## Test 2 — Upgrade Free → Starter

**Steps**
1. From the Free org → Account / Billing page → click "Upgrade to Starter"
2. Stripe Checkout loads
3. Use real personal card. Email pre-fills with the church owner's email.
4. Complete checkout

**Expected**
- Redirect back to `/dashboard/billing?success=true`
- Subscription tier flipped to `starter` within seconds
- Receipt email arrives at the church owner's email (might land in junk for new sender domain — see launch plan A.5)

**Verify**
| Where | What | When |
|---|---|---|
| Stripe Payments | New $29 charge listed | Immediately |
| Stripe Customers | New customer with church_id metadata | Immediately |
| Firestore `churches/{churchId}` | `subscription_tier: "starter"`, `stripe_customer_id` set, `stripe_subscription_id` set | Within ~10s |
| Firestore `stripe_processed_events/{event_id}` | New entry for `checkout.session.completed` | Within ~10s |
| Activity page | `billing.subscription_created` entry, sage dot | Within ~10s |
| Email | Stripe receipt + your custom welcome-paid-tier email (if configured) | Within ~1 min |

☐ **Pass / Fail**: ___

---

## Test 3 — Webhook idempotency (replay)

**Steps**
1. From Stripe Dashboard → Developers → Webhooks → your endpoint → Recent events
2. Find the `checkout.session.completed` event from Test 2
3. Click "Resend" / "Replay"

**Expected**
- Webhook returns `{ received: true, duplicate: true }`
- No double-application of the tier flip
- No new entry in Activity (the original is unchanged)

**Verify**
| Where | What |
|---|---|
| Stripe webhook delivery log | Status 200, response body contains `duplicate: true` |
| Activity page | Still only ONE `billing.subscription_created` entry |
| Firestore `churches/{churchId}` | No timestamp changes |

☐ **Pass / Fail**: ___

---

## Test 4 — Upgrade Starter → Growth (in-place)

**Steps**
1. From Customer Portal (linked from billing page) → Update plan
2. Choose Growth → confirm
3. Stripe pro-rates, charges the difference

**Expected**
- Tier flips to `growth` within seconds
- Pro-rated charge appears on Stripe
- `Activity` shows `billing.subscription_updated` with `from_tier: starter, to_tier: growth`

**Verify**
| Where | What |
|---|---|
| Activity | `billing.subscription_updated` entry |
| Firestore `churches/{churchId}` | `subscription_tier: "growth"` |

☐ **Pass / Fail**: ___

---

## Test 5 — Downgrade Growth → Starter (immediate)

**Steps**
1. Customer Portal → Update plan → Starter
2. Confirm

**Expected**
- Tier flips to `starter`
- A `billing.subscription_updated` entry with `from_tier: growth, to_tier: starter`
- Downgrade notification email sent (using your `buildDowngradeNotificationEmail` template)
- `previous_tier` and `tier_changed_at` fields set on the church doc

**Verify**
| Where | What |
|---|---|
| Firestore | `subscription_tier: "starter"`, `previous_tier: "growth"`, `tier_changed_at` set |
| Email | Downgrade notification email |

☐ **Pass / Fail**: ___

---

## Test 6 — Refund yourself

**Steps**
1. Stripe Dashboard → Payments → click the original $29 charge from Test 2
2. Click Refund → full refund → reason: "test transaction"

**Expected**
- Charge marked refunded immediately
- Subscription stays active (Stripe behavior — refund doesn't auto-cancel)
- The card refund clears in 5–10 business days (real bank-side delay, not testable here)

**Verify**
| Where | What |
|---|---|
| Stripe Payments | Charge has refund record |
| Firestore `churches/{churchId}` | Tier UNCHANGED (still on whatever you upgraded to) |

☐ **Pass / Fail**: ___

---

## Test 7 — Cancel via Customer Portal

**Steps**
1. Customer Portal → Cancel subscription → confirm
2. Default behavior: end at end-of-period (your portal config)

**Expected**
- Subscription marked `cancel_at_period_end: true`
- Tier stays paid until period end
- Cancellation reason captured (if you enabled in portal config)
- After period ends (next billing date passes without renewal), Stripe fires `customer.subscription.deleted`
- Tier flips to `free`, `billing.subscription_canceled` audit entry

**For testing the period-end behavior without waiting**:
- In Stripe Dashboard → Subscriptions → Test clocks → advance time past period_end
- Or: cancel immediately via Stripe Dashboard (not Customer Portal) for an instant test

**Verify**
| Where | What |
|---|---|
| Firestore `churches/{churchId}` | After period-end: `subscription_tier: "free"` |
| Activity | `billing.subscription_canceled` entry |

☐ **Pass / Fail**: ___

---

## Test 8 — Failed payment → grace → auto-downgrade (Track C.6)

This tests dunning. The key handler logic: `payment_failed_at` set on first failure → daily dunning cron auto-downgrades after 7 days.

**Steps**
1. From Stripe Dashboard → Customer → set the default payment method to a declining test card: `4000 0000 0000 0002`
2. Wait for the next renewal (or use Stripe Test Clocks to advance time past period_end + invoice trigger)

**Expected at first failure**
- Stripe fires `invoice.payment_failed`
- Your church doc gets `payment_failed_at` set to the failure time
- `Activity` shows `billing.invoice_failed` entry with coral dot

**Expected after 7 days**
- The dunning cron (`/api/cron/dunning`, runs daily at 06:00 UTC) catches this
- Tier flips to `free`
- `Activity` shows `billing.subscription_canceled` with `metadata.reason: "dunning_lapsed"`

**For faster testing**: trigger the cron manually:
```bash
curl -X GET "https://volunteercal.com/api/cron/dunning" \
  -H "Authorization: Bearer $CRON_SECRET"
```
And in Firestore directly, set `payment_failed_at` to 8 days ago on a test church.

**Verify**
| Where | What |
|---|---|
| Firestore `churches/{churchId}` | `payment_failed_at` set on first failure |
| Firestore `churches/{churchId}` (after 7d) | `subscription_tier: "free"`, `previous_tier` recorded |
| Activity | Two entries: `billing.invoice_failed` then `billing.subscription_canceled` |

☐ **Pass / Fail (initial failure logging)**: ___ ☐ **Pass / Fail (auto-downgrade)**: ___

---

## Test 9 — Failed payment recovery clears the flag

**Steps**
1. After a `payment_failed_at` was set in Test 8
2. Update card to a valid test card: `4242 4242 4242 4242`
3. Trigger a successful payment via Stripe (retry the invoice from Stripe dashboard)

**Expected**
- `invoice.payment_succeeded` webhook fires
- `payment_failed_at` cleared on the church doc
- `Activity` shows `billing.invoice_paid` entry (sage dot)
- Dunning cron sees nothing to do for this church

**Verify**
| Where | What |
|---|---|
| Firestore `churches/{churchId}` | `payment_failed_at: null`, `payment_failed_invoice_id: null` |
| Activity | `billing.invoice_paid` entry |

☐ **Pass / Fail**: ___

---

## Test 10 — Dispute / chargeback hook (Track C.10)

Hard to test with a real card without contacting Stripe support. Use Stripe's test mode if you want to exercise the path:

**Steps** (test mode only)
1. Switch Stripe to Test mode temporarily
2. Use the dispute test card: `4000 0000 0000 0259` (creates a charge that immediately disputes)
3. Watch the webhook fire `charge.dispute.created`

**Expected**
- Church doc gets `dispute_pending_at`, `dispute_id`, `dispute_reason`, `dispute_amount_cents` set
- `Activity` shows `billing.dispute_created` entry
- NO auto-cancellation — humans decide

**Verify**
| Where | What |
|---|---|
| Firestore `churches/{churchId}` | Dispute fields populated |
| Activity | `billing.dispute_created` entry |

**Note**: in production with real customers, you'd manually freeze the church's paid features here (e.g., block new check-ins until the dispute is resolved). That manual step is intentional — false-positive disputes shouldn't kill a customer's app immediately.

☐ **Pass / Fail**: ___ (skip if you don't want to switch to test mode)

---

## Test 11 — Tier enforcement on paid features (Track C.5)

For each paid feature, try to use it from a Free-tier org:

**Steps**
1. Ensure your test org is back on Free tier
2. Try to:
   - Create a 6th team (Starter limit: 5)
   - Create a short link (Starter+)
   - Enable check-in (Growth+)
   - Enable rooms (Starter+)
   - Add ProPresenter export (Growth+)

**Expected**
- Each blocked with a tier-upgrade prompt
- API responses are 403 with tier-limit messages
- UI doesn't even let you submit forms

☐ **Pass / Fail**: ___

---

## Test 12 — Annual billing (Phase 2)

If you've added annual prices to your Stripe products:
- Test upgrading via the annual price
- Test the prorated upgrade from monthly to annual
- Verify the annual receipt mentions the term

Skip if annual prices weren't added.

☐ **Pass / Fail**: ___

---

## Failure modes to watch

- **Tier doesn't flip after upgrade** — webhook didn't fire OR the metadata mismatch happened. Check Stripe webhook delivery log; should be 200.
- **Tier flipped but church_id metadata is wrong** — bug in checkout-session creation. The `metadata: { church_id, tier }` must be set on both `session` and `subscription_data.metadata`.
- **Receipt email lands in spam every time** — known Stripe deliverability issue for new merchants. Improves over time. See SHOULD_DO.md for the custom-domain receipt option.
- **Customer Portal returns "Configuration not found"** — portal config not saved in Live mode. Re-check `dashboard.stripe.com/settings/billing/portal`.
- **Same tier upgrade applied twice** — webhook idempotency broken. Tell me.
- **payment_failed_at never clears** — the `invoice.payment_succeeded` handler isn't firing or isn't matching church_id. Check webhook log.

## What I can't test for you

- Real card processing latency (network → Stripe → bank)
- Real refund timing (5-10 business days back to your card)
- Stripe's anti-fraud rules triggering on unusual patterns
- Real chargebacks from a real bank
- Tax computation correctness in your specific state(s)
