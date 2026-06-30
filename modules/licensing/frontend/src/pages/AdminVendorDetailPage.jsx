import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  getAdminVendors,
  getAdminVendorPools,
  createAdminVendorPool,
  patchAdminVendorPool,
  getAdminVendorInvoices,
  generateAdminVendorInvoice,
  getAdminBillingProducts,
} from '../api.js';

function StatusTag({ status }) {
  const colors = {
    draft:  'is-light',
    issued: 'is-info is-light',
    paid:   'is-success is-light',
    void:   'is-danger is-light',
  };
  return <span className={`tag is-small ${colors[status] || 'is-light'}`}>{status}</span>;
}

function priceLabel(p) {
  const amount = (p.amount / 100).toFixed(2);
  if (p.price_type === 'one_time') {
    return p.days_granted ? `$${amount} one-time (${p.days_granted}d)` : `$${amount} one-time`;
  }
  return `$${amount}/${p.interval}`;
}

const EMPTY_SEATS_FORM = { price_id: '', seats: 1 };

export default function AdminVendorDetailPage() {
  const { id }   = useParams();
  const vendorId = parseInt(id, 10);

  const [vendor, setVendor]     = useState(null);
  const [pools, setPools]       = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);

  const [showSeats, setShowSeats]     = useState(false);
  const [seatsForm, setSeatsForm]     = useState(EMPTY_SEATS_FORM);
  const [seatsSaving, setSeatsSaving] = useState(false);
  const [seatsError, setSeatsError]   = useState(null);

  const [invForm, setInvForm]     = useState({ period_start: '', period_end: '' });
  const [invSaving, setInvSaving] = useState(false);
  const [invError, setInvError]   = useState(null);

  useEffect(() => {
    async function load() {
      try {
        const [vendorsRes, poolsRes, invoicesRes, productsRes] = await Promise.all([
          getAdminVendors(),
          getAdminVendorPools(vendorId),
          getAdminVendorInvoices(vendorId),
          getAdminBillingProducts(),
        ]);
        if (vendorsRes.ok) {
          const all = await vendorsRes.json();
          setVendor(all.find(v => v.id === vendorId) || null);
        }
        if (poolsRes.ok) setPools(await poolsRes.json());
        if (invoicesRes.ok) setInvoices(await invoicesRes.json());
        if (productsRes.ok) setProducts(await productsRes.json());
      } catch {
        setError('Network error.');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [vendorId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Flat list of all active prices across all products, annotated with existing pool if any
  const priceOptions = products.flatMap(prod =>
    (prod.prices || [])
      .filter(p => p.is_active)
      .map(p => ({
        price_id:    p.id,
        product_id:  prod.id,
        label:       `${prod.name} — ${priceLabel(p)}`,
        existingPool: pools.find(pool => pool.price === p.id) || null,
      }))
  );

  const selectedOption = priceOptions.find(o => o.price_id === parseInt(seatsForm.price_id, 10)) || null;

  async function handleAddSeats() {
    const seats = parseInt(seatsForm.seats, 10);
    if (!seats || seats < 1) { setSeatsError('Enter a positive number of seats.'); return; }
    if (!selectedOption) { setSeatsError('Select a price.'); return; }

    setSeatsSaving(true);
    setSeatsError(null);
    try {
      let res, data;
      if (selectedOption.existingPool) {
        const pool = selectedOption.existingPool;
        res  = await patchAdminVendorPool(vendorId, pool.id, { seats_purchased: pool.seats_purchased + seats });
        data = await res.json();
        if (res.ok) {
          setPools(prev => prev.map(p => p.id === pool.id ? data : p));
        }
      } else {
        res  = await createAdminVendorPool(vendorId, {
          product:         selectedOption.product_id,
          price:           selectedOption.price_id,
          seats_purchased: seats,
        });
        data = await res.json();
        if (res.ok) {
          setPools(prev => [...prev, data]);
        }
      }
      if (res.ok) {
        setShowSeats(false);
        setSeatsForm(EMPTY_SEATS_FORM);
      } else {
        setSeatsError(data.error || data.detail || JSON.stringify(data));
      }
    } catch {
      setSeatsError('Network error.');
    } finally {
      setSeatsSaving(false);
    }
  }

  async function handleGenerateInvoice() {
    setInvSaving(true);
    setInvError(null);
    try {
      const res  = await generateAdminVendorInvoice(vendorId, invForm.period_start, invForm.period_end);
      const data = await res.json();
      if (res.ok) {
        setInvoices(prev => [data, ...prev]);
        setInvForm({ period_start: '', period_end: '' });
      } else {
        setInvError(data.error || data.detail || JSON.stringify(data));
      }
    } catch {
      setInvError('Network error.');
    } finally {
      setInvSaving(false);
    }
  }

  if (loading) {
    return (
      <section className="section">
        <div className="container"><p className="has-text-grey">Loading…</p></div>
      </section>
    );
  }

  if (!vendor) {
    return (
      <section className="section">
        <div className="container">
          <div className="notification is-danger is-light">Vendor not found.</div>
          <Link to="/admin/licensing/vendors" className="button is-small">Back to Vendors</Link>
        </div>
      </section>
    );
  }

  return (
    <section className="section">
      <div className="container" style={{ maxWidth: 860 }}>
        <nav className="breadcrumb is-small mb-3">
          <ul>
            <li><Link to="/admin/licensing/vendors">Vendors</Link></li>
            <li className="is-active"><a>{vendor.org_name}</a></li>
          </ul>
        </nav>

        {error && (
          <div className="notification is-danger is-light">
            {error}<button className="delete" onClick={() => setError(null)} />
          </div>
        )}

        {/* Vendor summary */}
        <div className="box mb-4">
          <div className="level is-mobile mb-2">
            <div className="level-left">
              <div>
                <h1 className="title is-5 mb-1">{vendor.org_name}</h1>

              </div>
            </div>
            <div className="level-right">
              <span className={`tag ${vendor.is_active ? 'is-success' : 'is-danger'} is-light`}>
                  {vendor.org_id}
              </span>
              <span className={`tag ${vendor.is_active ? 'is-success' : 'is-danger'} is-light`}>
                {vendor.is_active ? 'Active' : 'Inactive'}
              </span>
            </div>
          </div>
          <div className="is-size-7">
            <span className="has-text-grey">Discount: </span>
            <strong>{(parseFloat(vendor.discount_pct) * 100).toFixed(0)}% off list price</strong>
            {vendor.notes && (
              <span className="ml-4 has-text-grey">{vendor.notes}</span>
            )}
          </div>
        </div>

        {/* License Pools */}
        <div className="box mb-4">
          <div className="level is-mobile mb-3">
            <div className="level-left">
              <h2 className="subtitle is-5 mb-0">License Pools</h2>
            </div>
            <div className="level-right">
              {!showSeats && (
                <button className="button is-small is-primary" onClick={() => setShowSeats(true)}>
                  + Add Seats
                </button>
              )}
            </div>
          </div>

          {showSeats && (
            <div className="box mb-3">
              <p className="has-text-weight-semibold mb-3 is-size-7">Add Seats</p>
              {seatsError && (
                <div className="notification is-danger is-light py-2 px-3 mb-3 is-size-7">{seatsError}</div>
              )}
              <div className="columns is-vcentered">
                <div className="column">
                  <div className="field">
                    <label className="label is-small">Product &amp; Price</label>
                    <div className="control">
                      <div className="select is-small is-fullwidth">
                        <select
                          value={seatsForm.price_id}
                          onChange={e => setSeatsForm(f => ({ ...f, price_id: e.target.value }))}
                        >
                          <option value="">— select —</option>
                          {priceOptions.map(o => (
                            <option key={o.price_id} value={o.price_id}>
                              {o.label}{o.existingPool ? ' (add to existing pool)' : ''}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="column is-narrow">
                  <div className="field">
                    <label className="label is-small">Seats</label>
                    <div className="control">
                      <input
                        className="input is-small"
                        type="number"
                        min="1"
                        value={seatsForm.seats}
                        onChange={e => setSeatsForm(f => ({ ...f, seats: e.target.value }))}
                        style={{ width: 90 }}
                      />
                    </div>
                  </div>
                </div>
              </div>
              <div className="buttons">
                <button
                  className={`button is-primary is-small${seatsSaving ? ' is-loading' : ''}`}
                  disabled={seatsSaving || !seatsForm.price_id}
                  onClick={handleAddSeats}
                >
                  {selectedOption?.existingPool ? 'Add Seats' : 'Create Pool'}
                </button>
                <button
                  className="button is-small"
                  onClick={() => { setShowSeats(false); setSeatsForm(EMPTY_SEATS_FORM); setSeatsError(null); }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {pools.length === 0 && !showSeats && (
            <div className="box has-text-grey is-size-7">No pools yet.</div>
          )}

          {pools.length > 0 && (
            <table className="table is-fullwidth is-size-7">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Price</th>
                  <th>Purchased</th>
                  <th>Issued</th>
                  <th>Remaining</th>
                </tr>
              </thead>
              <tbody>
                {pools.map(pool => (
                  <tr key={pool.id}>
                    <td className="has-text-weight-semibold">{pool.product_name}</td>
                    <td className="has-text-grey">{pool.price_label}</td>
                    <td>{pool.seats_purchased}</td>
                    <td>{pool.seats_issued}</td>
                    <td>
                      <span className={pool.seats_remaining === 0 ? 'has-text-danger' : ''}>
                        {pool.seats_remaining}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Invoices */}
        <div>

          <div className="box mb-3">
            <h2 className="subtitle is-5 mb-3">Invoices</h2>
            <p className="has-text-weight-semibold is-size-7 mb-3">Generate Invoice</p>
            {invError && (
              <div className="notification is-danger is-light py-2 px-3 mb-3 is-size-7">{invError}</div>
            )}
            <div className="columns is-vcentered">
              <div className="column">
                <div className="field">
                  <label className="label is-small">Period Start</label>
                  <div className="control">
                    <input
                      className="input is-small"
                      type="date"
                      value={invForm.period_start}
                      onChange={e => setInvForm(f => ({ ...f, period_start: e.target.value }))}
                    />
                  </div>
                </div>
              </div>
              <div className="column">
                <div className="field">
                  <label className="label is-small">Period End</label>
                  <div className="control">
                    <input
                      className="input is-small"
                      type="date"
                      value={invForm.period_end}
                      onChange={e => setInvForm(f => ({ ...f, period_end: e.target.value }))}
                    />
                  </div>
                </div>
              </div>
              <div className="column is-narrow" style={{ paddingTop: '1.75rem' }}>
                <button
                  className={`button is-small is-primary${invSaving ? ' is-loading' : ''}`}
                  disabled={invSaving || !invForm.period_start || !invForm.period_end}
                  onClick={handleGenerateInvoice}
                >
                  Generate
                </button>
              </div>
            </div>

            {invoices.length === 0 && (
              <div className="has-text-grey is-size-8">No invoices yet.</div>
            )}

            {invoices.length > 0 && (
            <table className="table is-fullwidth is-hoverable is-size-7">
              <thead>
                <tr>
                  <th>Period</th>
                  <th>Status</th>
                  <th>Issued</th>
                  <th>Paid</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {invoices.map(inv => (
                  <tr key={inv.id}>
                    <td>{inv.period_start} — {inv.period_end}</td>
                    <td><StatusTag status={inv.status} /></td>
                    <td>{inv.issued_at ? new Date(inv.issued_at).toLocaleDateString() : '—'}</td>
                    <td>{inv.paid_at  ? new Date(inv.paid_at).toLocaleDateString()  : '—'}</td>
                    <td>
                      <Link
                        to={`/admin/licensing/vendors/${vendorId}/invoices/${inv.id}`}
                        className="button is-small is-info is-light"
                      >
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
