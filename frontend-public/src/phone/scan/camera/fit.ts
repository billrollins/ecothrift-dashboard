/**
 * What the customer sees is what the decoder reads (PLAN-SCANNER.md risk 11).
 *
 * The decoder (core `useQrCamera`, unchanged) reads a square in the middle of the camera's frame: 70 % of the frame's
 * short side (divided by the digital zoom, while the picture is magnified by the same amount, so on screen the square
 * keeps its size). The live scanner filled a tall card with the picture, so the square was always on screen. The phone
 * site's camera window is wide and short: filled edge to edge, the square would reach above and below the window and a
 * tag the customer cannot see could be read.
 *
 * So the picture is sized here, not by the browser: it fills the window whenever the read square fits inside it (with a
 * small margin), and otherwise it is drawn smaller, just big enough that the whole read square sits inside the window.
 * The corner marks are drawn exactly on the read square. A tall enough window never shrinks the picture.
 *
 * Android's built-in reader at 1x reads the whole frame (core: `kind === 'native' && zoom <= 1.01`); that is the live
 * behaviour and is not changed here.
 */
import { useEffect, useLayoutEffect, useState, type RefObject } from 'react'

/** The decoder's square, as a share of the frame's short side (core useQrCamera CROP_FRACTION). */
export const READ_FRACTION = 0.7
/** The read square may take this share of the window's height or width, so its corner marks stay inside. */
export const FIT_MARGIN = 0.92

export type Box = { w: number; h: number }

export type Fit = {
  /** The picture's drawn size and place in the window (px), before the digital zoom. */
  video: { width: number; height: number; left: number; top: number }
  /** The read square (px), centred in the window. */
  square: number
  /** True when the picture is drawn smaller than the window so the read square fits. */
  shrunk: boolean
}

/**
 * Where the picture and the read square go for a window and a frame size; null until both are known. `start`: a picture
 * drawn smaller than the window sits at its left edge (a short window keeps its controls in a column on the right).
 */
export function fitCamera(win: Box, frame: Box, start = false): Fit | null {
  if (!(win.w > 0 && win.h > 0 && frame.w > 0 && frame.h > 0)) return null
  const short = Math.min(frame.w, frame.h)
  const fill = Math.max(win.w / frame.w, win.h / frame.h)
  const room = FIT_MARGIN * Math.min(win.w, win.h)
  const fits = READ_FRACTION * short * fill <= room
  const scale = fits ? fill : room / (READ_FRACTION * short)
  const width = frame.w * scale
  const height = frame.h * scale
  return {
    video: { width, height, left: start && !fits ? 0 : (win.w - width) / 2, top: (win.h - height) / 2 },
    square: READ_FRACTION * short * scale,
    shrunk: !fits,
  }
}

/** Under this height the window's controls go compact (36 px to see, 44 px to tap) so two rows still fit. */
export const COMPACT_BELOW = 150

/** The window's size (ResizeObserver), the camera frame's size (the video's own events), and the fit while live. */
export function useCameraFit(
  win: RefObject<HTMLElement | null>,
  video: RefObject<HTMLVideoElement | null>,
  live: boolean,
  startWhen: (height: number) => boolean = () => false,
): { fit: Fit | null; box: Box } {
  const [box, setBox] = useState<Box>({ w: 0, h: 0 })
  const [frame, setFrame] = useState<Box>({ w: 0, h: 0 })

  // Measured before the first paint, so the controls never draw at one size and then another.
  useLayoutEffect(() => {
    const el = win.current
    if (!el) return
    const read = () => setBox((b) => (b.w === el.clientWidth && b.h === el.clientHeight ? b : { w: el.clientWidth, h: el.clientHeight }))
    read()
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', read)
      return () => window.removeEventListener('resize', read)
    }
    const ro = new ResizeObserver(read)
    ro.observe(el)
    return () => ro.disconnect()
  }, [win])

  useEffect(() => {
    const v = video.current
    if (!v || !live) return
    const read = () => setFrame((f) => (f.w === v.videoWidth && f.h === v.videoHeight ? f : { w: v.videoWidth, h: v.videoHeight }))
    read()
    // A phone turned (or a lens switched) gives the frame a new size.
    v.addEventListener('loadedmetadata', read)
    v.addEventListener('resize', read)
    return () => {
      v.removeEventListener('loadedmetadata', read)
      v.removeEventListener('resize', read)
    }
  }, [video, live])

  return { fit: live ? fitCamera(box, frame, startWhen(box.h)) : null, box }
}
