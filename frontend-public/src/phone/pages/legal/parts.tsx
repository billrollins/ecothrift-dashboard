/** Small pieces the W5 pages share (Terms, Privacy, Blog, Verify, not found). Kept here, not in shell/ or lib/. */
import { Link, useNavigate } from 'react-router-dom'

/** Back: the page the visitor came from inside the site, else `fallback`. Same 44 px row as the kit's `.backrow`. */
export function BackRow({ fallback = '/', label = 'Back' }: { fallback?: string; label?: string }) {
  const navigate = useNavigate()
  const idx = typeof window !== 'undefined' ? (window.history.state as { idx?: number } | null)?.idx ?? 0 : 0
  const arrow = (
    <svg className="i" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M15 5l-7 7 7 7" />
    </svg>
  )
  if (idx > 0) {
    return (
      <button type="button" className="backrow lg-back" onClick={() => navigate(-1)}>
        {arrow}
        {label}
      </button>
    )
  }
  return (
    <Link className="backrow lg-back" to={fallback}>
      {arrow}
      {label}
    </Link>
  )
}

/** A phone number or an email as selectable text (word rules: no tel: or mailto: links). */
export function Plain({ children }: { children: string }) {
  return <span className="lg-sel">{children}</span>
}
