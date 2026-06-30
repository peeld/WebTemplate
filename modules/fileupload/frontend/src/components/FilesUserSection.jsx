import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getFiles } from '../api.js';
import FileStatusBadge from './FileStatusBadge.jsx';

function formatBytes(bytes) {
  if (bytes == null) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function FilesUserSection() {
  const [files, setFiles]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  useEffect(() => {
    getFiles()
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load files');
        return res.json();
      })
      .then((data) => setFiles(data.slice(0, 5)))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="card" style={{ width: '100%' }}>
      <header className="card-header">
        <p className="card-header-title">Files</p>
      </header>

      <div className="card-content">
        {loading && <p className="has-text-grey">Loading…</p>}

        {error && <p className="has-text-danger">{error}</p>}

        {!loading && !error && files.length === 0 && (
          <p className="has-text-grey">No files uploaded yet.</p>
        )}

        {!loading && !error && files.length > 0 && (
          <table className="table is-fullwidth is-narrow">
            <tbody>
              {files.map((f) => (
                <tr key={f.id}>
                  <td className="is-vcentered">{f.original_filename}</td>
                  <td className="is-vcentered has-text-grey is-size-7">{formatBytes(f.size)}</td>
                  <td className="is-vcentered"><FileStatusBadge status={f.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <footer className="card-footer">
        <Link to="/files" className="card-footer-item">My Files</Link>
        <Link to="/files/upload" className="card-footer-item">Upload</Link>
      </footer>
    </div>
  );
}
