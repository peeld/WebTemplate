import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getRelease, getDownloadUrl } from '../api.js';
import ReleaseNotes from '../components/ReleaseNotes.jsx';

function formatBytes(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export default function ReleaseDetail() {
  const { id } = useParams();
  const [release, setRelease] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    getRelease(id)
      .then(r => r.json())
      .then(data => {
        if (data.id) setRelease(data);
        else setError(data.detail || 'Release not found.');
      })
      .catch(() => setError('Network error loading release.'))
      .finally(() => setLoading(false));
  }, [id]);

  return (
    <section className="section">
      <div className="container" style={{ maxWidth: 720 }}>
        <Link to="/downloads/" className="has-text-grey is-size-7 mb-5 is-inline-block">
          ← Back to Downloads
        </Link>

        {error && <div className="notification is-danger is-light mt-4">{error}</div>}
        {loading && <p className="has-text-grey has-text-centered mt-6">Loading…</p>}

        {release && (
          <>
            <h1 className="title mt-4 mb-1">Version {release.version}</h1>
            <p className="has-text-grey mb-5">{release.release_date}</p>

            {release.notes && (
              <div className="mb-6">
                <h2 className="subtitle is-6 has-text-grey-dark mb-3">Release Notes</h2>
                <ReleaseNotes notes={release.notes} />
              </div>
            )}

            <h2 className="subtitle is-6 has-text-grey-dark mb-3">Files</h2>
            {release.assets.length === 0 ? (
              <p className="has-text-grey">No files available for this release.</p>
            ) : (
              <div className="table-container">
                <table className="table is-fullwidth">
                  <thead>
                    <tr>
                      <th>Label</th>
                      <th>Platform</th>
                      <th>Size</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {release.assets.map(asset => (
                      <tr key={asset.id}>
                        <td>{asset.label}</td>
                        <td><span className="tag">{asset.platform}</span></td>
                        <td className="has-text-grey">{formatBytes(asset.file_size_bytes) || '—'}</td>
                        <td>
                          <a
                            className="button is-small is-primary"
                            href={getDownloadUrl(release.id, asset.id)}
                          >
                            Download
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
