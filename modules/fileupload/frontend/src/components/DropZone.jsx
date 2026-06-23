import { useRef, useState } from 'react';

import { confirmUpload, getPresignedUrl } from '../api.js';

export default function DropZone({ onUploadComplete }) {
  const [dragging,  setDragging]  = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress,  setProgress]  = useState(0);
  const [error,     setError]     = useState(null);
  const inputRef = useRef(null);

  const handleFile = async (file) => {
    setError(null);
    setUploading(true);
    setProgress(0);

    try {
      const presignRes = await getPresignedUrl(file.name, file.type || 'application/octet-stream', file.size);
      if (!presignRes.ok) {
        const body = await presignRes.json();
        throw new Error(body.error || 'Failed to get upload URL');
      }
      const { file_id, upload_url } = await presignRes.json();

      await uploadToS3(upload_url, file, file.type || 'application/octet-stream', setProgress);

      const confirmRes = await confirmUpload(file_id);
      if (!confirmRes.ok) {
        const body = await confirmRes.json();
        throw new Error(body.error || 'Failed to confirm upload');
      }

      onUploadComplete?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const onInputChange = (e) => {
    const file = e.target.files[0];
    if (file) handleFile(file);
    e.target.value = '';
  };

  return (
    <div>
      <div
        className={`box has-text-centered${dragging ? ' has-background-light' : ''}`}
        style={{ border: '2px dashed #ccc', cursor: uploading ? 'default' : 'pointer', padding: '3rem' }}
        onClick={() => !uploading && inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <input ref={inputRef} type="file" style={{ display: 'none' }} onChange={onInputChange} />
        {uploading ? (
          <div>
            <p className="mb-3">Uploading{progress < 100 ? ` ${progress}%` : '…'}
            </p>
            <progress className="progress is-primary" value={progress} max="100">{progress}%</progress>
          </div>
        ) : (
          <p className="has-text-grey">
            {dragging ? 'Drop to upload' : 'Drag & drop a file here, or click to browse'}
          </p>
        )}
      </div>
      {error && <p className="help is-danger mt-2">{error}</p>}
    </div>
  );
}

function uploadToS3(url, file, contentType, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    });
    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(100);
        resolve();
      } else {
        reject(new Error(`S3 upload failed (HTTP ${xhr.status})`));
      }
    });
    xhr.addEventListener('error', () => reject(new Error('Upload network error')));
    xhr.open('PUT', url);
    xhr.setRequestHeader('Content-Type', contentType);
    xhr.send(file);
  });
}
