import { useState } from 'react';

const INTERVAL_LABEL = { week: '/wk', month: '/mo', year: '/yr' };
const INTERVAL_ORDER = { week: 0, month: 1, year: 2 };

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

export default function StoreProductCard({ name, description, thumbnail, features, fulfillment_type, prices = [], onAddToCart }) {
  const [added, setAdded] = useState(null);

  const product = { name, description, thumbnail, features, fulfillment_type, prices };

  const activeOne  = prices.find(p => p.price_type === 'one_time' && p.is_active);
  const activeRecurring = prices
    .filter(p => p.price_type === 'recurring' && p.is_active)
    .sort((a, b) => (INTERVAL_ORDER[a.interval] ?? 99) - (INTERVAL_ORDER[b.interval] ?? 99));

  const isFree = !activeOne && activeRecurring.length === 0;

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
          <p className="title is-5 mb-1">{name}</p>
          {description && (
            <p className="is-size-7 has-text-grey mb-3">{description}</p>
          )}
          {Array.isArray(features) && features.length > 0 && (
            <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 1rem' }}>
              {features.map((f, i) => (
                <li key={i} className="is-size-7 mb-1" style={{ display: 'flex', gap: '0.4rem' }}>
                  <span className="has-text-success" style={{ flexShrink: 0 }}>✓</span>
                  <span>{f}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          {isFree && (
            <div className="has-text-centered py-2">
              <p className="is-size-3 has-text-weight-bold has-text-primary mb-2">Free</p>
              <button className="button is-primary is-fullwidth" disabled>Get started</button>
            </div>
          )}

          {activeOne && (
            <div className={activeRecurring.length > 0 ? 'mb-3' : ''}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem' }}>
                <div>
                  <span className="is-size-4 has-text-weight-bold has-text-primary">
                    {formatPrice(activeOne.amount, activeOne.currency)}
                  </span>
                  <span className="is-size-7 has-text-grey ml-1">one-time</span>
                </div>
                <button
                  className={`button is-small${added === activeOne.stripe_price_id ? ' is-success' : ' is-primary'}${activeRecurring.length > 0 ? ' is-outlined' : ''}`}
                  disabled={!activeOne.stripe_price_id}
                  onClick={() => handleAdd(activeOne)}
                  style={{ flexShrink: 0 }}
                >
                  {added === activeOne.stripe_price_id
                    ? 'Added!'
                    : fulfillment_type === 'physical' ? 'Buy & Ship' : 'Add to Cart'}
                </button>
              </div>
            </div>
          )}

          {activeRecurring.length > 0 && (
            <div style={activeOne ? { borderTop: '1px solid #ededed', paddingTop: '0.75rem' } : {}}>
              {activeRecurring.map((price, i) => (
                <div
                  key={price.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '0.75rem',
                    marginTop: i > 0 ? '0.5rem' : 0,
                  }}
                >
                  <div>
                    <span className="is-size-4 has-text-weight-bold has-text-primary">
                      {formatPrice(price.amount, price.currency)}
                    </span>
                    <span className="is-size-7 has-text-grey ml-1">
                      {INTERVAL_LABEL[price.interval] || `/${price.interval}`}
                    </span>
                  </div>
                  <button
                    className={`button is-small${added === price.stripe_price_id ? ' is-success' : ' is-primary'}`}
                    disabled={!price.stripe_price_id}
                    onClick={() => handleAdd(price)}
                    style={{ flexShrink: 0 }}
                  >
                    {added === price.stripe_price_id ? 'Added!' : 'Subscribe'}
                  </button>
                </div>
              ))}
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
