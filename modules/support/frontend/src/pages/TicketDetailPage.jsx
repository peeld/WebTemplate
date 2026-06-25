import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supportApi } from '../api'
import AttachmentList from '../components/AttachmentList'
import AttachmentUploader from '../components/AttachmentUploader'
import TicketStatusBadge from '../components/TicketStatusBadge'

export default function TicketDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [ticket, setTicket] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [reply, setReply] = useState('')
  const [sending, setSending] = useState(false)
  const [closing, setClosing] = useState(false)
  const [lastMessageId, setLastMessageId] = useState(null)
  const [attachRefresh, setAttachRefresh] = useState(0)

  const load = useCallback(() => {
    supportApi.getTicket(id)
      .then(res => res.ok ? res.json() : Promise.reject(res))
      .then(setTicket)
      .catch(() => setError('Failed to load ticket.'))
      .finally(() => setLoading(false))
  }, [id])

  useEffect(() => { load() }, [load])

  const handleClose = async () => {
    setClosing(true)
    try {
      const res = await supportApi.updateTicket(id, { status: 'closed' })
      if (!res.ok) throw new Error()
      setTicket(t => ({ ...t, status: 'closed' }))
    } catch {
      setError('Failed to close ticket.')
    } finally {
      setClosing(false)
    }
  }

  const handleReply = async e => {
    e.preventDefault()
    if (!reply.trim()) return
    setSending(true)
    setLastMessageId(null)
    try {
      const res = await supportApi.createMessage(id, { body: reply })
      if (!res.ok) throw new Error()
      const msg = await res.json()
      setTicket(t => ({ ...t, messages: [...(t.messages ?? []), msg] }))
      setReply('')
      setLastMessageId(msg.id)
    } catch {
      setError('Failed to send reply.')
    } finally {
      setSending(false)
    }
  }

  if (loading) return <section className="section"><p>Loading…</p></section>
  if (error && !ticket) return <section className="section"><p className="has-text-danger">{error}</p></section>

  const canClose = ticket && ticket.status !== 'closed' && ticket.status !== 'resolved'

  return (
    <section className="section">
      <div className="container" style={{ maxWidth: 760 }}>
        <div className="mb-4">
          <button className="button is-light is-small mb-3" onClick={() => navigate('/support')}>
            &larr; All Tickets
          </button>
          <div className="is-flex is-justify-content-space-between is-align-items-start">
            <div>
              <h1 className="title mb-1">{ticket.title}</h1>
              <div className="tags">
                <TicketStatusBadge status={ticket.status} />
                <span className="tag is-light">{ticket.priority}</span>
                <span className="tag is-light">#{ticket.id}</span>
              </div>
            </div>
            {canClose && (
              <button
                className="button is-warning is-light is-small"
                onClick={handleClose}
                disabled={closing}
              >
                {closing ? 'Closing…' : 'Close Ticket'}
              </button>
            )}
          </div>
          <p className="has-text-grey is-size-7">
            Opened {new Date(ticket.created_at).toLocaleString()} · by {ticket.user}
          </p>
        </div>

        <div className="box mb-4">
          <p style={{ whiteSpace: 'pre-wrap' }}>{ticket.description}</p>
        </div>

        <AttachmentList ticketId={id} refreshKey={attachRefresh} />

        {ticket.status === 'open' && (
          <div className="mb-4">
            <AttachmentUploader
              ticketId={id}
              onUploadComplete={() => setAttachRefresh(k => k + 1)}
            />
          </div>
        )}

        {error && <div className="notification is-danger is-light mb-4">{error}</div>}

        {(ticket.messages ?? []).length > 0 && (
          <div className="mb-5">
            <h2 className="subtitle is-6 mb-2">Messages</h2>
            {ticket.messages.map(msg => (
              <div
                key={msg.id}
                className={`box mb-3 ${msg.is_staff_reply ? 'has-background-info-light' : ''}`}
              >
                <div className="is-flex is-justify-content-space-between mb-1">
                  <strong className="is-size-7">{msg.author}</strong>
                  {msg.is_staff_reply && (
                    <span className="tag is-info is-light is-small">Staff</span>
                  )}
                  <span className="has-text-grey is-size-7">
                    {new Date(msg.created_at).toLocaleString()}
                  </span>
                </div>
                <p style={{ whiteSpace: 'pre-wrap' }}>{msg.body}</p>
              </div>
            ))}
          </div>
        )}

        {ticket.status !== 'closed' && (
          <form onSubmit={handleReply}>
            <h2 className="subtitle is-6 mb-2">Reply</h2>
            <div className="field">
              <div className="control">
                <textarea
                  className="textarea"
                  rows={4}
                  value={reply}
                  onChange={e => setReply(e.target.value)}
                  placeholder="Write a reply…"
                  required
                />
              </div>
            </div>
            <div className="control">
              <button className="button is-primary" type="submit" disabled={sending}>
                {sending ? 'Sending…' : 'Send Reply'}
              </button>
            </div>
            {lastMessageId && (
              <AttachmentUploader
                ticketId={id}
                messageId={lastMessageId}
                onUploadComplete={() => {
                  setLastMessageId(null)
                  setAttachRefresh(k => k + 1)
                }}
              />
            )}
          </form>
        )}
      </div>
    </section>
  )
}
