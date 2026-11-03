import { useEffect, useRef } from 'react'

// An error message that scrolls itself into view, so a long form never fails silently off-screen.
export function FormError({ message }: { message: string }) {
  const ref = useRef<HTMLParagraphElement>(null)
  useEffect(() => {
    if (message) ref.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [message])
  if (!message) return null
  return <p ref={ref} className="error" role="alert">{message}</p>
}
