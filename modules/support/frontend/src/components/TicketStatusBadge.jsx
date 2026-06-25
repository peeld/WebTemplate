const STATUS_COLORS = {
  open: 'is-info',
  in_progress: 'is-warning',
  resolved: 'is-success',
  closed: 'is-light',
}

export default function TicketStatusBadge({ status }) {
  return (
    <span className={`tag ${STATUS_COLORS[status] ?? 'is-light'}`}>
      {status.replace('_', ' ')}
    </span>
  )
}
