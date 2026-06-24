from django.dispatch import Signal

# Fired when a subscription becomes active or is renewed.
# kwargs: user, subscription
subscription_activated = Signal()

# Fired when a subscription is cancelled (immediately or at period end).
# kwargs: user, subscription
subscription_cancelled = Signal()

# Fired when a Stripe Checkout session completes successfully.
# kwargs: user, session  (raw Stripe session object)
checkout_completed = Signal()

# Fired when a one-time PaymentIntent completes successfully.
# kwargs: user, payment_intent  (raw Stripe PaymentIntent object)
payment_completed = Signal()
