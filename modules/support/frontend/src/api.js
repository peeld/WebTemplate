import { apiFetch } from '@core/frontend/utils/api'

const BASE = '/api/support'

export const supportApi = {
  getTickets: () =>
    apiFetch(`${BASE}/tickets/`),

  createTicket: (data) =>
    apiFetch(`${BASE}/tickets/`, { method: 'POST', body: JSON.stringify(data) }),

  getTicket: (id) =>
    apiFetch(`${BASE}/tickets/${id}/`),

  updateTicket: (id, data) =>
    apiFetch(`${BASE}/tickets/${id}/`, { method: 'PATCH', body: JSON.stringify(data) }),

  getMessages: (ticketId) =>
    apiFetch(`${BASE}/tickets/${ticketId}/messages/`),

  createMessage: (ticketId, data) =>
    apiFetch(`${BASE}/tickets/${ticketId}/messages/`, { method: 'POST', body: JSON.stringify(data) }),

  getAdminTickets: (params = {}) => {
    const qs = new URLSearchParams(
      Object.fromEntries(Object.entries(params).filter(([, v]) => v))
    ).toString()
    return apiFetch(`${BASE}/admin/tickets/${qs ? `?${qs}` : ''}`)
  },

  getAttachments: (ticketId) =>
    apiFetch(`${BASE}/tickets/${ticketId}/attachments/`),

  addAttachment: (ticketId, fileId, filename, messageId = null) =>
    apiFetch(`${BASE}/tickets/${ticketId}/attachments/`, {
      method: 'POST',
      body: JSON.stringify({ file_id: fileId, original_filename: filename, message: messageId }),
    }),

  presignFile: (filename, contentType, size) =>
    apiFetch('/api/fileupload/presign/', {
      method: 'POST',
      body: JSON.stringify({ filename, content_type: contentType, size }),
    }),

  confirmFile: (fileId) =>
    apiFetch(`/api/fileupload/confirm/${fileId}/`, { method: 'POST', body: JSON.stringify({}) }),

  getFileUrl: (fileId) =>
    apiFetch(`/api/fileupload/files/${fileId}/url/`),
}
