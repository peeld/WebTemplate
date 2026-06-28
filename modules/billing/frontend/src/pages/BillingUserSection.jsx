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

export default function BillingUserSection() {
  const [sub, setSub]               = useState(null);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState(null);
  const [licenses, setLicenses]     = useState([]);
  const [installTokens, setInstallTokens] = useState({});

  useEffect(() => {
    async function load() {
      try {
        const [subRes, licRes] = await Promise.all([getSubscription(), getLicenses()]);
        if (subRes.status !== 401) {
          const subData = await subRes.json();
          if (subRes.ok) setSub(subData[0] || null);
          else setError(subData.detail || subData.error || 'Failed to load subscription.');
        }
        if (licRes.ok) {
          const licData = await licRes.json();
          setLicenses(licData);
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

  const hasSubscription = sub && sub.status && sub.status !== 'none';
  const tagColor = hasSubscription ? (STATUS_COLOR[sub.status] || 'is-light') : 'is-light';

  return (
    <>
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
                  {sub.items?.[0]?.product_name || 'Subscription'}
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

          {licenses.length > 0 && (
      <>

          {licenses.map(lic => {
            const state = installTokens[lic.id] || {};
            return (
              <div key={lic.id} className="mb-4">
                <div className="level is-mobile mb-2">
                  <div className="level-left">
                    <p className="has-text-weight-medium">{lic.product_name}</p>
                  </div>
                  <div className="level-right">
                    {lic.machines_used < lic.max_machines && (
                      <button
                        className={`button is-small is-info${state.loading ? ' is-loading' : ''}`}
                        onClick={() => handleGetInstallKey(lic.id)}
                        disabled={state.loading}
                      >
                        Get Install Key
                      </button>
                    )}
                  </div>
                </div>

                {state.error && (
                  <p className="is-size-7 has-text-danger">{state.error}</p>
                )}

                {state.token && (
                  <div className="notification is-info is-light py-2 px-3">
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
      </>
    )}

      </div>

      <footer className="card-footer">
        <Link to="/billing/account" className="card-footer-item">
          My Licenses
        </Link>
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


    </>
  );
}
