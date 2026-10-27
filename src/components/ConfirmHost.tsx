import { useEffect } from 'react'
import { answer, useAsk } from '../lib/confirm'

// Shows the question from ask() as a small dialog over the page.
export function ConfirmHost() {
  const a = useAsk()
  useEffect(() => {
    if (!a) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && answer(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [a])
  if (!a) return null
  return (
    <div className="confirm-scrim" onClick={() => answer(false)}>
      <div className="confirm-box" role="alertdialog" aria-modal="true" aria-label={a.message} onClick={(e) => e.stopPropagation()}>
        <p>{a.message}</p>
        <div className="row buttons">
          <button autoFocus onClick={() => answer(false)}>Cancel</button>
          <button className="danger-solid" onClick={() => answer(true)}>{a.label}</button>
        </div>
      </div>
    </div>
  )
}
