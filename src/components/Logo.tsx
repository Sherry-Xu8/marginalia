import { useId } from 'react'

// The Marginalia mark: a folded map page with a route to a pin, and a bookmark for notes.
export function LogoMark({ size = 46 }: { size?: number }) {
  const clip = useId()
  return (
    <svg width={size} height={size} viewBox="0 0 96 96" aria-hidden="true" className="logo-mark">
      <defs>
        <clipPath id={clip}>
          <rect x="20" y="22" width="54" height="56" rx="7" />
        </clipPath>
      </defs>
      <rect width="96" height="96" rx="26" fill="#4A7461" />
      <g clipPath={`url(#${clip})`}>
        <rect x="20" y="22" width="18" height="56" fill="#FBF8F1" />
        <rect x="38" y="22" width="18" height="56" fill="#E6EDE2" />
        <rect x="56" y="22" width="18" height="56" fill="#FBF8F1" />
      </g>
      <path d="M30 66C38 56 44 64 52 54" fill="none" stroke="#4A7461" strokeWidth="4.2" strokeLinecap="round" strokeDasharray="0.1 10" />
      <circle cx="58" cy="44" r="8" fill="#C2582F" />
      <circle cx="58" cy="44" r="3.2" fill="#FBF8F1" />
      <path d="M24 12h14v26l-7-6-7 6Z" fill="#C2582F" />
    </svg>
  )
}

// The name, with terracotta dots on both i's (the start and end of a route).
export function Wordmark() {
  return (
    <span className="wordmark" aria-label="Marginalia">
      <span aria-hidden>
        Marg<span className="idot">ı</span>nal<span className="idot">ı</span>a
      </span>
    </span>
  )
}
