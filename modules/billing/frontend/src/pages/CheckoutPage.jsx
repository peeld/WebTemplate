import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { useCart } from '../context/CartContext.jsx';
import { createSetupIntent } from '../api.js';

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY);

const INTERVAL_LABEL = { week: '/wk', month: '/mo', year: '/yr' };

function formatPrice(amount, currency) {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: (currency || 'usd').toUpperCase(),
    }).format(amount / 100);
  } catch {
    return `$${(amount / 100).toFixed(2)}`;
  }
}

function CheckoutForm({ setupIntentId }) {
  const stripe     = useStripe();
  const elements   = useElements();
  const navigate   = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]           = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!stripe || !elements) return;
    setSubmitting(true);
    setError(null);

    const result = await stripe.confirmSetup({
      elements,
      confirmParams: {
        return_url: window.location.origin + '/billing/checkout/processing',
      },
      redirect: 'if_required',
    });

    if (result.error) {
      setError(result.error.message);
      setSubmitting(false);
      return;
    }

    navigate('/billing/checkout/processing', {
      state: {
        paymentMethod: result.setupIntent?.payment_method,
        setupIntentId,
      },
    });
  }

  return (
    <form onSubmit={handleSubmit}>
      <PaymentElement />
      {error && (
        <div className="notification is-danger is-light mt-4">{error}</div>
      )}
      <button
        type="submit"
        className={`button is-primary is-fullwidth is-medium mt-5${submitting ? ' is-loading' : ''}`}
        disabled={submitting || !stripe}
      >
        Place Order
      </button>
    </form>
  );
}

export default function CheckoutPage() {
  const { oneTimeItems, subscriptionItems, cartTotal, cartCount } = useCart();
  const navigate = useNavigate();
  const [clientSecret, setClientSecret]   = useState(null);
  const [setupIntentId, setSetupIntentId] = useState(null);
  const [loadError, setLoadError]         = useState(null);
  const [guestEmail, setGuestEmail]       = useState('');

  const isGuest      = !localStorage.getItem('access');
  const hasRecurring = subscriptionItems.length > 0;

  // For guests, wait for email before initializing; authenticated users start immediately.
  // Initialize to true for guests so there is no flash of the loading state.
  const [awaitingEmail, setAwaitingEmail] = useState(isGuest);

  useEffect(() => {
    if (cartCount === 0) { navigate('/billing/cart'); return; }
    if (!isGuest) initCheckout();
  }, []);

  async function initCheckout(email = null) {
    try {
      const res  = await createSetupIntent(email);
      const data = await res.json();
      if (data.client_secret) {
        setClientSecret(data.client_secret);
        if (data.setup_intent_id) setSetupIntentId(data.setup_intent_id);
      } else {
        setLoadError(data.error || 'Unable to initialize checkout.');
      }
    } catch {
      setLoadError('Network error. Please try again.');
    }
  }

  function handleGuestEmailSubmit(e) {
    e.preventDefault();
    setAwaitingEmail(false);
    initCheckout(guestEmail);
  }

  if (loadError) {
    return (
      <section className="section">
        <div className="container">
          <div className="notification is-danger">{loadError}</div>
        </div>
      </section>
    );
  }

  // Guests cannot purchase subscriptions
  if (isGuest && hasRecurring) {
    return (
      <section className="section">
        <div className="container" style={{ maxWidth: '540px', margin: '0 auto' }}>
          <div className="box">
            <h1 className="title is-5 mb-4">Account required</h1>
            <p className="mb-4">
              Your cart contains subscriptions, which require an account.
            </p>
            <div className="buttons">
              <a href="/login" className="button is-primary">Log in</a>
              <a href="/signup" className="button is-light">Create account</a>
            </div>
            {oneTimeItems.length > 0 && (
              <p className="is-size-7 has-text-grey mt-3">
                To check out only the one-time items as a guest, remove all subscriptions from your cart first.
              </p>
            )}
          </div>
        </div>
      </section>
    );
  }

  // Guest email collection
  if (isGuest && awaitingEmail) {
    return (
      <section className="section">
        <div className="container" style={{ maxWidth: '480px', margin: '0 auto' }}>
          <div className="box">
            <h1 className="title is-5 mb-4">Guest Checkout</h1>
            <form onSubmit={handleGuestEmailSubmit}>
              <div className="field">
                <label className="label">Email address</label>
                <div className="control">
                  <input
                    className="input"
                    type="email"
                    required
                    value={guestEmail}
                    onChange={e => setGuestEmail(e.target.value)}
                    placeholder="you@example.com"
                    autoFocus
                  />
                </div>
                <p className="help">Your Stripe receipt will be sent here.</p>
              </div>
              <button type="submit" className="button is-primary is-fullwidth mt-4">
                Continue to Payment
              </button>
            </form>
            <p className="has-text-centered is-size-7 mt-3 has-text-grey">
              Already have an account? <a href="/login">Log in</a>
            </p>
          </div>
        </div>
      </section>
    );
  }

  if (!clientSecret) {
    return (
      <section className="section">
        <div className="container has-text-centered">
          <p className="has-text-grey">Initializing checkout…</p>
        </div>
      </section>
    );
  }

  return (
    <section className="section">
      <div className="container">
        <h1 className="title mb-6">Checkout</h1>
        <div className="columns">
          <div className="column is-half">
            <div className="box">
              <h2 className="subtitle is-5 mb-4">Payment Details</h2>
              {isGuest && guestEmail && (
                <p className="is-size-7 mb-3">
                  <span className="has-text-grey">Receipt will be sent to </span>
                  <strong>{guestEmail}</strong>
                </p>
              )}
              <p className="is-size-7 has-text-grey mb-4">
                Your card will be saved securely by Stripe and charged for each item.
              </p>
              <Elements stripe={stripePromise} options={{ clientSecret }}>
                <CheckoutForm setupIntentId={setupIntentId} />
              </Elements>
            </div>
          </div>

          <div className="column is-half">
            <div className="box">
              <h2 className="subtitle is-5 mb-4">Order Summary</h2>

              {oneTimeItems.length > 0 && (
                <div className="mb-4">
                  <p className="has-text-weight-semibold mb-2 is-size-6">One-time</p>
                  {oneTimeItems.map(({ product, price, quantity }) => (
                    <div key={price.stripe_price_id} className="is-flex is-justify-content-space-between mb-1">
                      <span className="is-size-6">
                        {product.name}{quantity > 1 ? ` × ${quantity}` : ''}
                        {price.days_granted && (
                          <span className="is-size-7 has-text-grey ml-1">
                            ({price.days_granted * quantity} days)
                          </span>
                        )}
                      </span>
                      <span className="is-size-6">{formatPrice(price.amount * quantity, price.currency)}</span>
                    </div>
                  ))}
                  <div
                    className="is-flex is-justify-content-space-between mt-2"
                    style={{ borderTop: '1px solid #f0f0f0', paddingTop: '0.5rem' }}
                  >
                    <span className="has-text-weight-semibold">Charged today</span>
                    <span className="has-text-weight-semibold">
                      {formatPrice(cartTotal, oneTimeItems[0]?.price.currency)}
                    </span>
                  </div>
                </div>
              )}

              {subscriptionItems.length > 0 && (
                <div className={oneTimeItems.length > 0 ? 'mt-4' : ''}>
                  <p className="has-text-weight-semibold mb-2 is-size-6">Subscriptions</p>
                  {subscriptionItems.map(({ product, price }) => (
                    <div key={price.stripe_price_id} className="is-flex is-justify-content-space-between mb-1">
                      <span className="is-size-6">{product.name}</span>
                      <span className="is-size-6">
                        {formatPrice(price.amount, price.currency)}
                        {INTERVAL_LABEL[price.interval] || `/${price.interval}`}
                      </span>
                    </div>
                  ))}
                  <p className="is-size-7 has-text-grey mt-2">
                    Each subscription is billed on its own recurring cycle.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
