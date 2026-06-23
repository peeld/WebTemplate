/**
 * GoogleButton.jsx
 *
 * Google OAuth button used on login and signup forms.
 * Returns null when VITE_GOOGLE_CLIENT_ID is not set, so callers don't need
 * to guard the render themselves.
 *
 * Props
 * ─────
 * label     {string}   - Button text, e.g. "Sign in with Google"
 * onClick   {function} - Handler from useGoogleLogin()
 * loading   {boolean}  - Shows Bulma is-loading spinner
 * disabled  {boolean}  - Disables the button (e.g. when another flow is in flight)
 */

const GOOGLE_ENABLED = Boolean(import.meta.env.VITE_GOOGLE_CLIENT_ID)

export default function GoogleButton({ label, onClick, loading, disabled }) {
  if (!GOOGLE_ENABLED) return null

  return (
    <div className="field mt-4">
      <button
        type="button"
        className={`button is-fullwidth${loading ? ' is-loading' : ''}`}
        onClick={onClick}
        disabled={disabled}
      >
        <span className="icon">
          <img
            src="https://www.google.com/favicon.ico"
            alt=""
            aria-hidden="true"
            style={{ width: '16px', height: '16px' }}
          />
        </span>
        <span>{label}</span>
      </button>
    </div>
  )
}
