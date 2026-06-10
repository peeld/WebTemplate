import { apiFetch } from '@core/frontend/utils/api';

const get  = (path)       => apiFetch(path, { method: 'GET' });
const post = (path, body) => apiFetch(path, { method: 'POST', body: JSON.stringify(body) });

export const getPrices = () =>
  get('/api/billing/prices/');

export const createCheckoutSession = (priceId, mode = 'subscription') =>
  post('/api/billing/checkout/', { price_id: priceId, mode });

export const getSubscription = () =>
  get('/api/billing/subscription/');

export const openPortal = () =>
  post('/api/billing/portal/', {});
