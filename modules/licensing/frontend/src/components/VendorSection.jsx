import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getVendorPools } from '../api.js';

export default function VendorSection() {
  const [pools, setPools]     = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getVendorPools()
      .then(res => res.ok ? res.json() : [])
      .then(data => { if (Array.isArray(data)) setPools(data); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (!loading && pools.length === 0) return null;

  const totalRemaining = pools.reduce((sum, p) => sum + p.seats_remaining, 0);
  const totalIssued    = pools.reduce((sum, p) => sum + p.seats_issued, 0);

  return (
    <div className="card" style={{ width: '100%' }}>
      <header className="card-header">
          <p className="card-header-title">Vendor Portal</p>
      </header>

      <div className="card-content">

        <div className="level-right">
          <Link to="/vendor/portal" className="button is-small is-light">Manage</Link>
        </div>

      {loading ? (
        <p className="has-text-grey is-size-7">Loading…</p>
      ) : (
        <p className="is-size-6">
          <span className="has-text-weight-semibold">{pools.length}</span>
          <span className="has-text-grey"> pool{pools.length !== 1 ? 's' : ''}</span>
          {' · '}
          <span className="has-text-weight-semibold">{totalIssued}</span>
          <span className="has-text-grey"> issued</span>
          {totalRemaining > 0 && (
            <>
              {' · '}
              <span className="has-text-weight-semibold">{totalRemaining}</span>
              <span className="has-text-grey"> remaining</span>
            </>
          )}
        </p>

      )}
        </div>
    </div>
  );
}
