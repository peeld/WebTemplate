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

# License verification (billing module)
LICENSE_APP_SECRET           = os.environ.get('LICENSE_APP_SECRET', '')
LICENSE_RSA_PRIVATE_KEY      = os.environ.get('LICENSE_RSA_PRIVATE_KEY', '').replace('\\n', '\n')
LICENSE_RSA_PUBLIC_KEY       = os.environ.get('LICENSE_RSA_PUBLIC_KEY', '').replace('\\n', '\n')
LICENSE_DEFAULT_MAX_MACHINES      = int(os.environ.get('LICENSE_DEFAULT_MAX_MACHINES', 1))
LICENSE_DEFAULT_OFFLINE_TTL_DAYS  = int(os.environ.get('LICENSE_DEFAULT_OFFLINE_TTL_DAYS', 30))

--- Add to core/backend/.env.example ---

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
LICENSE_RSA_PRIVATE_KEY=-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----
LICENSE_RSA_PUBLIC_KEY=-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----
LICENSE_DEFAULT_MAX_MACHINES=1
LICENSE_DEFAULT_OFFLINE_TTL_DAYS=30

--- Add to core/frontend/.env.example ---

VITE_STRIPE_PUBLISHABLE_KEY=pk_test_...
"""
