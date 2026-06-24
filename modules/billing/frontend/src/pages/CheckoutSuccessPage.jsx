import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

const INTERVAL_LABEL = { week: 'weekly', month: 'monthly', year: 'annual' };

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

export default function CheckoutSuccessPage() {
  const [summary, setSummary] = useState([]);

  useEffect(() => {
    try {
      const stored = sessionStorage.getItem('checkout_summary');
      if (stored) setSummary(JSON.parse(stored));
    } catch { /* non-fatal */ }
  }, []);

  return (
    <section className="section">
      <div className="container">
        <div className="box has-text-centered" style={{ maxWidth: '560px', margin: '0 auto' }}>
          <p className="is-size-1 mb-3" style={{ color: '#48c78e' }}>✓</p>
          <h1 className="title is-3 mb-2">Order placed!</h1>
          <p className="has-text-grey mb-5">Thank you for your purchase.</p>

          {summary.length > 0 && (
            <div className="has-text-left mb-5" style={{ borderTop: '1px solid #f0f0f0', paddingTop: '1rem' }}>
              <p className="has-text-weight-semibold mb-3">You purchased:</p>
              {summary.map((item, i) => (
                <div key={i} className="is-flex is-justify-content-space-between mb-2">
                  <span className="is-size-6">
                    {item.name}
                    {item.price.price_type === 'recurring'
                      ? ` (${INTERVAL_LABEL[item.price.interval] || item.price.interval})`
                      : item.quantity > 1 ? ` × ${item.quantity}` : ''}
                  </span>
                  <span className="is-size-6">
                    {item.price.price_type === 'one_time'
                      ? formatPrice(item.price.amount * item.quantity, item.price.currency)
                      : formatPrice(item.price.amount, item.price.currency) + `/${item.price.interval}`}
                  </span>
                </div>
              ))}
            </div>
          )}

          <div className="buttons is-centered">
            <Link to="/billing/subscription" className="button is-primary">Manage Subscription</Link>
            <Link to="/" className="button is-light">Home</Link>
          </div>
        </div>
      </div>
    </section>
  );
}
