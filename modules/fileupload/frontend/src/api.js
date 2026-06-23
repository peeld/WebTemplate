import { apiFetch } from '@core/frontend/utils/api';

const get  = (path)       => apiFetch(path, { method: 'GET' });
const post = (path, body) => apiFetch(path, { method: 'POST', body: JSON.stringify(body) });

export const getPresignedUrl = (filename, contentType, size) =>
  post('/api/fileupload/presign/', { filename, content_type: contentType, size });

export const confirmUpload = (fileId) =>
  post(`/api/fileupload/confirm/${fileId}/`, {});

export const getFiles = () =>
  get('/api/fileupload/files/');

export const getFileUrls = (fileId) =>
  get(`/api/fileupload/files/${fileId}/url/`);
