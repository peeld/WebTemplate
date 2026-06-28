import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { addBreadcrumb } from '@core/frontend/utils/logger';
import { getSubscription, cancelSubscription, resumeSubscription, changeSubscription, getProducts } from '../api.js';

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

export default function ManageBillingPage() {
  const [sub, setSub]                 = useState(null);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState(null);
  const [working, setWorking]         = useState(false);
  const [confirm, setConfirm]         = useState(false);
  const [showChangePlan, setShowChangePlan] = useState(false);
  const [plans, setPlans]             = useState([]);
  const [plansLoading, setPlansLoading] = useState(false);
  const [planError, setPlanError]     = useState(null);
  const [selectedPrice, setSelectedPrice] = useState(null);

  useEffect(() => {
    async function load() {
      try {
        const res  = await getSubscription();
        if (res.status === 401) { setLoading(false); return; }
        const data = await res.json();
        if (res.ok) setSub(data[0] || null);
        else setError(data.detail || data.error || 'Failed to load subscription.');
      } catch {
        setError('Network error.');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  async function handleCancel() {
    addBreadcrumb('subscription cancel requested', {}, 'info');
    setWorking(true);
    setError(null);
    try {
      const res  = await cancelSubscription(sub.stripe_subscription_id);
      const data = await res.json();
      if (res.ok) { setSub(data); setConfirm(false); }
      else setError(data.error || 'Failed to cancel subscription.');
    } catch {
      setError('Network error.');
    } finally {
      setWorking(false);
    }
  }

  async function handleResume() {
    addBreadcrumb('subscription resume requested', {}, 'info');
    setWorking(true);
    setError(null);
    try {
      const res  = await resumeSubscription(sub.stripe_subscription_id);
      const data = await res.json();
      if (res.ok) setSub(data);
      else setError(data.error || 'Failed to resume subscription.');
    } catch {
      setError('Network error.');
    } finally {
      setWorking(false);
    }
  }

  async function handleOpenChangePlan() {
    setShowChangePlan(true);
    setSelectedPrice(null);
    setPlansLoading(true);
    setPlanError(null);
    try {
      const res  = await getProducts();
      const data = await res.json();
      if (!res.ok) { setPlanError(data.error || 'Failed to load plans.'); return; }
      const prices = [];
      for (const product of data) {
        for (const price of product.prices) {
          if (price.price_type === 'recurring' && price.is_active) {
            prices.push({ ...price, productName: product.name });
          }
        }
      }
      setPlans(prices);
    } catch {
      setPlanError('Network error.');
    } finally {
      setPlansLoading(false);
    }
  }

  async function handleChangePlan() {
    setWorking(true);
    setError(null);
    try {
      const res  = await changeSubscription(sub.stripe_subscription_id, selectedPrice);
      const data = await res.json();
      if (res.ok) {
        setSub(data);
        setShowChangePlan(false);
        setSelectedPrice(null);
      } else {
        setError(data.error || 'Failed to change plan.');
      }
    } catch {
      setError('Network error.');
    } finally {
      setWorking(false);
    }
  }

  const hasSubscription = sub && sub.status !== 'none';
  const canCancel  = hasSubscription && !sub.cancel_at_period_end && ['active', 'trialing'].includes(sub.status);
  const canResume  = hasSubscription && sub.cancel_at_period_end;
  const tagColor   = hasSubscription ? (STATUS_COLOR[sub.status] || 'is-light') : 'is-light';

  return (
    <section className="section">
      <div className="container" style={{ maxWidth: 560 }}>
        <nav className="breadcrumb mb-4" aria-label="breadcrumbs">
          <ul>
            <li><Link to="/dashboard">My Account</Link></li>
            <li className="is-active"><a>Manage Billing</a></li>
          </ul>
        </nav>

        <h1 className="title">Manage Billing</h1>

        {error && (
          <div className="notification is-danger is-light mb-4">{error}</div>
        )}

        {loading && <p className="has-text-grey">Loading…</p>}

        {!loading && !hasSubscription && (
          <div className="box">
            <p className="mb-4">You don't have an active subscription.</p>
            <Link to="/billing/pricing" className="button is-primary">View Plans</Link>
          </div>
        )}

        {!loading && hasSubscription && (
          <div className="box">
            <div className="level is-mobile mb-4">
              <div className="level-left">
                <div>
                  <p className="is-size-5 has-text-weight-semibold">
                    {sub.items?.[0]?.product_name || 'Subscription'}
                  </p>
                  <p className="is-size-7 has-text-grey">{sub.items?.[0]?.stripe_price_id}</p>
                </div>
              </div>
              <div className="level-right">
                <span className={`tag is-medium ${tagColor}`}>
                  {sub.status.replace(/_/g, ' ')}
                </span>
              </div>
            </div>

            <p className="mb-2">
              <span className="has-text-grey">
                {sub.cancel_at_period_end ? 'Access until:' : 'Next renewal:'}
              </span>{' '}
              <strong>{new Date(sub.current_period_end).toLocaleDateString()}</strong>
            </p>

            {sub.cancel_at_period_end && (
              <div className="notification is-warning is-light mt-3 mb-4">
                Your subscription is set to cancel at the end of the current period. You won't be charged again.
              </div>
            )}

            <hr />

            {canResume && (
              <div className="mb-4">
                <p className="mb-3">Changed your mind? Resume your subscription and keep access after the current period.</p>
                <button
                  className={`button is-primary${working ? ' is-loading' : ''}`}
                  disabled={working}
                  onClick={handleResume}
                >
                  Resume Subscription
                </button>
              </div>
            )}

            {canCancel && !confirm && (
              <div>
                <p className="mb-3 has-text-grey is-size-7">
                  Cancelling will stop your subscription at the end of the current billing period. You'll keep access until then.
                </p>
                <button
                  className="button is-danger is-light"
                  onClick={() => setConfirm(true)}
                >
                  Cancel Subscription
                </button>
              </div>
            )}

            {canCancel && confirm && (
              <div className="notification is-danger is-light">
                <p className="mb-3">
                  <strong>Are you sure?</strong> Your subscription will end on{' '}
                  {new Date(sub.current_period_end).toLocaleDateString()} and will not renew.
                </p>
                <div className="buttons">
                  <button
                    className={`button is-danger${working ? ' is-loading' : ''}`}
                    disabled={working}
                    onClick={handleCancel}
                  >
                    Yes, cancel my subscription
                  </button>
                  <button
                    className="button is-light"
                    disabled={working}
                    onClick={() => setConfirm(false)}
                  >
                    Never mind
                  </button>
                </div>
              </div>
            )}

            <div className="mt-5">
              {!showChangePlan && (
                <button className="button is-light" onClick={handleOpenChangePlan}>
                  Change Plan
                </button>
              )}

              {showChangePlan && (
                <div>
                  <p className="has-text-weight-semibold mb-3">Select a new plan</p>
                  {plansLoading && <p className="has-text-grey is-size-7">Loading plans…</p>}
                  {planError && <p className="has-text-danger is-size-7 mb-2">{planError}</p>}
                  {!plansLoading && plans.map(p => {
                    const isCurrent = p.stripe_price_id === sub.items?.[0]?.stripe_price_id;
                    const isSelected = selectedPrice === p.stripe_price_id;
                    return (
                      <div
                        key={p.stripe_price_id}
                        className={`box mb-2${isSelected ? ' has-background-primary-light' : ''}`}
                        style={{ cursor: isCurrent ? 'default' : 'pointer' }}
                        onClick={() => !isCurrent && setSelectedPrice(p.stripe_price_id)}
                      >
                        <div className="level is-mobile">
                          <div className="level-left">
                            <div>
                              <p className="has-text-weight-medium">{p.productName}</p>
                              <p className="is-size-7 has-text-grey">
                                {(p.amount / 100).toLocaleString('en-US', { style: 'currency', currency: p.currency.toUpperCase() })} / {p.interval}
                              </p>
                            </div>
                          </div>
                          <div className="level-right">
                            {isCurrent && <span className="tag is-info is-light">Current</span>}
                            {isSelected && !isCurrent && <span className="tag is-primary is-light">Selected</span>}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  <div className="buttons mt-3">
                    {selectedPrice && selectedPrice !== sub.items?.[0]?.stripe_price_id && (
                      <button
                        className={`button is-primary${working ? ' is-loading' : ''}`}
                        disabled={working}
                        onClick={handleChangePlan}
                      >
                        Confirm Change
                      </button>
                    )}
                    <button
                      className="button is-light"
                      disabled={working}
                      onClick={() => { setShowChangePlan(false); setSelectedPrice(null); }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
