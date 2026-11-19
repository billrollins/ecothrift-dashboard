/**
 * Zoom (PLAN-SCANNER.md row 15; live CameraCard.tsx `ZoomPill` and `usePinch`, owner 2026-10-15, APP D13): the phone's
 * own levels as chips, like a phone's camera app, and two fingers on the picture zooming smoothly with the chips
 * following. The logic is core's (`cameraZoom.ts`, `useQrCamera`), unchanged.
 */
import { useEffect, useRef } from 'react'
import { activeLevel, chipText, onLevel, pinchZoom, zoomText, type CameraZoom } from '../core'

/** The chips. The lit chip shows the zoom itself between levels ("2.6×") while a pinch moves it. */
export function ZoomPill({ zoom }: { zoom: CameraZoom }) {
  const lit = activeLevel(zoom.levels, zoom.value)
  return (
    <div className="cm-zoom" role="group" aria-label="Zoom" data-testid="zoom-pill">
      {zoom.levels.map((level) => {
        const on = level === lit
        return (
          <button
            key={level}
            type="button"
            className={`cm-chip tn${on ? ' cm-on' : ''}`}
            data-testid={`zoom-${level}`}
            aria-label={`Zoom ${chipText(level)}`}
            aria-pressed={on}
            onClick={(e) => {
              e.stopPropagation()
              zoom.set(level)
            }}
          >
            {on && !onLevel(level, zoom.value) ? zoomText(zoom.value) : chipText(level)}
          </button>
        )
      })}
    </div>
  )
}

/**
 * Pinch on the camera window zooms within the camera's range, and the chips follow. Native listeners, so the page itself
 * does not zoom (React's touch listeners cannot stop that).
 */
export function usePinch<T extends HTMLElement>(on: boolean, zoom: CameraZoom | null) {
  const ref = useRef<T | null>(null)
  const zoomRef = useRef(zoom)
  zoomRef.current = zoom
  useEffect(() => {
    const el = ref.current
    if (!el || !on) return
    let start: { distance: number; zoom: number } | null = null
    let last = 1
    const spread = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY)
    const onStart = (e: TouchEvent) => {
      const z = zoomRef.current
      if (e.touches.length !== 2 || !z) return
      e.preventDefault()
      start = { distance: spread(e.touches), zoom: z.value }
      last = z.value
    }
    const onMove = (e: TouchEvent) => {
      const z = zoomRef.current
      if (!start || e.touches.length !== 2 || !z) return
      e.preventDefault()
      last = pinchZoom(start.zoom, start.distance, spread(e.touches), z.range)
      z.set(last, { live: true })
    }
    const onEnd = (e: TouchEvent) => {
      if (!start || e.touches.length >= 2) return
      start = null
      zoomRef.current?.set(last)
    }
    const stopPageZoom = (e: Event) => e.preventDefault() // Safari's own pinch gesture
    el.addEventListener('touchstart', onStart, { passive: false })
    el.addEventListener('touchmove', onMove, { passive: false })
    el.addEventListener('touchend', onEnd)
    el.addEventListener('touchcancel', onEnd)
    el.addEventListener('gesturestart', stopPageZoom)
    return () => {
      el.removeEventListener('touchstart', onStart)
      el.removeEventListener('touchmove', onMove)
      el.removeEventListener('touchend', onEnd)
      el.removeEventListener('touchcancel', onEnd)
      el.removeEventListener('gesturestart', stopPageZoom)
    }
  }, [on])
  return ref
}
