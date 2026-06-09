/**
 * VerifyEmail.jsx
 *
 * Handles email address verification via a token delivered in a link.
 * The token is extracted from the URL parameter and posted to the backend
 * immediately on mount. On success the user is logged in and redirected
 * to the dashboard. On failure a resend form is shown.
 *
 * URL parameter
 * ─────────────
 * :token — the verification token from the emailed link.
 *          Validated for presence before the API call is made;
 *          an absent token renders the error state immediately.
 *
 * States
 * ──────
 * 'verifying' — API call in flight (shown on mount)
 * 'success'   — token accepted; auto-redirecting to dashboard
 * 'error'     — token rejected, expired, or network failure; resend form shown
 *
 * Dependencies
 * ────────────
 * - ../modules/auth/context/AuthContext   login()
 * - ../utils/api             apiFetch
 * - ../utils/sentry          captureError, captureWarning, addBreadcrumb
 * - react-router-dom         useParams, useNavigate, Link
 *
 * Hardening considerations
 * ────────────────────────
 * - Token presence is checked before the API call; missing token renders
 *   the error state without an unnecessary network round-trip.
 * - login() argument order is validated against AuthContext signature:
 *   login(accessToken, refreshToken, username).
 * - The redirect setTimeout is stored and cleared on unmount to prevent
 *   navigate() firing on an unmounted component.
 * - All API calls use apiFetch for consistent error handling.
 * - ResendForm handles network failures and checks res.ok before telling
 *   the user their email was sent.
 * - Server errors (5xx) during verification are captured to Sentry;
 *   token rejection errors (expected user-facing events) are console-only.
 *
 * Testing considerations
 * ──────────────────────
 * - Visit with a valid token and confirm login() is called with correct
 *   argument order and the dashboard redirect fires after 2.5s.
 * - Visit with an expired token and confirm the error state and resend form.
 * - Visit /verify-email/ with no token segment and confirm error state
 *   renders without making an API call.
 * - Simulate a 500 from the verify endpoint and confirm Sentry capture.
 * - Submit the resend form with a network failure and confirm an error
 *   message is shown (not "check your inbox").
 * - Navigate away during the 2.5s redirect window and confirm no console
 *   warning about state updates on unmounted components.
 */

import { useState, useEffect, useRef } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useAuth }   from '../context/AuthContext'
import { captureError, captureWarning, addBreadcrumb } from '@core/frontend/utils/logger'
import { authApi }  from '../auth_api'
import AuthCard      from '../components/AuthCard'
import FormField     from '../components/FormField'
import SiteLogo      from '@core/frontend/components/SiteLogo'

export default function VerifyEmail() {
  const { token }  = useParams()
  const { login }  = useAuth()
  const navigate   = useNavigate()

  // 'verifying' | 'success' | 'error'
  const [status, setStatus]   = useState('verifying')
  const [message, setMessage] = useState('')
  const redirectTimer         = useRef(null)

  useEffect(() => {
    // Guard: token must be present in the URL before attempting verification.
    if (!token) {
      captureWarning('VerifyEmail rendered without a token parameter', { url: window.location.href })
      setMessage('The verification link is missing or malformed. Please request a new one.')
      setStatus('error')
      return
    }

    addBreadcrumb('Email verification attempt', { hasToken: true }, 'info')

    async function verify() {
      try {
        const res  = await authApi.verifyEmailToken(token)
        const data = await res.json()

        if (!res.ok) {
          if (res.status >= 500) {
            captureWarning('Email verification server error', { status: res.status })
          }
          // Token rejection (expired, already used, not found) is an expected
          // user-facing event — console only, not a Sentry error.
          setMessage(data?.error || 'Verification failed. The link may have expired.')
          setStatus('error')
          return
        }

        // Validate response shape before calling login().
        // AuthContext.login() signature: login(accessToken, refreshToken, username)
        if (!data.access) {
          captureWarning('Verify email response missing tokens', {
            hasAccess:  Boolean(data.access),
            hasRefresh: Boolean(data.refresh),
          })
          setMessage('Unexpected response from server. Please try again or contact support.')
          setStatus('error')
          return
        }

        const username = data.username || data.user?.username || data.user?.email
        login(data.access, data.refresh, username)
        setStatus('success')

        // Schedule redirect; store timer so it can be cancelled if the
        // component unmounts before it fires.
        redirectTimer.current = setTimeout(() => navigate('/dashboard'), 2500)

      } catch (err) {
        captureError(err, { operation: 'verify_email' }, 'auth')
        setMessage('Could not reach the server. Check your connection and try again.')
        setStatus('error')
      }
    }

    verify()

    return () => {
      if (redirectTimer.current) clearTimeout(redirectTimer.current)
    }
  }, [token, login, navigate])

  return (
    <section className="section auth-page auth-page--centered">
      <div className="container">
        <div className="columns is-centered">
          <div className="column is-5-tablet is-4-desktop has-text-centered">

            <SiteLogo style={{ display: 'inline-block', marginBottom: '2rem' }} />

            {status === 'verifying' && (
              <AuthCard centered className="auth-card--status">
                <i className="fa-solid fa-spinner fa-spin" style={{ fontSize: '2rem', color: 'var(--gold)', marginBottom: '1.5rem', display: 'block' }} />
                <h2 className="title is-5 mb-2">Verifying your email…</h2>
                <p className="has-text-muted">Just a moment.</p>
              </AuthCard>
            )}

            {status === 'success' && (
              <AuthCard centered className="auth-card--status auth-card--success">
                <div className="auth-icon-circle auth-icon-circle--success">
                  <i className="fa-solid fa-check auth-icon--success" />
                </div>
                <h2 className="title is-4 mb-3">Email verified!</h2>
                <p className="has-text-muted mb-2">Your account is now active.</p>
                <p className="has-text-muted" style={{ fontSize: '0.85rem' }}>Redirecting you to your dashboard…</p>
              </AuthCard>
            )}

            {status === 'error' && (
              <AuthCard centered className="auth-card--status auth-card--error">
                <div className="auth-icon-circle auth-icon-circle--error">
                  <i className="fa-solid fa-xmark auth-icon--error" />
                </div>
                <h2 className="title is-4 mb-3">Verification failed</h2>
                <p className="has-text-muted mb-5">{message}</p>
                <ResendForm />
              </AuthCard>
            )}

          </div>
        </div>
      </div>
    </section>
  )
}

// ─── Resend form ──────────────────────────────────────────────────────────────

/**
 * ResendForm
 *
 * Shown inside the error state. Lets the user request a new verification
 * email by entering their address. Checks res.ok before confirming success
 * so network or server failures are surfaced rather than silently ignored.
 */
function ResendForm() {
  const [email, setEmail]     = useState('')
  const [sent, setSent]       = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState(null)

  const handleResend = async e => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const res = await authApi.resendVerification(email)
      if (!res.ok) {
        if (res.status >= 500) {
          captureWarning('Resend verification server error', { status: res.status })
        }
        setError('Could not send a new link. Please try again shortly.')
        return
      }
      setSent(true)
    } catch (err) {
      captureError(err, { operation: 'resend_verification' }, 'auth')
      setError('Could not reach the server. Check your connection.')
    } finally {
      setLoading(false)
    }
  }

  if (sent) {
    return (
      <p style={{ color: '#4cd68a', fontSize: '0.9rem' }}>
        <i className="fa-solid fa-check mr-2" />
        Check your inbox for a new verification link.
      </p>
    )
  }

  return (
    <form onSubmit={handleResend}>
      <p className="has-text-muted mb-3" style={{ fontSize: '0.9rem' }}>
        Need a new link? Enter your email below.
      </p>
      {error && (
        <div className="notification is-danger is-light mb-3" style={{ fontSize: '0.88rem' }}>
          <i className="fa-solid fa-circle-exclamation mr-2" />{error}
        </div>
      )}
      <FormField
        icon="fa-solid fa-envelope"
        type="email" placeholder="your@email.com"
        value={email} onChange={e => setEmail(e.target.value)}
        required autoComplete="email"
      />
      <button
        type="submit"
        className={`button is-primary is-fullwidth ${loading ? 'is-loading' : ''}`}
        disabled={loading}
      >
        Resend verification email
      </button>
    </form>
  )
}