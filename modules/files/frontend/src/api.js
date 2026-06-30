import { apiFetch } from '@core/frontend/utils/api';

const get   = (path)       => apiFetch(path, { method: 'GET' });
const post  = (path, body) => apiFetch(path, { method: 'POST',  body: JSON.stringify(body ?? {}) });
const patch = (path, body) => apiFetch(path, { method: 'PATCH', body: JSON.stringify(body) });
const del   = (path)       => apiFetch(path, { method: 'DELETE' });

function qs(params) {
  const p = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v != null)
  ).toString();
  return p ? `?${p}` : '';
}

export const getReleases      = (params = {}) => get(`/api/files/releases/${qs(params)}`);
export const getRelease       = (id) => get(`/api/files/releases/${id}/`);
export const getLatestRelease = (productId) =>
  get(`/api/files/releases/latest/?product_id=${productId}`);
export const createRelease    = (data) => post('/api/files/releases/', data);
export const updateRelease    = (id, data) => patch(`/api/files/releases/${id}/`, data);
export const setLatestRelease = (id) => post(`/api/files/releases/${id}/set-latest/`);
export const deleteRelease    = (id) => del(`/api/files/releases/${id}/`);
export const createAsset      = (releaseId, data) =>
  post(`/api/files/releases/${releaseId}/assets/`, data);
export const updateAsset      = (releaseId, assetId, data) =>
  patch(`/api/files/releases/${releaseId}/assets/${assetId}/`, data);
export const deleteAsset      = (releaseId, assetId) =>
  del(`/api/files/releases/${releaseId}/assets/${assetId}/`);
export const getDownloadUrl   = (releaseId, assetId) =>
  `/api/files/releases/${releaseId}/assets/${assetId}/download/`;
