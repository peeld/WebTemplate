import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { supportApi } from '../api'
import TicketStatusBadge from '../components/TicketStatusBadge'

export default function SupportUserSection() {
  const [tickets, setTickets] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supportApi.getTickets()
      .then(res => res.ok ? res.json() : Promise.reject(res))
      .then(data => setTickets(data.filter(t => t.status === 'open')))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const recent = tickets.slice(0, 3)

  return (
    <div className="card"  style={{ width: '100%' }}>
      <header className="card-header">
        <p className="card-header-title">Support</p>
      </header>

      <div className="card-content">

        {loading ? (
          <p className="has-text-grey is-size-7">Loading…</p>
        ) : tickets.length === 0 ? (
          <p className="has-text-grey is-size-7">No open tickets.</p>
        ) : (
          <>
            <p className="has-text-grey is-size-7 mb-2">{tickets.length} open ticket{tickets.length !== 1 ? 's' : ''}</p>
            {recent.map(t => (
              <div key={t.id} className="is-flex is-justify-content-space-between is-align-items-center mb-1">
                <Link to={`/support/tickets/${t.id}`} className="is-size-7 has-text-weight-medium">
                  {t.title}
                </Link>
                <TicketStatusBadge status={t.status} />
              </div>
            ))}
          </>
        )}

        <div className="mt-3">
          <Link to="/support/new" className="button is-small is-primary">New Ticket</Link>
        </div>
      </div>
    </div>
  )
}
