import { Link, useNavigate } from 'react-router-dom';
import { useCart } from '../context/CartContext.jsx';

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

export default function CartPage() {
  const { oneTimeItems, subscriptionItems, cartTotal, removeFromCart, updateQuantity, cartCount } = useCart();
  const navigate = useNavigate();

  if (cartCount === 0) {
    return (
      <section className="section">
        <div className="container has-text-centered">
          <h1 className="title">Your Cart</h1>
          <p className="has-text-grey mb-5">Your cart is empty.</p>
          <Link to="/billing/pricing" className="button is-primary">Browse Plans</Link>
        </div>
      </section>
    );
  }

  return (
    <section className="section">
      <div className="container" style={{ maxWidth: '720px' }}>
        <h1 className="title mb-6">Your Cart</h1>

        {oneTimeItems.length > 0 && (
          <div className="mb-6">
            <h2 className="subtitle is-5 mb-3">One-time Purchases</h2>
            <div className="box">
              {oneTimeItems.map(({ product, price, quantity }) => (
                <div
                  key={price.stripe_price_id}
                  className="is-flex is-justify-content-space-between is-align-items-center mb-4"
                  style={{ borderBottom: '1px solid #f5f5f5', paddingBottom: '1rem' }}
                >
                  <div style={{ flex: 1 }}>
                    <p className="has-text-weight-semibold">{product.name}</p>
                    <p className="is-size-7 has-text-grey">{formatPrice(price.amount, price.currency)} each</p>
                  </div>
                  <div className="is-flex is-align-items-center" style={{ gap: '0.75rem' }}>
                    <div className="field has-addons mb-0">
                      <div className="control">
                        <button
                          className="button is-small"
                          onClick={() => updateQuantity(price.stripe_price_id, quantity - 1)}
                        >−</button>
                      </div>
                      <div className="control">
                        <input
                          className="input is-small"
                          type="number"
                          min="1"
                          value={quantity}
                          onChange={e => updateQuantity(price.stripe_price_id, parseInt(e.target.value) || 1)}
                          style={{ width: '3.5rem', textAlign: 'center' }}
                        />
                      </div>
                      <div className="control">
                        <button
                          className="button is-small"
                          onClick={() => updateQuantity(price.stripe_price_id, quantity + 1)}
                        >+</button>
                      </div>
                    </div>
                    <span className="has-text-weight-semibold" style={{ minWidth: '5rem', textAlign: 'right' }}>
                      {formatPrice(price.amount * quantity, price.currency)}
                    </span>
                    <button
                      className="delete"
                      onClick={() => removeFromCart(price.stripe_price_id)}
                      title="Remove"
                    />
                  </div>
                </div>
              ))}
              <div className="is-flex is-justify-content-flex-end mt-2">
                <p className="has-text-weight-bold is-size-5">
                  Subtotal: {formatPrice(cartTotal, oneTimeItems[0]?.price.currency)}
                </p>
              </div>
            </div>
          </div>
        )}

        {subscriptionItems.length > 0 && (
          <div className="mb-6">
            <h2 className="subtitle is-5 mb-3">Subscriptions</h2>
            <div className="box">
              {subscriptionItems.map(({ product, price }) => (
                <div
                  key={price.stripe_price_id}
                  className="is-flex is-justify-content-space-between is-align-items-center mb-4"
                  style={{ borderBottom: '1px solid #f5f5f5', paddingBottom: '1rem' }}
                >
                  <div style={{ flex: 1 }}>
                    <p className="has-text-weight-semibold">{product.name}</p>
                    <p className="is-size-7 has-text-grey">
                      {formatPrice(price.amount, price.currency)}
                      {INTERVAL_LABEL[price.interval] || `/${price.interval}`}
                    </p>
                  </div>
                  <button
                    className="delete"
                    onClick={() => removeFromCart(price.stripe_price_id)}
                    title="Remove"
                  />
                </div>
              ))}
              <p className="is-size-7 has-text-grey">
                Subscriptions will be charged separately on their billing cycle.
              </p>
            </div>
          </div>
        )}

        <div className="is-flex is-justify-content-space-between is-align-items-center">
          <Link to="/billing/pricing" className="button is-light">Continue Shopping</Link>
          <button
            className="button is-primary is-medium"
            onClick={() => navigate('/billing/checkout')}
          >
            Proceed to Checkout
          </button>
        </div>
      </div>
    </section>
  );
}
