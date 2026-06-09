/**
 * ForgotPassword.jsx
 *
 * Initiates the password reset flow by accepting an email address and
 * requesting a reset link from the backend.
 *
 * The success state is shown regardless of whether an account exists for
 * the submitted email. This is intentional — confirming or denying account
 * existence for a given email is an account enumeration vulnerability.
 * The backend must also follow this convention.
 *
 * States
 * ──────
 * Form visible   — initial state, user has not submitted
 * Sent (success) — POST succeeded with a 2xx; reset link instructions shown
 * Error visible  — network failure or server error; error message shown,
 *                  form remains usable
 *
 * Dependencies
 * ────────────
 * - ../utils/api      apiFetch
 * - ../utils/sentry   captureWarning, addBreadcrumb
 * - react-router-dom  Link
 *
 * Hardening considerations
 * ────────────────────────
 * - res.ok is checked before showing the sent confirmation; a 5xx does not
 *   silently tell the user their email was sent.
 * - 5xx responses are captured to Sentry — they may indicate a broken email
 *   delivery service.
 * - 429 (rate limit) surfaces a specific user-facing message.
 * - Network errors produce a user-appropriate message with no internal
 *   implementation details.
 * - apiFetch is used for consistent base URL validation and breadcrumbing.
 *
 * Testing considerations
 * ──────────────────────
 * - Submit a valid email and confirm the sent state is shown.
 * - Submit an email for a non-existent account and confirm the same sent
 *   state is shown (no account enumeration).
 * - Simulate a 500 from the endpoint and confirm an error message is shown,
 *   the sent state is NOT shown, and a Sentry warning is captured.
 * - Simulate a 429 and confirm the rate-limit message is shown.
 * - Simulate a network failure and confirm an appropriate error message.
 */

import { useState }  from 'react'
import { Link }      from 'react-router-dom'
import { captureWarning, addBreadcrumb } from '@core/frontend/utils/logger'
import { authApi }  from '../auth_api'
import FormField     from '../components/FormField'
import AuthCard      from '../components/AuthCard'
import SiteLogo                  from '@core/frontend/components/SiteLogo'


export default function ForgotPassword() {
  const [email, setEmail]     = useState('')
  const [sent, setSent]       = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState(null)

  const handleSubmit = async e => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    addBreadcrumb('Forgot password request', {}, 'info')

    try {
      const res = await authApi.forgotPassword(email)

      if (res.status === 429) {
        setError('Too many requests — please wait a moment before trying again.')
        return
      }

      if (!res.ok) {
        // 5xx indicates a backend problem (e.g. email service down).
        captureWarning('Forgot password server error', { status: res.status })
        setError('A server error occurred. Please try again shortly.')
        return
      }

      // Do not distinguish between "email found" and "email not found" in the
      // success message — doing so would allow account enumeration.
      setSent(true)

    } catch (err) {
      captureWarning('Forgot password network failure', { error: err.message })
      setError('Could not reach the server. Check your connection.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="section auth-page">
      <div className="container">
        <div className="columns is-centered">
          <div className="column is-5-tablet is-4-desktop">

            <div className="has-text-centered mb-6">
              <SiteLogo />
              <h1 className="title is-4 mt-4">Forgot your password?</h1>
              <p className="has-text-muted">We'll send you a link to reset it.</p>
            </div>

            <AuthCard>
              {sent ? (
                <div className="has-text-centered py-5">
                  <i className="fa-solid fa-envelope auth-status-icon" />
                  <h2 className="title is-5 mb-3">Check your inbox</h2>
                  <p className="has-text-muted" style={{ fontSize: '0.95rem', lineHeight: 1.7 }}>
                    If an account exists for{' '}
                    <strong className="has-text-light">{email}</strong>{' '}
                    we've sent a password reset link. Check your spam folder if you don't see it.
                  </p>
                </div>
              ) : (
                <form onSubmit={handleSubmit}>
                  {error && (
                    <div className="notification is-danger is-light mb-4">
                      <i className="fa-solid fa-circle-exclamation mr-2" />{error}
                    </div>
                  )}
                  <FormField
                    label="Email address" icon="fa-solid fa-envelope"
                    type="email" placeholder="your@email.com"
                    value={email} onChange={e => setEmail(e.target.value)}
                    required autoComplete="email" disabled={loading}
                  />
                  <div className="field mt-5">
                    <button
                      type="submit"
                      className={`button is-primary is-fullwidth ${loading ? 'is-loading' : ''}`}
                      disabled={loading}
                    >
                      Send reset link
                    </button>
                  </div>
                </form>
              )}
            </AuthCard>

            <p className="has-text-centered has-text-muted mt-4">
              <Link to="/login" className="auth-link">
                <i className="fa-solid fa-arrow-left mr-1" />Back to login
              </Link>
            </p>

          </div>
        </div>
      </div>
    </section>
  )
}