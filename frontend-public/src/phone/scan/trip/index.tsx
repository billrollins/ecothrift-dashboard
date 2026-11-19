/**
 * The Thrift+ trip scanner in the phone site (piece S4; PLAN-SCANNER.md rows 12, 17-20): the live TripScanner.tsx's
 * state machine and behaviour on the mockup's screen (pages/scan.html), which the owner approved:
 *
 * - **The camera on top** (piece S3's `Camera`; this screen owns the camera hook), then **ONE fixed answer slot** whose
 *   content swaps in place with a short fade ("Point at a tag", a tag, or the answer a code gets), then **Pass and Add
 *   to trip, always in the same place and size**, then **the summary row** (the trip's count and the ThriftBucks it
 *   collects; a tap shows the trip's lines over the camera and the slot, a second tap goes back).
 * - The live behaviour, unchanged: a code read while a tag is up waits; Pass and Add put the tag away at once (the add
 *   lands when the server answers); swipe right adds, left passes; a laptop's arrows and Escape; every code gets an
 *   answer with Scan again (a link adds Open link), and Scan again ignores that same code for 3 s; a trip line seen
 *   again has Remove and Back to trip; Undo puts lines back; sideways the camera fills the screen.
 * - `?tag=<SKU>` (a price tag's QR) opens that tag once and leaves the address; one that arrives while this screen is
 *   open (the top bar's search on /scan) opens too. On a phone that is not a member's it shows "Get Thrift+".
 * - No motion but a fade of 120 ms or less; no count-up, no falling tickets, no flash; nothing moves when state
 *   changes (owner 11-19: "whiplash", "nauseating", "CALM DOWN").
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { bucks } from '../../lib/format'
import { lookupTag } from '../api'
import Camera, { CameraHelp, SidewaysGotIt, SidewaysScanPill, TurnUpright } from '../camera'
import type { TripProps } from '../contracts'
import { classifyCode, loadDetector, ScanGate, useQrCamera, useSideways, useUprightLock, type ThriftPlusCartLine } from '../core'
import { HomeScreenCard } from '../member'
import { typeOnlyMode } from '../route'
import { actions, useCart } from '../store'
import { IconBack, IconBag, IconDown, IconLink, IconPlus, IconScan, IconTrash, IconUp, IconClose } from '../ui'
import { AboutSheet, FeelSheet, InfoSheet, RETAIL_INFO, RETURNS_INFO, type Feel, type Info } from './Sheets'
import { EmptySlot, TagSlot } from './Slot'
import { answerFor, SCAN_AGAIN_IGNORE_MS, type Mode, type Top } from './state'
import { removeLine, sortedLines, TripLines, tripWords, UndoToast } from './TripList'
import './trip.css'

export { TripList } from './TripList'

const quiet = (p: Promise<unknown>) => void p.catch(() => undefined)

export default function Trip({ session, onJoin }: TripProps) {
  // The site's top rows are hidden on every /scan view (ScanApp sets `data-scan`), so the camera gets the room.
  const member = session.status === 'member' ? session.member : null
  const isGuest = session.status === 'guest'
  const cart = useCart()
  const [params, setParams] = useSearchParams()

  const [mode, setMode] = useState<Mode>('scan')
  const [top, setTop] = useState<Top | null>(null)
  const [sheet, setSheet] = useState<null | 'about' | 'camera'>(null)
  const [info, setInfo] = useState<Info | null>(null)
  const [feel, setFeel] = useState<Feel | null>(null)
  // A phone held sideways (owner 2026-10-15, APP D16 v2): the camera keeps scanning full screen, everything else asks
  // to turn the phone upright. "Lock upright" locks the screen where the browser can (Android).
  const sideways = useSideways()
  const lock = useUprightLock()
  const topRef = useRef<Top | null>(null)
  const gate = useRef(new ScanGate(2000))
  topRef.current = top

  const lines = sortedLines(cart.data?.lines)
  const count = cart.data?.totals.item_count ?? 0
  const total = Number.parseFloat(cart.data?.totals.reward_total ?? '0') || 0
  const qtyOf = useCallback((sku: string) => cart.data?.lines.find((l) => l.item.sku === sku)?.qty ?? 0, [cart.data])

  const handleCodeRef = useRef<(raw: string, from: 'camera' | 'typed' | 'link', format?: string) => void>(() => undefined)
  const typeOnly = typeOnlyMode()
  // The decoder loads with this view and never before (Dash Update #185: not on sign-in). The camera hook asks for it as
  // the camera starts; this starts it a moment sooner, also while a tag's link holds the camera back. A phone with a
  // built-in reader loads no file at all (core `loadDetector`).
  useEffect(() => {
    if (!typeOnly) loadDetector().catch(() => undefined)
  }, [typeOnly])
  const overlayOpen = sheet != null || info != null || feel != null
  const camera = useQrCamera({
    // A tag's QR link shows its item first: the camera (and its permission question) waits until that tag is put away.
    enabled: !typeOnly && !top?.fromLink,
    paused: mode !== 'scan' || overlayOpen,
    onDecode: (raw, format) => handleCodeRef.current(raw, 'camera', format),
  })

  // Every code read gets an answer (owner 2026-10-15, APP D14, D15): a buzz, then a tag, or what the code is. Only tag
  // codes are looked up. A tag's link (the address, or the top bar's search on /scan) puts away what is up first.
  handleCodeRef.current = (raw, from, format) => {
    camera.poke()
    const was = topRef.current
    if (was && from !== 'link') return
    if (was) gate.current.hold(was.gateKey ?? was.sku)
    const code = classifyCode(raw, format)
    const text = raw.trim()
    const gateKey = code.kind === 'tag' ? code.sku : `raw:${text}`
    if (from === 'camera' && !gate.current.accept(gateKey)) return
    navigator.vibrate?.(15)
    const key = Date.now() + Math.random()
    const next: Top = { key, sku: code.kind === 'tag' ? code.sku : text, lookup: null, code, gateKey, fromLink: from === 'link' }
    topRef.current = next
    setTop(next)
    setMode('card')
    if (code.kind !== 'tag') return
    void lookupTag(code.sku).then((lookup) => {
      setTop((t) => (t && t.key === key ? { ...t, lookup } : t))
    })
  }

  // A tag's QR link opens that tag, once; the SKU comes off the address so Back and a reload don't open it again. One
  // that arrives later (the top bar's search while this screen is open) opens the same way.
  const tagParam = params.get('tag')
  const opened = useRef<string | null>(null)
  useEffect(() => {
    if (!tagParam) {
      opened.current = null
      return
    }
    if (opened.current === tagParam) return
    opened.current = tagParam
    setParams((prev) => {
      const next = new URLSearchParams(prev)
      next.delete('tag')
      return next
    }, { replace: true })
    handleCodeRef.current(tagParam, 'link')
  }, [tagParam]) // eslint-disable-line react-hooks/exhaustive-deps

  const found = top?.lookup?.status === 'found' ? top.lookup.item : null
  const canAdd = !!found && found.available
  const inTrip = found ? qtyOf(found.sku) : 0
  const answer = mode === 'card' ? answerFor(top) : null

  const closeCard = () => {
    const t = topRef.current
    if (t) gate.current.hold(t.gateKey ?? t.sku)
    topRef.current = null
    setTop(null)
    setMode('scan')
    camera.poke()
  }
  /** [Scan again] on an answer: back to the camera, and that same code is ignored for 3 s (APP D14). */
  const scanAgain = () => {
    const t = topRef.current
    if (t) gate.current.ignore(t.gateKey ?? t.sku, SCAN_AGAIN_IGNORE_MS)
    topRef.current = null
    setTop(null)
    setMode('scan')
    camera.poke()
  }
  const pass = () => {
    if (found) void actions.passItem(found.sku)
    closeCard()
  }
  const add = () => {
    if (!found || !found.available) return
    if (inTrip > 0) quiet(actions.setCartQty({ sku: found.sku, qty: inTrip + 1 }))
    else quiet(actions.addToCart(found))
    closeCard()
  }
  // The summary row flips between the camera and the trip's lines (owner 2026-10-13); a tag that is up is put away.
  const toggleTrip = () => {
    const t = topRef.current
    if (t && mode === 'card') gate.current.hold(t.sku)
    topRef.current = null
    setTop(null)
    setMode((m) => (m === 'trip' || m === 'item' ? 'scan' : 'trip'))
  }
  // A trip line's tag again (APP D12): the line's item at once, refreshed in the background (not counted as a scan).
  const openLine = (line: ThriftPlusCartLine) => {
    const key = Date.now() + Math.random()
    const next: Top = { key, sku: line.item.sku, lookup: { status: 'found', item: line.item } }
    topRef.current = next
    setTop(next)
    setMode('item')
    void lookupTag(line.item.sku, { again: true }).then((lookup) => {
      if (lookup.status === 'found') setTop((t) => (t && t.key === key ? { ...t, lookup } : t))
    })
  }
  const backToTrip = () => {
    topRef.current = null
    setTop(null)
    setMode('trip')
  }
  const removeShown = () => {
    const line = lines.find((l) => l.item.sku === top?.sku)
    if (line) removeLine(line)
    backToTrip()
  }

  // A laptop: right arrow adds, left arrow or Escape passes; on a trip line's tag, they go back to the trip.
  useEffect(() => {
    if ((mode !== 'card' && mode !== 'item') || overlayOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return
      if (mode === 'item') {
        if (e.key === 'ArrowLeft' || e.key === 'Escape') backToTrip()
        return
      }
      if (answer) {
        if (e.key === 'ArrowLeft' || e.key === 'Escape') scanAgain()
        return
      }
      if (e.key === 'ArrowRight') add()
      if (e.key === 'ArrowLeft' || e.key === 'Escape') pass()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const cameraSideways = sideways && mode === 'scan' && !overlayOpen
  // A code read while sideways: the tag is ready underneath ("Got it": turn the phone upright).
  const readSideways = sideways && mode === 'card' && !overlayOpen
  const tripOpen = mode === 'trip' || mode === 'item'
  const linkJoin = mode === 'card' && !!top?.fromLink && isGuest && !answer ? onJoin : undefined
  const onReturns = (ok: boolean) => setInfo(RETURNS_INFO[ok ? 'yes' : 'no'])
  const word = tripWords(isGuest)

  return (
    <div className="tr" data-testid="trip-scanner" data-mode={mode} onPointerDown={() => camera.poke()}>
      {/* The scanning screen: exactly the space between the site's top rows and its bottom bar. */}
      <div className="tr-main">
      <div className="tr-stage" data-testid="stage">
        <div className="tr-cam">
          <Camera
            camera={camera}
            // No highlight flash (owner 11-19): the slot's new content is the sign a code was read (and the buzz).
            flash={false}
            onCode={(code) => handleCodeRef.current(code, 'typed')}
            onHelp={() => setSheet('camera')}
            typeOnly={typeOnly}
            lock={lock}
            fullBleed={cameraSideways}
            underneath={mode !== 'scan' || overlayOpen}
          />
        </div>
        <div className="tr-slot" aria-live="polite">
          {top && mode !== 'trip' ? (
            <TagSlot
              key={`${top.key}:${top.lookup?.status ?? 'wait'}`}
              top={top}
              answer={answer}
              isGuest={isGuest}
              verified18={member?.verified_18 ?? false}
              qty={inTrip}
              onAdd={mode === 'card' && canAdd ? add : null}
              onPass={mode === 'item' ? backToTrip : answer ? scanAgain : pass}
              onFeel={found ? () => setFeel({ step: 'reasons' }) : undefined}
              onRetail={() => setInfo(RETAIL_INFO)}
              onReturns={onReturns}
              onJoin={linkJoin}
            />
          ) : (
            <EmptySlot onAbout={() => setSheet('about')} />
          )}
        </div>
        {mode === 'trip' ? (
          <div className="tr-over" data-testid="trip-view">
            <TripLines onOpen={openLine} />
          </div>
        ) : null}
      </div>

      {/* Every action lives here (owner 2026-10-12), each in the same place on every screen. */}
      <div className="tr-acts" data-testid="actions">
        {mode === 'trip' ? (
          <button type="button" className="btn btn-ink tr-span" onClick={() => setMode('scan')} data-testid="scan-more">
            <IconScan />
            Scan more
          </button>
        ) : mode === 'item' ? (
          <>
            <button type="button" className="btn btn-line" onClick={removeShown} data-testid="remove-line">
              <IconTrash className="tr-red" />
              Remove
            </button>
            <button type="button" className="btn btn-ink" onClick={backToTrip} data-testid="back-to-trip">
              <IconBack />
              Back to trip
            </button>
          </>
        ) : answer ? (
          <>
            <button type="button" className="btn btn-ink" onClick={scanAgain} data-testid="scan-again">
              <IconScan />
              Scan again
            </button>
            {top?.code?.kind === 'link' ? (
              <a className="btn btn-line" href={top.code.href} target="_blank" rel="noopener noreferrer" data-testid="open-link">
                <IconLink />
                Open link
              </a>
            ) : (
              <span className="tr-blank" aria-hidden="true" />
            )}
          </>
        ) : (
          <>
            <button type="button" className="btn btn-line" onClick={pass} disabled={mode !== 'card'} data-testid="pass">
              <IconClose />
              Pass
            </button>
            <button type="button" className="btn btn-ink" onClick={add} disabled={!canAdd} data-testid="add">
              <IconPlus />
              {found && !found.available ? 'Sold' : inTrip > 0 ? 'Add another' : 'Add to trip'}
            </button>
          </>
        )}
      </div>

      <button
        type="button"
        className={`tr-sum${tripOpen ? ' tr-on' : ''}`}
        onClick={toggleTrip}
        data-testid="trip-summary"
        aria-label={`This trip: ${count} items, +${bucks(total)} ${word}. ${tripOpen ? 'Back to the scanner' : 'See the trip'}`}
        aria-expanded={tripOpen}
      >
        <span className="tr-sum-i">
          <IconBag />
          <span className="tr-sum-n tn" data-testid="trip-count">{count}</span>
        </span>
        <span className="tr-sum-w">This trip</span>
        <span className="tr-sum-t tn" data-target="trip-total">
          <b>{total > 0 ? '+' : ''}{bucks(total)}</b>
          <span>{word}</span>
        </span>
        {tripOpen ? <IconUp /> : <IconDown />}
      </button>
      </div>

      {/* Under the scanning screen (members, mobile browsers): it never squeezes the camera or moves the buttons. */}
      {member ? <HomeScreenCard variant="banner" /> : null}
      <UndoToast />

      {sheet === 'about' ? <AboutSheet onClose={() => setSheet(null)} /> : null}
      {sheet === 'camera' ? <CameraHelp onClose={() => setSheet(null)} onRetry={camera.wake} /> : null}
      {info ? <InfoSheet info={info} onClose={() => setInfo(null)} /> : null}
      {feel && found ? (
        <FeelSheet
          item={found}
          feel={feel}
          onFeel={setFeel}
          onSend={(reason, wouldPay) => void actions.sendPriceFeel({ sku: found.sku, feel: { reason, would_pay: wouldPay } })}
          onClose={() => setFeel(null)}
        />
      ) : null}
      {sideways ? (cameraSideways ? <SidewaysScanPill lock={lock} /> : readSideways ? <SidewaysGotIt /> : <TurnUpright lock={lock} />) : null}
    </div>
  )
}
