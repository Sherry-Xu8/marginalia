import { dismissToast, useToast } from '../lib/toast'

// Shows the message from toast() at the bottom of the screen.
export function ToastHost() {
  const t = useToast()
  if (!t) return null
  return (
    <div className="toast" role="status" aria-live="polite">
      <span>{t.message}</span>
      {t.action && (
        <button
          onClick={() => {
            t.action!.run()
            dismissToast(t.id)
          }}
        >
          {t.action.label}
        </button>
      )}
      {!t.sticky && <button className="toast-x" aria-label="Dismiss" onClick={() => dismissToast(t.id)}>×</button>}
    </div>
  )
}
