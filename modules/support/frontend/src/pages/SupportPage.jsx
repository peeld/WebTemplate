import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { supportApi } from '../api'
import TicketStatusBadge from '../components/TicketStatusBadge'

export default function SupportPage() {
  const [tickets, setTickets] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    supportApi.getTickets()
      .then(res => res.ok ? res.json() : Promise.reject(res))
      .then(setTickets)
      .catch(() => setError('Failed to load tickets.'))
      .finally(() => setLoading(false))
  }, [])

  return (
    <section className="section">
      <div className="container">
        <div className="is-flex is-justify-content-space-between is-align-items-center mb-5">
          <h1 className="title">Support Tickets</h1>
          <Link to="/support/new" className="button is-primary">New Ticket</Link>
        </div>

        {loading && <p>Loading…</p>}
        {error && <p className="has-text-danger">{error}</p>}

        {!loading && !error && tickets.length === 0 && (
          <div className="has-text-centered py-6">
            <p className="has-text-grey">You have no support tickets.</p>
            <Link to="/support/new" className="button is-primary mt-3">Open a Ticket</Link>
          </div>
        )}

        {tickets.length > 0 && (
          <div className="table-container">
            <table className="table is-fullwidth is-hoverable">
              <thead>
                <tr>
                  <th>#</th>
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
