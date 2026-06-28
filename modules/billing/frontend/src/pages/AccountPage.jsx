import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getSubscription, getLicenses, createInstallToken } from '../api.js';

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
  const [subs, setSubs]               = useState([]);
  const [licenses, setLicenses]       = useState([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState(null);
  const [installTokens, setInstallTokens] = useState({});

  useEffect(() => {
    async function load() {
      try {
        const [subRes, licRes] = await Promise.all([getSubscription(), getLicenses()]);
        if (subRes.ok) {
          const data = await subRes.json();
          setSubs(Array.isArray(data) ? data : []);
        } else if (subRes.status !== 401) {
          const data = await subRes.json();
          setError(data.detail || data.error || 'Failed to load subscriptions.');
        }
        if (licRes.ok) {
          const data = await licRes.json();
          setLicenses(data);
        }
      } catch {
        setError('Network error.');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  async function handleGetInstallKey(licenseId) {
    setInstallTokens(prev => ({ ...prev, [licenseId]: { loading: true, token: null, error: null } }));
    try {
      const res  = await createInstallToken(licenseId);
      const data = await res.json();
      if (res.ok) {
        setInstallTokens(prev => ({ ...prev, [licenseId]: { loading: false, token: data.token, error: null } }));
      } else {
        setInstallTokens(prev => ({ ...prev, [licenseId]: { loading: false, token: null, error: data.error || 'Failed to generate key.' } }));
      }
    } catch {
      setInstallTokens(prev => ({ ...prev, [licenseId]: { loading: false, token: null, error: 'Network error.' } }));
    }
  }

  function handleCopy(token) {
    navigator.clipboard.writeText(token);
  }

  return (
    <section className="section">
      <div className="container" style={{ maxWidth: 680 }}>
        <nav className="breadcrumb mb-4" aria-label="breadcrumbs">
          <ul>
            <li><Link to="/dashboard">My Account</Link></li>
            <li className="is-active"><a>Licenses &amp; Subscriptions</a></li>
          </ul>
        </nav>

        <h1 className="title">Licenses &amp; Subscriptions</h1>

        {error && <div className="notification is-danger is-light mb-4">{error}</div>}
        {loading && <p className="has-text-grey">Loading…</p>}

        {!loading && (
          <>
            <h2 className="subtitle is-5 mb-3">Subscriptions</h2>

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

            <h2 className="subtitle is-5 mb-3">Licenses</h2>

            {licenses.length === 0 ? (
              <div className="box has-text-grey mb-5">
                No licenses found.
              </div>
            ) : (
              <div className="mb-5">
                {licenses.map(lic => {
                  const state         = installTokens[lic.id] || {};
                  const slotsLeft     = lic.max_machines - lic.machines_used;
                  const slotsAvailable = slotsLeft > 0;

                  return (
                    <div key={lic.id} className="box mb-3">
                      <div className="level is-mobile mb-3">
                        <div className="level-left">
                          <p className="has-text-weight-semibold is-size-5">{lic.product_name}</p>
                        </div>
                        <div className="level-right">
                          <span className={`tag ${lic.is_active ? 'is-success' : 'is-danger'}`}>
                            {lic.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </div>
                      </div>

                      <div className="columns is-mobile mb-2">
                        <div className="column is-half">
                          <p className="is-size-7 has-text-grey mb-1">Installations</p>
                          <p className="is-size-6">
                            {lic.machines_used} / {lic.max_machines}
                            {slotsAvailable
                              ? <span className="has-text-success ml-2 is-size-7">{slotsLeft} slot{slotsLeft !== 1 ? 's' : ''} available</span>
                              : <span className="has-text-grey ml-2 is-size-7">no slots available</span>
                            }
                          </p>
                        </div>

                        <div className="column is-half">
                          <p className="is-size-7 has-text-grey mb-1">Expires</p>
                          <p className="is-size-6">
                            {lic.expires_at
                              ? new Date(lic.expires_at).toLocaleDateString()
                              : <span className="has-text-grey">While subscription active</span>
                            }
                          </p>
                        </div>
                      </div>

                      {slotsAvailable && !state.token && (
                        <button
                          className={`button is-info is-small${state.loading ? ' is-loading' : ''}`}
                          onClick={() => handleGetInstallKey(lic.id)}
                          disabled={state.loading}
                        >
                          Get Install Key
                        </button>
                      )}

                      {state.error && (
                        <p className="is-size-7 has-text-danger mt-2">{state.error}</p>
                      )}

                      {state.token && (
                        <div className="notification is-info is-light py-2 px-3 mt-2">
                          <div className="level is-mobile mb-1">
                            <div className="level-left">
                              <code className="is-size-6">{state.token}</code>
                            </div>
                            <div className="level-right">
                              <button
                                className="button is-small is-white"
                                onClick={() => handleCopy(state.token)}
                              >
                                Copy
                              </button>
                            </div>
                          </div>
                          <p className="is-size-7 has-text-grey">Single use &middot; expires in 24 hours</p>
                        </div>
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
