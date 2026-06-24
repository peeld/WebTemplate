import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { addBreadcrumb } from '@core/frontend/utils/logger';
import {
  adminGetProducts,
  adminCreateProduct,
  adminUpdateProduct,
  adminDeleteProduct,
  adminGetSubscriptions,
  adminSyncProduct,
  adminCreateProductPrice,
  adminUpdateProductPrice,
  adminDeleteProductPrice,
  adminUploadProductImage,
  adminDeleteProductImage,
} from '../api.js';

const EMPTY_PRODUCT = {
  name: '', slug: '', description: '', thumbnail: '',
  fulfillment_type: 'digital', is_active: true, sort_order: 0, features: '',
};

const EMPTY_PRICE = { price_type: 'one_time', interval: '', amount: '', currency: 'usd', is_active: true };

const INTERVAL_OPTIONS = [
  { value: 'week',  label: 'Weekly' },
  { value: 'month', label: 'Monthly' },
  { value: 'year',  label: 'Annual' },
];

const STATUS_COLOR = {
  active: 'is-success', trialing: 'is-info', past_due: 'is-warning',
  canceled: 'is-danger', incomplete: 'is-warning',
  unpaid: 'is-danger', paused: 'is-warning', incomplete_expired: 'is-danger',
};

function parseFeatures(val) {
  if (Array.isArray(val)) return val;
  return val.split('\n').map(s => s.trim()).filter(Boolean);
}

function featuresToText(val) {
  if (!val) return '';
  if (Array.isArray(val)) return val.join('\n');
  return val;
}

function formatPrice(amount, currency) {
  if (amount == null) return '—';
  return `${(amount / 100).toFixed(2)} ${(currency || 'usd').toUpperCase()}`;
}

function priceTypeLabel(p) {
  if (p.price_type === 'one_time') return 'One-time';
  return INTERVAL_OPTIONS.find(o => o.value === p.interval)?.label || p.interval;
}

function hasValidToken() {
  const token = localStorage.getItem('access');
  if (!token) return false;
  try {
    const { exp } = JSON.parse(atob(token.split('.')[1]));
    return exp * 1000 > Date.now();
  } catch { return false; }
}

function Field({ label, value, onChange, type = 'text', placeholder = '', error }) {
  const errMsg = Array.isArray(error) ? error.join(' ') : error;
  return (
    <div className="field is-horizontal" style={{ marginBottom: '0.4rem' }}>
      <div className="field-label is-small" style={{ flexBasis: 120, flexShrink: 0 }}>
        <label className="label">{label}</label>
      </div>
      <div className="field-body">
        <div className="field">
          <div className="control">
            {type === 'textarea'
              ? <textarea className={`textarea is-small${errMsg ? ' is-danger' : ''}`} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={3} />
              : <input className={`input is-small${errMsg ? ' is-danger' : ''}`} type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} />
            }
          </div>
          {errMsg && <p className="help is-danger">{errMsg}</p>}
        </div>
      </div>
    </div>
  );
}

function SelectField({ label, value, onChange, options, error }) {
  const errMsg = Array.isArray(error) ? error.join(' ') : error;
  return (
    <div className="field is-horizontal" style={{ marginBottom: '0.4rem' }}>
      <div className="field-label is-small" style={{ flexBasis: 120, flexShrink: 0 }}>
        <label className="label">{label}</label>
      </div>
      <div className="field-body">
        <div className="field">
          <div className="control">
            <div className={`select is-small${errMsg ? ' is-danger' : ''}`}>
              <select value={value} onChange={e => onChange(e.target.value)}>
                {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </div>
          {errMsg && <p className="help is-danger">{errMsg}</p>}
        </div>
      </div>
    </div>
  );
}

function ProductForm({ values, onChange, onSave, onCancel, saveLabel = 'Save', saving: isSaving, children, errors = {} }) {
  const nonFieldErrors = errors.non_field_errors || errors.detail;
  return (
    <div className="box">
      {nonFieldErrors && (
        <div className="notification is-danger is-light py-2 px-3 mb-3 is-size-7">
          {Array.isArray(nonFieldErrors) ? nonFieldErrors.join(' ') : nonFieldErrors}
        </div>
      )}
      <Field label="Name"        value={values.name}        onChange={v => onChange({ ...values, name: v })}        error={errors.name} />
      <Field label="Slug"        value={values.slug}        onChange={v => onChange({ ...values, slug: v })}        error={errors.slug} />
      <Field label="Description" value={values.description} onChange={v => onChange({ ...values, description: v })} type="textarea" error={errors.description} />
      <SelectField
        label="Fulfillment"
        value={values.fulfillment_type}
        onChange={v => onChange({ ...values, fulfillment_type: v })}
        options={[
          { value: 'digital',  label: 'Digital' },
          { value: 'physical', label: 'Physical (ships)' },
        ]}
        error={errors.fulfillment_type}
      />
      <div className="field is-horizontal" style={{ marginBottom: '0.4rem' }}>
        <div className="field-label is-small" style={{ flexBasis: 120, flexShrink: 0 }}>
          <label className="label">Active</label>
        </div>
        <div className="field-body">
          <div className="field">
            <label className="checkbox is-size-7">
              <input type="checkbox" checked={values.is_active} onChange={e => onChange({ ...values, is_active: e.target.checked })} />
              {' '}Active
            </label>
          </div>
        </div>
      </div>
      <Field label="Features" value={values.features} onChange={v => onChange({ ...values, features: v })} type="textarea" placeholder="One feature per line" error={errors.features} />
      {children}
      <div className="buttons mt-4">
        <button className={`button is-primary is-small${isSaving ? ' is-loading' : ''}`} disabled={isSaving} onClick={onSave}>{saveLabel}</button>
        <button className="button is-small" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

function AddPriceForm({ canAddOneTime, availableIntervals, onAdd, onCancel, addLabel = 'Add', saving = false }) {
  const [form, setForm] = useState(() => ({
    ...EMPTY_PRICE,
    price_type: canAddOneTime ? 'one_time' : 'recurring',
    interval: !canAddOneTime && availableIntervals[0] ? availableIntervals[0].value : '',
  }));

  const canAddRecurring = availableIntervals.length > 0;

  function handleTypeChange(type) {
    setForm(f => ({
      ...f,
      price_type: type,
      interval: type === 'recurring' ? (availableIntervals[0]?.value || '') : '',
    }));
  }

  return (
    <div className="mt-3 pt-3" style={{ borderTop: '1px solid #ededed' }}>
      <div className="is-flex is-flex-wrap-wrap is-align-items-flex-end" style={{ gap: '0.75rem' }}>
        <div className="field mb-0">
          <label className="label is-small">Type</label>
          <div className="control">
            <div className="select is-small">
              <select value={form.price_type} onChange={e => handleTypeChange(e.target.value)}>
                {canAddOneTime   && <option value="one_time">One-time</option>}
                {canAddRecurring && <option value="recurring">Recurring</option>}
              </select>
            </div>
          </div>
        </div>

        {form.price_type === 'recurring' && (
          <div className="field mb-0">
            <label className="label is-small">Interval</label>
            <div className="control">
              <div className="select is-small">
                <select value={form.interval} onChange={e => setForm(f => ({ ...f, interval: e.target.value }))}>
                  {availableIntervals.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            </div>
          </div>
        )}

        <div className="field mb-0">
          <label className="label is-small">Amount ($)</label>
          <div className="control">
            <input
              className="input is-small"
              type="number"
              placeholder="9.99"
              value={form.amount}
              onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
              style={{ width: 100 }}
            />
          </div>
        </div>

        <div className="field mb-0">
          <label className="label is-small">Currency</label>
          <div className="control">
            <input
              className="input is-small"
              value={form.currency}
              onChange={e => setForm(f => ({ ...f, currency: e.target.value }))}
              style={{ width: 60 }}
            />
          </div>
        </div>

        <div className="field mb-0">
          <div className="buttons">
            <button
              className={`button is-primary is-small${saving ? ' is-loading' : ''}`}
              disabled={saving || !form.amount}
              onClick={() => onAdd(form)}
            >
              {addLabel}
            </button>
            <button className="button is-small" onClick={onCancel}>Cancel</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function PendingPricesEditor({ prices, onChange }) {
  const [showAdd, setShowAdd] = useState(false);

  const hasOneTime         = prices.some(p => p.price_type === 'one_time');
  const usedIntervals      = prices.filter(p => p.price_type === 'recurring').map(p => p.interval);
  const availableIntervals = INTERVAL_OPTIONS.filter(o => !usedIntervals.includes(o.value));
  const canAddOneTime      = !hasOneTime;
  const canAdd             = canAddOneTime || availableIntervals.length > 0;

  function handleAdd(form) {
    if (!form.amount) return;
    onChange([...prices, {
      _localId:   Date.now(),
      price_type: form.price_type,
      amount:     Math.round(Number(form.amount) * 100),
      currency:   form.currency,
      interval:   form.price_type === 'recurring' ? form.interval : '',
    }]);
    setShowAdd(false);
  }

  return (
    <div className="mt-4" style={{ borderTop: '1px solid #ededed', paddingTop: '0.75rem' }}>
      <div className="is-flex is-align-items-center" style={{ gap: '0.75rem' }}>
        <p className="is-size-7 has-text-weight-semibold has-text-grey-dark mb-0">
          Prices
          {prices.length > 0 && (
            <span className="has-text-grey has-text-weight-normal ml-1">
              ({prices.length}) — created in Stripe on save
            </span>
          )}
        </p>
        {!showAdd && canAdd && (
          <button className="button is-small is-light" onClick={() => setShowAdd(true)}>+ Add</button>
        )}
      </div>

      {prices.length > 0 && (
        <table className="table is-fullwidth is-size-7 mt-2 mb-0" style={{ border: 'none' }}>
          <thead>
            <tr><th>Type</th><th>Amount</th><th /></tr>
          </thead>
          <tbody>
            {prices.map(p => (
              <tr key={p._localId}>
                <td className="has-text-weight-semibold">{priceTypeLabel(p)}</td>
                <td>{formatPrice(p.amount, p.currency)}</td>
                <td>
                  <button
                    className="button is-small is-danger is-light"
                    onClick={() => onChange(prices.filter(x => x._localId !== p._localId))}
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {showAdd && (
        <AddPriceForm
          canAddOneTime={canAddOneTime}
          availableIntervals={availableIntervals}
          onAdd={handleAdd}
          onCancel={() => setShowAdd(false)}
          addLabel="Add"
        />
      )}
    </div>
  );
}

function PricesPanel({ productId, initialPrices = [], onError }) {
  const [prices, setPrices]         = useState(initialPrices);
  const [showAdd, setShowAdd]       = useState(false);
  const [saving, setSaving]         = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  const hasOneTime         = prices.some(p => p.price_type === 'one_time');
  const usedIntervals      = prices.filter(p => p.price_type === 'recurring').map(p => p.interval);
  const availableIntervals = INTERVAL_OPTIONS.filter(o => !usedIntervals.includes(o.value));
  const canAddOneTime      = !hasOneTime;
  const canAdd             = canAddOneTime || availableIntervals.length > 0;

  async function handleAdd(form) {
    setSaving(true);
    try {
      const payload = {
        price_type: form.price_type,
        amount:     Math.round(Number(form.amount) * 100),
        currency:   form.currency,
        ...(form.price_type === 'recurring' ? { interval: form.interval } : {}),
      };
      const res  = await adminCreateProductPrice(productId, payload);
      const data = await res.json();
      if (!res.ok) { onError(data.error || JSON.stringify(data)); return; }
      setPrices(prev => [...prev, data]);
      setShowAdd(false);
    } catch { onError('Network error.'); }
    finally { setSaving(false); }
  }

  async function togglePrice(price) {
    try {
      const res  = await adminUpdateProductPrice(productId, price.id, { is_active: !price.is_active });
      const data = await res.json();
      if (res.ok) setPrices(prev => prev.map(p => p.id === price.id ? data : p));
      else { onError(data.error || 'Update failed.'); }
    } catch { onError('Network error.'); }
  }

  async function deletePrice(id) {
    if (!window.confirm('Delete this price? It will also be archived in Stripe.')) return;
    setDeletingId(id);
    try {
      const res = await adminDeleteProductPrice(productId, id);
      if (res.ok) setPrices(prev => prev.filter(p => p.id !== id));
      else onError('Delete failed.');
    } catch { onError('Network error.'); }
    finally { setDeletingId(null); }
  }

  return (
    <div className="mt-2">
      <div className="level is-mobile mb-2">
        <div className="level-left">
          <p className="is-size-7 has-text-weight-semibold has-text-grey-dark">
            {prices.length === 0 ? 'No prices yet' : `${prices.length} price${prices.length === 1 ? '' : 's'}`}
          </p>
        </div>
        <div className="level-right">
          {!showAdd && canAdd && (
            <button className="button is-small is-light" onClick={() => setShowAdd(true)}>+ Add price</button>
          )}
        </div>
      </div>

      {prices.length > 0 && (
        <table className="table is-fullwidth is-size-7 mb-0" style={{ border: 'none' }}>
          <thead>
            <tr>
              <th>Type</th>
              <th>Amount</th>
              <th>Stripe Price ID</th>
              <th>Active</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {prices.map(p => (
              <tr key={p.id}>
                <td className="has-text-weight-semibold">{priceTypeLabel(p)}</td>
                <td>{formatPrice(p.amount, p.currency)}</td>
                <td><code className="has-text-grey">{p.stripe_price_id || '—'}</code></td>
                <td>
                  <span className={`tag is-small ${p.is_active ? 'is-success' : 'is-light'}`}>
                    {p.is_active ? 'Active' : 'Off'}
                  </span>
                </td>
                <td>
                  <div className="buttons">
                    <button className="button is-small" onClick={() => togglePrice(p)}>
                      {p.is_active ? 'Disable' : 'Enable'}
                    </button>
                    <button
                      className={`button is-small is-danger is-light${deletingId === p.id ? ' is-loading' : ''}`}
                      disabled={deletingId === p.id}
                      onClick={() => deletePrice(p.id)}
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {showAdd && (
        <AddPriceForm
          canAddOneTime={canAddOneTime}
          availableIntervals={availableIntervals}
          onAdd={handleAdd}
          onCancel={() => setShowAdd(false)}
          addLabel="Create in Stripe"
          saving={saving}
        />
      )}
    </div>
  );
}

function PendingImagesEditor({ images, onChange, primaryLocalId, onPrimaryChange }) {
  const fileInputRef = useRef(null);

  function handleFiles(e) {
    const newImages = Array.from(e.target.files).map(file => ({
      _localId:   Date.now() + Math.random(),
      file,
      previewUrl: URL.createObjectURL(file),
    }));
    const combined = [...images, ...newImages];
    onChange(combined);
    if (!primaryLocalId && combined.length > 0) onPrimaryChange(combined[0]._localId);
    e.target.value = '';
  }

  function remove(localId) {
    const img = images.find(i => i._localId === localId);
    if (img) URL.revokeObjectURL(img.previewUrl);
    const remaining = images.filter(i => i._localId !== localId);
    onChange(remaining);
    if (primaryLocalId === localId) onPrimaryChange(remaining.length > 0 ? remaining[0]._localId : null);
  }

  return (
    <div className="mt-4" style={{ borderTop: '1px solid #ededed', paddingTop: '0.75rem' }}>
      <div className="is-flex is-align-items-center" style={{ gap: '0.75rem', marginBottom: images.length > 0 ? '0.5rem' : 0 }}>
        <p className="is-size-7 has-text-weight-semibold has-text-grey-dark mb-0">
          Images
          {images.length > 0 && (
            <span className="has-text-grey has-text-weight-normal ml-1">
              ({images.length}) — uploaded on save
            </span>
          )}
        </p>
        <button className="button is-small is-light" type="button" onClick={() => fileInputRef.current?.click()}>
          + Add image
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp"
          multiple
          style={{ display: 'none' }}
          onChange={handleFiles}
        />
      </div>

      {images.length > 0 && (
        <>
          <p className="is-size-7 has-text-grey mb-2">Click an image to set it as the thumbnail.</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            {images.map(img => {
              const isPrimary = img._localId === primaryLocalId;
              return (
                <div
                  key={img._localId}
                  style={{ position: 'relative', cursor: 'pointer' }}
                  onClick={() => onPrimaryChange(isPrimary ? null : img._localId)}
                >
                  <img
                    src={img.previewUrl}
                    alt=""
                    style={{
                      width: 80, height: 80, objectFit: 'cover', borderRadius: 4, display: 'block',
                      border: isPrimary ? '2px solid #3273dc' : '2px solid #ededed',
                    }}
                  />
                  {isPrimary && (
                    <span style={{
                      position: 'absolute', bottom: 3, left: 3,
                      background: '#3273dc', color: 'white',
                      fontSize: 9, padding: '1px 4px', borderRadius: 2, lineHeight: 1.4,
                    }}>
                      THUMB
                    </span>
                  )}
                  <button
                    className="delete is-small"
                    type="button"
                    onClick={e => { e.stopPropagation(); remove(img._localId); }}
                    style={{ position: 'absolute', top: 2, right: 2 }}
                    title="Remove"
                  />
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function ImagesPanel({ productId, initialImages = [], onError, thumbnail, onThumbnailChange }) {
  const [images, setImages]         = useState(initialImages);
  const [uploading, setUploading]   = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const fileInputRef = useRef(null);

  async function handleUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('image', file);
      const res  = await adminUploadProductImage(productId, fd);
      const data = await res.json();
      if (!res.ok) { onError(data.error || 'Upload failed.'); return; }
      setImages(prev => [...prev, data]);
    } catch { onError('Network error.'); }
    finally { setUploading(false); e.target.value = ''; }
  }

  async function deleteImage(id) {
    if (!window.confirm('Remove this image?')) return;
    setDeletingId(id);
    try {
      const res = await adminDeleteProductImage(productId, id);
      if (res.ok) {
        setImages(prev => {
          const remaining = prev.filter(img => img.id !== id);
          const deleted   = prev.find(img => img.id === id);
          if (onThumbnailChange && deleted?.image_url === thumbnail) {
            onThumbnailChange(remaining.length > 0 ? remaining[0].image_url : '');
          }
          return remaining;
        });
      } else { onError('Delete failed.'); }
    } catch { onError('Network error.'); }
    finally { setDeletingId(null); }
  }

  const showThumbnailHint = onThumbnailChange && images.length > 0;

  return (
    <div className="mt-2">
      <div className="level is-mobile mb-2">
        <div className="level-left">
          <p className="is-size-7 has-text-weight-semibold has-text-grey-dark">
            {images.length === 0 ? 'No images' : `${images.length} image${images.length === 1 ? '' : 's'}`}
          </p>
        </div>
        <div className="level-right">
          <button
            className={`button is-small is-light${uploading ? ' is-loading' : ''}`}
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
          >
            + Upload image
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp"
            style={{ display: 'none' }}
            onChange={handleUpload}
          />
        </div>
      </div>

      {showThumbnailHint && (
        <p className="is-size-7 has-text-grey mb-2">Click an image to set it as the thumbnail.</p>
      )}

      {images.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
          {images.map(img => {
            const isThumb = onThumbnailChange && img.image_url === thumbnail;
            return (
              <div
                key={img.id}
                style={{ position: 'relative', cursor: onThumbnailChange ? 'pointer' : 'default' }}
                onClick={() => onThumbnailChange?.(isThumb ? '' : img.image_url)}
              >
                <img
                  src={img.image_url}
                  alt=""
                  style={{
                    width: 80, height: 80, objectFit: 'cover', borderRadius: 4, display: 'block',
                    border: isThumb ? '2px solid #3273dc' : '2px solid #ededed',
                  }}
                />
                {isThumb && (
                  <span style={{
                    position: 'absolute', bottom: 3, left: 3,
                    background: '#3273dc', color: 'white',
                    fontSize: 9, padding: '1px 4px', borderRadius: 2, lineHeight: 1.4,
                  }}>
                    THUMB
                  </span>
                )}
                <button
                  className="delete is-small"
                  disabled={deletingId === img.id}
                  onClick={e => { e.stopPropagation(); deleteImage(img.id); }}
                  style={{ position: 'absolute', top: 2, right: 2 }}
                  title="Remove image"
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function AdminBillingPage() {
  const [products, setProducts]             = useState([]);
  const [subscriptions, setSubscriptions]   = useState([]);
  const [loadingP, setLoadingP]             = useState(true);
  const [loadingS, setLoadingS]             = useState(true);
  const [error, setError]                   = useState(null);
  const [activeTab, setActiveTab]           = useState('products');
  const [editingId, setEditingId]           = useState(null);
  const [form, setForm]                     = useState(EMPTY_PRODUCT);
  const [saving, setSaving]                 = useState(false);
  const [showCreate, setShowCreate]         = useState(false);
  const [createForm, setCreateForm]         = useState(EMPTY_PRODUCT);
  const [pendingPrices, setPendingPrices]     = useState([]);
  const [pendingImages, setPendingImages]     = useState([]);
  const [pendingPrimaryId, setPendingPrimaryId] = useState(null);
  const [creating, setCreating]             = useState(false);
  const [deletingId, setDeletingId]         = useState(null);
  const [expandedPrices, setExpandedPrices] = useState({});
  const [expandedImages, setExpandedImages] = useState({});
  const [syncingId, setSyncingId]           = useState(null);
  const [editErrors, setEditErrors]         = useState({});
  const [createErrors, setCreateErrors]     = useState({});

  useEffect(() => {
    if (!hasValidToken()) {
      setLoadingP(false);
      setLoadingS(false);
      return;
    }

    async function loadProducts() {
      const r = await adminGetProducts();
      if (r.status === 401) {
        setError('Your session has expired. Please log in again.');
        setLoadingP(false); setLoadingS(false);
        return;
      }
      if (r.status === 403) {
        setError('Access denied. Your Django account needs is_staff=True to use billing admin.');
        setLoadingP(false); setLoadingS(false);
        return;
      }
      const data = await r.json();
      if (Array.isArray(data)) setProducts(data);
      else setError(data.detail || data.error || 'Failed to load products.');
      setLoadingP(false);
    }

    async function loadSubscriptions() {
      try {
        const r = await adminGetSubscriptions();
        if (!r.ok) { setLoadingS(false); return; }
        const data = await r.json();
        if (Array.isArray(data)) setSubscriptions(data);
      } catch { /* surfaced via products load */ }
      finally { setLoadingS(false); }
    }

    loadProducts().catch(() => { setError('Network error loading products.'); setLoadingP(false); });
    loadSubscriptions();
  }, []);

  function startEdit(product) {
    setEditingId(product.id);
    setEditErrors({});
    setForm({ ...product, features: featuresToText(product.features) });
  }

  function cancelEdit() { setEditingId(null); setEditErrors({}); }

  async function saveEdit(id) {
    addBreadcrumb('admin product updated', { id }, 'info');
    setSaving(true);
    setEditErrors({});
    try {
      const payload = { ...form, features: parseFeatures(form.features) };
      const res  = await adminUpdateProduct(id, payload);
      const data = await res.json();
      if (!res.ok) {
        if (data.error) setError(data.error);
        else setEditErrors(data);
        return;
      }
      setProducts(prev => prev.map(p => p.id === id ? data : p));
      setEditingId(null);
      setEditErrors({});
    } catch { setError('Network error.'); }
    finally { setSaving(false); }
  }

  async function toggleActive(product) {
    try {
      const res  = await adminUpdateProduct(product.id, { is_active: !product.is_active });
      const data = await res.json();
      if (res.ok) setProducts(prev => prev.map(p => p.id === product.id ? data : p));
      else { setError(data.error || 'Update failed.'); }
    } catch { setError('Network error.'); }
  }

  async function deleteProduct(id) {
    if (!window.confirm('Delete this product? This cannot be undone.')) return;
    addBreadcrumb('admin product deleted', { id }, 'info');
    setDeletingId(id);
    try {
      const res = await adminDeleteProduct(id);
      if (res.ok) setProducts(prev => prev.filter(p => p.id !== id));
      else setError('Delete failed.');
    } catch { setError('Network error.'); }
    finally { setDeletingId(null); }
  }

  async function createProduct() {
    setCreating(true);
    setCreateErrors({});
    try {
      const payload = { ...createForm, features: parseFeatures(createForm.features) };
      const res  = await adminCreateProduct(payload);
      const data = await res.json();
      if (!res.ok) {
        if (data.error) setError(data.error);
        else setCreateErrors(data);
        return;
      }

      addBreadcrumb('admin product created', { id: data.id, name: data.name }, 'info');
      const newProduct  = { ...data, prices: [], images: [] };
      const priceErrors = [];
      for (const { _localId, ...pricePayload } of pendingPrices) {
        const priceRes  = await adminCreateProductPrice(data.id, pricePayload);
        const priceData = await priceRes.json();
        if (priceRes.ok) newProduct.prices.push(priceData);
        else priceErrors.push(priceData.error || `Failed to create ${pricePayload.price_type} price`);
      }

      const imageErrors  = [];
      const primaryFirst = pendingPrimaryId
        ? [
            ...pendingImages.filter(i => i._localId === pendingPrimaryId),
            ...pendingImages.filter(i => i._localId !== pendingPrimaryId),
          ]
        : pendingImages;

      for (const { _localId, file } of primaryFirst) {
        const fd = new FormData();
        fd.append('image', file);
        const imgRes  = await adminUploadProductImage(data.id, fd);
        const imgData = await imgRes.json();
        if (imgRes.ok) {
          newProduct.images.push(imgData);
          if (_localId === pendingPrimaryId && !newProduct.thumbnail) {
            newProduct.thumbnail = imgData.image_url;
            const thumbRes = await adminUpdateProduct(data.id, { thumbnail: imgData.image_url });
            if (!thumbRes.ok) {
              const thumbData = await thumbRes.json();
              imageErrors.push(thumbData.error || 'Failed to set thumbnail');
            }
          }
        } else {
          imageErrors.push(imgData.error || 'Failed to upload image');
        }
      }
      pendingImages.forEach(img => URL.revokeObjectURL(img.previewUrl));

      setProducts(prev => [...prev, newProduct]);
      setShowCreate(false);
      setCreateForm(EMPTY_PRODUCT);
      setCreateErrors({});
      setPendingPrices([]);
      setPendingImages([]);
      setPendingPrimaryId(null);
      const allErrors = [...priceErrors, ...imageErrors];
      if (allErrors.length > 0) setError(`Product created, but some items failed: ${allErrors.join('; ')}`);
    } catch { setError('Network error.'); }
    finally { setCreating(false); }
  }

  function togglePricesPanel(id) {
    setExpandedPrices(prev => ({ ...prev, [id]: !prev[id] }));
  }

  function toggleImagesPanel(id) {
    setExpandedImages(prev => ({ ...prev, [id]: !prev[id] }));
  }

  async function syncProduct(id) {
    addBreadcrumb('admin product stripe sync', { id }, 'info');
    setSyncingId(id);
    try {
      const res  = await adminSyncProduct(id);
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Sync failed.'); return; }
      setProducts(prev => prev.map(p => p.id === id ? data : p));
    } catch { setError('Network error.'); }
    finally { setSyncingId(null); }
  }

  if (!loadingP && !loadingS && !hasValidToken() && !error) {
    return (
      <section className="section">
        <div className="container">
          <div className="notification is-warning is-light">
            You must be logged in to access billing admin.{' '}
            <Link to="/login">Log in</Link>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="section">
      <div className="container">
        <h1 className="title">Billing Admin</h1>

        {error && (
          <div className="notification is-danger is-light">
            {error}
            <button className="delete" onClick={() => setError(null)} />
          </div>
        )}

        <div className="tabs">
          <ul>
            <li className={activeTab === 'products' ? 'is-active' : ''}>
              <a onClick={() => setActiveTab('products')}>
                Products
                {!loadingP && products.length > 0 && (
                  <span className="tag is-rounded is-light ml-2" style={{ fontSize: '0.7rem' }}>{products.length}</span>
                )}
              </a>
            </li>
            <li className={activeTab === 'subscriptions' ? 'is-active' : ''}>
              <a onClick={() => setActiveTab('subscriptions')}>
                Subscriptions
                {!loadingS && subscriptions.length > 0 && (
                  <span className="tag is-rounded is-light ml-2" style={{ fontSize: '0.7rem' }}>{subscriptions.length}</span>
                )}
              </a>
            </li>
          </ul>
        </div>

        {activeTab === 'products' && (
          <>
            {!showCreate && (
              <div className="is-flex is-justify-content-flex-end mb-4">
                <button className="button is-primary is-small" onClick={() => setShowCreate(true)}>
                  + New Product
                </button>
              </div>
            )}

            {showCreate && (
              <div className="mb-5">
                <p className="has-text-weight-semibold mb-2">New Product</p>
                <ProductForm
                  values={createForm}
                  onChange={setCreateForm}
                  onSave={createProduct}
                  onCancel={() => {
                    pendingImages.forEach(img => URL.revokeObjectURL(img.previewUrl));
                    setShowCreate(false);
                    setCreateForm(EMPTY_PRODUCT);
                    setCreateErrors({});
                    setPendingPrices([]);
                    setPendingImages([]);
                    setPendingPrimaryId(null);
                  }}
                  saveLabel="Create"
                  saving={creating}
                  errors={createErrors}
                >
                  <PendingPricesEditor prices={pendingPrices} onChange={setPendingPrices} />
                  <PendingImagesEditor
                    images={pendingImages}
                    onChange={setPendingImages}
                    primaryLocalId={pendingPrimaryId}
                    onPrimaryChange={setPendingPrimaryId}
                  />
                </ProductForm>
              </div>
            )}

            {loadingP && <p className="has-text-grey mb-4">Loading products…</p>}

            {!loadingP && products.length === 0 && !showCreate && (
              <p className="has-text-grey mb-4">No products found.</p>
            )}

            {products.map(product =>
              editingId === product.id ? (
                <div key={product.id} className="mb-3">
                  <ProductForm
                    values={form}
                    onChange={setForm}
                    onSave={() => saveEdit(product.id)}
                    onCancel={cancelEdit}
                    saving={saving}
                    errors={editErrors}
                  />
                  <div className="box mt-2">
                    <p className="is-size-7 has-text-weight-semibold has-text-grey-dark mb-3">Images</p>
                    <ImagesPanel
                      productId={product.id}
                      initialImages={product.images || []}
                      onError={setError}
                      thumbnail={form.thumbnail}
                      onThumbnailChange={v => setForm(f => ({ ...f, thumbnail: v }))}
                    />
                  </div>
                </div>
              ) : (
                <div key={product.id} className="box mb-3">
                  <div className="level is-mobile" style={{ flexWrap: 'wrap', gap: '0.5rem', alignItems: 'flex-start' }}>
                    <div className="level-left" style={{ flexWrap: 'wrap' }}>
                      <div>
                        <p className="has-text-weight-semibold">
                          {product.name}
                          {' '}
                          <span className={`tag is-small ${product.is_active ? 'is-success' : 'is-light'}`}>
                            {product.is_active ? 'Active' : 'Inactive'}
                          </span>
                          {' '}
                          <span className="tag is-small is-light">
                            {product.fulfillment_type === 'physical' ? 'Physical' : 'Digital'}
                          </span>
                        </p>
                        <p className="is-size-7 has-text-grey">{product.slug}</p>
                        <p className="is-size-7 has-text-grey">
                          {product.stripe_product_id
                            ? <><span className="has-text-success-dark">Stripe:</span> <code>{product.stripe_product_id}</code></>
                            : <span className="has-text-warning-dark">Not synced to Stripe</span>}
                        </p>
                        {product.description && <p className="is-size-7 mt-1">{product.description}</p>}
                      </div>
                    </div>
                    <div className="level-right">
                      <div className="buttons are-small">
                        <button
                          className={`button is-small is-link is-light${syncingId === product.id ? ' is-loading' : ''}`}
                          disabled={syncingId === product.id}
                          onClick={() => syncProduct(product.id)}
                          title="Push name/description to Stripe"
                        >
                          {product.stripe_product_id ? 'Re-sync' : 'Sync to Stripe'}
                        </button>
                        <button className="button is-small" onClick={() => toggleActive(product)}>
                          {product.is_active ? 'Disable' : 'Enable'}
                        </button>
                        <button className="button is-small is-info is-light" onClick={() => startEdit(product)}>Edit</button>
                        <button
                          className={`button is-small is-danger is-light${deletingId === product.id ? ' is-loading' : ''}`}
                          disabled={deletingId === product.id}
                          onClick={() => deleteProduct(product.id)}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>

                  <div style={{ borderTop: '1px solid #f5f5f5', marginTop: '0.75rem', paddingTop: '0.5rem' }}>
                    <button
                      className="button is-ghost is-small has-text-grey"
                      onClick={() => togglePricesPanel(product.id)}
                      style={{ paddingLeft: 0, height: 'auto' }}
                    >
                      Prices ({(product.prices || []).length})
                      <span className="ml-1">{expandedPrices[product.id] ? '▴' : '▾'}</span>
                    </button>
                  </div>

                  {expandedPrices[product.id] && (
                    <PricesPanel
                      productId={product.id}
                      initialPrices={product.prices || []}
                      onError={setError}
                    />
                  )}

                  <div style={{ borderTop: '1px solid #f5f5f5', marginTop: '0.75rem', paddingTop: '0.5rem' }}>
                    <button
                      className="button is-ghost is-small has-text-grey"
                      onClick={() => toggleImagesPanel(product.id)}
                      style={{ paddingLeft: 0, height: 'auto' }}
                    >
                      Images ({(product.images || []).length})
                      <span className="ml-1">{expandedImages[product.id] ? '▴' : '▾'}</span>
                    </button>
                  </div>

                  {expandedImages[product.id] && (
                    <ImagesPanel
                      productId={product.id}
                      initialImages={product.images || []}
                      onError={setError}
                    />
                  )}
                </div>
              )
            )}
          </>
        )}

        {activeTab === 'subscriptions' && (
          <>
            {loadingS && <p className="has-text-grey">Loading subscriptions…</p>}

            {!loadingS && subscriptions.length === 0 && (
              <p className="has-text-grey">No subscriptions found.</p>
            )}

            {!loadingS && subscriptions.length > 0 && (
              <div className="table-container">
                <table className="table is-fullwidth is-striped is-hoverable is-size-7">
                  <thead>
                    <tr>
                      <th>User</th>
                      <th>Status</th>
                      <th>Subscription ID</th>
                      <th>Price ID</th>
                      <th>Period End</th>
                      <th>Cancel at End</th>
                    </tr>
                  </thead>
                  <tbody>
                    {subscriptions.map(sub => (
                      <tr key={sub.id}>
                        <td>
                          <p>{sub.username}</p>
                          <p className="has-text-grey">{sub.user_email}</p>
                        </td>
                        <td>
                          <span className={`tag ${STATUS_COLOR[sub.status] || 'is-light'}`}>
                            {sub.status.replace('_', ' ')}
                          </span>
                        </td>
                        <td><code>{sub.stripe_subscription_id}</code></td>
                        <td><code>{sub.stripe_price_id}</code></td>
                        <td>{new Date(sub.current_period_end).toLocaleDateString()}</td>
                        <td>{sub.cancel_at_period_end ? <span className="tag is-warning is-light">Yes</span> : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
