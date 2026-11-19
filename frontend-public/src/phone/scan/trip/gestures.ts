/**
 * The trip's two gestures (the live tripUi.tsx `useSwipe` and `SwipeRow`, owner 2026-10-12 and 10-13; kept by the
 * coordinator's call 3): a tag in the answer slot swipes right to add and left to pass (never mentioned), and a trip
 * line slides left to remove. The content follows the finger; when it is let go far enough it fades out (120 ms or
 * less, no fly-away), otherwise it goes straight back. Taps and scrolling stay taps and scrolls.
 */
import { useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'

/** How long the let-go fade takes before the action runs. */
export const LET_GO_MS = 110

type Drag = { id: number; x: number; y: number; on: boolean }

/** A drag that starts only once the finger has moved sideways more than up or down (10 px). */
function useDrag() {
  const drag = useRef<Drag | null>(null)
  const [dx, setDx] = useState(0)
  const [dragging, setDragging] = useState(false)
  const dxRef = useRef(0)
  const set = (v: number) => {
    dxRef.current = v
    setDx(v)
  }
  const down = (e: ReactPointerEvent<HTMLElement>) => {
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, on: false }
  }
  /** True when this move belongs to a sideways drag. */
  const move = (e: ReactPointerEvent<HTMLElement>, clamp: (mx: number) => number): boolean => {
    const d = drag.current
    if (!d || d.id !== e.pointerId) return false
    const mx = e.clientX - d.x
    if (!d.on) {
      if (Math.abs(mx) < 10 || Math.abs(mx) < Math.abs(e.clientY - d.y)) return false
      d.on = true
      setDragging(true)
      try {
        e.currentTarget.setPointerCapture(e.pointerId)
      } catch {
        /* an old browser: the drag still works while the finger stays on it */
      }
    }
    set(clamp(mx))
    return true
  }
  /** The drag that just ended, or null for a tap. */
  const up = (): Drag | null => {
    const d = drag.current
    drag.current = null
    if (!d?.on) return null
    setDragging(false)
    return d
  }
  return { dx, dxRef, set, dragging, down, move, up }
}

/** Right adds, left passes. `onAdd` null: a tag that cannot go in the trip (sold, an answer) springs back from the right. */
export function useSwipe(onAdd: (() => void) | null, onPass: () => void) {
  const d = useDrag()
  const [leaving, setLeaving] = useState(false)
  const end = (e: ReactPointerEvent<HTMLElement>) => {
    if (!d.up()) return
    const w = e.currentTarget.offsetWidth || 320
    const reach = Math.min(120, w * 0.28)
    const right = d.dxRef.current > 0
    if (Math.abs(d.dxRef.current) < reach || (right && !onAdd)) {
      d.set(0)
      return
    }
    setLeaving(true)
    window.setTimeout(right && onAdd ? onAdd : onPass, LET_GO_MS)
  }
  const handlers = {
    onPointerDown: (e: ReactPointerEvent<HTMLElement>) => {
      if (!leaving) d.down(e)
    },
    onPointerMove: (e: ReactPointerEvent<HTMLElement>) => {
      d.move(e, (mx) => mx)
    },
    onPointerUp: end,
    onPointerCancel: end,
  }
  const style: CSSProperties = {
    transform: d.dx ? `translateX(${d.dx}px)` : undefined,
    opacity: leaving ? 0 : 1,
    transition: d.dragging ? 'none' : leaving ? `opacity ${LET_GO_MS}ms linear` : 'transform 100ms ease-out',
    touchAction: 'pan-y',
  }
  return { handlers, style }
}

/**
 * A trip line that slides left to show "Remove" and goes when let go past a third of its width. `moved` tells the
 * line's click (open its tag) that a slide, not a tap, just ended.
 */
export function useSlideToRemove(onRemove: () => void) {
  const d = useDrag()
  const [leaving, setLeaving] = useState(false)
  const moved = useRef(false)
  const end = (e: ReactPointerEvent<HTMLElement>) => {
    const was = d.up()
    if (!was) return
    moved.current = true
    window.setTimeout(() => {
      moved.current = false
    }, 0)
    const w = e.currentTarget.offsetWidth || 300
    if (d.dxRef.current < -w * 0.32) {
      setLeaving(true)
      window.setTimeout(onRemove, LET_GO_MS)
    } else d.set(0)
  }
  const handlers = {
    onPointerDown: (e: ReactPointerEvent<HTMLElement>) => {
      if (!leaving) d.down(e)
    },
    onPointerMove: (e: ReactPointerEvent<HTMLElement>) => {
      d.move(e, (mx) => Math.min(0, mx))
    },
    onPointerUp: end,
    onPointerCancel: end,
  }
  const style: CSSProperties = {
    transform: d.dx ? `translateX(${d.dx}px)` : undefined,
    opacity: leaving ? 0 : 1,
    transition: d.dragging ? 'none' : leaving ? `opacity ${LET_GO_MS}ms linear` : 'transform 100ms ease-out',
    touchAction: 'pan-y',
  }
  return { handlers, style, showing: d.dx < 0, moved }
}
