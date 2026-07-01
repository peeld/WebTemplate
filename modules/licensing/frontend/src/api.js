import { apiFetch } from '@core/frontend/utils/api';

const get    = (path)       => apiFetch(path, { method: 'GET' });
const post   = (path, body) => apiFetch(path, { method: 'POST',  body: JSON.stringify(body) });
const patch  = (path, body) => apiFetch(path, { method: 'PATCH', body: JSON.stringify(body) });
const del    = (path)       => apiFetch(path, { method: 'DELETE' });

export const getLicenses = () =>
  get('/api/licensing/keys/');

export const createInstallToken = (licenseKeyUuid) =>
  post('/api/licensing/install-tokens/', { license_key: licenseKeyUuid });

export const exchangeInstallToken = (token) =>
  post('/api/licensing/install-token/exchange/', { token });

export const adminGetLicenses = () =>
  get('/api/licensing/admin/licenses/');

export const getVendorPools = () =>
  get('/api/licensing/vendor/pools/');

export const getVendorTokens = (poolId) =>
  get(`/api/licensing/vendor/pools/${poolId}/tokens/`);

export const createVendorTokens = (poolId, count, label) =>
  post(`/api/licensing/vendor/pools/${poolId}/tokens/`, { count, label });

export const revokeVendorToken = (poolId, tokenId) =>
  del(`/api/licensing/vendor/pools/${poolId}/tokens/${tokenId}/`);

export const getAdminVendors = () =>
  get('/api/licensing/admin/vendors/');

export const createAdminVendor = (data) =>
  post('/api/licensing/admin/vendors/', data);

export const getAdminVendorPools = (vendorId) =>
  get(`/api/licensing/admin/vendors/${vendorId}/pools/`);

export const createAdminVendorPool = (vendorId, data) =>
  post(`/api/licensing/admin/vendors/${vendorId}/pools/`, data);

export const getAdminVendorInvoices = (vendorId) =>
  get(`/api/licensing/admin/vendors/${vendorId}/invoices/`);

export const generateAdminVendorInvoice = (vendorId, periodStart, periodEnd) =>
  post(`/api/licensing/admin/vendors/${vendorId}/invoices/`, { period_start: periodStart, period_end: periodEnd });

export const updateAdminVendorInvoice = (vendorId, invoiceId, action) =>
  patch(`/api/licensing/admin/vendors/${vendorId}/invoices/${invoiceId}/`, { action });

export const patchAdminVendorPool = (vendorId, poolId, data) =>
  patch(`/api/licensing/admin/vendors/${vendorId}/pools/${poolId}/`, data);

export const getAdminBillingProducts = () =>
  get('/api/billing/admin/products/');

// Submits an HMAC-signed offline trial-request payload (built by the C++
// client's build_offline_trial_payload() and carried here via URL query
// params) to the same endpoint the app calls directly when online.
export const requestTrialFromPayload = ({ product, email, mid, ts, nonce, sig }) =>
  apiFetch('/api/licensing/trial/request/', {
    method: 'POST',
    headers: {
      'X-Machine-ID': mid,
      'X-Timestamp':  ts,
      'X-Nonce':      nonce,
      'X-Signature':  sig,
    },
    body: JSON.stringify({ product_slug: product, email }),
  });
