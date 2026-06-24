# Billing Module

Stripe-backed billing with subscription management, a customer portal, one-time payments, and a locally-managed product catalog.

---

## Setup

### 1. Add Stripe keys to `core/backend/.env`

```env
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_SUCCESS_URL=http://localhost:5173/billing/success
STRIPE_CANCEL_URL=http://localhost:5173/billing/pricing
```

Get these from the [Stripe Dashboard](https://dashboard.stripe.com/apikeys).  
Use `sk_test_` / `pk_test_` keys for development and `sk_live_` / `pk_live_` for production.

### 2. Run migrations

```bash
python manage.py migrate
```

### 3. Set up the Stripe webhook (local development)

Install the [Stripe CLI](https://stripe.com/docs/stripe-cli), then forward events to your local server:

```bash
stripe listen --forward-to localhost:8000/api/billing/webhook/
```

The CLI prints a webhook signing secret (`whsec_...`) — use that as `STRIPE_WEBHOOK_SECRET` in `.env`.

For production, create a webhook endpoint in the Stripe Dashboard pointing to `https://yourdomain.com/api/billing/webhook/` and subscribe to:

- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`

---

## Managing Products

Products are managed through the Django admin at `/admin/billing/product/`.

| Field | Description |
|---|---|
| **Name** | Display name (slug is auto-populated) |
| **Description** | Short tagline shown under the title |
| **Thumbnail** | URL of a product image (16:9 recommended) |
| **Features** | JSON array of feature strings, e.g. `["Unlimited users", "5GB storage"]` |
| **Stripe Price ID** | The `price_xxx` ID from your Stripe Dashboard — used to initiate checkout |
| **Amount** | Price in cents, e.g. `1999` for $19.99 |
| **Currency** | 3-letter code, e.g. `usd` |
| **Interval** | `month`, `year`, or blank for one-time payments |
| **Sort Order** | Controls display order on the pricing page (lower = first) |
| **Is Active** | Uncheck to hide a product without deleting it |

To find the Stripe Price ID: Stripe Dashboard → Products → select a product → copy the Price ID (`price_...`) from the Pricing section.

---

## API Endpoints

All endpoints are under `/api/billing/`.

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `products/` | Public | List active products from the local catalog |
| `GET` | `prices/` | Public | List active prices directly from Stripe |
| `POST` | `checkout/` | Required | Create a Stripe Checkout session; returns `{ url }` |
| `GET` | `subscription/` | Required | Get the current user's subscription status |
| `POST` | `portal/` | Required | Open the Stripe Billing Portal; returns `{ url }` |
| `POST` | `webhook/` | Public (signed) | Receive Stripe webhook events |

`checkout/` accepts `{ price_id, mode }` where `mode` is `subscription` (default) or `payment`.

---

## Signals

Listen to these signals to react to billing events in other modules:

```python
from billing.signals import checkout_completed, subscription_activated, subscription_cancelled

# Fired when a Stripe Checkout session completes
checkout_completed.send(sender=..., user=user, session=session)

# Fired when a subscription is created or updated
subscription_activated.send(sender=..., user=user, subscription=subscription)

# Fired when a subscription is deleted/cancelled
subscription_cancelled.send(sender=..., user=user, subscription=subscription)
```
