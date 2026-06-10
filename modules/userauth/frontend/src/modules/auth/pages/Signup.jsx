/**
 * Signup.jsx
 *
 * Two-step account registration: account details → email verification.
 * Steps that depend on other modules (skills, sprints) are NOT included here;
 * those modules extend the post-signup flow via their own routes/hooks.
 *
 * Steps
 * ─────
 * 0 — Account     username, email, password + reCAPTCHA, or Google OAuth
 * 1 — Verify      email verification code (skipped for Google accounts)
 * 2 — Done        navigate to /dashboard
 *
 * Auth flows
 * ──────────
 * Standard: POST /api/userauth/register/ → step 1 (email verify)
 * Google:   POST /api/userauth/google/register/ → step 2 (pre-verified)
 */

import { useState }          from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useGoogleLogin }    from '@react-oauth/google'

import { useAuth }        from '../context/AuthContext'
import { useRecaptcha }   from '../hooks/useRecaptcha'
import { authApi }        from '../auth_api'
import AuthCard           from '../components/AuthCard'
import FormField          from '../components/FormField'
import GoogleButton       from '../components/GoogleButton'
import StepIndicator      from '../components/StepIndicator'
import EmailVerifyForm    from '../components/EmailVerifyForm'

import { captureError, captureWarning, addBreadcrumb } from '@core/frontend/utils/logger'

const SIGNUP_STEPS = ['Account', 'Verify']
const GOOGLE_ENABLED = Boolean(import.meta.env.VITE_GOOGLE_CLIENT_ID)

function GoogleSignupSection({ username, setErrors, setGLoading, gLoading, disabled, login, navigate, removeRecaptcha }) {
  const handleGoogleSignup = useGoogleLogin({
    onSuccess: async (tokenResponse) => {
      setGLoading(true)
      setErrors({})
      addBreadcrumb('Google signup attempt', {}, 'info')
      try {
        const res  = await authApi.registerWithGoogle(tokenResponse.access_token, username)
        const data = await res.json()

        if (!res.ok) {
          captureWarning('Google signup rejected', { status: res.status })
          setErrors({ non_field_errors: [data?.error || 'Google signup failed — please try again'] })
          return
        }

        login(data.access, data.refresh, data.user.username)
        removeRecaptcha()
        navigate('/dashboard', { replace: true })
      } catch (err) {
        captureError(err, { operation: 'google_signup' }, 'auth')
        setErrors({ non_field_errors: ['Could not reach the server. Check your connection.'] })
      } finally {
        setGLoading(false)
      }
    },
    onError: (err) => {
      captureWarning('Google OAuth signup popup error', { error: String(err) })
      setErrors({ non_field_errors: ['Google sign-up was cancelled or failed. Please try again.'] })
    },
  })

  return (
    <GoogleButton
      label="Sign up with Google"
      onClick={() => handleGoogleSignup()}
      loading={gLoading}
      disabled={disabled}
    />
  )
}

// ─── Step 0: Account ─────────────────────────────────────────────────────────

function Step0Account({ form, onChange, onSubmit, loading, errors, gLoading, googleSection }) {
  const isAnyLoading = loading || gLoading

  const getFieldError = (fieldName) => {
    const fieldErrors = errors[fieldName]
    if (Array.isArray(fieldErrors) && fieldErrors.length > 0) return fieldErrors[0]
    if (typeof fieldErrors === 'string') return fieldErrors
    return null
  }

  return (
    <>
      <div className="has-text-centered mb-5">
        <h1 className="title is-4">Create your account</h1>
      </div>

      <AuthCard>
        {errors.non_field_errors && (
          <div className="notification is-danger is-light mb-4">
            {Array.isArray(errors.non_field_errors) ? errors.non_field_errors[0] : errors.non_field_errors}
          </div>
        )}
        {errors.error && (
          <div className="notification is-warning is-light mb-4">{errors.error}</div>
        )}

        <form onSubmit={onSubmit}>
          <FormField
            label="Username" icon="fa-solid fa-user"
            type="text" name="username" placeholder="Choose a username"
            value={form.username} onChange={onChange}
            required autoComplete="username" disabled={isAnyLoading}
            error={getFieldError('username')}
          />
          <FormField
            label="Email" icon="fa-solid fa-envelope"
            type="email" name="email" placeholder="Your email address"
            value={form.email} onChange={onChange}
            required autoComplete="email" disabled={isAnyLoading}
            error={getFieldError('email')}
          />
          <FormField
            label="Password" icon="fa-solid fa-lock"
            type="password" name="password" placeholder="Create a password"
            value={form.password} onChange={onChange}
            required autoComplete="new-password" disabled={isAnyLoading}
            minLength={8} error={getFieldError('password')}
          />

          <div className="field mt-5">
            <button
              type="submit"
              className={`button is-primary is-fullwidth ${loading ? 'is-loading' : ''}`}
              disabled={isAnyLoading}
            >
              Create account
            </button>
          </div>
        </form>

        {googleSection}

        <p className="has-text-centered has-text-muted mt-4" style={{ fontSize: '0.82rem' }}>
          Already have an account?{' '}
          <Link to="/login">Log in</Link>
        </p>
      </AuthCard>
    </>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function Signup() {
  const { login }  = useAuth()
  const navigate   = useNavigate()

  const [step, setStep]   = useState(0)
  const [form, setForm]   = useState({ username: '', email: '', password: '' })
  const [errors, setErrors]   = useState({})
  const [loading, setLoading] = useState(false)
  const [gLoading, setGLoading] = useState(false)

  const [code, setCode]             = useState('')
  const [verifyError, setVerifyError] = useState(null)
  const [verifying, setVerifying]   = useState(false)
  const [resending, setResending]   = useState(false)
  const [resendSent, setResendSent] = useState(false)

  const { execute, removeRecaptcha } = useRecaptcha()

  const handleChange = e => setForm({ ...form, [e.target.name]: e.target.value })

  // ── Step 0: email/password submit ─────────────────────────────────────────

  const handleAccountSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setErrors({})
    addBreadcrumb('Signup attempt', { username: form.username }, 'info')

    try {
      let captcha_token
      try {
        captcha_token = await execute('register')
      } catch (tokenErr) {
        captureError(tokenErr, { operation: 'recaptcha_token_generation' }, 'auth')
        setErrors({ non_field_errors: ['reCAPTCHA failed to load. Please refresh the page.'] })
        return
      }

      const res  = await authApi.register({ ...form, captcha_token })
      const data = await res.json()

      if (!res.ok) {
        if (res.status >= 500) captureWarning('Registration server error', { status: res.status })
        setErrors(data.error ? { error: data.error } : data)
        return
      }

      setStep(1)
    } catch (err) {
      captureError(err, { operation: 'register' }, 'auth')
      setErrors({ non_field_errors: ['Could not reach the server. Check your connection.'] })
    } finally {
      setLoading(false)
    }
  }

  // ── Step 1: email verification ────────────────────────────────────────────

  const handleVerify = async () => {
    setVerifying(true)
    setVerifyError(null)
    try {
      const res  = await authApi.verifyEmailCode(form.email, code)
      const data = await res.json()

      if (!res.ok) {
        if (res.status >= 500) captureWarning('Email verify server error', { status: res.status })
        setVerifyError(data?.error || 'Invalid or expired code. Please try again.')
      } else {
        if (data.access && data.refresh) {
          login(data.access, data.refresh, data.username || form.username)
        }
        navigate('/dashboard', { replace: true })
      }
    } catch (err) {
      captureError(err, { operation: 'verify_email' }, 'auth')
      setVerifyError('Could not reach the server. Check your connection.')
    } finally {
      setVerifying(false)
    }
  }

  const handleResend = async () => {
    setResending(true)
    setResendSent(false)
    try {
      const res = await authApi.resendVerification(form.email)
      if (res.ok) setResendSent(true)
      else setVerifyError('Could not resend code. Please try again.')
    } catch (err) {
      captureWarning('Resend verification network failure', { error: err.message })
      setVerifyError('Could not reach the server.')
    } finally {
      setResending(false)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <section className="section">
      <div className="container">
        <div className="columns is-centered">
          <div className="column is-6-tablet is-5-desktop">

            <StepIndicator steps={SIGNUP_STEPS} current={step} />

            {step === 0 && (
              <Step0Account
                form={form} onChange={handleChange}
                onSubmit={handleAccountSubmit}
                loading={loading} errors={errors}
                gLoading={gLoading}
                googleSection={GOOGLE_ENABLED && (
                  <GoogleSignupSection
                    username={form.username}
                    setErrors={setErrors}
                    setGLoading={setGLoading}
                    gLoading={gLoading}
                    disabled={loading || gLoading}
                    login={login}
                    navigate={navigate}
                    removeRecaptcha={removeRecaptcha}
                  />
                )}
              />
            )}
            {step === 1 && (
              <EmailVerifyForm
                code={code} onChange={setCode}
                onVerify={handleVerify} verifying={verifying} error={verifyError}
                onResend={handleResend} resending={resending} resendSent={resendSent}
              />
            )}

          </div>
        </div>
      </div>
    </section>
  )
}
