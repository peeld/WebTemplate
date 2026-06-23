/**
 * AuthCard.jsx
 *
 * Shared card wrapper for auth pages (login, signup, forgot/reset password).
 * Encapsulates the Bulma box + project-standard background, border, and radius.
 *
 * Props
 * ─────
 * centered   {boolean}  - Adds has-text-centered; used by completion/success screens
 * className  {string}   - Extra classes, e.g. auth-card--success, auth-card--status
 * style      {object}   - Merged into the wrapper style for computed one-off overrides
 * children   {node}     - Card content
 */
export default function AuthCard({ children, centered = false, className = '', style = {} }) {
  return (
    <div
      className={`box${centered ? ' has-text-centered' : ''}${className ? ` ${className}` : ''}`}
      style={{
        background:   'var(--white)',
        border:       '1px solid rgba(0,0,0,0.07)',
        borderRadius: '12px',
        ...style,
      }}
    >
      {children}
    </div>
  )
}
