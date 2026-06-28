"""
Billing module settings reference.

All settings below are declared in module.json `settings_defaults` and are
applied automatically by install.py / installed_modules.py. You do not need
to add anything to core/backend/core/settings/base.py for this module.

Add the corresponding keys to core/backend/.env.example:

--- core/backend/.env.example ---

# Stripe (billing module)
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_SUCCESS_URL=http://localhost:5173/billing/checkout/success
STRIPE_CANCEL_URL=http://localhost:5173/billing/pricing

# License verification (billing module)
# Generate keypair: openssl genrsa -out license_private.pem 2048
#                   openssl rsa -in license_private.pem -pubout -out license_public.pem
LICENSE_APP_SECRET=replace-with-long-random-secret
LICENSE_RSA_PRIVATE_KEY_PATH=/path/to/license_private.pem
LICENSE_RSA_PUBLIC_KEY_PATH=/path/to/license_public.pem
LICENSE_DEFAULT_MAX_MACHINES=1
LICENSE_DEFAULT_OFFLINE_TTL_DAYS=30

--- core/frontend/.env.example ---

VITE_STRIPE_PUBLISHABLE_KEY=pk_test_...
"""
