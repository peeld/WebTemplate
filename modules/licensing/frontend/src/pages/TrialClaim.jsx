import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { requestTrialFromPayload } from '../api.js';

// Public, no-login relay page for the offline trial flow: the C++ client's
// build_offline_trial_payload() produces a URL to this page carrying a
// signed request (product, email, mid, ts, nonce, sig) that it built while
// offline. Opening this page on any connected device submits that request
// to the same backend endpoint the app calls directly when it has network.
export default function TrialClaim() {
  const [searchParams] = useSearchParams();

  // 'submitting' | 'success' | 'error'
  const [status, setStatus]   = useState('submitting');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const payload = {
      product: searchParams.get('product'),
      email:   searchParams.get('email'),
      mid:     searchParams.get('mid'),
      ts:      searchParams.get('ts'),
      nonce:   searchParams.get('nonce'),
      sig:     searchParams.get('sig'),
    };

    if (Object.values(payload).some(v => !v)) {
      setMessage('This trial link is missing information. Please generate a new one from the app.');
      setStatus('error');
      return;
    }

    async function submit() {
      try {
        const res  = await requestTrialFromPayload(payload);
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setMessage(data.error || 'Could not start the trial. The link may have expired or already been used.');
          setStatus('error');
          return;
        }
        setStatus('success');
      } catch {
        setMessage('Could not reach the server. Check your connection and try again.');
        setStatus('error');
      }
    }

    submit();
  }, [searchParams]);

  return (
    <section className="section">
      <div className="container" style={{ maxWidth: 480 }}>
        <div className="box has-text-centered">
          {status === 'submitting' && (
            <>
              <h1 className="title is-5 mb-2">Starting your trial…</h1>
              <p className="has-text-grey">Just a moment.</p>
            </>
          )}

          {status === 'success' && (
            <>
              <h1 className="title is-5 mb-2">Trial requested</h1>
              <p className="has-text-grey">
                Check the email address you entered in the app for an install token —
                enter it there to activate your 30-day trial.
              </p>
            </>
          )}

          {status === 'error' && (
            <>
              <h1 className="title is-5 mb-2">Couldn't start trial</h1>
              <p className="has-text-grey">{message}</p>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
