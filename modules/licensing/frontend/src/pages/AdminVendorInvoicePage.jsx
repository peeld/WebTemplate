import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getAdminVendors, getAdminVendorInvoices, updateAdminVendorInvoice } from '../api.js';

function formatCents(cents) {
  if (cents == null) return '—';
  return `$${(cents / 100).toFixed(2)}`;
}

const STATUS_TRANSITIONS = {
  draft:  ['issue', 'void'],
  issued: ['pay', 'void'],
  paid:   ['void'],
  void:   [],
};

const ACTION_LABELS = { issue: 'Issue', pay: 'Mark Paid', void: 'Void' };
const ACTION_COLORS = {
  issue: 'is-info',
  pay:   'is-success',
  void:  'is-danger is-light',
};

export default function AdminVendorInvoicePage() {
  const { id, inv } = useParams();
  const vendorId    = parseInt(id, 10);
  const invoiceId   = parseInt(inv, 10);

  const [vendor, setVendor]   = useState(null);
  const [invoice, setInvoice] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);
  const [acting, setActing]   = useState(null);

  useEffect(() => {
    async function load() {
      try {
        const [vendorsRes, invoicesRes] = await Promise.all([
          getAdminVendors(),
          getAdminVendorInvoices(vendorId),
        ]);
        if (vendorsRes.ok) {
          const all = await vendorsRes.json();
          setVendor(all.find(v => v.id === vendorId) || null);
        }
        if (invoicesRes.ok) {
          const all = await invoicesRes.json();
          setInvoice(all.find(i => i.id === invoiceId) || null);
        }
      } catch {
        setError('Network error.');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [vendorId, invoiceId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleAction(action) {
    setActing(action);
    setError(null);
    try {
      const res  = await updateAdminVendorInvoice(vendorId, invoiceId, action);
      const data = await res.json();
      if (res.ok) {
        setInvoice(data);
      } else {
        setError(data.error || data.detail || 'Action failed.');
      }
    } catch {
      setError('Network error.');
    } finally {
      setActing(null);
    }
  }

  if (loading) {
    return (
      <section className="section">
        <div className="container"><p className="has-text-grey">Loading…</p></div>
      </section>
    );
  }

  if (!invoice) {
    return (
      <section className="section">
        <div className="container">
          <div className="notification is-danger is-light">Invoice not found.</div>
          <Link to={`/admin/licensing/vendors/${vendorId}`} className="button is-small">Back</Link>
        </div>
      </section>
    );
  }

  const allowedActions = STATUS_TRANSITIONS[invoice.status] || [];
  const lineItems      = invoice.line_items || [];
  const grandTotal     = lineItems.reduce((sum, item) => sum + item.line_total, 0);

  const statusColor = {
    draft:  'is-light',
    issued: 'is-info',
    paid:   'is-success',
    void:   'is-danger is-light',
  }[invoice.status] || 'is-light';

  return (
    <section className="section">
      <div className="container" style={{ maxWidth: 860 }}>
        <nav className="breadcrumb is-small mb-3">
          <ul>
            <li><Link to="/admin/licensing/vendors">Vendors</Link></li>
            <li><Link to={`/admin/licensing/vendors/${vendorId}`}>{vendor?.org_name || `Vendor ${vendorId}`}</Link></li>
            <li className="is-active"><a>Invoice #{invoice.id}</a></li>
          </ul>
        </nav>

        {error && (
          <div className="notification is-danger is-light">
            {error}<button className="delete" onClick={() => setError(null)} />
          </div>
        )}

        {/* Invoice header */}
        <div className="box mb-4">
          <div className="level is-mobile mb-3">
            <div className="level-left">
              <div>
                <h1 className="title is-5 mb-1">Invoice #{invoice.id}</h1>
                <p className="is-size-7 has-text-grey">
                  {invoice.period_start} — {invoice.period_end}
                </p>
              </div>
            </div>
            <div className="level-right">
              <span className={`tag is-medium ${statusColor}`}>
                {invoice.status}
              </span>
            </div>
          </div>

          <div className="columns is-mobile is-size-7 mb-0">
            <div className="column">
              <span className="has-text-grey">Issued: </span>
              {invoice.issued_at ? new Date(invoice.issued_at).toLocaleString() : '—'}
            </div>
            <div className="column">
              <span className="has-text-grey">Paid: </span>
              {invoice.paid_at ? new Date(invoice.paid_at).toLocaleString() : '—'}
            </div>
          </div>

          {invoice.notes && (
            <p className="is-size-7 has-text-grey mt-2">{invoice.notes}</p>
          )}

          {allowedActions.length > 0 && (
            <div className="buttons mt-4">
              {allowedActions.map(action => (
                <button
                  key={action}
                  className={`button is-small ${ACTION_COLORS[action]}${acting === action ? ' is-loading' : ''}`}
                  disabled={acting !== null}
                  onClick={() => handleAction(action)}
                >
                  {ACTION_LABELS[action]}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Line items */}
        <h2 className="subtitle is-5 mb-3">Line Items</h2>

        {lineItems.length === 0 ? (
          <div className="box has-text-grey is-size-7">No line items.</div>
        ) : (
          <table className="table is-fullwidth is-size-7">
            <thead>
              <tr>
                <th>Product</th>
                <th className="has-text-right">Seats</th>
                <th className="has-text-right">Unit Price</th>
                <th className="has-text-right">Discount</th>
                <th className="has-text-right">Line Total</th>
              </tr>
            </thead>
            <tbody>
              {lineItems.map(item => (
                <tr key={item.id}>
                  <td className="has-text-weight-semibold">{item.product_name}</td>
                  <td className="has-text-right">{item.seats_used}</td>
                  <td className="has-text-right">{formatCents(item.unit_price)}</td>
                  <td className="has-text-right">{(parseFloat(item.discount_pct) * 100).toFixed(0)}%</td>
                  <td className="has-text-right has-text-weight-semibold">{formatCents(item.line_total)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={4} className="has-text-right has-text-weight-semibold">Total</td>
                <td className="has-text-right has-text-weight-semibold">{formatCents(grandTotal)}</td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>
    </section>
  );
}
