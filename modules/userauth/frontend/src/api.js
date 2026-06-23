/**
 * api.js
 *
 * All authentication endpoint calls for the auth module.
 * Each function returns a raw Promise<Response> — callers check res.ok
 * and parse the body themselves, consistent with the rest of the API layer.
 *
 * URL prefix: /api/userauth/ (module mounted by core at this path)
 *
 * Endpoints
 * ─────────
 * login              POST /api/userauth/login/
 * loginWithGoogle    POST /api/userauth/google/
 * register           POST /api/userauth/register/
 * registerWithGoogle POST /api/userauth/google/register/
 * verifyEmailCode    POST /api/userauth/verify-email-code/
 * verifyEmailToken   POST /api/userauth/verify-email/
 * resendVerification POST /api/userauth/resend-verification/
 * forgotPassword     POST /api/userauth/forgot-password/
 * resetPassword      POST /api/userauth/reset-password/
 * refreshToken       POST /api/userauth/token/refresh/
 */

import { apiFetch, BASE } from '@core/frontend/utils/api'

const post = (path, body) =>
  apiFetch(path, { method: 'POST', body: JSON.stringify(body) })

export const authApi = {
  /** Authenticate with username and password. */
  login: (username, password) =>
    post('/api/userauth/login/', { username, password }),

  /** Authenticate via Google OAuth access token. */
  loginWithGoogle: (accessToken) =>
    post('/api/userauth/google/', { access_token: accessToken }),

  /** Register a new account. captcha_token is a reCAPTCHA v3 token. */
  register: ({ username, email, password, captcha_token }) =>
    post('/api/userauth/register/', { username, email, password, captcha_token }),

  /** Register via Google OAuth. Username is required for new accounts. */
  registerWithGoogle: (accessToken, username) =>
    post('/api/userauth/google/register/', { access_token: accessToken, username }),

  /** Verify email with a short numeric code (sent during registration). */
  verifyEmailCode: (email, code) =>
    post('/api/userauth/verify-email-code/', { email, code }),

  /** Verify email with a token delivered via link (standalone verify page). */
  verifyEmailToken: (token) =>
    post('/api/userauth/verify-email/', { token }),

  /** Request a new verification email. */
  resendVerification: (email) =>
    post('/api/userauth/resend-verification/', { email }),

  /** Request a password reset link for the given email address. */
  forgotPassword: (email) =>
    post('/api/userauth/forgot-password/', { email }),

  /** Submit a new password using the reset token from the emailed link. */
  resetPassword: (token, password) =>
    post('/api/userauth/reset-password/', { token, password }),

  /**
   * Exchange a refresh token for a new access token.
   * Uses raw fetch() rather than apiFetch() to avoid a circular dependency
   * with AuthContext (which registers the 401 handler in apiFetch).
   */
  refreshToken: (refreshToken) =>
    fetch(`${BASE}/api/userauth/token/refresh/`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ refresh: refreshToken }),
    }),
}
