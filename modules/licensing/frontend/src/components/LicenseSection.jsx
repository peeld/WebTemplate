import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getLicenses } from '../api.js';

export default function LicenseSection() {
  const [licenses, setLicenses] = useState([]);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    getLicenses()
      .then(res => res.ok ? res.json() : [])
      .then(data => { if (Array.isArray(data)) setLicenses(data); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const active = licenses.filter(l => l.is_active).length;

  return (
    <div className="card" style={{ width: '100%' }}>
      <header className="card-header">
          <p className="card-header-title">Licenses</p>
      </header>
      <div className="card-content">

        <div className="level-right">
          <Link to="/licensing/keys" className="button is-small is-primary">Manage</Link>
        </div>
      {loading ? (
        <p className="has-text-grey is-size-7">Loading…</p>
      ) : licenses.length === 0 ? (
        <p className="has-text-grey is-size-7">No license keys found.</p>
      ) : (
        <p className="is-size-6">
          <span className="has-text-weight-semibold">{active}</span>
          <span className="has-text-grey"> active license{active !== 1 ? 's' : ''}</span>
          {licenses.length > active && (
            <span className="has-text-grey"> ({licenses.length - active} inactive)</span>
          )}
        </p>
      )}
      </div>
    </div>
  );
}
