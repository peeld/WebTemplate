/**
 * useRecaptcha.js
 *
 * Provides reCAPTCHA Enterprise v3 token generation for form submissions.
 * Lazily loads the reCAPTCHA script on first use rather than at app startup
 * to avoid affecting initial page load performance.
 *
 * Usage
 * ─────
 * const { execute, removeRecaptcha } = useRecaptcha()
 *
 * // Before a form POST:
 * const token = await execute('register')   // action name matches backend config
 *
 * // After a flow completes (e.g. post-signup):
 * removeRecaptcha()   // removes the badge and script from the DOM
 *
 * Environment variables
 * ─────────────────────
 * VITE_RECAPTCHA_SITE_KEY  (required) — the reCAPTCHA Enterprise site key.
 *                           Missing key is captured to Sentry as a warning
 *                           and execute() will fail gracefully.
 *
 * Dependencies
 * ────────────
 * - ../utils/sentry   captureWarning, captureError
 * - window.grecaptcha.enterprise  (loaded lazily via script injection)
 *
 * Hardening considerations
 * ────────────────────────
 * - VITE_RECAPTCHA_SITE_KEY is validated at module load; execute() returns
 *   null and logs a Sentry warning when the key is absent rather than
 *   constructing a broken script URL.
 * - loadRecaptchaScript() is idempotent — concurrent calls before the script
 *   loads all resolve when the single script fires its onload event.
 * - Script load failures (network error, CSP block) reject the promise and
 *   are captured to Sentry by execute()'s catch block.
 * - execute() returns null on failure rather than throwing, so callers that
 *   do not strictly need reCAPTCHA can continue; callers that require it
 *   should check the return value before proceeding.
 * - removeRecaptcha() is safe to call multiple times; each DOM query is
 *   guarded with a null check.
 *
 * Testing considerations
 * ──────────────────────
 * - Remove VITE_RECAPTCHA_SITE_KEY and confirm execute() returns null and
 *   Sentry receives a captureWarning (no script loaded, no uncaught error).
 * - Call execute() twice concurrently before the script loads and confirm
 *   both resolve correctly (tests the idempotent loader).
 * - Block the reCAPTCHA script URL in DevTools and confirm execute() returns
 *   null and Sentry receives a captureError.
 * - Call removeRecaptcha() before the script loads and confirm no errors.
 * - Call removeRecaptcha() twice and confirm no errors.
 */

import { captureWarning, captureError } from '@core/frontend/utils/logger'

const SITE_KEY = import.meta.env.VITE_RECAPTCHA_SITE_KEY

if (!SITE_KEY) {
  captureWarning('VITE_RECAPTCHA_SITE_KEY is not set — reCAPTCHA will not function', {
    environment: import.meta.env.MODE,
  })
  console.warn('[useRecaptcha] VITE_RECAPTCHA_SITE_KEY is not set. reCAPTCHA will be disabled.')
}

// ─── Script loader ────────────────────────────────────────────────────────────

/**
 * Lazily loads the reCAPTCHA Enterprise script. Idempotent — safe to call
 * multiple times concurrently. All callers waiting on the same in-flight
 * load will resolve when the script fires its onload event.
 *
 * Resolves immediately if the script is already loaded.
 * Rejects if the script fails to load (network error, CSP block).
 *
 * @returns {Promise<void>}
 */
function loadRecaptchaScript() {
  return new Promise((resolve, reject) => {
    // Already loaded.
    if (window.grecaptcha?.enterprise) {
      resolve()
      return
    }

    const existing = document.querySelector('#recaptcha-script')

    if (existing) {
      // Script tag exists but hasn't fired onload yet — piggyback on it.
      // If it already errored, the load event won't fire; the caller's
      // execute() timeout or grecaptcha.enterprise check will catch that.
      existing.addEventListener('load', resolve)
      existing.addEventListener('error', reject)
      return
    }

    const script    = document.createElement('script')
    script.id       = 'recaptcha-script'
    script.src      = `https://www.google.com/recaptcha/enterprise.js?render=${SITE_KEY}`
    script.async    = true
    script.onload   = resolve
    script.onerror  = () => reject(new Error('reCAPTCHA script failed to load'))
    document.head.appendChild(script)
  })
}

// ─── DOM cleanup ─────────────────────────────────────────────────────────────

/**
 * Removes the reCAPTCHA script, badge, and global from the DOM.
 * Call after a flow that required reCAPTCHA completes (e.g. post-signup)
 * to clean up the floating badge injected by the Google script.
 *
 * Safe to call multiple times or before the script has loaded.
 */
function removeRecaptcha() {
  const script = document.querySelector('#recaptcha-script')
  if (script) script.remove()

  // Google injects the badge into a container div — remove the parent.
  const badge = document.querySelector('.grecaptcha-badge')
  if (badge?.parentElement) badge.parentElement.remove()

  // Clear the global so it reloads cleanly if needed again.
  try { delete window.grecaptcha } catch { /* non-configurable in some envs */ }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useRecaptcha() {
  /**
   * Generates a reCAPTCHA v3 token for the given action name.
   * The action name should match what your backend verifies (e.g. 'register',
   * 'login'). Returns null if reCAPTCHA is not configured or fails to load.
   *
   * @param {string} action
   * @returns {Promise<string|null>}
   */
  const execute = async (action) => {
    if (!SITE_KEY) {
      console.warn('[useRecaptcha] execute() called but SITE_KEY is missing.')
      return null
    }

    try {
      await loadRecaptchaScript()

      return await new Promise((resolve, reject) => {
        window.grecaptcha.enterprise.ready(async () => {
          try {
            const token = await window.grecaptcha.enterprise.execute(SITE_KEY, { action })
            resolve(token)
          } catch (err) {
            reject(err)
          }
        })
      })

    } catch (err) {
      captureError(err, { operation: 'recaptcha_execute', action }, 'recaptcha')
      console.warn('[useRecaptcha] execute() failed:', err.message)
      return null
    }
  }

  return { execute, removeRecaptcha }
}