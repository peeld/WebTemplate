import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supportApi } from '../api'
import TicketStatusBadge from '../components/TicketStatusBadge'

const STATUS_OPTIONS = ['', 'open', 'in_progress', 'resolved', 'closed']
const PRIORITY_OPTIONS = ['', 'low', 'medium', 'high', 'urgent']

export default function AdminTicketsPage() {
  const navigate = useNavigate()
  const [tickets, setTickets] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [filters, setFilters] = useState({ status: '', priority: '' })

  useEffect(() => {
    setLoading(true)
    supportApi.getAdminTickets(filters)
      .then(res => {
        if (res.status === 403) { navigate('/'); return null }
        if (!res.ok) throw new Error()
        return res.json()
      })
      .then(data => { if (data) setTickets(data) })
      .catch(() => setError('Failed to load tickets.'))
      .finally(() => setLoading(false))
  }, [filters, navigate])

  const handleFilter = e => setFilters(f => ({ ...f, [e.target.name]: e.target.value }))

  return (
    <section className="section">
      <div className="container">
        <h1 className="title">Admin — All Tickets</h1>

        <div className="field is-grouped mb-4">
          <div className="control">
            <div className="select">
              <select name="status" value={filters.status} onChange={handleFilter}>
                {STATUS_OPTIONS.map(s => (
                  <option key={s} value={s}>{s || 'All statuses'}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="control">
            <div className="select">
              <select name="priority" value={filters.priority} onChange={handleFilter}>
                {PRIORITY_OPTIONS.map(p => (
                  <option key={p} value={p}>{p || 'All priorities'}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {loading && <p>Loading…</p>}
        {error && <p className="has-text-danger">{error}</p>}

        {!loading && !error && tickets.length === 0 && (
          <p className="has-text-grey">No tickets found.</p>
        )}

        {tickets.length > 0 && (
          <div className="table-container">
            <table className="table is-fullwidth is-hoverable">
              <thead>
                <tr>
                  <th>#</th>
                  <th>User</th>
                  <th>Title</th>
                  <th>Status</th>
                  <th>Priority</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {tickets.map(t => (
                  <tr key={t.id}>
                    <td>{t.id}</td>
                    <td>{t.user}</td>
                    <td>
                      <Link to={`/support/tickets/${t.id}`}>{t.title}</Link>
                    </td>
                    <td><TicketStatusBadge status={t.status} /></td>
                    <td>{t.priority}</td>
                    <td>{new Date(t.created_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  )
}
