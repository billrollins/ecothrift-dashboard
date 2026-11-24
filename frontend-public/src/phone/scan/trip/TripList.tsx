/**
 * The trip's lines (the live TripScanner.tsx `TripView` / `TripLine`, owner 2026-10-12 to 10-15), on the mockup's rows
 * (pages/thriftplus.html: the tag block, the name, its ThriftBucks): tap a line for its tag again (APP D12), − N + to
 * change how many (always shown, never opened by a tap), slide a line left to remove it, with Undo; "Clear my trip" at
 * the end. ThriftBucks only: no dollar total (coordinator's call 2).
 *
 * `TripList` (the lines and the totals band) is also the "My trip" section of /thriftplus (pages/ThriftPlus.tsx); the
 * scanner shows `TripLines` over its camera and slot, with its own summary row under the buttons.
 *
 * The trip's changes and their Undo live here, so the scanner (Remove on a line's tag) and /thriftplus share them. Each
 * change waits for the server's answer (the store replaces the trip with it); a failed change stays silent (as live).
 */
import { useSyncExternalStore } from 'react'
import { bucks } from '../../lib/format'
import type { TripListProps } from '../contracts'
import { money, type ThriftPlusCartLine } from '../core'
import { actions, useCart, useScanSession } from '../store'
import { IconTrash } from '../ui'
import { useSlideToRemove } from './gestures'
import { PriceTag, QtyStepper } from './parts'
import './trip.css'

// ── Undo ────────────────────────────────────────────────────────────────────

type Toast = { id: number; text: string; undo: () => void }
let toast: Toast | null = null
let toastTimer: number | null = null
const toastListeners = new Set<() => void>()

function setToast(next: Toast | null) {
  toast = next
  toastListeners.forEach((fn) => fn())
}

/** "Removed Oak Bookshelf · Undo", for 4.5 seconds (the live `useUndo`). */
export function showUndo(text: string, undo: () => void): void {
  if (toastTimer != null) window.clearTimeout(toastTimer)
  setToast({ id: Date.now(), text, undo })
  toastTimer = window.setTimeout(() => setToast(null), 4500)
}

/** Tests only. */
export function _resetUndo(): void {
  if (toastTimer != null) window.clearTimeout(toastTimer)
  toastTimer = null
  setToast(null)
}

function subscribeToast(fn: () => void) {
  toastListeners.add(fn)
  return () => {
    toastListeners.delete(fn)
  }
}
const getToast = () => toast

/** The Undo bar: a layer over the page above the bottom bar (it covers, never pushes). */
export function UndoToast() {
  const t = useSyncExternalStore(subscribeToast, getToast, getToast)
  if (!t) return null
  return (
    <div className="tr-undo" role="status" data-testid="undo-toast" key={t.id}>
      <span>{t.text}</span>
      <button
        type="button"
        onClick={() => {
          t.undo()
          setToast(null)
        }}
      >
        Undo
      </button>
    </div>
  )
}

// ── The trip's changes ──────────────────────────────────────────────────────

const quiet = (p: Promise<unknown>) => void p.catch(() => undefined)

/** Take a whole line out, with Undo (which puts it back as it was). */
export function removeLine(line: ThriftPlusCartLine): void {
  quiet(actions.removeFromCart(line.item.sku))
  showUndo(`Removed ${line.item.title}`, () => quiet(actions.restoreLines([line])))
}

export function setLineQty(line: ThriftPlusCartLine, qty: number): void {
  if (qty <= 0) removeLine(line)
  else quiet(actions.setCartQty({ sku: line.item.sku, qty }))
}

/** Clear my trip, with Undo (the lines go back one at a time, oldest first). */
export function clearTrip(lines: ThriftPlusCartLine[]): void {
  const before = [...lines].reverse()
  quiet(actions.clearCart())
  showUndo('Cleared your trip', () => quiet(actions.restoreLines(before)))
}

/** Newest first. */
export function sortedLines(lines: ThriftPlusCartLine[] | undefined): ThriftPlusCartLine[] {
  return [...(lines ?? [])].sort((a, b) => b.added_at.localeCompare(a.added_at))
}

// ── The lines ───────────────────────────────────────────────────────────────

function TripLine({ line, onOpen }: { line: ThriftPlusCartLine; onOpen?: () => void }) {
  const { item, qty } = line
  const reward = (Number.parseFloat(item.reward) || 0) * qty
  const price = Number.parseFloat(item.price) || 0
  const slide = useSlideToRemove(() => removeLine(line))
  return (
    <div className="tr-line" data-testid="swipe-row" aria-label={item.title}>
      <div className="tr-line-rm" aria-hidden="true" style={{ opacity: slide.showing ? 1 : 0 }}>
        <IconTrash />
        Remove
      </div>
      <div
        className={`tr-line-in${onOpen ? ' tr-tap' : ''}`}
        {...slide.handlers}
        style={slide.style}
        role={onOpen ? 'button' : undefined}
        tabIndex={onOpen ? 0 : undefined}
        onClick={() => {
          if (!slide.moved.current) onOpen?.()
        }}
        onKeyDown={(e) => {
          if (onOpen && (e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) {
            e.preventDefault()
            onOpen()
          }
        }}
      >
        <div className="tr-line-tag">
          <PriceTag price={price} />
          <span className="tr-each">
            {qty > 1 ? 'each' : null}
            {!item.returnable ? <span className="tr-asis-chip">AS IS</span> : null}
          </span>
        </div>
        <div className="tr-line-txt">
          <span className="tr-line-nm">{item.title}</span>
          <span className="tr-line-sub tn">
            {item.black_friday ? (
              <span className="tr-plus">Black Friday</span>
            ) : (
              <span className={reward > 0 ? 'tr-plus' : 'tr-zero'}>
                {reward > 0 ? `+ ${bucks(reward)}` : '0.00'} ThriftBucks
              </span>
            )}
          </span>
        </div>
        <QtyStepper qty={qty} onChange={(q) => setLineQty(line, q)} />
      </div>
    </div>
  )
}

/** The lines, the hint and Clear my trip (or the empty state, then `children`). */
export function TripLines({ onOpen, children }: TripListProps) {
  // The trip loads once the session is known (on /thriftplus nothing else may have asked yet; the store asks once).
  useScanSession()
  const cart = useCart()
  const lines = sortedLines(cart.data?.lines)
  if (lines.length === 0) {
    return (
      <div className="tr-list" data-testid="trip-lines">
        <div className="tr-none">
          <h2>Nothing in your trip yet</h2>
          <p>Scan a tag to see its price and the ThriftBucks it gives back.</p>
        </div>
        {children}
      </div>
    )
  }
  return (
    <div className="tr-list" data-testid="trip-lines">
      {lines.map((l) => (
        <TripLine key={l.item.sku} line={l} onOpen={onOpen ? () => onOpen(l) : undefined} />
      ))}
      <p className="tr-hint">
        {onOpen ? 'Tap an item to see its tag · − and + change how many · slide left to remove' : '− and + change how many · slide left to remove'}
      </p>
      <button type="button" className="sa-link tr-clear" data-testid="clear-trip" onClick={() => clearTrip(lines)}>
        Clear my trip
      </button>
      {children}
    </div>
  )
}

/** The trip's count and the ThriftBucks it collects: "This trip · 3 items · +30.00 ThriftBucks back". */
export function tripWords(isGuest: boolean): string {
  return isGuest ? 'ThriftBucks for members' : 'ThriftBucks back'
}

/** The trip's lines and its totals band (for /thriftplus: "My trip"). */
export function TripList({ onOpen, children }: TripListProps) {
  const cart = useCart()
  const count = cart.data?.totals.item_count ?? 0
  const total = Number.parseFloat(cart.data?.totals.reward_total ?? '0') || 0
  // Black Friday (#220): the trip's total at the Black Friday price, the same for everyone; no ThriftBucks.
  const bf = (cart.data?.lines ?? []).some((l) => l.item.black_friday)
  const priceTotal = Number.parseFloat(cart.data?.totals.price_total ?? '0') || 0
  return (
    <div className="tr-triplist" data-testid="trip-list">
      <TripLines onOpen={onOpen}>{children}</TripLines>
      {count > 0 && bf ? (
        <div className="tr-band" data-testid="trip-band">
          <span className="lbl tn">This trip · {count} {count === 1 ? 'item' : 'items'}</span>
          <span className="tr-band-n tn">
            <b>{money(priceTotal)}</b>
            <span>Black Friday</span>
          </span>
          <span className="fine">Before tax. The same price for everyone.</span>
        </div>
      ) : count > 0 ? (
        <div className="tr-band" data-testid="trip-band">
          <span className="lbl tn">This trip · {count} {count === 1 ? 'item' : 'items'}</span>
          <span className="tr-band-n tn">
            <b>+{bucks(total)}</b>
            <span>ThriftBucks back</span>
          </span>
          <span className="fine">Thrift+ members. Most items.</span>
        </div>
      ) : null}
      <UndoToast />
    </div>
  )
}
