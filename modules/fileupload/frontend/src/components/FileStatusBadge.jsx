const TAG_CLASS = {
  pending:    'is-warning is-light',
  processing: 'is-info    is-light',
  complete:   'is-success is-light',
  failed:     'is-danger  is-light',
};

export default function FileStatusBadge({ status }) {
  return (
    <span className={`tag ${TAG_CLASS[status] ?? 'is-light'}`}>{status}</span>
  );
}
