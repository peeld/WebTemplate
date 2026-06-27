import { apiFetch } from '@core/frontend/utils/api'

const post = (path, body) =>
  apiFetch(path, { method: 'POST', body: JSON.stringify(body) })

const patch = (path, body) =>
  apiFetch(path, { method: 'PATCH', body: JSON.stringify(body) })

const put = (path, body) =>
  apiFetch(path, { method: 'PUT', body: JSON.stringify(body) })

const del = (path) =>
  apiFetch(path, { method: 'DELETE' })

export const orgsApi = {
  list:             ()               => apiFetch('/api/orgs/'),
  create:           (data)           => post('/api/orgs/', data),
  detail:           (id)             => apiFetch(`/api/orgs/${id}/`),
  update:           (id, data)       => put(`/api/orgs/${id}/`, data),
  delete:           (id)             => del(`/api/orgs/${id}/`),
  members:          (id)             => apiFetch(`/api/orgs/${id}/members/`),
  updateMemberRole: (id, uid, role)  => patch(`/api/orgs/${id}/members/${uid}/`, { role }),
  removeMember:     (id, uid)        => del(`/api/orgs/${id}/members/${uid}/`),
  invites:          (id)             => apiFetch(`/api/orgs/${id}/invites/`),
  createInvite:     (id, email)      => post(`/api/orgs/${id}/invites/`, { email }),
  acceptInvite:     (token)          => post(`/api/orgs/invites/${token}/accept/`, {}),
}
