/**
 * StepIndicator.jsx
 *
 * Horizontal step progress tracker for multi-step forms.
 * Completed steps show a checkmark; the active step is highlighted;
 * future steps are dimmed. Connector lines reflect completion state.
 *
 * Props
 * ─────
 * steps    {string[]}  - Ordered step labels, e.g. ['Account', 'Verify', 'Done']
 * current  {number}    - Zero-based index of the active step
 */
import './StepIndicator.css'

export default function StepIndicator({ steps, current }) {
  return (
    <div className="step-indicator">
      {steps.map((step, i) => {
        const done   = i < current
        const active = i === current
        const circleClass = done ? '--done' : active ? '--active' : ''
        return (
          <div key={step} className="step-indicator__item">
            <div className="step-indicator__step">
              <div className={`step-indicator__circle${circleClass ? ` step-indicator__circle${circleClass}` : ''}`}>
                {done ? <i className="fa-solid fa-check" style={{ fontSize: '0.75rem' }} /> : i + 1}
              </div>
              <span className={`step-indicator__label${active ? ' step-indicator__label--active' : ''}`}>
                {step}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div className={`step-indicator__connector${done ? ' step-indicator__connector--done' : ''}`} />
            )}
          </div>
        )
      })}
    </div>
  )
}
