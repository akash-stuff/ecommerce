# Razorpay setup

The code is written and tested against Razorpay's documented contract, but it has
never run against live credentials — order creation calls their API, and that
call has only ever been exercised with the signature-verification tests. Treat
the first test-mode payment as the real integration test.

---

## What is already built

| Piece | Where | State |
|---|---|---|
| Order creation (`/v1/orders`) | `providers/razorpay.provider.ts` | Written, unverified against the live API |
| Webhook signature verification | same | Tested — timing-safe HMAC-SHA256 over the raw body |
| Replay protection | `payments.service.ts` | Tested — `WebhookEvent` unique on `(provider, eventId)` |
| Amount tamper check | same | Tested — refuses if the provider's amount ≠ the order's |
| `payment.captured` / `payment.failed` handling | same | Written |

What is **not** built: refunds through the API, saved cards, subscriptions, and
the storefront's "Pay online" button, which is currently disabled because no
gateway was configured.

---

## 1. Create the account

Sign up at [razorpay.com](https://razorpay.com). You get test mode immediately;
live mode needs KYC (PAN, bank account, business proof) and takes a few days.
Do everything below in **test mode** first.

---

## 2. Get the API keys

Dashboard → **Settings → API Keys → Generate Test Key**.

You get a key id (`rzp_test_…`) and a secret. The secret is shown **once**.

Add to `.env.production`:

```bash
RAZORPAY_KEY_ID=rzp_test_xxxxxxxxxxxx
RAZORPAY_KEY_SECRET=xxxxxxxxxxxxxxxxxxxxxxxx
```

> These are platform-wide, not per tenant. Every store's payments settle into
> *your* Razorpay account, and you pay out to tenants yourself. If you want
> money to land directly in each tenant's own account, that is Razorpay Route
> and it is a different integration — see [Marketplace payments](#marketplace-payments-razorpay-route).

---

## 3. Configure the webhook

Dashboard → **Settings → Webhooks → Add New Webhook**.

| Field | Value |
|---|---|
| Webhook URL | `https://admin.mystore.com/api/v1/payments/webhook/razorpay` |
| Secret | Generate a long random string — `openssl rand -hex 32` |
| Active events | `payment.captured`, `payment.failed` |

Add the same secret to `.env.production`:

```bash
RAZORPAY_WEBHOOK_SECRET=<the string you generated>
```

Restart so the API picks it up:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production up -d backend
```

> **The URL must be a hostname the API answers on.** Use your admin host, not a
> tenant's storefront — the webhook carries no tenant hostname and the order is
> found by its Razorpay reference instead.

> **The secret is the authentication.** The webhook route is `@Public` because
> Razorpay cannot hold a token; the HMAC signature is what proves the request
> came from them. If `RAZORPAY_WEBHOOK_SECRET` is unset, every webhook is
> rejected rather than trusted.

---

## 4. Enable the storefront button

`Checkout.tsx` currently disables **Pay online** with the hint "Not configured
for this store yet". Once keys are set, that hint is wrong.

The remaining work is the browser half: load Razorpay's checkout script, open it
with the `clientPayload` that `POST /api/v1/payments/initiate` already returns,
and let the webhook confirm the order. That is roughly half a session of work
and has not been done — the button stays disabled until it is.

**Do not mark the order paid from the browser callback.** The webhook is the
authority. A client-side "payment succeeded" message is a claim from an
untrusted source; the current design ignores it deliberately.

---

## 5. Test a payment

Razorpay's test cards:

| Card | Result |
|---|---|
| `4111 1111 1111 1111` | Success |
| `5104 0600 0000 0008` | Success (Mastercard) |
| `4000 0000 0000 0002` | Failure |

Any future expiry, any CVV, OTP `1234`.

**Check the whole chain, not just the payment:**

```bash
# 1. Razorpay says it captured — Dashboard → Transactions

# 2. The webhook arrived and verified
docker compose -f docker-compose.prod.yml logs backend | grep -i razorpay

# 3. The order actually moved
#    paymentStatus should be PAID, and a Payment row should exist
```

A captured payment in Razorpay's dashboard with an order still `PENDING` in yours
means the webhook is not arriving. Razorpay's dashboard has a webhook delivery
log with the response it got — check there first.

---

## 6. Going live

Only after a successful test-mode payment end to end.

1. Complete KYC and get live mode activated.
2. Generate **live** API keys — `rzp_live_…`.
3. Create a **separate** webhook for live mode with its own secret. Test and
   live webhooks are configured independently and do not share secrets.
4. Update all three environment variables and restart.
5. Make one real payment with a real card for a small amount, then refund it
   from Razorpay's dashboard.

**Keep test and live keys in different files.** A `rzp_test_` key in production
fails loudly, which is fine. A `rzp_live_` key in staging takes real money from
whoever is testing, which is not.

---

## How the money flow actually works

```
Customer pays ──▶ Razorpay ──▶ your Razorpay account
                                      │
                                      ▼
                        settled to your bank in T+2/T+3
                                      │
                                      ▼
                        you pay each tenant their share
```

Two consequences worth being clear about before you sell this to anyone:

- **You are holding other people's money.** Depending on where you operate this
  may have regulatory implications. Worth a conversation with an accountant
  before onboarding paying tenants.
- **Refunds come out of your balance**, whichever store issued them.

### Marketplace payments (Razorpay Route)

Razorpay Route splits a payment between your account and a tenant's at capture
time, so funds never pool in yours. It needs each tenant onboarded as a linked
account with their own KYC, and the `transfers` array added to order creation.

It is the right model for a real multi-tenant marketplace and it is **not built**.
The current single-account flow is simpler and fine for a first launch with a
handful of stores you know.

---

## Cash on delivery

COD works today with no gateway at all, and is what the demo uses. There is no
external call: the order is created `PENDING`, and someone marks the cash
collected from the order screen in the admin, which is COD's equivalent of a
webhook. If you want to launch before Razorpay is ready, COD alone is enough.

---

## Troubleshooting

| Symptom | Where to look |
|---|---|
| `Webhook signature did not verify` | Secret mismatch between dashboard and env. Regenerate both. |
| Webhook returns 200 but nothing changes | Already-processed event — replay protection working as intended |
| `Amount mismatch` in logs | The order total changed after payment started. Investigate; do not "fix" by removing the check. |
| Razorpay order creation fails | Wrong key id/secret pair, or amount below their minimum (₹1) |
| Nothing arrives at all | URL not publicly reachable, or events not selected on the webhook |

The signature check reads the **raw request body** — `main.ts` creates the Nest
app with `rawBody: true` for exactly this reason. If you add any middleware that
re-serialises JSON before the webhook route, the bytes change and every signature
fails. That is the first thing to suspect if signatures start failing after an
otherwise unrelated change.
