import { useEffect, useState } from 'react';
import { getPrices, createCheckoutSession } from '../api.js';
import PricingCard from '../components/PricingCard.jsx';

export default function PricingPage() {
  const [prices, setPrices]       = useState([]);
  const [error, setError]         = useState(null);
  const [loading, setLoading]     = useState(true);
  const [checkingOut, setCheckingOut] = useState(null);

  useEffect(() => {
    getPrices()
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) setPrices(data);
        else setError(data.error || 'Failed to load pricing.');
      })
      .catch(() => setError('Network error loading pricing.'))
      .finally(() => setLoading(false));
  }, []);

  async function handleSubscribe(priceId) {
    setCheckingOut(priceId);
    try {
      const res  = await createCheckoutSession(priceId, 'subscription');
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Could not start checkout.');
        return;
      }
      window.location.href = data.url;
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setCheckingOut(null);
    }
  }

  return (
    <section className="section">
      <div className="container">
        <h1 className="title">Pricing</h1>

        {error && (
          <div className="notification is-danger is-light mb-4">{error}</div>
        )}

        {loading && (
          <p className="has-text-grey">Loading plans…</p>
        )}

        {!loading && prices.length === 0 && !error && (
          <p className="has-text-grey">No plans available.</p>
        )}

        <div className="columns is-multiline">
          {prices.map(price => (
            <div key={price.price_id} className="column is-one-third">
              <PricingCard
                {...price}
                onSubscribe={handleSubscribe}
                loading={checkingOut === price.price_id}
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
