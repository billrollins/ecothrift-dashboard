/**
 * The selfie camera (owner 2026-10-19: "make sure they put their face in a face shape, to ensure it's not too far away"):
 * the front camera live in the app, with an oval to fit the face in. A port of the live scanner's
 * `frontend/src/pages/thriftplus/scanner/SelfieCamera.tsx` on the kit, same behaviour:
 * - the front camera (`facingMode: user`), one more try after 700 ms when the scanner's back camera is slow to let go
 *   (never after a refusal);
 * - mirrored on screen like a mirror; the photo is the middle 3:4 the person saw, 960 x 1280, not mirrored, JPEG 0.85;
 * - the camera is released when the photo is taken, when this unmounts (the step ends, Sign out), and at once when the
 *   phone leaves the page (another app, the lock screen: owner 2026-10-22);
 * - where the camera cannot open here (blocked, unsupported), `onFail` and the step uses the phone's own camera.
 * The `<video>` is always mounted, `playsinline` and `muted`, never `display: none` and never inside a button (iPhone).
 */
import { useEffect, useId, useRef, useState } from 'react'
import { cameraSupported } from '../core'
import { Button } from '../ui'

/** The frame on screen and in the photo: portrait 3:4. */
const FRAME_W = 3
const FRAME_H = 4
/** The oval, as a share of the frame: a face this size is close enough for staff to match it to the ID. */
export const OVAL = { width: 0.62, height: 0.66, top: 0.12 } as const
/** The photo's size (px), 3:4. */
const PHOTO_W = 960
const PHOTO_H = 1280

export function selfieCameraAvailable(): boolean {
  return cameraSupported()
}

export default function SelfieCamera({ onPhoto, onFail }: {
  /** The photo, a JPEG cropped to the frame. */
  onPhoto: (photo: Blob) => void
  /** The camera couldn't open here: use the phone's own camera instead. */
  onFail: () => void
}) {
  const video = useRef<HTMLVideoElement | null>(null)
  const stream = useRef<MediaStream | null>(null)
  const [ready, setReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const maskId = `fj-oval-${useId().replace(/:/g, '')}`

  useEffect(() => {
    let stopped = false
    void (async () => {
      try {
        const ask = () =>
          navigator.mediaDevices.getUserMedia({
            audio: false,
            video: { facingMode: { ideal: 'user' }, width: { ideal: 1280 }, height: { ideal: 1280 } },
          })
        let media: MediaStream
        try {
          media = await ask()
        } catch (first) {
          // The scanner's back camera may take a moment to let go (phones open one camera at a time): one more try.
          const name = first && typeof first === 'object' && 'name' in first ? String((first as { name?: unknown }).name) : ''
          if (name === 'NotAllowedError' || stopped) throw first
          await new Promise((r) => window.setTimeout(r, 700))
          media = await ask()
        }
        if (stopped) {
          media.getTracks().forEach((t) => t.stop())
          return
        }
        stream.current = media
        const el = video.current
        if (el) {
          el.srcObject = media
          await el.play().catch(() => undefined)
        }
        setReady(true)
      } catch {
        if (!stopped) onFail()
      }
    })()
    // Leaving the page (another app, the lock screen, closing it) stops the camera at once (owner 2026-10-22).
    const release = () => {
      stream.current?.getTracks().forEach((t) => t.stop())
      stream.current = null
    }
    const onHide = () => {
      if (document.visibilityState === 'hidden') release()
    }
    document.addEventListener('visibilitychange', onHide)
    window.addEventListener('pagehide', release)
    return () => {
      stopped = true
      document.removeEventListener('visibilitychange', onHide)
      window.removeEventListener('pagehide', release)
      release()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /** The frame the person saw (the middle 3:4 of the camera picture, as object-fit: cover shows it), not mirrored. */
  const take = () => {
    const el = video.current
    if (!el || !el.videoWidth || !el.videoHeight) return
    setBusy(true)
    const vw = el.videoWidth
    const vh = el.videoHeight
    const want = FRAME_W / FRAME_H
    let sw = vw
    let sh = vh
    if (vw / vh > want) sw = Math.round(vh * want)
    else sh = Math.round(vw / want)
    const sx = Math.round((vw - sw) / 2)
    const sy = Math.round((vh - sh) / 2)
    const canvas = document.createElement('canvas')
    canvas.width = PHOTO_W
    canvas.height = PHOTO_H
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      setBusy(false)
      onFail()
      return
    }
    ctx.drawImage(el, sx, sy, sw, sh, 0, 0, PHOTO_W, PHOTO_H)
    canvas.toBlob(
      (blob) => {
        setBusy(false)
        if (blob) {
          stream.current?.getTracks().forEach((t) => t.stop())
          stream.current = null
          onPhoto(blob)
        } else onFail()
      },
      'image/jpeg',
      0.85,
    )
  }

  const cy = 400 * (OVAL.top + OVAL.height / 2)
  const rx = 150 * OVAL.width
  const ry = 200 * OVAL.height
  return (
    <div className="fj-cam" data-testid="selfie-camera">
      <div className="fj-frame fj-frame-cam">
        <video ref={video} className="fj-video" muted playsInline autoPlay />
        {/* Dark outside the oval, a bright dashed oval line: put your face here. */}
        <svg className="fj-oval" aria-hidden="true" viewBox="0 0 300 400" preserveAspectRatio="none">
          <defs>
            <mask id={maskId}>
              <rect width="300" height="400" fill="white" />
              <ellipse cx="150" cy={cy} rx={rx} ry={ry} fill="black" />
            </mask>
          </defs>
          <rect width="300" height="400" fill="rgba(0,0,0,0.55)" mask={`url(#${maskId})`} />
          <ellipse cx="150" cy={cy} rx={rx} ry={ry} fill="none" stroke="#ffffff" strokeWidth="4" strokeDasharray="10 7" />
        </svg>
        <div className="fj-oval-hint" data-testid="selfie-oval-hint">
          {ready ? 'Fit your face in the oval' : 'Opening the camera…'}
        </div>
      </div>
      {/* The tip's and the error's places, kept empty so the button sits where "Take my selfie" was. */}
      <div className="fj-tip" aria-hidden="true" />
      <div className="fj-err" aria-hidden="true" />
      <div className="fj-acts">
        <Button kind="ink" wide onClick={take} disabled={!ready || busy} testId="selfie-shoot">
          Take photo
        </Button>
      </div>
    </div>
  )
}
