/**
 * FormField.jsx
 *
 * Bulma field/control/input block with a left icon and optional per-field
 * error. Covers the pattern repeated across all auth forms.
 *
 * Props
 * ─────
 * label    {string}       - Visible label; omit to render no label element
 * icon     {string}       - Font Awesome class, e.g. "fa-solid fa-user"
 * error    {string|null}  - Per-field error text; adds is-danger styling
 * ...rest                 - Forwarded to <input> (type, name, value, onChange,
 *                           placeholder, required, disabled, autoComplete,
 *                           minLength, etc.)
 */
export default function FormField({ label, icon, error, ...rest }) {
  return (
    <div className="field">
      {label && <label className="label">{label}</label>}
      <div className="control has-icons-left">
        <input className={`input${error ? ' is-danger' : ''}`} {...rest} />
        {icon && (
          <span className="icon is-left">
            <i className={icon} />
          </span>
        )}
      </div>
      {error && <p className="help is-danger">{error}</p>}
    </div>
  )
}
