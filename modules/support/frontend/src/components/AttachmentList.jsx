import { useEffect, useState } from 'react'
import { supportApi } from '../api'

export default function AttachmentList({ ticketId, refreshKey }) {
  const [attachments, setAttachments] = useState([])
  const [urls, setUrls] = useState({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    supportApi.getAttachments(ticketId)
      .then(res => res.ok ? res.json() : [])
      .then(async (items) => {
        setAttachments(items)
        const urlMap = {}
        await Promise.all(
          items.map(async (a) => {
            try {
              const res = await supportApi.getFileUrl(a.file_id)
              if (res.ok) {
                const data = await res.json()
                urlMap[a.file_id] = data.source_url
              }
            } catch {}
          })
        )
        setUrls(urlMap)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [ticketId, refreshKey])

  if (loading || attachments.length === 0) return null

  return (
    <div className="mb-4">
      <p className="is-size-7 has-text-grey mb-1">Attachments</p>
      <div className="tags">
        {attachments.map(a => (
          <span key={a.id} className="tag is-light">
            {urls[a.file_id] ? (
              <a href={urls[a.file_id]} target="_blank" rel="noreferrer">
                {a.original_filename}
              </a>
            ) : (
              a.original_filename
            )}
          </span>
        ))}
      </div>
    </div>
  )
}
