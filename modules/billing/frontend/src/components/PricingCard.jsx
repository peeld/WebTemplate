import { useState } from 'react';

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

export default function PricingCard({ name, description, thumbnail, features, fulfillment_type, prices = [], selectedInterval, onAddToCart }) {
  const [added, setAdded] = useState(null);

  const oneTimePrice    = prices.find(p => p.price_type === 'one_time'  && p.is_active);
  const recurringPrice  = prices.find(p => p.price_type === 'recurring' && p.interval === selectedInterval && p.is_active);
  const hasAnyRecurring = prices.some(p => p.price_type === 'recurring' && p.is_active);
  const isFree          = !oneTimePrice && !hasAnyRecurring;

  const product = { name, description, thumbnail, features, fulfillment_type, prices };

  function handleAdd(price) {
    onAddToCart(product, price);
    setAdded(price.stripe_price_id);
    setTimeout(() => setAdded(null), 1500);
  }

  return (
    <div className="card" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {thumbnail && (
        <div className="card-image">
          <figure className="image is-3by2">
            <img src={thumbnail} alt={name} style={{ objectFit: 'cover', width: '100%', height: '100%' }} />
          </figure>
        </div>
      )}

      <div className="card-content" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <div style={{ flex: 1 }}>
          <p className="title is-4 mb-1">{name}</p>
          {description && (
            <p className="is-size-6 has-text-grey mb-4">{description}</p>
          )}

          {Array.isArray(features) && features.length > 0 && (
            <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 1.25rem' }}>
              {features.map((f, i) => (
                <li key={i} className="is-size-6 mb-1" style={{ display: 'flex', gap: '0.5rem' }}>
                  <span className="has-text-success" style={{ flexShrink: 0 }}>✓</span>
                  <span>{f}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          {isFree && (
            <>
              <p className="is-size-2 has-text-weight-bold has-text-primary mb-3">Free</p>
              <button className="button is-primary is-fullwidth" disabled>Get started</button>
            </>
          )}

          {oneTimePrice && (
            <div className={recurringPrice ? 'mb-4' : ''}>
              <p className="is-size-2 has-text-weight-bold has-text-primary mb-1" style={{ lineHeight: 1 }}>
                {formatPrice(oneTimePrice.amount, oneTimePrice.currency)}
                <span className="is-size-6 has-text-grey has-text-weight-normal ml-2">one-time</span>
              </p>
              <button
                className={`button is-fullwidth mt-3${added === oneTimePrice.stripe_price_id ? ' is-success' : ' is-primary'}${recurringPrice ? ' is-outlined' : ''}`}
                disabled={!oneTimePrice.stripe_price_id}
                onClick={() => handleAdd(oneTimePrice)}
              >
                {added === oneTimePrice.stripe_price_id
                  ? 'Added!'
                  : fulfillment_type === 'physical' ? 'Buy & Ship' : 'Add to Cart'}
              </button>
            </div>
          )}

          {recurringPrice && (
            <div style={oneTimePrice ? { borderTop: '1px solid #ededed', paddingTop: '1rem' } : {}}>
              <p className="is-size-2 has-text-weight-bold has-text-primary mb-1" style={{ lineHeight: 1 }}>
                {formatPrice(recurringPrice.amount, recurringPrice.currency)}
                <span className="is-size-6 has-text-grey has-text-weight-normal ml-2">
                  {INTERVAL_LABEL[recurringPrice.interval] || `/${recurringPrice.interval}`}
                </span>
              </p>
              <button
                className={`button is-fullwidth mt-3${added === recurringPrice.stripe_price_id ? ' is-success' : ' is-primary'}`}
                disabled={!recurringPrice.stripe_price_id}
                onClick={() => handleAdd(recurringPrice)}
              >
                {added === recurringPrice.stripe_price_id ? 'Added!' : 'Add to Cart'}
              </button>
            </div>
          )}

          {fulfillment_type === 'physical' && !isFree && (
            <p className="is-size-7 has-text-grey mt-2 has-text-centered">Ships to your door</p>
          )}
        </div>
      </div>
    </div>
  );
}
