/**
 * modules/auth/index.js
 *
 * Public API for the auth module. Import from here rather than from
 * internal sub-paths so the module's internals can be reorganised without
 * breaking consumers.
 *
 * Usage
 * ─────
 * import { AuthProvider, useAuth }                  from './modules/auth'
 * import { Login, ForgotPassword, ... }             from './modules/auth'
 * import { FormField, AuthCard, GoogleButton, ... } from './modules/auth'
 * import { useRecaptcha }                           from './modules/auth'
 *
 * Required environment variables
 * ───────────────────────────────
 * VITE_API_URL            Backend base URL, e.g. http://localhost:8000
 * VITE_WS_URL             WebSocket base URL, e.g. ws://localhost:8000
 * VITE_GOOGLE_CLIENT_ID   Google OAuth client ID (optional — hides Google button if absent)
 * VITE_RECAPTCHA_SITE_KEY reCAPTCHA Enterprise site key (optional — disables reCAPTCHA if absent)
 *
 * Expected backend endpoints
 * ──────────────────────────
 * POST /api/login/                     username + password → { access, refresh }
 * POST /api/token/refresh/             refresh → { access, refresh? }
 * POST /api/register/                  username, email, password, captcha_token → { ... }
 * POST /auth/social/google/            access_token → { access, refresh, user }
 * POST /auth/social/google/register/   access_token, username → { ... }
 * POST /api/auth/verify-email-code/    email, code → { ... }
 * POST /api/auth/verify-email/         token → { access, refresh, username }
 * POST /api/auth/resend-verification/  email → { ... }
 * POST /api/auth/forgot-password/      email → { ... }
 * POST /api/auth/reset-password/       token, password → { ... }
 *
 * Peer dependencies
 * ─────────────────
 * react-router-dom        Link, useNavigate, useParams
 * @react-oauth/google     GoogleOAuthProvider, useGoogleLogin
 * modules/common          initLogger, apiFetch, BASE, SiteLogo
 */

import './auth.css'

// ── Core auth state ───────────────────────────────────────────────────────────
export { AuthProvider, useAuth } from './context/AuthContext'

// ── Pages ─────────────────────────────────────────────────────────────────────
export { default as Login }          from './pages/Login'
export { default as Signup }         from './pages/Signup'
export { default as ForgotPassword } from './pages/ForgotPassword'
export { default as ResetPassword }  from './pages/ResetPassword'
export { default as VerifyEmail }    from './pages/VerifyEmail'

// ── Components ────────────────────────────────────────────────────────────────
export { default as FormField }       from './components/FormField'
export { default as AuthCard }        from './components/AuthCard'
export { default as GoogleButton }    from './components/GoogleButton'
export { default as StepIndicator }   from './components/StepIndicator'
export { default as EmailVerifyForm } from './components/EmailVerifyForm'

// ── Hooks ─────────────────────────────────────────────────────────────────────
export { useRecaptcha } from './hooks/useRecaptcha'

// ── API ───────────────────────────────────────────────────────────────────────
export { authApi } from './auth_api'
