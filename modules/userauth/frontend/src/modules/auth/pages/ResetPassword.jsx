/**
 * ResetPassword.jsx
 *
 * Completes the password reset flow. The reset token is extracted from the
 * URL and submitted with the new password. On success the user is redirected
 * to login after a brief confirmation delay.
 *
 * URL parameter
 * ─────────────
 * :token — the password reset token from the emailed link.
 *          Validated for presence on mount; missing token shows an error
 *          without making an API call.
 *
 * States
 * ──────
 * Form visible — initial state, awaiting password input
 * Success      — password updated; auto-redirecting to /login after 3s
 * Error        — validation failure, expired token, or network error;
 *                error message shown, form remains usable
 *
 * Dependencies
 * ────────────
 * - ../utils/api      apiFetch
 * - ../utils/sentry   captureError, captureWarning, addBreadcrumb
 * - react-router-dom  useParams, useNavigate, Link
 *
 * Hardening considerations
 * ────────────────────────
 * - Token presence is checked on mount; an absent token renders an error
 *   without a wasted API round-trip.
 * - Password match is validated client-side before the API call.
 * - minLength={8} is applied directly to the password input so the browser
 *   enforces the constraint before the form submits.
 * - The redirect setTimeout is stored in a ref and cleared on unmount to
 *   prevent navigate() firing on an unmounted component.
 * - 5xx responses are captured to Sentry; token expiry/invalid errors are
 *   expected user-facing events logged to console only.
 * - apiFetch is used for consistent base URL validation and breadcrumbing.
 *
 * Testing considerations
 * ──────────────────────
 * - Submit with a valid token and matching passwords; confirm success state
 *   and redirect to /login after 3 seconds.
 * - Submit with mismatched passwords and confirm the client-side error,
 *   no API call made.
 * - Submit a password shorter than 8 characters and confirm browser
 *   validation prevents submission.
 * - Visit /reset-password/ with no token segment and confirm error state
 *   without an API call.
 * - Simulate an expired/invalid token response (400) and confirm the
 *   error message is shown and no Sentry event is captured.
 * - Simulate a 500 and confirm Sentry captures a warning.
 * - Navigate away during the 3s redirect window; confirm no unmounted
 *   component warning in the console.
 */

import { useState, useEffect, useRef } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { captureError, captureWarning, addBreadcrumb } from '@core/frontend/utils/logger'
import { authApi }  from '../auth_api'
import FormField     from '../components/FormField'
import AuthCard      from '../components/AuthCard'
import SiteLogo      from '@core/frontend/components/SiteLogo'

export default function ResetPassword() {
  const { token }   = useParams()
  const navigate    = useNavigate()
  const redirectTimer = useRef(null)

  const [form, setForm]       = useState({ password: '', confirm: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState(null)
  const [success, setSuccess] = useState(false)

  // Validate token presence on mount — no API call needed if it's missing.
  useEffect(() => {
    if (!token) {
      captureWarning('ResetPassword rendered without a token parameter', { url: window.location.href })
      setError('The reset link is missing or malformed. Please request a new one from the forgot password page.')
    }
    return () => {
      if (redirectTimer.current) clearTimeout(redirectTimer.current)
    }
  }, [token])

  const handleChange = e => setForm(prev => ({ ...prev, [e.target.name]: e.target.value }))

  const handleSubmit = async e => {
    e.preventDefault()

    if (form.password !== form.confirm) {
      setError('Passwords do not match.')
      return
    }

    setLoading(true)
    setError(null)
    addBreadcrumb('Password reset submission', {}, 'info')

    try {
      const res  = await authApi.resetPassword(token, form.password)
      const data = await res.json()

      if (!res.ok) {
        if (res.status >= 500) {
          captureWarning('Reset password server error', { status: res.status })
          setError('A server error occurred. Please try again shortly.')
        } else {
          // 400 typically means the token is invalid or expired — expected
          // user-facing event, not a Sentry error.
          setError(data?.error || 'This reset link is invalid or has expired. Please request a new one.')
        }
        return
      }

      setSuccess(true)
      redirectTimer.current = setTimeout(() => navigate('/login'), 3000)

    } catch (err) {
      captureError(err, { operation: 'reset_password' }, 'auth')
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
              <h1 className="title is-4 mt-4">Set a new password</h1>
              <p className="has-text-muted">Choose something strong.</p>
            </div>

            <AuthCard>
              {success ? (
                <div className="has-text-centered" style={{ padding: '1.5rem 0' }}>
                  <div className="auth-icon-circle auth-icon-circle--success">
                    <i className="fa-solid fa-check auth-icon--success" />
                  </div>
                  <h2 className="title is-5 mb-3">Password updated!</h2>
                  <p className="has-text-muted">Redirecting you to login…</p>
                </div>
              ) : (
                <form onSubmit={handleSubmit}>
                  {error && (
                    <div className="notification is-danger is-light mb-4">
                      <i className="fa-solid fa-circle-exclamation mr-2" />{error}
                    </div>
                  )}

                  <FormField
                    label="New password" icon="fa-solid fa-lock"
                    type="password" name="password" placeholder="Minimum 8 characters"
                    value={form.password} onChange={handleChange}
                    required minLength={8} autoComplete="new-password" disabled={loading}
                  />

                  <FormField
                    label="Confirm password" icon="fa-solid fa-lock"
                    type="password" name="confirm" placeholder="Repeat your new password"
                    value={form.confirm} onChange={handleChange}
                    required minLength={8} autoComplete="new-password" disabled={loading}
                  />

                  <div className="field mt-5">
                    <button
                      type="submit"
                      className={`button is-primary is-fullwidth ${loading ? 'is-loading' : ''}`}
                      disabled={loading || !token}
                    >
                      Set new password
                    </button>
                  </div>
                </form>
              )}
            </AuthCard>

            {!success && (
              <p className="has-text-centered has-text-muted mt-4">
                <Link to="/forgot-password" className="auth-link">
                  <i className="fa-solid fa-arrow-left mr-1" />Request a new reset link
                </Link>
              </p>
            )}

          </div>
        </div>
      </div>
    </section>
  )
}
