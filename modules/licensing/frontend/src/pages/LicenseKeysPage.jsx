import { useEffect, useState } from 'react';
import { getLicenses, createInstallToken } from '../api.js';

export default function LicenseKeysPage() {
  const [licenses, setLicenses]           = useState([]);
  const [loading, setLoading]             = useState(true);
  const [error, setError]                 = useState(null);
  const [installTokens, setInstallTokens] = useState({});

  useEffect(() => {
    async function load() {
      try {
        const res = await getLicenses();
        if (res.ok) {
          const data = await res.json();
          setLicenses(data);
        } else {
          const data = await res.json();
          setError(data.detail || data.error || 'Failed to load licenses.');
        }
      } catch {
        setError('Network error.');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  async function handleGetInstallKey(licenseKeyUuid) {
    setInstallTokens(prev => ({ ...prev, [licenseKeyUuid]: { loading: true, token: null, error: null } }));
    try {
      const res  = await createInstallToken(licenseKeyUuid);
      const data = await res.json();
      if (res.ok) {
        setInstallTokens(prev => ({ ...prev, [licenseKeyUuid]: { loading: false, token: data.token, error: null } }));
      } else {
        setInstallTokens(prev => ({ ...prev, [licenseKeyUuid]: { loading: false, token: null, error: data.error || 'Failed to generate install key.' } }));
      }
    } catch {
      setInstallTokens(prev => ({ ...prev, [licenseKeyUuid]: { loading: false, token: null, error: 'Network error.' } }));
    }
  }

  function handleCopy(token) {
    navigator.clipboard.writeText(token);
  }

  return (
    <section className="section">
      <div className="container" style={{ maxWidth: 680 }}>
        <h1 className="title">License Keys</h1>

        {error && <div className="notification is-danger is-light mb-4">{error}</div>}
        {loading && <p className="has-text-grey">Loading…</p>}

        {!loading && licenses.length === 0 && !error && (
          <div className="box has-text-grey">No license keys found.</div>
        )}

        {!loading && licenses.map(lic => {
          const state          = installTokens[lic.key] || {};
          const slotsLeft      = lic.max_machines - lic.machines_used;
          const slotsAvailable = slotsLeft > 0;

          return (
            <div key={lic.key} className="box mb-3">
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
                  onClick={() => handleGetInstallKey(lic.key)}
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
                  <p className="is-size-7 has-text-grey">Single use &middot; expires in 7 days</p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
