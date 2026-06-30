import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getSubscription } from '../api.js';

const STATUS_COLOR = {
  active:             'is-success',
  trialing:           'is-info',
  past_due:           'is-warning',
  canceled:           'is-danger',
  incomplete:         'is-warning',
  unpaid:             'is-danger',
  paused:             'is-warning',
  incomplete_expired: 'is-danger',
};

export default function AccountPage() {
  const [subs, setSubs]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await getSubscription();
        if (res.ok) {
          const data = await res.json();
          setSubs(Array.isArray(data) ? data : []);
        } else if (res.status !== 401) {
          const data = await res.json();
          setError(data.detail || data.error || 'Failed to load subscriptions.');
        }
      } catch {
        setError('Network error.');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return (
    <section className="section">
      <div className="container" style={{ maxWidth: 680 }}>
        <nav className="breadcrumb mb-4" aria-label="breadcrumbs">
          <ul>
            <li><Link to="/dashboard">My Account</Link></li>
            <li className="is-active"><a>Subscriptions</a></li>
          </ul>
        </nav>

        <h1 className="title">Subscriptions</h1>

        {error && <div className="notification is-danger is-light mb-4">{error}</div>}
        {loading && <p className="has-text-grey">Loading…</p>}

        {!loading && (
          <>
            {subs.length === 0 ? (
              <div className="box has-text-grey mb-5">
                No active subscriptions.{' '}
                <Link to="/billing/pricing">View plans</Link>
              </div>
            ) : (
              <div className="mb-5">
                {subs.map(sub => {
                  const color = STATUS_COLOR[sub.status] || 'is-light';
                  return (
                    <div key={sub.stripe_subscription_id} className="box mb-3">
                      <div className="level is-mobile mb-2">
                        <div className="level-left">
                          <div>
                            {sub.items.map(item => (
                              <p key={item.stripe_price_id} className="has-text-weight-semibold">
                                {item.product_name || item.stripe_price_id}
                                {item.quantity > 1 && (
                                  <span className="has-text-grey ml-1">&times;{item.quantity}</span>
                                )}
                              </p>
                            ))}
                          </div>
                        </div>
                        <div className="level-right">
                          <span className={`tag is-medium ${color}`}>
                            {sub.status.replace(/_/g, ' ')}
                          </span>
                        </div>
                      </div>

                      <p className="is-size-7 has-text-grey">
                        {sub.cancel_at_period_end ? 'Access until' : 'Renews'}{' '}
                        <strong>{new Date(sub.current_period_end).toLocaleDateString()}</strong>
                      </p>

                      {sub.cancel_at_period_end && (
                        <p className="is-size-7 has-text-warning mt-1">
                          Subscription ends at period close and will not renew.
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            <div className="buttons">
              <Link to="/billing/manage" className="button is-light">Manage Billing</Link>
              <Link to="/billing/pricing" className="button is-light">View Plans</Link>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
