/**
 * A phone held sideways (PLAN-SCANNER.md row 27; live Sideways.tsx, owner 2026-10-15, APP D16 v2), and the "Lock upright"
 * button (core `useUprightLock`, live screenLock.ts). Each of these is a layer over the page: the page under it never
 * moves, and whatever was open is still there when the phone turns back.
 */
import type { TurnUprightProps, UprightLock } from '../contracts'
import { IconGotIt, IconLockUpright, IconTurn, IconUpright } from './icons'

/**
 * "Lock upright" / "Locked upright": full screen with the screen held in portrait, like the phone's own rotation lock.
 * Shown only where the browser can do it (Android). `dark` sits on the camera; otherwise it sits on the page.
 */
export function LockUprightButton({ lock, dark = true, size = 'small', iconOnly = false }: {
  lock: UprightLock
  dark?: boolean
  size?: 'small' | 'large'
  /** A short camera window: the icon alone (the words stay its name for a screen reader). */
  iconOnly?: boolean
}) {
  const on = lock.locked
  return (
    <button
      type="button"
      className={`cm-lock${size === 'large' ? ' cm-lg' : ''}${iconOnly ? ' cm-icon' : ''}${on ? ' cm-on' : dark ? ' cm-dark' : ' cm-light'}`}
      onClick={(e) => {
        e.stopPropagation()
        lock.toggle()
      }}
      onPointerDown={(e) => e.stopPropagation()}
      data-testid="lock-upright"
      aria-pressed={on}
      aria-label={on ? 'Screen locked upright. Tap to let it turn again' : 'Lock the screen upright'}
    >
      <IconLockUpright />
      {iconOnly ? null : on ? 'Locked upright' : 'Lock upright'}
    </button>
  )
}

/** Anything but the camera, sideways: one plain screen. */
export function TurnUpright({ lock }: TurnUprightProps) {
  return (
    <div className="cm-upright" data-testid="turn-upright">
      <div>
        <IconUpright className="cm-upright-i" />
        <h2 className="cm-upright-h">Turn your phone upright</h2>
        <p className="cm-upright-p">The scanner works best held upright.</p>
        {lock ? (
          <div className="cm-upright-lock">
            <LockUprightButton lock={lock} dark={false} size="large" />
          </div>
        ) : null}
      </div>
    </div>
  )
}

/** Scanning sideways: the camera fills the screen and keeps reading; this note sits on top of it. */
export function SidewaysScanPill({ lock }: TurnUprightProps) {
  return (
    <div className="cm-sw">
      <div className="cm-sw-pill" data-testid="sideways-pill">
        <IconTurn />
        Turn your phone upright for the full app
      </div>
      {lock ? (
        <div className="cm-sw-lock">
          <LockUprightButton lock={lock} />
        </div>
      ) : null}
    </div>
  )
}

/** A code read while sideways: the trip handles it as usual underneath; this asks to turn the phone to see it. */
export function SidewaysGotIt() {
  return (
    <div className="cm-got" data-testid="sideways-got-it">
      <div className="cm-got-box" role="status">
        <IconGotIt className="cm-got-i" />
        <div className="cm-got-h">Got it!</div>
        <div className="cm-got-p">Turn your phone upright to see it.</div>
      </div>
    </div>
  )
}
