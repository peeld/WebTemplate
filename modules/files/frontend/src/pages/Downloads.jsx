import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getReleases, getDownloadUrl } from '../api.js';

function formatBytes(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export default function Downloads() {
  const [releases, setReleases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    getReleases()
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) setReleases(data.filter(r => r.is_latest));
        else setError('Failed to load releases.');
      })
      .catch(() => setError('Network error loading releases.'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <section className="section">
      <div className="container">
        <div className="mb-6">
          <h1 className="title mb-3">Downloads</h1>
          <p className="subtitle has-text-grey">Download the latest software releases.</p>
        </div>

        {error && <div className="notification is-danger is-light mb-5">{error}</div>}
        {loading && <p className="has-text-grey has-text-centered">Loading…</p>}

        {!loading && !error && releases.length === 0 && (
          <p className="has-text-grey has-text-centered">No releases available.</p>
        )}

        {!loading && releases.length > 0 && (
          <div className="columns is-multiline">
            {releases.map(release => (
              <div key={release.id} className="column is-half-tablet is-one-third-desktop">
                <div className="box">
                  <p className="heading has-text-grey mb-1">Product #{release.product_id}</p>
                  <h2 className="title is-5 mb-1">Version {release.version}</h2>
                  <p className="has-text-grey-dark is-size-7 mb-4">{release.release_date}</p>
                  {release.assets.length === 0 && (
                    <p className="has-text-grey is-size-7">No files available.</p>
                  )}
                  {release.assets.length === 1 && (
                    <a
                      className="button is-primary is-fullwidth"
                      href={getDownloadUrl(release.id, release.assets[0].id)}
                    >
                      Download{release.assets[0].file_size_bytes
                        ? ` (${formatBytes(release.assets[0].file_size_bytes)})`
                        : ''}
                    </a>
                  )}
                  {release.assets.length > 1 && (
                    <Link
                      to={`/downloads/releases/${release.id}/`}
                      className="button is-primary is-fullwidth"
                    >
                      Download ({release.assets.length} files)
                    </Link>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
