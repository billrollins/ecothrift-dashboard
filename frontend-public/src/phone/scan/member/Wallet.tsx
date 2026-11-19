/**
 * My QR (PLAN-SCANNER.md row 22, C8), a section of /thriftplus since the coordinator's call 1. The owner's words: keep
 * it small, full size on a tap, because the register asks for a phone number.
 *
 * - The small QR in the balance band; a tap opens it large on a plain white layer (fade in, nothing under it moves),
 *   with the code to type, the line, the ThriftBucks terms line. The large layer is `?show=qr` (the old /qr, /card,
 *   /scan?view=qr land there): opened with a push, so the phone's Back closes it.
 * - Shown at once from the phone's copy (localStorage `tp-my-card`), fetched again only when older than 60 seconds
 *   (scan/store.ts `useMyCard`), so it shows with no signal.
 * - The screen stays awake while it is on screen (where the phone allows it), as the live My QR did.
 * - A phone held sideways shows the QR alone, as large as fits (APP D16 v2).
 * - The line, word for word as live (tripSheets.tsx): steps left: "Finish joining here in the app."; not finished at a
 *   register: "Not finished yet. Ask at the register."; else "Show this at the register."
 */
import { useEffect, useRef } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { asset } from '../../shell/Tag'
import type { WalletProps } from '../contracts'
import { hasFinishSteps, useSideways, type ThriftPlusMember } from '../core'
import type { MyCard } from '../api'
import { scanIsRoute } from '../switch'
import { useMyCard } from '../store'
import { Spinner } from '../ui'
import { CardQr } from './Qr'

export const CARD_TERMS = 'ThriftBucks are Thrift+ rewards: use within 30 days of collecting. No cash value.'

/** The QR's line (C8), exactly as live. */
export function qrLine(member: ThriftPlusMember, card: MyCard | undefined): string {
  if (hasFinishSteps(member)) return 'Finish joining here in the app.'
  if (card && !card.ready) return 'Not finished yet. Ask at the register.'
  return 'Show this at the register.'
}

/** Keep the screen awake while the QR is on screen (the live WalletScreen's wake lock). */
function useWakeLock() {
  useEffect(() => {
    let lock: { release?: () => Promise<void> } | null = null
    let gone = false
    const nav = navigator as Navigator & { wakeLock?: { request: (kind: 'screen') => Promise<{ release: () => Promise<void> }> } }
    nav.wakeLock
      ?.request('screen')
      .then((l) => {
        if (gone) void l.release().catch(() => undefined)
        else lock = l
      })
      .catch(() => undefined)
    return () => {
      gone = true
      lock?.release?.().catch(() => undefined)
    }
  }, [])
}

/** "Finish joining" goes to the scanner's Finish joining (a route when the new scanner is on, else a page load). */
function FinishLink() {
  const to = '/scan?view=finish'
  return scanIsRoute() ? (
    <Link className="btn btn-lime mb-wide" to={to} data-testid="finish-joining-button">Finish joining</Link>
  ) : (
    <a className="btn btn-lime mb-wide" href={to} data-testid="finish-joining-button">Finish joining</a>
  )
}

export function Wallet({ member }: WalletProps) {
  const card = useMyCard()
  const c = card.data
  const [params, setParams] = useSearchParams()
  const nav = useNavigate()
  const loc = useLocation()
  const big = params.get('show') === 'qr'
  const sideways = useSideways()
  const pushed = useRef(false)
  useWakeLock()
  useEffect(() => {
    if (!big) pushed.current = false
  }, [big])

  const open = () => {
    pushed.current = true
    const next = new URLSearchParams(params)
    next.set('show', 'qr')
    setParams(next)
  }
  const close = () => {
    // Opened here (a push): Back. Arrived on it (a hand-over from /scan, /qr): take it off the address.
    if (pushed.current && loc.key !== 'default') {
      pushed.current = false
      nav(-1)
      return
    }
    setParams((prev) => {
      const next = new URLSearchParams(prev)
      next.delete('show')
      return next
    }, { replace: true })
  }

  return (
    <>
      <button type="button" className="mb-qrtile" data-testid="qr-small" aria-label="Member QR: show it large" onClick={open}>
        {c ? <CardQr text={c.qr} testId="my-card-qr-small" /> : <span className="mb-qrwait">{card.error ? null : <Spinner size={22} />}</span>}
      </button>
      {big && !sideways ? <BigQr member={member} card={c} failed={!!card.error && !c} onClose={close} /> : null}
      {sideways ? <SidewaysQr card={c} /> : null}
    </>
  )
}

/** The QR full size on a plain white layer (no animation but the kit's short fade). */
function BigQr({ member, card, failed, onClose }: { member: ThriftPlusMember; card: MyCard | undefined; failed: boolean; onClose: () => void }) {
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeRef.current()
    }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [])
  const steps = hasFinishSteps(member)
  return (
    <div className="mb-big" role="dialog" aria-modal="true" aria-label="Member QR" data-testid="wallet-screen">
      <div className="mb-bigin" data-testid="my-card">
        <img className="mb-wm" src={asset('phone/thriftplus-wordmark-green.svg')} width={81} height={30} alt="Thrift+" />
        <p className="disp mb-bigname">{card?.first_name ?? member.first_name}</p>
        <div className="mb-qrl">
          {card ? (
            <CardQr text={card.qr} />
          ) : failed ? (
            <p className="mb-qrmiss">Your code needs a connection the first time. Try again in a moment.</p>
          ) : (
            <Spinner />
          )}
        </div>
        <p className="mb-code tn" data-testid="my-card-code">{card?.display ?? ' '}</p>
        <p className="mb-line" data-testid="my-card-line">{qrLine(member, card)}</p>
        <p className="fine mb-terms">
          {CARD_TERMS} Terms: <Link to="/terms">ecothrift.us/terms</Link>
        </p>
        {steps ? <FinishLink /> : null}
        <button type="button" className="btn btn-ink mb-close" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  )
}

/** A phone held sideways: the QR alone, as large as fits, with the code under it (live SidewaysQr). */
function SidewaysQr({ card }: { card: MyCard | undefined }) {
  return (
    <div className="mb-side" data-testid="sideways-qr">
      {card ? (
        <>
          <CardQr text={card.qr} className="mb-sideqr" />
          <p className="mb-code tn">{card.display}</p>
          <p className="mb-sideline">{card.ready ? 'Show this at the register.' : 'Finish joining in the app first.'}</p>
        </>
      ) : (
        <Spinner />
      )}
    </div>
  )
}
