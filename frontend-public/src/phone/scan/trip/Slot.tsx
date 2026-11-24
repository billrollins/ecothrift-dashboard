/**
 * The ONE answer slot under the camera (the mockup's pages/scan.html): always there, always the same size. Before the
 * first scan it says "Point at a tag"; then a scanned tag (the live ScanCard / FoundTag: name, returns badge, retail,
 * 18+ and Sold, our price on the tag block, the ThriftBucks, "N in your trip", "Price feel off?") or the answer a code
 * gets. A new answer swaps in place with a 100 ms fade; the numbers sit in the same place on every tag; nothing grows,
 * slides or pushes (owner 11-19: "CALM DOWN"). A tag swipes right to add and left to pass.
 */
import { bucks } from '../../lib/format'
import { money, type ThriftPlusItemCard } from '../core'
import { IconCheck } from '../ui'
import { CantFindItem, LookingUp, NoConnection, NotOurTag, OurLink } from './Answers'
import { useSwipe } from './gestures'
import { PriceTag, ReturnsBadge } from './parts'
import type { Answer, Top } from './state'

/** Before the first scan, and after each Pass or Add. "What is Thrift+?" opens the about sheet. */
export function EmptySlot({ onAbout }: { onAbout: () => void }) {
  return (
    <div className="tr-in tr-empty" data-testid="scan-empty">
      <span className="tag tn tr-ghost" aria-hidden="true">
        <small>$</small>00<sup>00</sup>
      </span>
      <h2 className="disp">Point at a tag</h2>
      <button type="button" className="sa-link tr-about-link" onClick={onAbout} data-testid="about-thriftplus" aria-label="What is Thrift+?">
        What is Thrift+?
      </button>
    </div>
  )
}

type CardProps = {
  top: Top
  answer: Answer | null
  isGuest: boolean
  verified18: boolean
  qty: number
  /** Null: this tag cannot go in the trip (sold, an answer, a trip line seen again). */
  onAdd: (() => void) | null
  onPass: () => void
  onFeel?: () => void
  onRetail: () => void
  onReturns: (ok: boolean) => void
  /** A tag opened from its QR on a phone that is not a member's: the ThriftBucks box opens Join. */
  onJoin?: () => void
}

/** What is in the slot for a code or a tag. Mounted fresh (by key) for each one, so it fades in. */
export function TagSlot({ top, answer, isGuest, verified18, qty, onAdd, onPass, onFeel, onRetail, onReturns, onJoin }: CardProps) {
  const swipe = useSwipe(onAdd, onPass)
  const lookup = top.lookup
  let body
  if (answer === 'not-ours') body = <NotOurTag />
  else if (answer === 'link' && top.code?.kind === 'link') body = <OurLink shown={top.code.shown} />
  else if (answer === 'not-found' || lookup?.status === 'not_found') body = <CantFindItem code={top.sku} onAsIs={() => onReturns(false)} />
  else if (!lookup) body = <LookingUp sku={top.sku} />
  else if (lookup.status !== 'found') body = <NoConnection message={lookup.message} sku={lookup.sku} />
  else body = <FoundTag item={lookup.item} isGuest={isGuest} verified18={verified18} qty={qty} onFeel={onFeel} onRetail={onRetail} onReturns={onReturns} onJoin={onJoin} />
  return (
    <div className="tr-in" data-testid="scan-card" {...swipe.handlers} style={swipe.style}>
      {body}
    </div>
  )
}

/** The price on the tag block: one size for $9.99 to $99.99, smaller for $100 and up, smaller again from $1,000. */
function tagSize(price: number): string {
  return price >= 1000 ? ' tr-t4' : price >= 100 ? ' tr-t3' : ''
}

function FoundTag({ item, isGuest, verified18, qty, onFeel, onRetail, onReturns, onJoin }: {
  item: ThriftPlusItemCard
  isGuest: boolean
  verified18: boolean
  qty: number
  onFeel?: () => void
  onRetail: () => void
  onReturns: (ok: boolean) => void
  onJoin?: () => void
}) {
  const reward = Number.parseFloat(item.reward) || 0
  const price = Number.parseFloat(item.price) || 0
  const notes: Array<{ text: string; tone: string }> = []
  if (!item.available) notes.push({ text: 'Sold', tone: 'tr-bad' })
  if (item.age_restricted) notes.push({ text: verified18 ? '18+' : '18+: ID checked at the register', tone: 'tr-warn' })
  const note = item.returnable && item.return_note ? item.return_note : ''

  const band = item.black_friday ? (
    <span className="tr-ans-none" data-testid="bf-band">Fri &amp; Sat price for everyone</span>
  ) : reward > 0 ? (
    <>
      <span className="tr-big tn">+{bucks(reward)}</span>
      <span className="tr-ans-w">{isGuest ? 'ThriftBucks for members' : 'ThriftBucks back'}</span>
      {/* Joining starts in the app now (owner 2026-10-15, APP D9). */}
      <span className="tr-ans-s">{isGuest ? 'Free to join' : 'saved for your next visit'}</span>
    </>
  ) : (
    <span className="tr-ans-none">No ThriftBucks on this item yet</span>
  )

  const feelLink = onFeel ? (
    <button type="button" className="tr-feel" onPointerDown={(e) => e.stopPropagation()} onClick={onFeel} data-testid="price-feel">
      Price feel off? Tell us.
    </button>
  ) : null

  return (
    <>
      <div className="tr-hd">
        {qty > 0 ? (
          <span className="lbl tr-intrip">
            <IconCheck /> {qty} in your trip
          </span>
        ) : (
          <span className="lbl tn tr-sku">Tag {item.sku}</span>
        )}
        <ReturnsBadge ok={item.returnable} onClick={() => onReturns(item.returnable)} />
      </div>
      <h2 className="tr-nm">{item.title}</h2>
      <div className="tr-meta tn">
        {item.retail_price ? (
          <button type="button" className="tr-retail" onPointerDown={(e) => e.stopPropagation()} onClick={onRetail} data-testid="retail"
            aria-label={`Retail ${money(item.retail_price)}. About retail prices`}>
            <span className="tr-dot">Retail</span> <s>{money(item.retail_price)}</s>
          </button>
        ) : null}
        {notes.map((n) => (
          <b key={n.text} className={n.tone}>{n.text}</b>
        ))}
        {/* The category only where nothing more important needs the room. */}
        {notes.length === 0 && !(note && feelLink) ? <span className="tr-cat">{item.category_label}</span> : null}
        {/* A closed-day note takes the whole last row: "Price feel off?" moves up here, at the end. */}
        {note ? feelLink : null}
      </div>
      <div className="tr-nums">
        <div className="tr-tc">
          <span className="lbl">{item.black_friday ? 'Black Friday' : 'Our price'}</span>
          <PriceTag price={price} className={tagSize(price)} />
        </div>
        {onJoin && !item.black_friday ? (
          <button type="button" className={`tr-ans tr-join${reward > 0 ? '' : ' tr-ans-0'}`} data-testid="get-thrift-plus" onPointerDown={(e) => e.stopPropagation()}
            onClick={onJoin}>
            <span className="tr-rb" data-testid="reward-band">{band}</span>
            <span className="tr-go">Get Thrift+ ›</span>
          </button>
        ) : (
          <div className={`tr-ans${reward > 0 ? '' : ' tr-ans-0'}`}>
            <span className="tr-rb" data-testid="reward-band">{band}</span>
          </div>
        )}
      </div>
      <div className="tr-foot">
        {note ? <span className="tr-note" data-testid="return-note">{note}</span> : feelLink}
      </div>
    </>
  )
}
