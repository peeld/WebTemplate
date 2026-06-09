import { useEffect, useState } from 'react';
import LoadingSpinner from '@core/frontend/components/LoadingSpinner.jsx';
import Notification from '@core/frontend/components/Notification.jsx';
import { get } from '../api.js';

/** Fetches /api/helloworld/ and displays the greeting. End-to-end smoke test. */
export default function HelloWorldPage() {
  const [message, setMessage] = useState(null);
  const [error, setError]     = useState(null);

  useEffect(() => {
    get('helloworld/')
      .then(data => setMessage(data.message))
      .catch(err  => setError(err.message));
  }, []);

  return (
    <section className="section">
      <div className="container">
        <h1 className="title">Hello World</h1>
        {error   && <Notification color="danger">{error}</Notification>}
        {message && <p className="subtitle">{message}</p>}
        {!message && !error && <LoadingSpinner />}
      </div>
    </section>
  );
}
