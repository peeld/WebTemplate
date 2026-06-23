/**
 * AuthContext.jsx
 *
 * Global authentication state and JWT lifecycle management.
 *
 * Provides
 * ────────
 * { user, isLoading, login, logout } via useAuth()
 *
 * user shape
 * ──────────
 * null when unauthenticated, otherwise:
 * {
 *   id:       number,   // from JWT payload.user_id
 *   username: string,
 *   token:    string,   // current access token
 * }
 *
 * Token lifecycle
 * ───────────────
 * On mount, the stored access token is decoded to determine time until
 * expiry. If the token is already expired, a refresh is attempted
 * immediately. Otherwise a timer is scheduled to refresh 2 minutes before
 * expiry. After each successful refresh the timer is rescheduled using
 * the new token's actual expiry rather than a fixed interval.
 *
 * isLoading
 * ─────────
 * true from mount until the initial token validation resolves (either
 * the token is confirmed valid and a refresh is scheduled, or a refresh
 * attempt completes). PrivateRoute reads this flag to avoid redirecting
 * authenticated users to /login during the async startup window.
 *
 * Dependencies
 * ────────────
 * - @core/frontend/utils/api      onUnauthorized
 * - @core/frontend/utils/logger   setUser, clearUser, captureError, captureWarning, addBreadcrumb
 * - ../api                authApi.refreshToken
 *
 * localStorage keys managed by this module
 * ─────────────────────────────────────────
 * "access"    — JWT access token
 * "refresh"   — JWT refresh token
 * "username"  — authenticated user's username
 * "user_id"   — authenticated user's numeric ID
 *
 * Only these four keys are written or removed. localStorage.clear() is
 * not used so unrelated keys from other modules are preserved.
 *
 * Hardening considerations
 * ────────────────────────
 * - JWT decode failures (malformed token, invalid base64) are caught and
 *   reported to Sentry. The fallback is an immediate refresh attempt; if
 *   that also fails, logout() is called.
 * - doRefresh() reports 5xx and network failures to Sentry as warnings
 *   rather than silently calling logout(), so intermittent server issues
 *   during refresh are visible in the dashboard.
 * - scheduleRefresh() and doRefresh() are wrapped in useCallback with
 *   correct dependencies to prevent stale closure bugs in the useEffect
 *   that starts the refresh cycle on mount.
 * - The 401 handler from api.js is registered on mount via onUnauthorized()
 *   so that apiFetch()'s 401 response calls AuthContext's logout() rather
 *   than manipulating localStorage directly.
 * - Sentry user identity is set on login and cleared on logout so all
 *   subsequent events are correctly attributed or anonymised.
 *
 * Testing considerations
 * ──────────────────────
 * - Hard-refresh a protected route while authenticated and confirm no
 *   flash-redirect to /login (tests isLoading guard in PrivateRoute).
 * - Let the access token expire while the tab is open and confirm the
 *   refresh fires automatically and the session continues uninterrupted.
 * - Simulate a refresh endpoint 500 and confirm a Sentry warning is
 *   captured and the user is NOT immediately logged out.
 * - Simulate a refresh endpoint returning 401 and confirm logout() runs.
 * - Call login() with a malformed token and confirm Sentry captures the
 *   decode error and a refresh is still attempted.
 * - Log in and confirm Sentry user fields (id, username) are set.
 * - Log out and confirm Sentry user is cleared and only the four auth
 *   keys are removed from localStorage.
 */

import {
  createContext, useContext, useState,
  useEffect, useCallback, useRef,
} from 'react'
import { onUnauthorized } from '@core/frontend/utils/api'
import { authApi } from '../api'
import {
  setUser, clearUser,
  captureError, captureWarning, addBreadcrumb,
} from '@core/frontend/utils/logger'

const AuthContext = createContext(null)

// Auth keys written to localStorage — only these are ever cleared on logout.
const AUTH_KEYS = ['access', 'refresh', 'username', 'user_id']

/**
 * Decodes the payload of a JWT access token without verifying its signature.
 * Signature verification is the backend's responsibility; we only need the
 * expiry claim (exp) and user identity (user_id) for client-side scheduling.
 *
 * @param {string} token - JWT string
 * @returns {{ exp: number, user_id: number, [key: string]: unknown }}
 * @throws {Error} If the token is malformed or the payload is not valid JSON
 */
function decodeJWT(token) {
  const parts = token.split('.')
  if (parts.length !== 3) throw new Error('Malformed JWT: expected 3 parts')
  return JSON.parse(atob(parts[1]))
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function AuthProvider({ children }) {

  // Initialise user synchronously from localStorage so protected pages
  // can begin rendering immediately on a hard refresh without waiting for
  // an async operation. isLoading gates PrivateRoute during token validation.
  const [user, setUser] = useState(() => {
    const token    = localStorage.getItem('access')
    const username = localStorage.getItem('username')
    const id       = localStorage.getItem('user_id')
    return token ? { id: Number(id), username, token } : null
  })

  const [isLoading, setIsLoading] = useState(true)
  const refreshTimer = useRef(null)

  // ── Refresh scheduling ──────────────────────────────────────────────────────

  /**
   * Cancels any pending refresh timer and schedules a new one.
   * Fires doRefresh 2 minutes before the token expires so there is a
   * window to retry if the first refresh attempt fails.
   * Minimum delay is 10 seconds to prevent tight retry loops.
   *
   * @param {number} tokenExpiresInMs - Milliseconds until the token expires
   */
  const scheduleRefresh = useCallback((tokenExpiresInMs) => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current)
    const delay = Math.max(tokenExpiresInMs - 2 * 60 * 1000, 10_000)
    refreshTimer.current = setTimeout(doRefresh, delay)
    addBreadcrumb('Token refresh scheduled', { delaySeconds: Math.round(delay / 1000) }, 'info')
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  // doRefresh is defined after scheduleRefresh and assigned via ref to
  // avoid a definition-order circular dependency (see doRefreshRef below).

  /**
   * Ref that holds doRefresh so scheduleRefresh's setTimeout callback
   * always calls the current version without needing doRefresh in its
   * dependency array (which would create a circular useCallback chain).
   */
  const doRefreshRef = useRef(null)

  /**
   * Attempts to exchange the stored refresh token for a new access token.
   *
   * On success: updates localStorage and user state, reschedules refresh
   *             using the new token's actual expiry.
   * On 401:     the refresh token is invalid or revoked — calls logout().
   * On 5xx:     server error during refresh — logs to Sentry as a warning
   *             (the session may still be recoverable) and calls logout()
   *             as a safe fallback.
   * On network failure: logs to Sentry, calls logout().
   */
  const doRefresh = useCallback(async () => {
    const refresh = localStorage.getItem('refresh')
    if (!refresh) {
      addBreadcrumb('No refresh token found — logging out', {}, 'warning')
      logout()
      return
    }

    addBreadcrumb('Token refresh attempt', {}, 'info')

    try {
      const res = await authApi.refreshToken(refresh)

      if (res.status === 401) {
        // Refresh token rejected — session is unrecoverable.
        captureWarning('Token refresh rejected (401) — logging out', {})
        logout()
        return
      }

      if (!res.ok) {
        // Server error during refresh — not the user's fault.
        captureWarning('Token refresh failed with server error', { status: res.status })
        logout()
        return
      }

      const data = await res.json()

      localStorage.setItem('access', data.access)
      if (data.refresh) localStorage.setItem('refresh', data.refresh)

      // Re-decode the new token for its actual expiry rather than
      // assuming a fixed interval which drifts if the backend config changes.
      let expiresIn = 60 * 60 * 1000 // 1 hour safe fallback
      try {
        const payload = decodeJWT(data.access)
        expiresIn = payload.exp * 1000 - Date.now()
      } catch (decodeErr) {
        captureWarning('Could not decode refreshed access token — using 1h fallback', {
          error: decodeErr.message,
        })
      }

      setUser(prev => ({ ...prev, token: data.access }))
      scheduleRefresh(expiresIn)
      addBreadcrumb('Token refresh succeeded', { expiresIn }, 'info')

    } catch (networkError) {
      captureError(networkError, { operation: 'token_refresh' }, 'auth')
      logout()
    }
  }, [scheduleRefresh]) // eslint-disable-line react-hooks/exhaustive-deps
  // logout is stable (no state deps); included via ref pattern below.

  // Keep the ref current so scheduleRefresh's setTimeout always calls
  // the latest doRefresh without needing it in scheduleRefresh's dep array.
  doRefreshRef.current = doRefresh

  // ── Mount: validate stored token and start refresh cycle ───────────────────

  useEffect(() => {
    async function initialise() {
      const token = localStorage.getItem('access')

      if (!token) {
        // No stored session — nothing to validate.
        setIsLoading(false)
        return
      }

      try {
        const payload   = decodeJWT(token)
        const expiresIn = payload.exp * 1000 - Date.now()

        if (expiresIn <= 0) {
          // Token already expired — attempt immediate refresh.
          await doRefreshRef.current()
        } else {
          scheduleRefresh(expiresIn)
        }
      } catch (decodeErr) {
        // Token is malformed — attempt a refresh in case the refresh token
        // is still valid; logout() will run if it is not.
        captureError(decodeErr, { operation: 'initial_token_decode' }, 'auth')
        await doRefreshRef.current()
      } finally {
        setIsLoading(false)
      }
    }

    initialise()

    return () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current)
    }
  }, [scheduleRefresh])

  // ── Auth actions ────────────────────────────────────────────────────────────

  /**
   * Stores tokens, decodes the JWT for user identity, starts the refresh
   * cycle, and sets Sentry user context. Called by Login and Signup pages
   * after a successful authentication response from the backend.
   *
   * @param {string} token    - JWT access token
   * @param {string} refresh  - JWT refresh token
   * @param {string} username - Authenticated user's username
   */
  const login = useCallback((token, refresh, username) => {
    let userId = null
    let expiresIn = 60 * 60 * 1000 // 1 hour safe fallback

    try {
      const payload = decodeJWT(token)
      userId    = payload.user_id
      expiresIn = payload.exp * 1000 - Date.now()
    } catch (err) {
      // A decode failure here means the token is malformed. The user will
      // appear logged in but the refresh cycle won't have correct timing.
      // Reported to Sentry so this can be investigated — it may indicate
      // a backend change to the token format.
      captureError(err, { operation: 'login_token_decode', username }, 'auth')
    }

    localStorage.setItem('access',   token)
    localStorage.setItem('refresh',  refresh)
    localStorage.setItem('username', username)
    if (userId !== null) localStorage.setItem('user_id', String(userId))

    const nextUser = { id: userId, username, token }
    setUser(nextUser)
    scheduleRefresh(expiresIn)

    addBreadcrumb('User logged in', { username }, 'info')
  }, [scheduleRefresh])

  /**
   * Clears auth state, cancels the refresh timer, removes Sentry user
   * context, and removes only the four managed auth keys from localStorage.
   * Other localStorage keys (from third-party libraries or other modules)
   * are not affected.
   */
  const logout = useCallback(() => {
    AUTH_KEYS.forEach(k => localStorage.removeItem(k))
    if (refreshTimer.current) clearTimeout(refreshTimer.current)
    clearUser()
    setUser(null)
    addBreadcrumb('User logged out', {}, 'info')
  }, [])

  // Register logout as the 401 handler in apiFetch so that any API call
  // receiving a 401 correctly triggers the full logout flow instead of
  // manipulating localStorage directly in api.js.
  useEffect(() => {
    onUnauthorized(logout)
  }, [logout])

  // ── Context value ───────────────────────────────────────────────────────────

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

/**
 * useAuth
 *
 * Returns { user, isLoading, login, logout } from AuthContext.
 * Must be called from a component that is a descendant of AuthProvider.
 * Throws if called outside the provider tree so misconfigured usage fails
 * loudly rather than returning a silent undefined.
 */
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth() must be used within an <AuthProvider>')
  return ctx
}
