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

export default function BillingUserSection() {
  const [sub, setSub]         = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await getSubscription();
        if (res.status === 401) { setLoading(false); return; }
        const data = await res.json();
        if (res.ok) setSub(data);
        else setError(data.detail || data.error || 'Failed to load subscription.');
      } catch {
        setError('Network error.');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const hasSubscription = sub && sub.status !== 'none';
  const tagColor = hasSubscription ? (STATUS_COLOR[sub.status] || 'is-light') : 'is-light';

  return (
    <div className="card" style={{ width: '100%' }}>
      <header className="card-header">
        <p className="card-header-title">Billing</p>
      </header>

      <div className="card-content">
        {error && <p className="has-text-danger mb-3">{error}</p>}

        {loading && <p className="has-text-grey">Loading…</p>}

        {!loading && !hasSubscription && (
          <p className="has-text-grey">No active subscription.</p>
        )}

        {!loading && hasSubscription && (
          <>
            <div className="level is-mobile mb-2">
              <div className="level-left">
                <p className="has-text-weight-medium">
                  {sub.product_name || 'Subscription'}
                </p>
              </div>
              <div className="level-right">
                <span className={`tag ${tagColor}`}>
                  {sub.status.replace(/_/g, ' ')}
                </span>
              </div>
            </div>

            <p className="is-size-7 has-text-grey">
              {sub.cancel_at_period_end ? 'Cancels' : 'Renews'}{' '}
              {new Date(sub.current_period_end).toLocaleDateString()}
            </p>

            {sub.cancel_at_period_end && (
              <p className="is-size-7 has-text-warning mt-1">
                Will not renew at end of period.
              </p>
            )}
          </>
        )}
      </div>

      <footer className="card-footer">
        <Link to="/billing/pricing" className="card-footer-item">
          {hasSubscription ? 'Change Plan' : 'View Plans'}
        </Link>
        {hasSubscription && (
          <Link to="/billing/manage" className="card-footer-item">
            Manage Billing
          </Link>
        )}
      </footer>
    </div>
  );
}
