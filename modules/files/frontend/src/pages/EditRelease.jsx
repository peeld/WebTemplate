import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import {
  getRelease, createRelease, updateRelease,
  createAsset, updateAsset, deleteAsset,
} from '../api.js';

function isStaff() {
  const token = localStorage.getItem('access');
  if (!token) return false;
  try { return !!JSON.parse(atob(token.split('.')[1])).is_staff; } catch { return false; }
}

const EMPTY_RELEASE = { product_id: '', version: '', release_date: '', status: 'draft', notes: '' };
const EMPTY_ASSET   = { label: '', platform: '', s3_bucket: '', s3_key: '', file_size_bytes: '', sort_order: 0 };

export default function EditRelease() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isNew = !id;

  const [form, setForm] = useState(EMPTY_RELEASE);
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [editingId, setEditingId] = useState(null); // null | 'new' | asset.id
  const [assetForm, setAssetForm] = useState(EMPTY_ASSET);

  useEffect(() => {
    if (!isNew) {
      getRelease(id)
        .then(r => r.json())
        .then(data => {
          if (data.id) {
            setForm({
              product_id: data.product_id,
              version: data.version,
              release_date: data.release_date,
              status: data.status,
              notes: data.notes || '',
            });
            setAssets(data.assets || []);
          } else {
            setError(data.detail || 'Release not found.');
          }
        })
        .catch(() => setError('Network error loading release.'))
        .finally(() => setLoading(false));
    }
  }, [id, isNew]);

  if (!isStaff()) return <Navigate to="/downloads/" replace />;

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const payload = {
        product_id: Number(form.product_id),
        version: form.version,
        release_date: form.release_date,
        status: form.status,
        notes: form.notes,
      };
      if (isNew) {
        const resp = await createRelease(payload);
        const data = await resp.json();
        if (data.id) {
          navigate(`/downloads/manage/${data.id}/`, { replace: true });
        } else {
          setError(JSON.stringify(data));
        }
      } else {
        const resp = await updateRelease(id, payload);
        const data = await resp.json();
        if (!data.id) setError(JSON.stringify(data));
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveAsset() {
    setError(null);
    const payload = {
      label: assetForm.label,
      platform: assetForm.platform,
      s3_bucket: assetForm.s3_bucket,
      s3_key: assetForm.s3_key,
      file_size_bytes: assetForm.file_size_bytes !== '' ? Number(assetForm.file_size_bytes) : null,
      sort_order: Number(assetForm.sort_order),
    };
    try {
      if (editingId === 'new') {
        const resp = await createAsset(id, payload);
        const data = await resp.json();
        if (data.id) setAssets(prev => [...prev, data]);
        else setError(JSON.stringify(data));
      } else {
        const resp = await updateAsset(id, editingId, payload);
        const data = await resp.json();
        if (data.id) setAssets(prev => prev.map(a => a.id === data.id ? data : a));
        else setError(JSON.stringify(data));
      }
      setEditingId(null);
    } catch {
      setError('Network error saving asset.');
    }
  }

  async function handleDeleteAsset(assetId) {
    if (!window.confirm('Delete this asset?')) return;
    await deleteAsset(id, assetId);
    setAssets(prev => prev.filter(a => a.id !== assetId));
  }

  function startEditAsset(asset) {
    setEditingId(asset.id);
    setAssetForm({
      label: asset.label,
      platform: asset.platform,
      s3_bucket: asset.s3_bucket,
      s3_key: asset.s3_key,
      file_size_bytes: asset.file_size_bytes ?? '',
      sort_order: asset.sort_order,
    });
  }

  return (
    <section className="section">
      <div className="container" style={{ maxWidth: 860 }}>
        <Link to="/downloads/manage/" className="has-text-grey is-size-7 mb-4 is-inline-block">
          ← Back to Releases
        </Link>
        <h1 className="title mt-2">{isNew ? 'New Release' : 'Edit Release'}</h1>

        {error && <div className="notification is-danger is-light mb-4">{error}</div>}
        {loading && <p className="has-text-grey">Loading…</p>}

        {!loading && (
          <form onSubmit={handleSave}>
            <div className="columns">
              <div className="column is-half">
                <div className="field">
                  <label className="label">Product ID</label>
                  <div className="control">
                    <input
                      className="input"
                      type="number"
                      required
                      value={form.product_id}
                      onChange={e => setForm(f => ({ ...f, product_id: e.target.value }))}
                    />
                  </div>
                  <p className="help">Billing Product ID — check the billing admin for the correct value.</p>
                </div>
              </div>
              <div className="column is-half">
                <div className="field">
                  <label className="label">Version</label>
                  <div className="control">
                    <input
                      className="input"
                      type="text"
                      required
                      placeholder="e.g. 1.2.3"
                      value={form.version}
                      onChange={e => setForm(f => ({ ...f, version: e.target.value }))}
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="columns">
              <div className="column is-half">
                <div className="field">
                  <label className="label">Release Date</label>
                  <div className="control">
                    <input
                      className="input"
                      type="date"
                      required
                      value={form.release_date}
                      onChange={e => setForm(f => ({ ...f, release_date: e.target.value }))}
                    />
                  </div>
                </div>
              </div>
              <div className="column is-half">
                <div className="field">
                  <label className="label">Status</label>
                  <div className="control">
                    <div className="select is-fullwidth">
                      <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                        <option value="draft">Draft</option>
                        <option value="published">Published</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="field">
              <label className="label">Release Notes</label>
              <div className="control">
                <textarea
                  className="textarea"
                  rows={6}
                  placeholder="One line per note. Blank lines are stripped on display."
                  value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                />
              </div>
            </div>

            <div className="field">
              <div className="control">
                <button className="button is-primary" type="submit" disabled={saving}>
                  {saving ? 'Saving…' : isNew ? 'Create Release' : 'Save Changes'}
                </button>
              </div>
            </div>
          </form>
        )}

        {isNew && !loading && (
          <div className="notification is-info is-light mt-4">
            Save the release first, then you can add assets.
          </div>
        )}

        {!isNew && !loading && (
          <div className="mt-6">
            <div className="is-flex is-justify-content-space-between is-align-items-center mb-3">
              <h2 className="subtitle is-5 mb-0">Assets</h2>
              {editingId === null && (
                <button
                  className="button is-small is-primary"
                  type="button"
                  onClick={() => { setEditingId('new'); setAssetForm(EMPTY_ASSET); }}
                >
                  Add Asset
                </button>
              )}
            </div>

            <div className="table-container">
              <table className="table is-fullwidth is-size-7">
                <thead>
                  <tr>
                    <th>Label</th>
                    <th>Platform</th>
                    <th>S3 Bucket</th>
                    <th>S3 Key</th>
                    <th>Size (bytes)</th>
                    <th>Order</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {assets.length === 0 && editingId !== 'new' && (
                    <tr>
                      <td colSpan={7} className="has-text-grey has-text-centered py-4">
                        No assets yet.
                      </td>
                    </tr>
                  )}
                  {assets.map(asset =>
                    editingId === asset.id ? (
                      <AssetEditRow
                        key={asset.id}
                        form={assetForm}
                        setForm={setAssetForm}
                        onSave={handleSaveAsset}
                        onCancel={() => setEditingId(null)}
                      />
                    ) : (
                      <tr key={asset.id}>
                        <td>{asset.label}</td>
                        <td><span className="tag is-light">{asset.platform}</span></td>
                        <td className="has-text-grey">{asset.s3_bucket}</td>
                        <td className="has-text-grey" style={{ wordBreak: 'break-all' }}>{asset.s3_key}</td>
                        <td className="has-text-grey">{asset.file_size_bytes ?? '—'}</td>
                        <td>{asset.sort_order}</td>
                        <td>
                          <div className="buttons are-small">
                            <button className="button" type="button" onClick={() => startEditAsset(asset)}>
                              Edit
                            </button>
                            <button
                              className="button is-danger is-light"
                              type="button"
                              onClick={() => handleDeleteAsset(asset.id)}
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  )}
                  {editingId === 'new' && (
                    <AssetEditRow
                      key="new"
                      form={assetForm}
                      setForm={setAssetForm}
                      onSave={handleSaveAsset}
                      onCancel={() => setEditingId(null)}
                    />
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function AssetEditRow({ form, setForm, onSave, onCancel }) {
  const f = key => e => setForm(prev => ({ ...prev, [key]: e.target.value }));
  return (
    <tr>
      <td><input className="input is-small" value={form.label} onChange={f('label')} placeholder="Windows Installer" /></td>
      <td><input className="input is-small" value={form.platform} onChange={f('platform')} placeholder="win_exe" /></td>
      <td><input className="input is-small" value={form.s3_bucket} onChange={f('s3_bucket')} placeholder="my-bucket" /></td>
      <td><input className="input is-small" value={form.s3_key} onChange={f('s3_key')} placeholder="releases/app.exe" /></td>
      <td><input className="input is-small" type="number" value={form.file_size_bytes} onChange={f('file_size_bytes')} placeholder="bytes" /></td>
      <td><input className="input is-small" type="number" value={form.sort_order} onChange={f('sort_order')} /></td>
      <td>
        <div className="buttons are-small">
          <button className="button is-primary" type="button" onClick={onSave}>Save</button>
          <button className="button" type="button" onClick={onCancel}>Cancel</button>
        </div>
      </td>
    </tr>
  );
}
