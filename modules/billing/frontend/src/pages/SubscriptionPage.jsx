import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { addBreadcrumb } from '@core/frontend/utils/logger';
import { getSubscription, openPortal } from '../api.js';

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

export default function SubscriptionPage() {
  const [sub, setSub]           = useState(null);
  const [error, setError]       = useState(null);
  const [loading, setLoading]   = useState(true);
  const [opening, setOpening]   = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const res = await getSubscription();
        if (res.status === 401) {
          setError('Please log in to view your subscription.');
          return;
        }
        const data = await res.json();
        if (!res.ok) {
          setError(data.detail || data.error || 'Failed to load subscription.');
          return;
        }
        setSub(data[0] || null);
      } catch {
        setError('Failed to load subscription.');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  async function handlePortal() {
    addBreadcrumb('billing portal opened', {}, 'info');
    setOpening(true);
    try {
      const res  = await openPortal();
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Could not open billing portal.');
        return;
      }
      window.location.href = data.url;
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setOpening(false);
    }
  }

  const hasSubscription = sub && sub.status !== 'none';
  const tagColor = hasSubscription ? (STATUS_COLOR[sub.status] || 'is-light') : 'is-light';

  return (
    <section className="section">
      <div className="container" style={{ maxWidth: 540 }}>
        <h1 className="title">Your Subscription</h1>

        {error && (
          <div className="notification is-danger is-light mb-4">{error}</div>
        )}

        {loading && <p className="has-text-grey">Loading…</p>}

        {!loading && !hasSubscription && (
          <div className="box">
            <p className="mb-4">You don't have an active subscription.</p>
            <Link to="/billing/pricing" className="button is-primary">
              View Plans
            </Link>
          </div>
        )}

        {!loading && hasSubscription && (
          <div className="box">
            <div className="level is-mobile mb-3">
              <div className="level-left">
                <p className="is-size-5 has-text-weight-semibold">Status</p>
              </div>
              <div className="level-right">
                <span className={`tag is-medium ${tagColor}`}>
                  {sub.status.replace('_', ' ')}
                </span>
              </div>
            </div>

            <p className="mb-1">
              <span className="has-text-grey">Price ID:</span>{' '}
              <code>{sub.items?.[0]?.stripe_price_id}</code>
            </p>

            <p className="mb-4">
              <span className="has-text-grey">
                {sub.cancel_at_period_end ? 'Cancels on:' : 'Renews on:'}
              </span>{' '}
              {new Date(sub.current_period_end).toLocaleDateString()}
            </p>

            {sub.cancel_at_period_end && (
              <div className="notification is-warning is-light mb-4">
                Your subscription will cancel at the end of the current period.
              </div>
            )}

            <button
              className={`button is-primary${opening ? ' is-loading' : ''}`}
              disabled={opening}
              onClick={handlePortal}
            >
              Manage Billing
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
