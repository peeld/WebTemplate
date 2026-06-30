import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getProducts } from '../api.js';
import { useCart } from '../context/CartContext.jsx';
import StoreProductCard from '../components/StoreProductCard.jsx';

const MAX_FEATURED = 4;

export default function FeaturedProducts() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading]   = useState(true);
  const { addToCart }           = useCart();

  useEffect(() => {
    getProducts()
      .then(res => res.json())
      .then(data => { if (Array.isArray(data)) setProducts(data.slice(0, MAX_FEATURED)); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading || products.length === 0) return null;

  return (
    <section className="section">
      <div className="container">
        <div className="level mb-5">
          <div className="level-left">
            <div>
              <h2 className="title is-4 mb-1">Featured Products</h2>
            </div>
          </div>
          <div className="level-right">
            <Link to="/billing/store" className="button is-light">View all &rarr;</Link>
          </div>
        </div>

        <div className="columns is-multiline">
          {products.map(product => (
            <div key={product.id} className="column is-one-quarter-widescreen is-one-third-desktop is-half-tablet">
              <StoreProductCard {...product} product_id={product.id} onAddToCart={addToCart} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
