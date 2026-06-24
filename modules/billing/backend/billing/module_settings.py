"""
Billing module required settings.

After running `python install.py add billing`, merge the block below into
core/backend/core/settings/base.py (in the appropriate section) and add the
corresponding keys to core/backend/.env.example.

These settings require os.environ.get() calls and cannot be declared in
module.json's settings_defaults (JSON limitation).

--- Add to core/backend/core/settings/base.py ---

STRIPE_SECRET_KEY     = os.environ.get('STRIPE_SECRET_KEY', '')
STRIPE_WEBHOOK_SECRET = os.environ.get('STRIPE_WEBHOOK_SECRET', '')
STRIPE_SUCCESS_URL    = os.environ.get('STRIPE_SUCCESS_URL', '')
STRIPE_CANCEL_URL     = os.environ.get('STRIPE_CANCEL_URL', '')

--- Add to core/backend/.env.example ---

# Stripe (billing module)
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_SUCCESS_URL=http://localhost:5173/billing/checkout/success
STRIPE_CANCEL_URL=http://localhost:5173/billing/pricing

--- Add to core/frontend/.env.example ---

VITE_STRIPE_PUBLISHABLE_KEY=pk_test_...
"""
