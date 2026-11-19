/**
 * The scanner's shared parts, on the kit (kit.css: `.btn`, `.disp`, `.lbl`, `svg.i`) and scan.css (prefix `sa-`):
 * buttons, a field with its label, an alert, the spinner, the sheet (no slide: a 120 ms fade, PLAN-SCANNER.md call 3),
 * the release tag, and the inline icons. No UI library.
 */
import { useEffect, useId, useRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react'
import './scan.css'

declare const __APP_VERSION__: string
export const APP_VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : ''

// ── Icons (24 box, `svg.i`) ─────────────────────────────────────────────────

type IconProps = { className?: string; title?: string }

function Icon({ className, title, children }: IconProps & { children: ReactNode }) {
  return (
    <svg className={`i${className ? ` ${className}` : ''}`} viewBox="0 0 24 24" aria-hidden={title ? undefined : true} role={title ? 'img' : undefined}>
      {title ? <title>{title}</title> : null}
      {children}
    </svg>
  )
}

export const IconScan = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M7 12h10" />
  </Icon>
)
export const IconClose = (p: IconProps) => <Icon {...p}><path d="M6 6l12 12M18 6L6 18" /></Icon>
export const IconPlus = (p: IconProps) => <Icon {...p}><path d="M12 5v14M5 12h14" /></Icon>
export const IconMinus = (p: IconProps) => <Icon {...p}><path d="M5 12h14" /></Icon>
export const IconCheck = (p: IconProps) => <Icon {...p}><path d="M5 12.5l4.5 4.5L19 7" /></Icon>
export const IconBack = (p: IconProps) => <Icon {...p}><path d="M15 6l-6 6 6 6" /></Icon>
export const IconNext = (p: IconProps) => <Icon {...p}><path d="M9 6l6 6-6 6" /></Icon>
export const IconUp = (p: IconProps) => <Icon {...p}><path d="M6 15l6-6 6 6" /></Icon>
export const IconDown = (p: IconProps) => <Icon {...p}><path d="M6 9l6 6 6-6" /></Icon>
export const IconBag = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5 8h14l-1.2 11.2a1 1 0 0 1-1 .8H7.2a1 1 0 0 1-1-.8z" />
    <path d="M9 8V6a3 3 0 0 1 6 0v2" />
  </Icon>
)
export const IconTrash = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 7h16M9 7V5h6v2M6.5 7l1 12.5a1 1 0 0 0 1 .9h7a1 1 0 0 0 1-.9l1-12.5" />
  </Icon>
)
export const IconPhone = (p: IconProps) => (
  <Icon {...p}>
    <rect x="7" y="3" width="10" height="18" rx="2" />
    <path d="M11 18h2" />
  </Icon>
)
export const IconMail = (p: IconProps) => (
  <Icon {...p}>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="M4 7l8 6 8-6" />
  </Icon>
)
export const IconCamera = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 8h3l2-2.5h6L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" />
    <circle cx="12" cy="13" r="3.5" />
  </Icon>
)
export const IconHelp = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .8-1 1.5v.5M12 17h.01" />
  </Icon>
)
export const IconLink = (p: IconProps) => (
  <Icon {...p}>
    <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
  </Icon>
)
export const IconLock = (p: IconProps) => (
  <Icon {...p}>
    <rect x="5" y="11" width="14" height="10" rx="2" />
    <path d="M8 11V8a4 4 0 0 1 8 0v3" />
  </Icon>
)
export const IconRestart = (p: IconProps) => (
  <Icon {...p}>
    <path d="M20 11a8 8 0 1 0-2.3 5.7M20 5v6h-6" />
  </Icon>
)
export const IconQr = (p: IconProps) => (
  <Icon {...p}>
    <rect x="4" y="4" width="6" height="6" rx="1" />
    <rect x="14" y="4" width="6" height="6" rx="1" />
    <rect x="4" y="14" width="6" height="6" rx="1" />
    <path d="M14 14h2v2h-2zM18 18h2v2h-2zM14 18h2M18 14h2" />
  </Icon>
)
export const IconPerson = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7" />
  </Icon>
)

// ── Spinner ─────────────────────────────────────────────────────────────────

/** A quiet ring that turns (still where the phone asks for less motion). `label` is read to a screen reader. */
export function Spinner({ label = 'Loading', size = 36 }: { label?: string; size?: number }) {
  return <span className="sa-spin" role="progressbar" aria-label={label} style={{ width: size, height: size }} />
}

/** The spinner in the middle of the scanner's space (sign-in under way, the session not known yet). */
export function SpinnerScreen() {
  return (
    <div className="sa-center" data-testid="scan-spinner">
      <Spinner />
    </div>
  )
}

// ── Buttons ─────────────────────────────────────────────────────────────────

export type ButtonKind = 'ink' | 'lime' | 'line' | 'link'

type ButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type'> & {
  kind?: ButtonKind
  /** Full width. */
  wide?: boolean
  /** While true the button shows a small spinner, keeps its size and takes no taps (blocks a double send). */
  pending?: boolean
  type?: 'button' | 'submit'
  testId?: string
}

/** The kit's button: 48 px tall (44 px tap target at least), full words. */
export function Button({ kind = 'ink', wide = false, pending = false, type = 'button', testId, className, disabled, children, ...rest }: ButtonProps) {
  const cls = kind === 'link' ? 'sa-link' : `btn btn-${kind}${wide ? ' sa-wide' : ''}`
  return (
    <button
      {...rest}
      type={type}
      data-testid={testId}
      className={`${cls}${pending ? ' sa-pending' : ''}${className ? ` ${className}` : ''}`}
      disabled={disabled || pending}
      aria-busy={pending || undefined}
    >
      {children}
      {pending ? <Spinner size={18} label="Working" /> : null}
    </button>
  )
}

/** A text link styled as the scanner's quiet link (a router `Link` or an `<a>` takes `className="sa-link"`). */
export const LINK_CLASS = 'sa-link'

// ── Fields and alerts ───────────────────────────────────────────────────────

type FieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> & { label: string; hint?: ReactNode; error?: string }

/** A labelled input (tests and screen readers find it by its label: "Mobile number", "6-digit code", ...). 16 px text
 *  so an iPhone does not zoom in. */
export function Field({ label, hint, error, className, ...input }: FieldProps) {
  const id = useId()
  const hintId = hint ? `${id}-hint` : undefined
  return (
    <div className={`sa-field${error ? ' sa-bad' : ''}${className ? ` ${className}` : ''}`}>
      <label htmlFor={id}>{label}</label>
      <input id={id} aria-describedby={hintId} aria-invalid={error ? true : undefined} {...input} />
      {hint ? <div id={hintId} className="sa-hint">{hint}</div> : null}
    </div>
  )
}

/** A message the screen reader says at once (errors, a used link's words). Nothing when empty. */
export function Alert({ children, tone = 'bad' }: { children?: ReactNode; tone?: 'bad' | 'info' }) {
  if (!children) return null
  return (
    <div className={`sa-alert sa-${tone}`} role="alert">
      {children}
    </div>
  )
}

// ── Sheet ───────────────────────────────────────────────────────────────────

/**
 * A sheet over the page: a panel at the bottom with a dim backdrop, a fade in (no slide), closed by the ×, the backdrop
 * or Escape. `label` names the dialog. The page behind does not scroll while it is open.
 */
export function Sheet({ label, onClose, children, testId, className }: { label: string; onClose: () => void; children: ReactNode; testId?: string; className?: string }) {
  const panel = useRef<HTMLDivElement>(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeRef.current()
    }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    panel.current?.focus()
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [])
  return (
    <div className="sa-sheet" data-testid={testId}>
      <div className="sa-sheet-bg" onClick={onClose} aria-hidden="true" />
      <div ref={panel} className={`sa-sheet-panel${className ? ` ${className}` : ''}`} role="dialog" aria-modal="true" aria-label={label} tabIndex={-1}>
        <button type="button" className="sa-sheet-x" aria-label="Close" onClick={onClose}>
          <IconClose />
        </button>
        {children}
      </div>
    </div>
  )
}

// ── The release ─────────────────────────────────────────────────────────────

/** The release, small and grey in a corner of every scanner screen (owner 2026-10-20), above the bottom bar. Takes no taps. */
export function VersionTag() {
  if (!APP_VERSION) return null
  return (
    <div className="sa-ver" aria-hidden="true" data-testid="version-tag">
      {APP_VERSION}
    </div>
  )
}

// ── Stand-ins ───────────────────────────────────────────────────────────────

/** A piece that is not built yet: a visible placeholder that names it (S0's stubs; each piece replaces its own). */
export function PieceStub({ piece, name, children }: { piece: string; name: string; children?: ReactNode }) {
  return (
    <section className="sa-stub" data-testid={`piece-${piece.toLowerCase()}`}>
      <span className="lbl">Piece {piece}</span>
      <h2 className="disp">{name}</h2>
      <p>Coming in the next update.</p>
      {children}
    </section>
  )
}
