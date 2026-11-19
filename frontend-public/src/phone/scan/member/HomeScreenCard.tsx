/**
 * "Put Thrift+ on your home screen" (owner 2026-10-20; PLAN-SCANNER.md row 25, C16): "It stays signed in and opens
 * faster." The live scanner's homeScreen.tsx on the kit, behaviour unchanged:
 * - on mobile web only, never inside the installed app (`display-mode: standalone`, `navigator.standalone`) or where the
 *   phone can't add it (installApp.ts `canInstall()`: Android's prompt, or iPhone Safari's Share menu);
 * - Android: the browser's own Install prompt, once; iPhone: three picture steps (Share, Add to Home Screen, Add) on a
 *   fade-in layer over the page;
 * - `banner`: × ("Not now") hides it for two weeks (localStorage `tp-home-card-dismissed`, installApp.ts, the live key);
 * - `account`: always in Account, with a big button; nothing hides it.
 *
 * Tiny on purpose: shell/Prompts.tsx puts the banner in the entry chunk, so this file imports only installApp.ts (no
 * store, no scanner CSS) and its own small CSS.
 */
import { useEffect, useState } from 'react'
import type { HomeScreenCardProps } from '../contracts'
import {
  canInstall,
  dismissHomeCard,
  homeCardDismissed,
  installPrompt,
  isStandalone,
} from '../../../../../frontend/src/pages/thriftplus/scanner/installApp'
import './homescreen.css'

const ICON = '/scan/icons/apple-touch-icon.png'
const TITLE = 'Put Thrift+ on your home screen'
const WHY = 'It stays signed in and opens faster.'

const IconShare = () => (
  <svg className="i hs-share" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 3v12M8 7l4-4 4 4M7 10H5v11h14V10h-2" />
  </svg>
)
const IconAddBox = () => (
  <svg className="i" viewBox="0 0 24 24" aria-hidden="true">
    <rect x="4" y="4" width="16" height="16" rx="3" />
    <path d="M12 8v8M8 12h8" />
  </svg>
)
const IconClose = () => (
  <svg className="i" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
)

function AppIcon({ size }: { size: number }) {
  const [gone, setGone] = useState(false)
  return (
    <img
      className="hs-icon"
      src={ICON}
      alt=""
      width={size}
      height={size}
      style={gone ? { visibility: 'hidden' } : undefined}
      onError={() => setGone(true)}
    />
  )
}

/** The three iPhone steps, each with a small picture of what to tap: a layer that fades in; the page does not move. */
function HowSheet({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  const steps = [
    { n: 1, tile: <IconShare />, text: <>Tap <b>Share</b> at the bottom of Safari.</> },
    {
      n: 2,
      tile: (
        <>
          <span className="hs-t2">Add to Home Screen</span>
          <IconAddBox />
        </>
      ),
      text: <>Tap <b>Add to Home Screen</b>. Scroll down if you don&apos;t see it.</>,
    },
    { n: 3, tile: <span className="hs-t3">Add</span>, text: <>Tap <b>Add</b> at the top right.</> },
  ]
  return (
    <div className="hs-layer" data-testid="home-steps">
      <div className="hs-bg" onClick={onClose} aria-hidden="true" />
      <div className="hs-panel" role="dialog" aria-modal="true" aria-label={TITLE}>
        <button type="button" className="hs-x" aria-label="Close" onClick={onClose}>
          <IconClose />
        </button>
        <div className="hs-head">
          <AppIcon size={60} />
          <h2>{TITLE}</h2>
        </div>
        <ol className="hs-steps">
          {steps.map((s) => (
            <li key={s.n} data-testid={`home-step-${s.n}`}>
              <span className="hs-n">{s.n}</span>
              <span className="hs-tile">{s.tile}</span>
              <span className="hs-text">{s.text}</span>
            </li>
          ))}
        </ol>
        <button type="button" className="btn btn-ink hs-done" data-testid="home-steps-done" onClick={onClose}>
          Got it
        </button>
      </div>
    </div>
  )
}

export function HomeScreenCard({ variant }: HomeScreenCardProps) {
  const [how, setHow] = useState(false)
  const [dismissed, setDismissed] = useState(() => variant === 'banner' && homeCardDismissed())
  const [, bump] = useState(0)
  useEffect(() => installPrompt.listen(() => bump((n) => n + 1)), [])
  const way = canInstall()
  // The steps stay open even if the browser withdraws its offer meanwhile (they are iPhone only anyway).
  if (!how && (isStandalone() || !way || dismissed)) return null
  const go = () => (way === 'prompt' ? void installPrompt.show() : setHow(true))
  const label = way === 'prompt' ? 'Install' : 'Show me'
  const banner = variant === 'banner'
  return (
    <>
      {way && !dismissed && !isStandalone() ? (
        <div className={banner ? 'hs hs-banner' : 'hs hs-acct'} data-testid={banner ? 'home-banner' : 'home-card'}>
          <AppIcon size={banner ? 44 : 56} />
          <div className="hs-words">
            <b>{TITLE}</b>
            <span>{WHY}</span>
          </div>
          {banner ? (
            <>
              <button type="button" className="btn btn-ink hs-go" data-testid="home-go" onClick={go}>
                {label}
              </button>
              <button
                type="button"
                className="hs-dismiss"
                aria-label="Not now"
                data-testid="home-dismiss"
                onClick={() => {
                  dismissHomeCard()
                  setDismissed(true)
                }}
              >
                <IconClose />
              </button>
            </>
          ) : (
            <button type="button" className="btn btn-ink hs-go hs-wide" data-testid="home-go" onClick={go}>
              {label}
            </button>
          )}
        </div>
      ) : null}
      {how ? <HowSheet onClose={() => setHow(false)} /> : null}
    </>
  )
}
