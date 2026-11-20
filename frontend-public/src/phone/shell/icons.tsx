/** The line icons the shell uses (24 box, `svg.i` in kit.css). Paths from the mockup. */
import type { ReactNode } from 'react'

type P = { className?: string }

const I = ({ d, className, children }: P & { d?: string; children?: ReactNode }) => (
  <svg className={`i${className ? ` ${className}` : ''}`} viewBox="0 0 24 24" aria-hidden="true">
    {d ? <path d={d} /> : null}
    {children}
  </svg>
)

export const IconMenu = (p: P) => <I {...p} d="M3 6h18M3 12h18M3 18h18" />
export const IconPerson = (p: P) => (
  <I {...p}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7" />
  </I>
)
export const IconSearch = (p: P) => (
  <I {...p}>
    <circle cx="10.5" cy="10.5" r="6.5" />
    <path d="M15.5 15.5L21 21" />
  </I>
)
export const IconClear = (p: P) => <I {...p} d="M6 6l12 12M18 6L6 18" />
export const IconNext = (p: P) => <I {...p} d="M9 6l6 6-6 6" />
export const IconPin = (p: P) => (
  <I {...p}>
    <path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21z" />
    <circle cx="12" cy="9.5" r="2.5" />
  </I>
)
export const IconHome = (p: P) => <I {...p} d="M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />
export const IconList = (p: P) => (
  <I {...p}>
    <path d="M4 6h16M4 12h16M4 18h10" />
    <circle cx="19" cy="18" r="1.2" />
  </I>
)
export const IconScan = (p: P) => <I {...p} d="M3 8V6a2 2 0 0 1 2-2h2M17 4h2a2 2 0 0 1 2 2v2M21 16v2a2 2 0 0 1-2 2h-2M7 20H5a2 2 0 0 1-2-2v-2M7 12h10" />
export const IconTag = (p: P) => (
  <I {...p}>
    <path d="M20.6 12.6l-8 8a1.4 1.4 0 0 1-2 0L3 13V4h9l8.6 8.6a1.4 1.4 0 0 1 0 2z" transform="translate(0 -1)" />
    <circle cx="7.5" cy="7.5" r="1.3" />
  </I>
)
export const IconCheck = (p: P) => <I {...p} d="M5 12.5l4.5 4.5L19 7.5" />
