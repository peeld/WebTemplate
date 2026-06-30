import { useCallback, useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { getReleases, setLatestRelease, updateRelease, deleteRelease } from '../api.js';

function isStaff() {
  const token = localStorage.getItem('access');
  if (!token) return false;
  try { return !!JSON.parse(atob(token.split('.')[1])).is_staff; } catch { return false; }
}

export default function ManageReleases() {
  const [releases, setReleases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filterProduct, setFilterProduct] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    const params = {};
    if (filterProduct) params.product_id = filterProduct;
    if (filterStatus) params.status = filterStatus;
    getReleases(params)
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) setReleases(data);
        else setError('Failed to load releases.');
      })
      .catch(() => setError('Network error.'))
      .finally(() => setLoading(false));
  }, [filterProduct, filterStatus]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSetLatest(id) {
    await setLatestRelease(id);
    load();
  }

  async function handleToggleStatus(release) {
    await updateRelease(release.id, { status: release.status === 'published' ? 'draft' : 'published' });
    load();
  }

  async function handleDelete(id) {
    if (!window.confirm('Delete this release and all its assets?')) return;
    await deleteRelease(id);
    load();
  }

  if (!isStaff()) return <Navigate to="/downloads/" replace />;

  return (
    <section className="section">
      <div className="container">
        <div className="is-flex is-justify-content-space-between is-align-items-center mb-5">
          <h1 className="title mb-0">Manage Releases</h1>
          <Link className="button is-primary" to="/downloads/manage/new/">New Release</Link>
        </div>

        <div className="columns mb-4">
          <div className="column is-narrow">
            <div className="field">
              <label className="label is-small">Product ID</label>
              <div className="control">
                <input
                  className="input is-small"
                  type="number"
                  placeholder="All"
                  value={filterProduct}
                  onChange={e => setFilterProduct(e.target.value)}
                />
              </div>
            </div>
          </div>
          <div className="column is-narrow">
            <div className="field">
              <label className="label is-small">Status</label>
              <div className="control">
                <div className="select is-small">
                  <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
                    <option value="">All</option>
                    <option value="draft">Draft</option>
                    <option value="published">Published</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
        </div>

        {error && <div className="notification is-danger is-light">{error}</div>}
        {loading && <p className="has-text-grey">Loading…</p>}

        {!loading && (
          <div className="table-container">
            <table className="table is-fullwidth is-hoverable">
              <thead>
                <tr>
                  <th>Product ID</th>
                  <th>Version</th>
                  <th>Date</th>
                  <th>Status</th>
                  <th>Latest</th>
                  <th>Assets</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {releases.length === 0 && (
                  <tr>
                    <td colSpan={7} className="has-text-grey has-text-centered py-4">
                      No releases found.
                    </td>
                  </tr>
                )}
                {releases.map(r => (
                  <tr key={r.id}>
                    <td>{r.product_id}</td>
                    <td>{r.version}</td>
                    <td>{r.release_date}</td>
                    <td>
                      <span className={`tag ${r.status === 'published' ? 'is-success' : 'is-warning'}`}>
                        {r.status}
                      </span>
                    </td>
                    <td>{r.is_latest && <span className="tag is-info">Latest</span>}</td>
                    <td>{r.assets?.length ?? 0}</td>
                    <td>
                      <div className="buttons are-small">
                        <Link className="button" to={`/downloads/manage/${r.id}/`}>Edit</Link>
                        {!r.is_latest && (
                          <button className="button is-info is-light" onClick={() => handleSetLatest(r.id)}>
                            Set Latest
                          </button>
                        )}
                        <button className="button is-light" onClick={() => handleToggleStatus(r)}>
                          {r.status === 'published' ? 'Unpublish' : 'Publish'}
                        </button>
                        <button className="button is-danger is-light" onClick={() => handleDelete(r.id)}>
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
