/**
 * "Scan the store's sign-in QR" (owner 2026-10-20), as live (`StoreQrScan.tsx`): a cashier shows a one-use sign-in QR on
 * the Thrift+ Staff app, and the member scans it with this app's own camera. On an iPhone the Camera app would open
 * Safari, not the installed app, so the app reads it itself. The QR holds ecothrift.us/scan?signin=<token>; `onToken`
 * gets the token (the sign-in screen puts it in `?signin=`, and the scanner shell signs in).
 *
 * The `<video>` stays mounted with `playsinline` and `muted`, never hidden and never inside a button (PLAN-SCANNER.md
 * risk 3); the camera is released when this screen closes (core `useQrCamera`).
 */
import { useState } from 'react'
import { useQrCamera } from '../core'
import { IconRestart, Spinner } from '../ui'
import { Head, SmallLink } from './parts'

/** The sign-in token in a scanned QR, or '' when it is some other code. */
export function signInTokenOf(raw: string): string {
  try {
    const url = new URL(raw.trim())
    if (!/(^|\.)ecothrift\.us$/.test(url.hostname) && url.hostname !== window.location.hostname) return ''
    return url.searchParams.get('signin') ?? ''
  } catch {
    return ''
  }
}

export function StoreQrScan({ onToken, onClose }: { onToken: (token: string) => void; onClose: () => void }) {
  const [note, setNote] = useState('')
  const { videoRef, status, restart } = useQrCamera({
    enabled: true,
    paused: false,
    onDecode: (raw) => {
      const token = signInTokenOf(raw)
      if (token) onToken(token)
      else setNote("That's not the store's sign-in QR. Ask the cashier to show it again.")
    },
  })
  const failed = status === 'blocked' || status === 'unsupported'
  return (
    <div className="si-screen" data-testid="store-qr-scan">
      <Head long title="Scan the store's sign-in QR" sub="A cashier shows it on their phone. Point your camera at it." />
      <div className="si-body">
        <div className="si-qr">
          <video ref={videoRef} playsInline muted />
          <span className="si-qr-frame" aria-hidden="true" />
          {status === 'starting' ? (
            <span className="si-qr-over">
              <Spinner label="Starting the camera" />
            </span>
          ) : null}
          {status === 'stalled' || status === 'resting' ? (
            <button type="button" className="si-qr-over si-qr-tap" onClick={restart}>
              <IconRestart />
              Tap to start the camera
            </button>
          ) : null}
        </div>
        {/* One reserved line for either message, so nothing under it moves. */}
        <div className="si-msg si-qr-msg">
          {failed ? <div>The camera didn&apos;t start. Ask the cashier, or sign in with your mobile number.</div> : null}
          {note ? <div role="alert">{note}</div> : null}
        </div>
        <SmallLink label="Back to sign in" onClick={onClose} className="si-alt" />
      </div>
    </div>
  )
}
