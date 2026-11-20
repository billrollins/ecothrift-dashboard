/**
 * The standard ThriftBucks example (rulebook V12, owner 2026-11-20: "a TOTALLY understandable ... STUPID easy
 * explanation (this needs to be very consistent across the app)"). One normal item: retail, our tag, the ThriftBucks it
 * carries, then the member's two choices and the non-member's price. Every surface that explains ThriftBucks uses
 * EXAMPLE's numbers and words; change them only in the rulebook first.
 *
 * Shown in a window over the page (fixed, so nothing on the page moves): the × button, a tap outside, or Escape closes
 * it. It opens with no animation.
 */
import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import './ThriftBucksExample.css'
import { Tag } from './Tag'

/** The standard example (rulebook V12). The instant choice is half the ThriftBucks' value (B1). */
export const EXAMPLE = {
  retail: 200,
  tag: 100,
  bucks: 20,
  today: 90, // tag - bucks / 2
} as const

const money = (n: number) => `$${n.toFixed(2)}`
const bucks = (n: number) => n.toFixed(2)

export function ThriftBucksExample({ onClose, joinHref }: { onClose: () => void; joinHref?: string }) {
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    box.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])
  return createPortal(
    <div className="tbx-back" onClick={onClose}>
      <div ref={box} tabIndex={-1} className="tbx" role="dialog" aria-modal="true" aria-labelledby="tbx-h" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="tbx-x" aria-label="Close" onClick={onClose}>
          ×
        </button>
        <p className="lbl">Example</p>
        <h2 id="tbx-h" className="disp">
          A normal item
        </h2>
        <div className="tbx-item">
          <div>
            <span className="tbx-k">Retail</span>
            <s className="tn">{money(EXAMPLE.retail)}</s>
          </div>
          <div>
            <span className="tbx-k">Our tag</span>
            <Tag price={EXAMPLE.tag} cents="auto" />
          </div>
        </div>
        <p className="tbx-carry">
          After 7 days on our floor, most items start to carry ThriftBucks. They grow every day.
        </p>
        <p className="tbx-now">
          This one carries today
          <b className="tn">{bucks(EXAMPLE.bucks)} ThriftBucks</b>
        </p>
        <p className="tbx-pick">Thrift+ members pick one</p>
        <div className="tbx-two">
          <div>
            <small>Keep them</small>
            <b className="tn">Pay {money(EXAMPLE.tag)}</b>
            <span>{bucks(EXAMPLE.bucks)} ThriftBucks come off your next visit</span>
          </div>
          <div>
            <small>Use them now</small>
            <b className="tn">Pay {money(EXAMPLE.today)}</b>
            <span>today</span>
          </div>
        </div>
        <p className="tbx-non">
          Non-member: pays <b className="tn">{money(EXAMPLE.tag)}</b>. All sales final.
        </p>
        {joinHref ? (
          <a className="btn tbx-join" href={joinHref}>
            Join free
          </a>
        ) : null}
      </div>
    </div>,
    document.body,
  )
}
