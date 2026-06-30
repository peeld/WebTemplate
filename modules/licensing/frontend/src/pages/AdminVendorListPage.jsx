import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getAdminVendors, createAdminVendor } from '../api.js';

const EMPTY_FORM = { org_id: '', discount_pct: '0', notes: '' };

export default function AdminVendorListPage() {
  const [vendors, setVendors]     = useState([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(null);
  const [showForm, setShowForm]   = useState(false);
  const [form, setForm]           = useState(EMPTY_FORM);
  const [saving, setSaving]       = useState(false);
  const [formError, setFormError] = useState(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await getAdminVendors();
        if (res.ok) {
          setVendors(await res.json());
        } else {
          const data = await res.json();
          setError(data.detail || data.error || 'Failed to load vendors.');
        }
      } catch {
        setError('Network error.');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  async function handleCreate() {
    setSaving(true);
    setFormError(null);
    try {
      const payload = {
        org_id:       parseInt(form.org_id, 10),
        discount_pct: (parseFloat(form.discount_pct) / 100).toFixed(4),
        notes:        form.notes,
      };
      const res  = await createAdminVendor(payload);
      const data = await res.json();
      if (res.ok) {
        setVendors(prev => [...prev, data]);
        setShowForm(false);
        setForm(EMPTY_FORM);
      } else {
        setFormError(data.error || data.detail || JSON.stringify(data));
      }
    } catch {
      setFormError('Network error.');
    } finally {
      setSaving(false);
    }
  }

  function cancelForm() {
    setShowForm(false);
    setForm(EMPTY_FORM);
    setFormError(null);
  }

  return (
    <section className="section">
      <div className="container" style={{ maxWidth: 800 }}>
        <div className="level mb-4">
          <div className="level-left">
            <h1 className="title mb-0">Vendors</h1>
          </div>
          <div className="level-right">
            {!showForm && (
              <button className="button is-primary is-small" onClick={() => setShowForm(true)}>
                + New Vendor
              </button>
            )}
          </div>
        </div>

        {error && (
          <div className="notification is-danger is-light">
            {error}
            <button className="delete" onClick={() => setError(null)} />
          </div>
        )}

        {showForm && (
          <div className="box mb-4">
            <p className="has-text-weight-semibold mb-3">New Vendor</p>
            {formError && (
              <div className="notification is-danger is-light py-2 px-3 mb-3 is-size-7">{formError}</div>
            )}
            <div className="field">
              <label className="label is-small">
                Org ID{' '}
                <span className="has-text-grey has-text-weight-normal">(numeric ID from Django admin or orgs API)</span>
              </label>
              <div className="control">
                <input
                  className="input is-small"
                  type="number"
                  min="1"
                  value={form.org_id}
                  onChange={e => setForm(f => ({ ...f, org_id: e.target.value }))}
                />
              </div>
            </div>
            <div className="field">
              <label className="label is-small">
                Discount %{' '}
                <span className="has-text-grey has-text-weight-normal">(e.g. 20 = 20% off list price)</span>
              </label>
              <div className="control">
                <input
                  className="input is-small"
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={form.discount_pct}
                  onChange={e => setForm(f => ({ ...f, discount_pct: e.target.value }))}
                />
              </div>
            </div>
            <div className="field">
              <label className="label is-small">Notes</label>
              <div className="control">
                <textarea
                  className="textarea is-small"
                  rows={2}
                  value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                />
              </div>
            </div>
            <div className="buttons mt-3">
              <button
                className={`button is-primary is-small${saving ? ' is-loading' : ''}`}
                disabled={saving || !form.org_id}
                onClick={handleCreate}
              >
                Create Vendor
              </button>
              <button className="button is-small" onClick={cancelForm}>
                Cancel
              </button>
            </div>
          </div>
        )}

        {loading && <p className="has-text-grey">Loading…</p>}

        {!loading && vendors.length === 0 && !error && (
          <div className="box has-text-grey">No vendors registered.</div>
        )}

        {!loading && vendors.length > 0 && (
          <table className="table is-fullwidth is-hoverable">
            <thead>
              <tr>
                  <th>ID</th>
                <th>Organisation</th>
                <th>Discount</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {vendors.map(v => (
                <tr key={v.id}>
                    <td>
                        <p className="is-size-7 has-text-grey">{v.org_id}</p>
                        </td>
                  <td>
                      <Link to={`/admin/licensing/vendors/${v.id}`}>


                    {v.org_name}
                        </Link>

                  </td>
                  <td>{(parseFloat(v.discount_pct) * 100).toFixed(0)}%</td>
                  <td>
                    <span className={`tag is-small ${v.is_active ? 'is-success is-light' : 'is-danger is-light'}`}>
                      {v.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
