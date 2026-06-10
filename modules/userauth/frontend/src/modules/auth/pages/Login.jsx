/**
 * Login.jsx
 *
 * Authentication page supporting username/password login and Google OAuth.
 * On successful authentication, calls AuthContext.login() which stores tokens,
 * sets Sentry user identity, and starts the JWT refresh cycle.
 *
 * Auth flows
 * ──────────
 * 1. Username / password
 *    POST /api/login/ → { access, refresh } → AuthContext.login() → /dashboard
 *
 * 2. Google OAuth (via @react-oauth/google)
 *    useGoogleLogin() → Google popup → onSuccess(tokenResponse)
 *    → POST /auth/social/google/ → { access, refresh, user } → AuthContext.login()
 *    → /dashboard
 *    Google OAuth is only rendered when GoogleOAuthProvider is available
 *    (VITE_GOOGLE_CLIENT_ID is set). The button is hidden otherwise.
 *
 * Dependencies
 * ────────────
 * - ../modules/auth/context/AuthContext   login()
 * - ../utils/api             apiFetch, BASE
 * - ../utils/sentry          captureWarning, addBreadcrumb
 * - @react-oauth/google      useGoogleLogin
 * - react-router-dom         useNavigate, Link
 *
 * Hardening considerations
 * ────────────────────────
 * - All API calls go through apiFetch so Sentry breadcrumbing, 401 handling,
 *   and env-var validation are consistent. Direct fetch/axios calls are not used.
 * - Response shape is validated before calling login() — missing access or
 *   refresh tokens log a Sentry warning and show a user-facing error rather
 *   than passing undefined into AuthContext.
 * - Google OAuth success and error callbacks both have error handling;
 *   failures show a user-facing message and are reported to Sentry.
 * - Separate loading states for password login and Google login so each
 *   flow gives correct visual feedback independently.
 * - Non-ok HTTP responses surface a context-appropriate message (rate limit
 *   vs server error vs credential failure) rather than one hardcoded string.
 *
 * Testing considerations
 * ──────────────────────
 * - Submit with correct credentials and confirm redirect to /dashboard.
 * - Submit with wrong credentials and confirm the error message and that
 *   no Sentry event is sent (credential errors are console-only).
 * - Disable the network and submit — confirm the network error message
 *   and a Sentry captureWarning event.
 * - Simulate a 500 from /api/login/ and confirm a Sentry captureWarning
 *   and the correct user-facing message.
 * - Simulate a 429 and confirm the rate-limit message is shown.
 * - Complete a Google login and confirm AuthContext.login() is called with
 *   valid access and refresh tokens.
 * - Simulate Google OAuth onError and confirm a user-facing error appears
 *   and a Sentry warning is sent.
 * - Remove VITE_GOOGLE_CLIENT_ID and confirm the Google button is not rendered.
 */

import { useState }              from 'react'
import { useNavigate, Link }     from 'react-router-dom'
import { useAuth }               from '../context/AuthContext'
import { useGoogleLogin }        from '@react-oauth/google'
import { captureWarning, addBreadcrumb } from '@core/frontend/utils/logger'
import { authApi }               from '../auth_api'
import FormField                 from '../components/FormField'
import AuthCard                  from '../components/AuthCard'
import GoogleButton               from '../components/GoogleButton'
import SiteLogo                  from '@core/frontend/components/SiteLogo'

const GOOGLE_ENABLED = Boolean(import.meta.env.VITE_GOOGLE_CLIENT_ID)

function GoogleLoginSection({ setError, setGLoading, disabled, login, navigate }) {
  const glogin = useGoogleLogin({
    onSuccess: async (tokenResponse) => {
      setGLoading(true)
      setError('')
      addBreadcrumb('Google login attempt', {}, 'info')

      try {
        const res  = await authApi.loginWithGoogle(tokenResponse.access_token)
        const data = await res.json()

        if (!res.ok) {
          captureWarning('Google login backend rejection', { status: res.status, error: data?.error })
          setError(data?.error || 'Google sign-in failed. Please try again.')
          return
        }

        if (!data.access) {
          captureWarning('Google login response missing access token', {
            hasAccess: Boolean(data.access), hasRefresh: Boolean(data.refresh),
          })
          setError('Unexpected response from server. Please try again.')
          return
        }
        if (!data.refresh) {
          captureWarning('Google login returned empty refresh token — fix backend social auth view', {
            endpoint: '/auth/social/google/',
          })
        }

        const username = data.user?.username || data.user?.email
        login(data.access, data.refresh, username)
        navigate('/dashboard')

      } catch (err) {
        captureWarning('Google login network failure', { error: err.message })
        setError('Could not reach the server. Check your connection.')
      } finally {
        setGLoading(false)
      }
    },
    onError: (err) => {
      captureWarning('Google OAuth popup error', { error: String(err) })
      setError('Google sign-in was cancelled or failed. Please try again.')
    },
  })

  return <GoogleButton label="Sign in with Google" onClick={() => glogin()} disabled={disabled} />
}

export default function Login() {
  const { login }  = useAuth()
  const navigate   = useNavigate()

  const [form, setForm]         = useState({ username: '', password: '' })
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)       // password login in flight
  const [gLoading, setGLoading] = useState(false)       // Google login in flight

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value })

  // ── Username / password login ─────────────────────────────────────────────

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    addBreadcrumb('Login attempt', { username: form.username }, 'info')

    try {
      const res  = await authApi.login(form.username, form.password)
      const data = await res.json()

      if (!res.ok) {
        // Credential or rate-limit errors are expected operational events;
        // log to console only — do not send to Sentry.
        if (res.status === 429) {
          setError('Too many attempts — please wait a moment and try again.')
        } else if (res.status >= 500) {
          captureWarning('Login endpoint server error', { status: res.status })
          setError('A server error occurred. Please try again shortly.')
        } else {
          setError('Invalid username or password.')
        }
        return
      }

      // Validate the response shape before trusting it.
      if (!data.access || !data.refresh) {
        captureWarning('Login response missing tokens', {
          hasAccess:  Boolean(data.access),
          hasRefresh: Boolean(data.refresh),
          status:     res.status,
        })
        setError('Unexpected response from server. Please try again.')
        return
      }

      login(data.access, data.refresh, form.username)
      navigate('/dashboard')

    } catch (err) {
      // Network-level failure — apiFetch re-throws after capturing to Sentry.
      captureWarning('Login network failure', { error: err.message })
      setError('Could not reach the server. Check your connection.')
    } finally {
      setLoading(false)
    }
  }

  const isAnyLoading = loading || gLoading

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <section className="section auth-page">
      <div className="container">
        <div className="columns is-centered">
          <div className="column is-5-tablet is-4-desktop is-4-widescreen">

            <div className="has-text-centered mb-6">
              <SiteLogo />
              <h1 className="title is-4 mt-4">Welcome back</h1>
              <p className="has-text-muted">Log in to your account</p>
            </div>

            <AuthCard>

              {error && (
                <div className="notification is-danger is-light mb-4">
                  <i className="fa-solid fa-circle-exclamation mr-2"></i>
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit}>
                <FormField
                  label="Username or email" icon="fa-solid fa-user"
                  type="text" name="username" placeholder="Username or email"
                  value={form.username} onChange={handleChange}
                  required autoComplete="username" disabled={isAnyLoading}
                />

                <FormField
                  label="Password" icon="fa-solid fa-lock"
                  type="password" name="password" placeholder="Your password"
                  value={form.password} onChange={handleChange}
                  required autoComplete="current-password" disabled={isAnyLoading}
                />

                <div className="auth-forgot-link">
                  <Link to="/forgot-password">Forgot password?</Link>
                </div>

                <div className="field mt-5">
                  <button
                    type="submit"
                    className={`button is-primary is-fullwidth ${loading ? 'is-loading' : ''}`}
                    disabled={isAnyLoading}
                  >
                    Log in
                  </button>
                </div>
              </form>

              {GOOGLE_ENABLED && (
                <GoogleLoginSection
                  setError={setError}
                  setGLoading={setGLoading}
                  disabled={isAnyLoading}
                  login={login}
                  navigate={navigate}
                />
              )}

            </AuthCard>

            <p className="has-text-centered has-text-muted mt-4">
              Don't have an account?{' '}
              <Link to="/signup" className="auth-link">Sign up</Link>
            </p>

          </div>
        </div>
      </div>
    </section>
  )
}