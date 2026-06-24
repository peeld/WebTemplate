import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { addBreadcrumb } from '@core/frontend/utils/logger';
import { getProducts } from '../api.js';
import { useCart } from '../context/CartContext.jsx';
import PricingCard from '../components/PricingCard.jsx';

const ALL_INTERVALS = [
  { value: 'week',  label: 'Weekly' },
  { value: 'month', label: 'Monthly' },
  { value: 'year',  label: 'Annual' },
];

export default function PricingPage() {
  const [products, setProducts]                 = useState([]);
  const [error, setError]                       = useState(null);
  const [loading, setLoading]                   = useState(true);
  const [selectedInterval, setSelectedInterval] = useState('month');

  const { addToCart, cartCount } = useCart();

  useEffect(() => {
    getProducts()
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) setProducts(data);
        else setError(data.error || 'Failed to load products.');
      })
      .catch(() => setError('Network error loading products.'))
      .finally(() => setLoading(false));
  }, []);

  function handleAddToCart(product, price) {
    addBreadcrumb('add to cart', { priceId: price.stripe_price_id }, 'info');
    addToCart(product, price);
  }

  const availableIntervals = ALL_INTERVALS.filter(iv =>
    products.some(p =>
      Array.isArray(p.prices) &&
      p.prices.some(pr => pr.price_type === 'recurring' && pr.interval === iv.value && pr.is_active)
    )
  );

  const showToggle = availableIntervals.length > 1;

  return (
    <section className="section">
      <div className="container">
        <div className="has-text-centered mb-6">
          <h1 className="title">Pricing</h1>
          <p className="subtitle has-text-grey">Choose the plan that works for you.</p>
        </div>

        {error && (
          <div className="notification is-danger is-light mb-5">{error}</div>
        )}

        {loading && (
          <p className="has-text-grey has-text-centered">Loading plans…</p>
        )}

        {!loading && !error && products.length === 0 && (
          <p className="has-text-grey has-text-centered">No plans available yet.</p>
        )}

        {!loading && showToggle && (
          <div className="has-text-centered mb-5">
            <div className="buttons has-addons is-centered">
              {availableIntervals.map(iv => (
                <button
                  key={iv.value}
                  className={`button${selectedInterval === iv.value ? ' is-primary is-selected' : ''}`}
                  onClick={() => setSelectedInterval(iv.value)}
                >
                  {iv.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {!loading && products.length > 0 && (
          <div className="columns is-multiline is-centered">
            {products.map(product => (
              <div
                key={product.id}
                className={`column${products.length === 1 ? ' is-half' : ' is-one-third'}`}
              >
                <PricingCard
                  {...product}
                  selectedInterval={selectedInterval}
                  onAddToCart={handleAddToCart}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {cartCount > 0 && (
        <div
          style={{
            position: 'fixed',
            bottom: 0,
            left: 0,
            right: 0,
            background: '#fff',
            borderTop: '1px solid #e0e0e0',
            padding: '0.75rem 1.5rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            zIndex: 100,
            boxShadow: '0 -2px 8px rgba(0,0,0,0.08)',
          }}
        >
          <span className="has-text-grey is-size-6">{cartCount} item{cartCount !== 1 ? 's' : ''} in cart</span>
          <Link to="/billing/cart" className="button is-primary">
            View Cart ({cartCount})
          </Link>
        </div>
      )}
    </section>
  );
}
