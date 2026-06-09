    /**
 * EmailVerifyForm.jsx
 *
 * Code-based email verification form. Renders a heading, a 6-digit code
 * input, a verify button, and a resend button with success feedback.
 * Used during signup (and any other flow where the backend sends a short
 * numeric code rather than a link).
 *
 * Props
 * ─────
 * code      {string}    - Controlled value of the code input
 * onChange  {function}  - Called with the raw string value on each keystroke
 * onVerify  {function}  - Called when the user clicks "Verify email"
 * verifying {boolean}   - Shows spinner on verify button; disables both buttons
 * error     {string}    - Per-attempt error message (wrong code, expired, etc.)
 * onResend  {function}  - Called when the user clicks "Resend code"
 * resending {boolean}   - Shows spinner on resend button
 * resendSent {boolean}  - Shows success notice when a new code has been sent
 * title     {string}    - Heading text (default: "Verify your email")
 * subtitle  {string}    - Subheading text (default: "Enter the 6-digit code we sent you")
 */
import AuthCard from './AuthCard'

export default function EmailVerifyForm({
  code, onChange, onVerify, verifying, error,
  onResend, resending, resendSent,
  title    = 'Verify your email',
  subtitle = 'Enter the 6-digit code we sent you',
}) {
  return (
    <>
      <div className="has-text-centered mb-5">
        <h1 className="title is-4">{title}</h1>
        <p className="has-text-muted">{subtitle}</p>
      </div>

      <AuthCard>
        {error && (
          <div className="notification is-danger is-light mb-4">
            <i className="fa-solid fa-circle-exclamation mr-2" />{error}
          </div>
        )}
        {resendSent && (
          <div className="notification is-success is-light mb-4">
            <i className="fa-solid fa-check mr-2" />A new code has been sent.
          </div>
        )}

        <div className="field">
          <label className="label">Verification code</label>
          <div className="control">
            <input
              className="input"
              type="text" inputMode="numeric" pattern="[0-9]*"
              maxLength={6} placeholder="123456"
              value={code} onChange={e => onChange(e.target.value)}
              autoComplete="one-time-code"
            />
          </div>
        </div>

        <div className="field mt-4">
          <button
            className={`button is-primary is-fullwidth${verifying ? ' is-loading' : ''}`}
            onClick={onVerify} disabled={verifying || resending}
          >
            Verify email
          </button>
        </div>

        <div className="has-text-centered mt-3">
          <button
            className={`button is-ghost is-small${resending ? ' is-loading' : ''}`}
            onClick={onResend} disabled={verifying || resending}
          >
            Resend code
          </button>
        </div>
      </AuthCard>
    </>
  )
}
