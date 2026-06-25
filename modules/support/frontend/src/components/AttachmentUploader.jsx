import { useRef, useState } from 'react'
import { supportApi } from '../api'

export default function AttachmentUploader({ ticketId, messageId = null, onUploadComplete }) {
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState(null)
  const inputRef = useRef(null)

  const handleFile = async (file) => {
    setError(null)
    setUploading(true)
    setProgress(0)
    try {
      const presignRes = await supportApi.presignFile(file.name, file.type || 'application/octet-stream', file.size)
      if (!presignRes.ok) throw new Error('Failed to get upload URL.')
      const { file_id, upload_url } = await presignRes.json()

      await uploadToS3(upload_url, file, file.type || 'application/octet-stream', setProgress)

      const confirmRes = await supportApi.confirmFile(file_id)
      if (!confirmRes.ok) throw new Error('Failed to confirm upload.')

      const attachRes = await supportApi.addAttachment(ticketId, file_id, file.name, messageId)
      if (!attachRes.ok) throw new Error('Failed to attach file.')

      onUploadComplete?.()
    } catch (err) {
      setError(err.message)
    } finally {
      setUploading(false)
    }
  }

  const onChange = (e) => {
    const file = e.target.files[0]
    if (file) handleFile(file)
    e.target.value = ''
  }

  return (
    <div className="mt-2">
      <input ref={inputRef} type="file" style={{ display: 'none' }} onChange={onChange} />
      <button
        type="button"
        className="button is-light is-small"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
      >
        {uploading ? `Uploading ${progress}%…` : 'Attach file'}
      </button>
      {uploading && (
        <progress
          className="progress is-primary is-small mt-2"
          value={progress}
          max="100"
          style={{ maxWidth: 200 }}
        >
          {progress}%
        </progress>
      )}
      {error && <p className="help is-danger mt-1">{error}</p>}
    </div>
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
