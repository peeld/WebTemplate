import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { addBreadcrumb } from '@core/frontend/utils/logger';
import { getProducts } from '../api.js';
import { useCart } from '../context/CartContext.jsx';
import StoreProductCard from '../components/StoreProductCard.jsx';

const FILTERS = [
  { value: 'all',      label: 'All' },
  { value: 'digital',  label: 'Digital' },
  { value: 'physical', label: 'Physical' },
];

export default function StorePage() {
  const [products, setProducts] = useState([]);
  const [error, setError]       = useState(null);
  const [loading, setLoading]   = useState(true);
  const [filter, setFilter]     = useState('all');

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
    addBreadcrumb('store add to cart', { priceId: price.stripe_price_id }, 'info');
    addToCart(product, price);
  }

  const hasPhysical = products.some(p => p.fulfillment_type === 'physical');
  const hasDigital  = products.some(p => p.fulfillment_type === 'digital');
  const showFilter  = hasPhysical && hasDigital;

  const visible = filter === 'all'
    ? products
    : products.filter(p => p.fulfillment_type === filter);

  return (
    <section className="section">
      <div className="container">
        <div className="has-text-centered mb-6">
          <h1 className="title">Store</h1>
          <p className="subtitle has-text-grey">Browse all products and plans.</p>
        </div>

        {error && (
          <div className="notification is-danger is-light mb-5">{error}</div>
        )}

        {loading && (
          <p className="has-text-grey has-text-centered">Loading products…</p>
        )}

        {!loading && !error && products.length === 0 && (
          <p className="has-text-grey has-text-centered">No products available yet.</p>
        )}

        {!loading && showFilter && (
          <div className="has-text-centered mb-5">
            <div className="buttons has-addons is-centered">
              {FILTERS.map(f => (
                <button
                  key={f.value}
                  className={`button${filter === f.value ? ' is-primary is-selected' : ''}`}
                  onClick={() => setFilter(f.value)}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {!loading && visible.length > 0 && (
          <div className="columns is-multiline">
            {visible.map(product => (
              <div key={product.id} className="column is-one-quarter-widescreen is-one-third-desktop is-half-tablet">
                <StoreProductCard
                  {...product}
                  onAddToCart={handleAddToCart}
                />
              </div>
            ))}
          </div>
        )}

        {!loading && visible.length === 0 && products.length > 0 && (
          <p className="has-text-grey has-text-centered">No products in this category.</p>
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
