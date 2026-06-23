import { useEffect, useState } from 'react';

import { Link } from 'react-router-dom';

import { getFiles } from '../api.js';
import FileStatusBadge from '../components/FileStatusBadge.jsx';

function formatBytes(bytes) {
  if (bytes == null) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function FilesPage() {
  const [files,   setFiles]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  useEffect(() => {
    getFiles()
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load files');
        return res.json();
      })
      .then(setFiles)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <section className="section">
      <div className="container">
        <div className="level">
          <div className="level-left">
            <h1 className="title level-item">My Files</h1>
          </div>
          <div className="level-right">
            <Link to="/files/upload" className="button is-primary level-item">
              Upload File
            </Link>
          </div>
        </div>

        {loading && <progress className="progress is-small is-primary" max="100" />}

        {error && <div className="notification is-danger">{error}</div>}

        {!loading && !error && files.length === 0 && (
          <div className="notification is-light">
            No files uploaded yet.{' '}
            <Link to="/files/upload">Upload your first file.</Link>
          </div>
        )}

        {files.length > 0 && (
          <div className="table-container">
            <table className="table is-fullwidth is-striped is-hoverable">
              <thead>
                <tr>
                  <th>Filename</th>
                  <th>Type</th>
                  <th>Size</th>
                  <th>Status</th>
                  <th>Uploaded</th>
                </tr>
              </thead>
              <tbody>
                {files.map((f) => (
                  <tr key={f.id}>
                    <td>{f.original_filename}</td>
                    <td><code>{f.content_type}</code></td>
                    <td>{formatBytes(f.size)}</td>
                    <td><FileStatusBadge status={f.status} /></td>
                    <td>{new Date(f.created_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
