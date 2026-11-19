/** Small parts the W3 pages (Categories, About, Questions) share: the mockup's Back row. */
import { useNavigate } from 'react-router-dom'
import type { MouseEvent } from 'react'

/** True when this tab has a page of the site to go back to (react-router keeps its place in history.state.idx). */
export function canGoBack(): boolean {
  const s = typeof window !== 'undefined' ? (window.history.state as { idx?: number } | null) : null
  return Boolean(s && typeof s.idx === 'number' && s.idx > 0)
}

/** "‹ Back": the page the visitor came from, or home when they landed here first. */
export function BackRow({ className = '' }: { className?: string }) {
  const navigate = useNavigate()
  const go = (e: MouseEvent) => {
    e.preventDefault()
    if (canGoBack()) navigate(-1)
    else navigate('/')
  }
  return (
    <a className={`backrow${className ? ` ${className}` : ''}`} href="/" onClick={go}>
      <svg className="i" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M15 5l-7 7 7 7" />
      </svg>
      Back
    </a>
  )
}
