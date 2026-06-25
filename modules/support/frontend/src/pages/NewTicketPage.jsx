import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supportApi } from '../api'

export default function NewTicketPage() {
  const navigate = useNavigate()
  const fileInputRef = useRef(null)
  const [form, setForm] = useState({ title: '', description: '', priority: 'medium' })
  const [pendingFile, setPendingFile] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitLabel, setSubmitLabel] = useState('Submit Ticket')
  const [uploadProgress, setUploadProgress] = useState(0)
  const [error, setError] = useState(null)

  const handleChange = e => setForm(f => ({ ...f, [e.target.name]: e.target.value }))

  const handleFileChange = e => {
    setPendingFile(e.target.files[0] ?? null)
    e.target.value = ''
  }

  const handleSubmit = async e => {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      setSubmitLabel('Creating ticket…')
      const res = await supportApi.createTicket(form)
      if (!res.ok) throw new Error('Failed to create ticket.')
      const ticket = await res.json()

      if (pendingFile) {
        setSubmitLabel('Uploading file…')
        setUploadProgress(0)

        const presignRes = await supportApi.presignFile(
          pendingFile.name,
          pendingFile.type || 'application/octet-stream',
          pendingFile.size,
        )
        if (!presignRes.ok) throw new Error('Failed to get upload URL.')
        const { file_id, upload_url } = await presignRes.json()

        await uploadToS3(upload_url, pendingFile, pendingFile.type || 'application/octet-stream', setUploadProgress)

        const confirmRes = await supportApi.confirmFile(file_id)
        if (!confirmRes.ok) throw new Error('Failed to confirm upload.')

        const attachRes = await supportApi.addAttachment(ticket.id, file_id, pendingFile.name)
        if (!attachRes.ok) throw new Error('Failed to attach file.')
      }

      navigate(`/support/tickets/${ticket.id}`)
    } catch (err) {
      setError(err.message)
      setSubmitLabel('Submit Ticket')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section className="section">
      <div className="container" style={{ maxWidth: 640 }}>
        <h1 className="title">Open a Support Ticket</h1>

        {error && <div className="notification is-danger is-light">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="field">
            <label className="label">Title</label>
            <div className="control">
              <input
                className="input"
                type="text"
                name="title"
                value={form.title}
                onChange={handleChange}
                required
                maxLength={200}
                placeholder="Brief summary of your issue"
              />
            </div>
          </div>

          <div className="field">
            <label className="label">Priority</label>
            <div className="control">
              <div className="select">
                <select name="priority" value={form.priority} onChange={handleChange}>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>
            </div>
          </div>

          <div className="field">
            <label className="label">Description</label>
            <div className="control">
              <textarea
                className="textarea"
                name="description"
                value={form.description}
                onChange={handleChange}
                required
                rows={6}
                placeholder="Describe your issue in detail"
              />
            </div>
          </div>

          <div className="field">
            <label className="label">Attachment <span className="has-text-grey has-text-weight-normal">(optional)</span></label>
            <div className="control">
              <input ref={fileInputRef} type="file" style={{ display: 'none' }} onChange={handleFileChange} />
              <div className="is-flex is-align-items-center" style={{ gap: '0.75rem' }}>
                <button
                  type="button"
                  className="button is-light is-small"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={submitting}
                >
                  {pendingFile ? 'Change file' : 'Choose file'}
                </button>
                {pendingFile ? (
                  <span className="is-size-7">
                    {pendingFile.name}
                    <button
                      type="button"
                      className="delete is-small ml-2"
                      onClick={() => setPendingFile(null)}
                      aria-label="Remove file"
                    />
                  </span>
                ) : (
                  <span className="is-size-7 has-text-grey">No file selected</span>
                )}
              </div>
              {submitting && pendingFile && (
                <progress
                  className="progress is-primary is-small mt-2"
                  value={uploadProgress}
                  max="100"
                  style={{ maxWidth: 240 }}
                >
                  {uploadProgress}%
                </progress>
              )}
            </div>
          </div>

          <div className="field is-grouped">
            <div className="control">
              <button className="button is-primary" type="submit" disabled={submitting}>
                {submitting ? submitLabel : 'Submit Ticket'}
              </button>
            </div>
            <div className="control">
              <button className="button is-light" type="button" onClick={() => navigate('/support')}>
                Cancel
              </button>
            </div>
          </div>
        </form>
      </div>
    </section>
  )
}

function uploadToS3(url, file, contentType, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100))
    })
    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(100)
        resolve()
      } else {
        reject(new Error(`S3 upload failed (HTTP ${xhr.status})`))
      }
    })
    xhr.addEventListener('error', () => reject(new Error('Upload network error')))
    xhr.open('PUT', url)
    xhr.setRequestHeader('Content-Type', contentType)
    xhr.send(file)
  })
}
