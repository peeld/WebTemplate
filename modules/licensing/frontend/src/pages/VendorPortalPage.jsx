import { useEffect, useState } from 'react';
import { getVendorPools, getVendorTokens, createVendorTokens, revokeVendorToken } from '../api.js';

export default function VendorPortalPage() {
  const [pools, setPools]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);
  const [tokens, setTokens]     = useState({});   // poolId → { loading, data, error }
  const [modal, setModal]       = useState(null);  // { poolId, count, label, submitting, error }
  const [revoking, setRevoking] = useState({});    // tokenId → true while revoke is in-flight

  async function loadTokens(poolId) {
    setTokens(prev => ({ ...prev, [poolId]: { loading: true, data: [], error: null } }));
    try {
      const res = await getVendorTokens(poolId);
      if (res.ok) {
        const data = await res.json();
        setTokens(prev => ({ ...prev, [poolId]: { loading: false, data, error: null } }));
      } else {
        setTokens(prev => ({ ...prev, [poolId]: { loading: false, data: [], error: 'Failed to load tokens.' } }));
      }
    } catch {
      setTokens(prev => ({ ...prev, [poolId]: { loading: false, data: [], error: 'Network error.' } }));
    }
  }

  useEffect(() => {
    async function load() {
      try {
        const res = await getVendorPools();
        if (res.ok) {
          const data = await res.json();
          setPools(data);
          data.forEach(pool => loadTokens(pool.id));
        } else {
          const data = await res.json();
          setError(data.detail || data.error || 'Failed to load vendor pools.');
        }
      } catch {
        setError('Network error.');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function openModal(poolId, seatsRemaining) {
    setModal({ poolId, seatsRemaining, count: 1, label: '', submitting: false, error: null });
  }

  function closeModal() {
    setModal(null);
  }

  async function submitTokenRequest() {
    const { poolId, count, label } = modal;
    setModal(prev => ({ ...prev, submitting: true, error: null }));
    try {
      const res  = await createVendorTokens(poolId, count, label);
      const data = await res.json();
      if (res.ok) {
        setModal(prev => ({ ...prev, submitting: false, createdTokens: data.tokens }));
        loadTokens(poolId);
        const poolsRes = await getVendorPools();
        if (poolsRes.ok) setPools(await poolsRes.json());
      } else {
        setModal(prev => ({ ...prev, submitting: false, error: data.error || data.detail || 'Failed to create tokens.' }));
      }
    } catch {
      setModal(prev => ({ ...prev, submitting: false, error: 'Network error.' }));
    }
  }

  async function revokeToken(poolId, tokenId) {
    if (!window.confirm('Revoke this token? The seat will be freed and the token will no longer work.')) return;
    setRevoking(prev => ({ ...prev, [tokenId]: true }));
    try {
      const res = await revokeVendorToken(poolId, tokenId);
      if (res.ok) {
        loadTokens(poolId);
        const poolsRes = await getVendorPools();
        if (poolsRes.ok) setPools(await poolsRes.json());
      } else {
        const data = await res.json();
        alert(data.error || data.detail || 'Failed to revoke token.');
      }
    } catch {
      alert('Network error.');
    } finally {
      setRevoking(prev => { const next = { ...prev }; delete next[tokenId]; return next; });
    }
  }

  const byOrg = pools.reduce((acc, pool) => {
    const key = pool.org_id;
    if (!acc[key]) acc[key] = { org_name: pool.org_name, pools: [] };
    acc[key].pools.push(pool);
    return acc;
  }, {});

  return (
    <section className="section">
      <div className="container" style={{ maxWidth: 860 }}>
        <h1 className="title">Vendor Portal</h1>

        {error && <div className="notification is-danger is-light mb-4">{error}</div>}
        {loading && <p className="has-text-grey">Loading…</p>}

        {!loading && pools.length === 0 && !error && (
          <div className="box has-text-grey">You are not registered as a vendor.</div>
        )}

        {!loading && Object.values(byOrg).map(({ org_name, pools: orgPools }) => (
          <div key={org_name} className="mb-5">
            <h2 className="subtitle is-4 mb-3">{org_name}</h2>

            {orgPools.map(pool => {
              const ts  = tokens[pool.id] || { loading: false, data: [], error: null };
              const pct = pool.seats_purchased > 0
                ? Math.round((pool.seats_issued / pool.seats_purchased) * 100)
                : 0;

              return (
                <div key={pool.id} className="box mb-4">
                  <div className="level is-mobile mb-3">
                    <div className="level-left">
                      <div>
                        <p className="has-text-weight-semibold is-size-5 mb-0">{pool.product_name}</p>
                        <p className="is-size-7 has-text-grey">{pool.price_label}</p>
                      </div>
                    </div>
                    <div className="level-right">
                      <button
                        className="button is-info is-small"
                        onClick={() => openModal(pool.id, pool.seats_remaining)}
                        disabled={pool.seats_remaining <= 0}
                      >
                        Generate Tokens
                      </button>
                    </div>
                  </div>

                  <p className="is-size-7 has-text-grey mb-1">
                    Seats: {pool.seats_issued} issued / {pool.seats_purchased} purchased ({pool.seats_remaining} remaining)
                  </p>
                  <progress
                    className={`progress is-small mb-3 ${pct >= 100 ? 'is-danger' : 'is-info'}`}
                    value={pool.seats_issued}
                    max={pool.seats_purchased}
                  />

                  {ts.loading && <p className="has-text-grey is-size-7">Loading tokens…</p>}
                  {ts.error   && <p className="has-text-danger is-size-7">{ts.error}</p>}
                  {!ts.loading && ts.data.length === 0 && !ts.error && (
                    <p className="has-text-grey is-size-7">No tokens issued yet.</p>
                  )}
                  {!ts.loading && ts.data.length > 0 && (
                    <table className="table is-fullwidth is-narrow is-size-7">
                      <thead>
                        <tr>
                          <th>Label</th>
                          <th>Status</th>
                          <th>Created</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {ts.data.map(t => (
                          <tr key={t.id} style={{ opacity: t.redeemed ? 0.5 : 1 }}>
                            <td>{t.label || <span className="has-text-grey">—</span>}</td>
                            <td>
                              <span className={`tag is-small ${t.redeemed ? 'is-light' : 'is-success is-light'}`}>
                                {t.redeemed ? 'Redeemed' : 'Active'}
                              </span>
                            </td>
                            <td className="has-text-grey">
                              {new Date(t.created_at).toLocaleDateString()}
                            </td>
                            <td>
                              {!t.redeemed && (
                                <button
                                  className={`button is-danger is-small is-light${revoking[t.id] ? ' is-loading' : ''}`}
                                  onClick={() => revokeToken(pool.id, t.id)}
                                  disabled={!!revoking[t.id]}
                                >
                                  Revoke
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {modal && (
        <div className="modal is-active">
          <div className="modal-background" onClick={!modal.submitting ? closeModal : undefined} />
          <div className="modal-card">
            <header className="modal-card-head">
              <p className="modal-card-title">
                {modal.createdTokens ? 'Tokens Generated' : 'Generate Install Tokens'}
              </p>
              <button className="delete" aria-label="close" onClick={closeModal} disabled={modal.submitting} />
            </header>
            <section className="modal-card-body">
              {modal.createdTokens ? (
                <>
                  <div className="notification is-success is-light mb-3">
                    <strong>Copy these tokens now.</strong> They will not be shown again.
                  </div>
                  {modal.createdTokens.map((tok, i) => (
                    <div key={i} className="field has-addons mb-2">
                      <div className="control is-expanded">
                        <input className="input is-family-monospace" readOnly value={tok} />
                      </div>
                      <div className="control">
                        <button
                          className="button"
                          onClick={() => navigator.clipboard.writeText(tok)}
                          title="Copy"
                        >
                          Copy
                        </button>
                      </div>
                    </div>
                  ))}
                </>
              ) : (
                <>
                  {modal.error && (
                    <div className="notification is-danger is-light mb-3">{modal.error}</div>
                  )}
                  <div className="field">
                    <label className="label">Count (1–{modal.seatsRemaining})</label>
                    <div className="control">
                      <input
                        className="input"
                        type="number"
                        min="1"
                        max={modal.seatsRemaining}
                        value={modal.count}
                        onChange={e => setModal(prev => ({ ...prev, count: parseInt(e.target.value, 10) || 1 }))}
                      />
                    </div>
                  </div>
                  <div className="field">
                    <label className="label">
                      Label <span className="has-text-grey is-size-7">(optional)</span>
                    </label>
                    <div className="control">
                      <input
                        className="input"
                        type="text"
                        placeholder="e.g. Acme Corp"
                        value={modal.label}
                        onChange={e => setModal(prev => ({ ...prev, label: e.target.value }))}
                      />
                    </div>
                  </div>
                </>
              )}
            </section>
            <footer className="modal-card-foot">
              {modal.createdTokens ? (
                <button className="button is-success" onClick={closeModal}>Done</button>
              ) : (
                <>
                  <button
                    className={`button is-info${modal.submitting ? ' is-loading' : ''}`}
                    onClick={submitTokenRequest}
                    disabled={modal.submitting || modal.count < 1 || modal.count > modal.seatsRemaining}
                  >
                    Generate Tokens
                  </button>
                  <button className="button" onClick={closeModal} disabled={modal.submitting}>
                    Cancel
                  </button>
                </>
              )}
            </footer>
          </div>
        </div>
      )}
    </section>
  );
}
