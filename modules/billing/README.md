# Billing Module

Stripe-backed billing with subscription management, a customer portal, one-time payments, a locally-managed product catalog, and a per-machine software license system.

---

## Setup

### 1. Add Stripe and license keys to `core/backend/.env`

```env
# Stripe
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_SUCCESS_URL=http://localhost:5173/billing/checkout/success
STRIPE_CANCEL_URL=http://localhost:5173/billing/pricing

# License system
LICENSE_APP_SECRET=replace-with-long-random-secret
LICENSE_RSA_PRIVATE_KEY_PATH=/path/to/license_private.pem
LICENSE_RSA_PUBLIC_KEY_PATH=/path/to/license_public.pem
LICENSE_DEFAULT_MAX_MACHINES=1
LICENSE_DEFAULT_OFFLINE_TTL_DAYS=30
```

Add the Stripe publishable key to `core/frontend/.env`:

```env
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_...
```

Get Stripe keys from the [Stripe Dashboard](https://dashboard.stripe.com/apikeys). Use `sk_test_` / `pk_test_` for development and `sk_live_` / `pk_live_` for production.

### 2. Generate the RSA keypair for license tokens

```bash
openssl genrsa -out license_private.pem 2048
openssl rsa -in license_private.pem -pubout -out license_public.pem
```

Set `LICENSE_RSA_PRIVATE_KEY_PATH` and `LICENSE_RSA_PUBLIC_KEY_PATH` in `.env` to the absolute paths of these files.

### 3. Run migrations

```bash
python core/backend/manage.py migrate
```

### 4. Set up the Stripe webhook (local development)

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
- `payment_intent.succeeded`
- `payment_intent.payment_failed`
- `invoice.payment_action_required`

---

## Managing Products

Products are managed through the Django admin at `/admin/billing/product/`.

| Field | Description |
|---|---|
| **Name** | Display name (slug is auto-populated) |
| **Description** | Short tagline shown under the title |
| **Fulfillment type** | `digital` or `physical` |
| **Stripe Product ID** | Auto-populated when you use the admin sync action; do not set by hand |
| **Features** | JSON array of feature strings, e.g. `["Unlimited users", "5GB storage"]` |
| **Sort Order** | Controls display order on the pricing page (lower = first) |
| **Is Active** | Uncheck to hide a product without deleting it |

Each product can have multiple **ProductPrice** records (managed inline in the admin):

| Field | Description |
|---|---|
| **Price type** | `one_time` or `recurring` |
| **Interval** | `week`, `month`, or `year` (recurring only) |
| **Amount** | Price in cents, e.g. `1999` for $19.99 |
| **Currency** | 3-letter code, e.g. `usd` |
| **Stripe Price ID** | Auto-populated when the price is created via the admin API |

To push a product to Stripe and create a Stripe Price, use the **Admin Billing** page in the frontend (`/billing/admin`) or the admin API described below. Prices cannot be edited in Stripe once created — archive and recreate instead.

---

## Subscription System

### How it works

Stripe is the source of truth for payment state. The module mirrors subscription data locally so other parts of the app can check it without hitting the Stripe API.

```
User → StripeCustomer → Subscription(s) → SubscriptionItem(s)
```

- A `StripeCustomer` record is created the first time a user initiates checkout.
- A `Subscription` mirrors one Stripe subscription (status, period end, cancellation flag).
- Each `SubscriptionItem` mirrors one line in the subscription (price ID, product ID, quantity).

### Status values

| Status | Meaning |
|---|---|
| `active` | Paid and in good standing |
| `trialing` | In a free trial period |
| `past_due` | Payment failed; Stripe is retrying — clients are still allowed in |
| `canceled` | Subscription ended |
| `incomplete` | Initial payment failed |
| `unpaid` | All retries exhausted |
| `paused` | Paused by the customer |
| `incomplete_expired` | Incomplete subscription expired |

`active` and `trialing` are considered fully active. `past_due` gets a grace period — the license system still accepts it.

### Cancellation

`POST /api/billing/subscription/cancel/` sets `cancel_at_period_end = true` on Stripe and locally. The subscription stays active until the period ends, then the webhook fires `customer.subscription.deleted` and the local record is marked `canceled`.

`POST /api/billing/subscription/resume/` undoes a pending cancellation.

### Sync

If the local DB and Stripe fall out of sync (e.g. after a missed webhook), admins can check and fix this from `/billing/admin` (frontend) or via the API:

- `GET /api/billing/admin/subscriptions/sync/` — inspect issues without changing anything
- `POST /api/billing/admin/subscriptions/sync/` — apply fixes

---

## License System

The license system links Stripe subscriptions to per-machine software licenses. It is designed for desktop applications or CLI tools that need to verify entitlement offline.

### Data model

```
User → LicenseKey (one per user+product) → LicenseMachine(s)
                                          → InstallToken(s)
```

- **`LicenseKey`** — a UUID issued to a user for one product. Linked to the active `Subscription`. Has `max_machines` (default 1) and `offline_ttl_days` (default 30). The UUID is never sent to the client after the first activation exchange; subsequent requests use the machine secret instead.
- **`LicenseMachine`** — a hashed machine fingerprint registered against a license key. Tracks `first_seen`, `last_seen`, active status, and a `machine_secret` (256-bit random secret generated at activation and returned once to the client).
- **`InstallToken`** — a short-lived, single-use token (`XXXX-XXXX-XXXX-XXXX`) that the user generates from the billing portal and enters during installation. The installer exchanges it for the license key UUID to perform first-time activation.

### Lifecycle

1. **Subscription activates** → `subscription_activated` signal fires → `_on_subscription_activated` auto-creates a `LicenseKey` for every product in the subscription. If the key already exists it is re-linked to the new subscription and reactivated.
2. **Subscription cancels** → `subscription_cancelled` signal fires → `_on_subscription_cancelled` sets `is_active = False` on all associated `LicenseKey` records.

### Installation flow

The client never asks the user to copy-paste their license UUID. Instead:

1. **User visits billing portal** → clicks **Get Install Key** on the relevant product → a single-use install token (`XXXX-XXXX-XXXX-XXXX`) appears, valid for 24 hours.
2. **User enters the token** in the installer or client app.
3. **Client POSTs** to `license/install-token/exchange/` with `{ token }` → receives `{ license_key, product_slug, product_name }`. The token is burned immediately.
4. **Client POSTs** to `license/activate/` with HMAC headers (using the license key from step 3) → receives `{ token, expires_at, machine_secret, machines_used, max_machines }`.
5. **Client discards the license key UUID** and stores only `machine_secret`, `machine_id_hash`, `product_slug`, and the offline JWT. The license UUID is not needed again.

For reinstalls, the user generates a new install token from the portal and repeats from step 1. Re-activation rotates the `machine_secret`.

### Update / renewal flow

The installed software calls `license/machine-checkin/` periodically (e.g. on startup, or before downloading an update) to renew the offline JWT. No install token or license UUID is needed — only the `machine_secret` stored at activation.

If the subscription lapses the check-in returns HTTP 402, and the client should fall back to the offline JWT until it expires (`offline_ttl_days`, capped at the subscription period end).

### Request authentication — legacy flow (license key)

Used by `/activate/` and `/checkin/`. The client signs with the shared `LICENSE_APP_SECRET` and includes the license key UUID.

```
message   = license_key + timestamp + nonce + machine_id_hash
signature = HMAC-SHA256(LICENSE_APP_SECRET, message)
```

| Header | Description |
|---|---|
| `X-License-Key` | The license UUID |
| `X-Machine-ID` | SHA-256 hex of the machine fingerprint |
| `X-Timestamp` | Unix timestamp (must be within ±5 minutes of server time) |
| `X-Nonce` | Random string; stored in cache for 10 minutes to prevent replay |
| `X-Signature` | HMAC-SHA256 hex of the message above, keyed with `LICENSE_APP_SECRET` |

### Request authentication — machine-secret flow

Used by `/machine-checkin/`. No license UUID required. The `machine_secret` issued at activation is the HMAC key.

```
message   = machine_id_hash + product_slug + timestamp + nonce
signature = HMAC-SHA256(machine_secret, message)
```

| Header | Description |
|---|---|
| `X-Machine-ID` | SHA-256 hex of the machine fingerprint |
| `X-Product-Slug` | Product slug (e.g. `my-app`) |
| `X-Timestamp` | Unix timestamp (must be within ±5 minutes of server time) |
| `X-Nonce` | Random string; stored in cache for 10 minutes to prevent replay |
| `X-Signature` | HMAC-SHA256 hex of the message above, keyed with `machine_secret` |

> **TODO (Step 2):** Add per-machine server challenge rotation to detect VM clones. At check-in the client includes the current `server_challenge` in the HMAC message; the server rotates it after each successful check-in. A clone using a stale challenge fails after the legitimate machine checks in first. Requires a `server_challenge` field on `LicenseMachine` and a recovery path for desync (re-activation via install token).

### Client-side storage

After a successful activation the client should store and the license UUID can be discarded:

| Value | Used for |
|---|---|
| `machine_secret` | Signing machine-checkin requests |
| `machine_id_hash` | Header value and part of the HMAC message |
| `product_slug` | Header value and part of the HMAC message |
| Offline JWT | Local entitlement verification without network access |

### Offline JWT tokens

On a successful activate or check-in the server issues a signed RS256 JWT. The client stores this locally and can verify it without contacting the server.

JWT payload:

| Claim | Description |
|---|---|
| `sub` | User primary key |
| `lic` | License key UUID |
| `mid` | Machine ID hash |
| `prd` | Product slug |
| `iat` | Issued-at timestamp |
| `exp` | Expiry (capped at `offline_ttl_days` or subscription period end, whichever is sooner) |

The public key (`LICENSE_RSA_PUBLIC_KEY_PATH`) can be bundled with the client application for fully offline verification.

### Subscription validation at check-in

Before issuing a token, the server checks:

1. The `LicenseKey` is active.
2. A `Subscription` is linked and its status is `active`, `trialing`, or `past_due`.
3. The subscription contains a `SubscriptionItem` whose `stripe_product_id` matches the licensed product.

If any check fails, the server returns HTTP 402 with `subscription_required`.

### License API endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `license/` | Session | List the current user's active licenses |
| `POST` | `license/<pk>/install-token/` | Session | Generate a single-use install token (24 h expiry) |
| `POST` | `license/install-token/exchange/` | Public | Exchange install token for license key UUID |
| `POST` | `license/activate/` | HMAC (license key) | Register machine, get offline JWT and `machine_secret` |
| `POST` | `license/checkin/` | HMAC (license key) | Renew offline JWT (legacy — requires license UUID) |
| `POST` | `license/machine-checkin/` | HMAC (machine secret) | Renew offline JWT (no license UUID needed) |
| `GET` | `license/machines/` | Session | List active machines for the current user |
| `DELETE` | `license/machines/<machine_id_hash>/` | Session | Deactivate a machine slot |

### C++ client library

`modules/billing/cpp/` contains a reference C++ client (`LicenseClient`) that handles machine fingerprinting, HMAC signing, and HTTP communication. Build with CMake (Visual Studio solution included under `cpp/vs_build/`).

```bash
# First-time activation (install token flow)
license_tool activate --url https://example.com --install-token XXXX-XXXX-XXXX-XXXX [--label "My PC"]

# Subsequent check-ins (machine secret flow — no license UUID needed)
license_tool checkin  --url https://example.com --product-slug my-app

# Legacy check-in (still supported)
license_tool checkin  --url https://example.com --license-key <uuid> --app-secret <secret>
```

---

## Cart / Custom Checkout

An alternative to Stripe-hosted Checkout. The cart flow collects a payment method on-site using Stripe Elements, then executes all items in one request:

1. `POST /api/billing/cart/setup-intent/` — creates a Stripe `SetupIntent` and returns its `client_secret`. Guest users must supply an `email`; authenticated users get a Stripe Customer automatically.
2. Frontend collects card details with Stripe.js and calls `stripe.confirmSetup()` to obtain a `payment_method` ID.
3. `POST /api/billing/cart/execute/` — charges one-time items and creates subscriptions grouped by billing interval. Requires `payment_method` and `items` (array of `{ price_id, quantity }`).

Guest checkout supports one-time items only; subscriptions require a logged-in account.

---

## API Endpoints

All endpoints are under `/api/billing/`.

### User-facing

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `products/` | Public | Active products from the local catalog |
| `GET` | `prices/` | Public | Active prices from Stripe |
| `POST` | `checkout/` | Required | Create a Stripe Checkout session; returns `{ url }` |
| `GET` | `subscription/` | Required | Current user's subscriptions |
| `POST` | `subscription/cancel/` | Required | Schedule cancellation at period end |
| `POST` | `subscription/resume/` | Required | Undo a pending cancellation |
| `POST` | `portal/` | Required | Open Stripe Billing Portal; returns `{ url }` |
| `POST` | `cart/setup-intent/` | Optional | Initialize cart checkout |
| `POST` | `cart/execute/` | Optional | Execute cart (charge + subscribe) |
| `POST` | `webhook/` | Public (signed) | Stripe webhook receiver |
| `GET` | `license/` | Required | List current user's active licenses |
| `POST` | `license/<pk>/install-token/` | Required | Generate a single-use install token |
| `POST` | `license/install-token/exchange/` | Public | Exchange install token for license key UUID |
| `POST` | `license/activate/` | HMAC | Register machine, get offline JWT and `machine_secret` |
| `POST` | `license/checkin/` | HMAC | Renew offline JWT (legacy, requires license UUID) |
| `POST` | `license/machine-checkin/` | HMAC | Renew offline JWT (machine secret, no UUID needed) |
| `GET` | `license/machines/` | Required | List active machines for the current user |
| `DELETE` | `license/machines/<hash>/` | Required | Deactivate a machine slot |

`checkout/` accepts `{ price_id, mode }` where `mode` is `subscription` (default) or `payment`.

### Admin (staff only)

| Method | Path | Description |
|---|---|---|
| `GET / POST` | `admin/products/` | List or create products |
| `PATCH / DELETE` | `admin/products/<pk>/` | Update or delete a product |
| `POST` | `admin/products/<pk>/sync/` | Push product to Stripe |
| `GET / POST` | `admin/products/<pk>/prices/` | List or create prices (creates in Stripe too) |
| `PATCH / DELETE` | `admin/products/<pk>/prices/<pk>/` | Update or archive a price |
| `GET / POST` | `admin/products/<pk>/images/` | List or upload product images |
| `DELETE` | `admin/products/<pk>/images/<pk>/` | Delete a product image |
| `GET` | `admin/subscriptions/` | List all subscriptions |
| `GET` | `admin/subscriptions/sync/` | Preview Stripe vs local differences |
| `POST` | `admin/subscriptions/sync/` | Apply sync fixes |

---

## Signals

Listen to these signals to react to billing events in other modules:

```python
from billing.signals import checkout_completed, subscription_activated, subscription_cancelled, payment_completed

# Fired when a Stripe Checkout session completes
checkout_completed.send(sender=..., user=user, session=session)

# Fired when a subscription becomes active or is renewed
subscription_activated.send(sender=..., user=user, subscription=subscription)

# Fired when a subscription is cancelled, paused, or unpaid
subscription_cancelled.send(sender=..., user=user, subscription=subscription)

# Fired when a one-time PaymentIntent succeeds (cart flow)
payment_completed.send(sender=..., user=user, payment_intent=payment_intent)
```
