/** The camera piece's own inline icons (24 box, kit `svg.i`), beside the shared ones in ../ui. */
import type { ReactNode } from 'react'

function Icon({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <svg className={`i${className ? ` ${className}` : ''}`} viewBox="0 0 24 24" aria-hidden="true">
      {children}
    </svg>
  )
}

type P = { className?: string }

export const IconKeyboard = (p: P) => (
  <Icon {...p}>
    <rect x="2.5" y="6" width="19" height="12" rx="2" />
    <path d="M6 10h.01M9 10h.01M12 10h.01M15 10h.01M18 10h.01M6 13h.01M18 13h.01M9 13h6" />
  </Icon>
)

export const IconNoCamera = (p: P) => (
  <Icon {...p}>
    <path d="M3 3l18 18" />
    <path d="M9.2 5.5H15L17 8h3a1 1 0 0 1 1 1v8.5M17.5 19H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1h3" />
    <path d="M10 10.6a3.5 3.5 0 0 0 4.4 4.4" />
  </Icon>
)

export const IconLockUpright = (p: P) => (
  <Icon {...p}>
    <rect x="7" y="2.5" width="10" height="19" rx="2" />
    <rect x="9.5" y="11" width="5" height="4.5" rx="1" />
    <path d="M10.5 11V9.6a1.5 1.5 0 0 1 3 0V11" />
  </Icon>
)

export const IconUpright = (p: P) => (
  <Icon {...p}>
    <rect x="7" y="2.5" width="10" height="19" rx="2" />
    <path d="M11 18.5h2" />
  </Icon>
)

export const IconTurn = (p: P) => (
  <Icon {...p}>
    <rect x="8.5" y="4" width="7" height="16" rx="1.5" transform="rotate(-45 12 12)" />
    <path d="M3.5 9A9 9 0 0 1 9 3.5M20.5 15A9 9 0 0 1 15 20.5" />
  </Icon>
)

export const IconGotIt = (p: P) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M7.5 12.3l3 3 6-6.3" />
  </Icon>
)
