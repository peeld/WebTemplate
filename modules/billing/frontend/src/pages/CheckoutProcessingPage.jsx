import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { loadStripe } from '@stripe/stripe-js';
import { useCart } from '../context/CartContext.jsx';
import { executeCart } from '../api.js';

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY);

export default function CheckoutProcessingPage() {
  const location          = useLocation();
  const navigate          = useNavigate();
  const { items, clearCart } = useCart();
  const [error, setError] = useState(null);
  const executed          = useRef(false);

  useEffect(() => {
    if (executed.current) return;
    executed.current = true;
    run();
  }, []);

  async function run() {
    let paymentMethod = location.state?.paymentMethod ?? null;
    let setupIntentId = location.state?.setupIntentId ?? null;

    // Redirect path: Stripe returned setup_intent_client_secret in URL
    if (!paymentMethod) {
      const params                   = new URLSearchParams(window.location.search);
      const setupIntentClientSecret  = params.get('setup_intent_client_secret');
      const redirectStatus           = params.get('redirect_status');

      if (redirectStatus === 'failed') {
        setError('Payment setup failed. Please go back and try again.');
        return;
      }

      if (setupIntentClientSecret) {
        try {
          const stripe = await stripePromise;
          const { setupIntent, error: siError } = await stripe.retrieveSetupIntent(setupIntentClientSecret);
          if (siError || !setupIntent) {
            setError(siError?.message || 'Could not retrieve payment details.');
            return;
          }
          paymentMethod = setupIntent.payment_method;
          setupIntentId = setupIntent.id;
        } catch {
          setError('Failed to verify payment setup.');
          return;
        }
      }
    }

    if (!paymentMethod) {
      setError('No payment method found. Please restart checkout.');
      return;
    }

    const cartItems = items.map(i => ({ price_id: i.price.stripe_price_id, quantity: i.quantity }));

    if (cartItems.length === 0) {
      setError('Cart is empty. Nothing to process.');
      return;
    }

    // Persist summary before clearing cart
    try {
      sessionStorage.setItem(
        'checkout_summary',
        JSON.stringify(items.map(i => ({ name: i.product.name, price: i.price, quantity: i.quantity })))
      );
    } catch { /* non-fatal */ }

    try {
      const res  = await executeCart(paymentMethod, cartItems, setupIntentId);
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Order processing failed. Please contact support.');
        return;
      }

      clearCart();
      navigate('/billing/checkout/success', { replace: true });
    } catch {
      setError('Network error. Please contact support if you were charged.');
    }
  }

  if (error) {
    return (
      <section className="section">
        <div className="container">
          <div className="box has-text-centered" style={{ maxWidth: '560px', margin: '0 auto' }}>
            <p className="title is-4 has-text-danger mb-4">Something went wrong</p>
            <p className="mb-5">{error}</p>
            <button className="button is-primary" onClick={() => navigate('/billing/checkout')}>
              Try Again
            </button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="section">
      <div className="container">
        <div className="box has-text-centered" style={{ maxWidth: '480px', margin: '0 auto' }}>
          <p className="title is-4 mb-4">Processing your order…</p>
          <p className="has-text-grey mb-5">Please do not close this page.</p>
          <progress className="progress is-primary" max="100">Processing</progress>
        </div>
      </div>
    </section>
  );
}
