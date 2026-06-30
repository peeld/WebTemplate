import { apiFetch } from '@core/frontend/utils/api';

const get    = (path)        => apiFetch(path, { method: 'GET' });
const post   = (path, body)  => apiFetch(path, { method: 'POST',   body: JSON.stringify(body) });
const patch  = (path, body)  => apiFetch(path, { method: 'PATCH',  body: JSON.stringify(body) });
const del    = (path)        => apiFetch(path, { method: 'DELETE' });
const upload = (path, fd)    => apiFetch(path, { method: 'POST',   body: fd });

export const getProducts = () =>
  get('/api/billing/products/');

export const getPrices = () =>
  get('/api/billing/prices/');

export const createCheckoutSession = (priceId, mode = 'subscription') =>
  post('/api/billing/checkout/', { price_id: priceId, mode });

export const getSubscription = () =>
  get('/api/billing/subscription/');

export const cancelSubscription = (subscriptionId) =>
  post('/api/billing/subscription/cancel/', { subscription_id: subscriptionId });

export const resumeSubscription = (subscriptionId) =>
  post('/api/billing/subscription/resume/', { subscription_id: subscriptionId });

export const changeSubscription = (subscriptionId, priceId) =>
  post('/api/billing/subscription/change/', { subscription_id: subscriptionId, price_id: priceId });

export const openPortal = () =>
  post('/api/billing/portal/', {});

export const adminGetProducts = () =>
  get('/api/billing/admin/products/');

export const adminCreateProduct = (data) =>
  post('/api/billing/admin/products/', data);

export const adminUpdateProduct = (id, data) =>
  patch(`/api/billing/admin/products/${id}/`, data);

export const adminDeleteProduct = (id) =>
  del(`/api/billing/admin/products/${id}/`);

export const adminGetSubscriptions = () =>
  get('/api/billing/admin/subscriptions/');

export const adminCheckSubscriptionSync = () =>
  get('/api/billing/admin/subscriptions/sync/');

export const adminFixSubscriptionSync = () =>
  post('/api/billing/admin/subscriptions/sync/', {});

export const adminSyncProduct = (productId) =>
  post(`/api/billing/admin/products/${productId}/sync/`, {});

export const adminGetProductPrices = (productId) =>
  get(`/api/billing/admin/products/${productId}/prices/`);

export const adminCreateProductPrice = (productId, data) =>
  post(`/api/billing/admin/products/${productId}/prices/`, data);

export const adminUpdateProductPrice = (productId, priceId, data) =>
  patch(`/api/billing/admin/products/${productId}/prices/${priceId}/`, data);

export const adminDeleteProductPrice = (productId, priceId) =>
  del(`/api/billing/admin/products/${productId}/prices/${priceId}/`);

export const adminUploadProductImage = (productId, formData) =>
  upload(`/api/billing/admin/products/${productId}/images/`, formData);

export const adminDeleteProductImage = (productId, imageId) =>
  del(`/api/billing/admin/products/${productId}/images/${imageId}/`);

export const createSetupIntent = (email = null) =>
  post('/api/billing/cart/setup-intent/', email ? { email } : {});

export const executeCart = (paymentMethod, items, setupIntentId = null) =>
  post('/api/billing/cart/execute/', {
    payment_method: paymentMethod,
    items,
    ...(setupIntentId ? { setup_intent_id: setupIntentId } : {}),
  });

