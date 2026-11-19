/**
 * The camera window (piece S3; PLAN-SCANNER.md rows 15, 16, 26, 27; live CameraCard.tsx): the mockup's dark panel with
 * lime corner marks (round3 `pages/scan.html`), on the live camera's behaviour.
 *
 * - The `<video>` is always mounted, `playsinline` and `muted`, never `display: none` and never inside a button (plan
 *   risk 3: iPhone Safari will not play it otherwise). Before the picture is live it is see-through, not hidden.
 * - What the customer sees is what the decoder reads (plan risk 11, `fit.ts`): the corner marks sit exactly on the
 *   square the decoder reads, and in a short window the picture is drawn smaller rather than let the square run past
 *   the window's edges. The window fills the box the trip gives it; under 150 px tall its controls go compact
 *   (36 px to see, 44 px to tap) so its two rows still fit.
 * - States, as live: starting, live (corners, zoom chips and pinch, restart, "Lock upright" on Android, "Type tag #"),
 *   resting after 5 quiet minutes ("Tap to scan"), stalled ("Tap to restart the camera"), blocked or no camera (the
 *   reason, "Camera not working?", and the tag box open), type-only test mode (`?type=1`: the test tags or the box).
 * - Restart (owner 2026-10-16): tapped again within 10 s, the page reloads (the fix that always works).
 * - With an answer on top (`underneath`) the camera keeps running, paused, under a dark veil that takes no taps.
 * - Calm (owner 11-19 night): every control is a layer inside the window, so nothing around it moves; the only motion is
 *   a fade of 120 ms or less; a code read gives no highlight flash (the trip's answer and the phone's buzz say it).
 */
import { useRef, useState } from 'react'
import type { CameraProps } from '../contracts'
import { useTestTags } from '../store'
import { IconCamera, IconRestart, Spinner } from '../ui'
import { COMPACT_BELOW, useCameraFit } from './fit'
import { IconKeyboard, IconNoCamera } from './icons'
import { LockUprightButton } from './Sideways'
import { TagForm, TestTagPick, TypeTagButton } from './TagBox'
import { usePinch, ZoomPill } from './ZoomPill'
import './camera.css'

export { CameraHelp } from './CameraHelp'
export { SidewaysGotIt, SidewaysScanPill, TurnUpright } from './Sideways'

/** A second tap on Restart within this long reloads the page (live CameraCard.tsx). */
export const HARD_RESTART_MS = 10_000

export default function Camera({ camera, flash, onCode, onHelp, typeOnly, lock, fullBleed, underneath }: CameraProps) {
  const { videoRef, status, error, zoom, switching } = camera
  const [typing, setTyping] = useState(false)
  const lastRestart = useRef(0)
  const restart = () => {
    const now = Date.now()
    if (now - lastRestart.current < HARD_RESTART_MS) {
      window.location.reload()
      return
    }
    lastRestart.current = now
    camera.restart()
  }

  const noCamera = !typeOnly && (status === 'unsupported' || status === 'blocked')
  // Test mode: pick a tag from a short list (owner 2026-10-10). If the list cannot load, type one instead.
  const testTags = useTestTags(typeOnly)
  const pickList = typeOnly && (testTags.data?.length ?? 0) > 0
  const panelOpen = typing || noCamera || typeOnly
  const live = status === 'live'
  // Zoom (APP D13): only while the camera runs, never in type-only mode or with the tag box open.
  const pinchable = !typeOnly && !underneath && live && !!zoom
  const showZoom = !typeOnly && !panelOpen && !!zoom && zoom.levels.length > 1 && (live || switching)
  const rootRef = usePinch<HTMLDivElement>(pinchable, zoom)
  const { fit, box } = useCameraFit(rootRef, videoRef, live, (h) => h < COMPACT_BELOW)
  // A short window (the trip gives the camera what the slot and buttons leave): smaller controls, same two rows.
  const compact = box.h > 0 && box.h < COMPACT_BELOW
  const digital = zoom && zoom.digital > 1.001 ? zoom.digital : 1
  const waking = status === 'resting' || status === 'stalled'
  const showBack = typing && !noCamera && !typeOnly
  const showLock = !!lock && !fullBleed && !typeOnly && !waking && !noCamera && !showBack
  const showType = !panelOpen && !fullBleed
  const showRestart = !typeOnly && !noCamera && !waking

  const typed = (code: string) => {
    setTyping(false)
    onCode(code)
  }

  return (
    <div
      ref={rootRef}
      className={`cm${compact ? ' cm-compact' : ''}${fullBleed ? ' cm-bleed' : ''}${pinchable ? ' cm-pinch' : ''}${underneath ? ' cm-under' : ''}`}
      data-testid="camera-card"
      data-status={status}
      data-flash={flash || undefined}
      data-shrunk={fit?.shrunk || undefined}
      aria-hidden={underneath || undefined}
    >
      <video
        ref={videoRef}
        className={`cm-video${live ? ' cm-live' : ''}${fit ? ' cm-placed' : ''}`}
        data-testid="camera-video"
        data-zoom={zoom?.digital ?? 1}
        muted
        playsInline
        autoPlay
        // Placed by fit.ts once the frame size is known; a phone with no zoom setting magnifies the picture (and the
        // decoder reads the same middle, scaled up). Inline, since a pinch moves it every frame.
        style={{
          ...(fit ? { width: fit.video.width, height: fit.video.height, left: fit.video.left, top: fit.video.top } : null),
          transform: digital > 1 ? `scale(${digital})` : 'none',
        }}
      />

      {/* The read square: the decoder reads what is inside these corners. */}
      {live ? (
        <div className="cm-find" aria-hidden="true" style={fit ? { width: fit.square, height: fit.square, left: fit.video.left + fit.video.width / 2, top: fit.video.top + fit.video.height / 2 } : undefined}>
          <span className="cm-k cm-k1" />
          <span className="cm-k cm-k2" />
          <span className="cm-k cm-k3" />
          <span className="cm-k cm-k4" />
          <span className="cm-ln" />
        </div>
      ) : null}

      {/* What the window says when there is no picture. */}
      {typeOnly ? (
        <div className="cm-say cm-say-top">
          <IconKeyboard />
          <span>Test mode: pick a tag</span>
        </div>
      ) : status === 'starting' ? (
        <div className="cm-say cm-say-mid" role="status">
          <Spinner size={22} label="Starting camera" />
          <span>Starting camera</span>
        </div>
      ) : noCamera ? (
        <div className="cm-say cm-say-top cm-say-row">
          <IconNoCamera />
          <span className="cm-why">{status === 'blocked' ? error : "This browser can't open the camera here."}</span>
          <button
            type="button"
            className="cm-pill cm-help-btn"
            onClick={(e) => {
              e.stopPropagation()
              onHelp()
            }}
          >
            Camera not working?
          </button>
        </div>
      ) : null}

      {/* Resting or stalled: the whole window is the button (a layer beside the video, never around it). */}
      {waking ? (
        <button
          type="button"
          className="cm-wake"
          onClick={status === 'resting' ? camera.wake : restart}
          data-testid={status === 'stalled' ? 'camera-stalled' : 'camera-resting'}
        >
          {status === 'resting' ? <IconCamera /> : <IconRestart />}
          <span className="cm-wake-h">{status === 'resting' ? 'Tap to scan' : 'Tap to restart the camera'}</span>
          <span className="cm-wake-p">{status === 'resting' ? 'The camera rests after 5 quiet minutes.' : 'The picture stopped.'}</span>
        </button>
      ) : null}

      {/* Top row. Left: "Back to the camera" while typing, else "Lock upright" (Android). Right: Restart. A short window
          keeps every control in a column on the right, beside the picture: the lock (as its icon), "Type tag #", Restart. */}
      {showBack ? (
        <button
          type="button"
          className="cm-pill cm-tl"
          onClick={(e) => {
            e.stopPropagation()
            setTyping(false)
          }}
        >
          Back to the camera
        </button>
      ) : showLock && !compact ? (
        <div className="cm-tl">
          <LockUprightButton lock={lock!} />
        </div>
      ) : null}
      <div className="cm-tr">
        {showLock && compact ? <LockUprightButton lock={lock!} iconOnly /> : null}
        {showType && compact ? <TypeTagButton onClick={() => setTyping(true)} /> : null}
        {showRestart ? (
          <button
            type="button"
            className="cm-round"
            onClick={(e) => {
              e.stopPropagation()
              restart()
            }}
            onPointerDown={(e) => e.stopPropagation()}
            data-testid="camera-restart"
            aria-label="Restart the camera"
          >
            <IconRestart />
          </button>
        ) : null}
      </div>

      {/* Bottom row: the zoom chips and "Type tag #"; or the tag box (or the test list) across. */}
      <div className={`cm-bottom${panelOpen ? ' cm-bottom-open' : ''}`}>
        {pickList ? (
          <TestTagPick tags={testTags.data!} onCode={onCode} />
        ) : panelOpen ? (
          <TagForm focus={typing || typeOnly} onCode={typed} />
        ) : (
          <>
            {showZoom && zoom ? <ZoomPill zoom={zoom} /> : <span />}
            {showType && !compact ? <TypeTagButton onClick={() => setTyping(true)} /> : null}
          </>
        )}
      </div>

      {/* An answer on top: the camera keeps running, paused, under this veil. */}
      <div className="cm-veil" aria-hidden="true" />
    </div>
  )
}
