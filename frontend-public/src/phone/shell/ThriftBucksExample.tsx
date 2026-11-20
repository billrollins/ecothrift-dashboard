/**
 * The standard ThriftBucks example (rulebook V12, owner 2026-11-20: "a TOTALLY understandable ... STUPID easy
 * explanation (this needs to be very consistent across the app)"). One normal item: retail, our tag, the ThriftBucks it
 * carries, then the member's two choices and the non-member's price. Every surface that explains ThriftBucks uses
 * EXAMPLE's numbers and words; change them only in the rulebook first.
 *
 * Laid out as a store sign, in the order it happens (critic cycle 2026-11-20, the AI panel): the tag; a growth strip
 * that SHOWS the V12 sentence (7 grey days with none, then bars that grow to today's, with no day number, so nothing
 * says 20.00 at day 7); two equal boxes with "or" between them; the non-member as a third row. Static, so the same
 * design prints as the poster and the register's sheet and serves as the scanner's info sheet.
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

/** The growth strip: the first 7 days carry none, then the bars grow day by day; the last bar is today's (no day number:
 *  the owner, 11-20, "after 7 days items START getting thrift bucks", never 20.00 at day 7). */
const FIRST_DAYS = 7
const GROW = [16, 22, 28, 35, 41, 48, 54, 61, 67, 74, 80, 87, 93, 100]

/** Owner 2026-11-20 (round 8 screens): ".00" only at the top (retail, our tag); whole numbers everywhere else read
 *  easier ("$100", "20 ThriftBucks"). Never a "$" next to ThriftBucks. */
const money = (n: number) => `$${n.toFixed(2)}`
const whole = (n: number) => `$${n}`

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
        <h2 id="tbx-h" className="disp">
          <span>Example ·</span> A normal item
        </h2>
        <div className="tbx-item">
          <div>
            <span className="tbx-k">Retail</span>
            <s className="tn">{money(EXAMPLE.retail)}</s>
          </div>
          <div>
            <span className="tbx-k">Our tag</span>
            <Tag price={EXAMPLE.tag} />
          </div>
        </div>
        <p className="tbx-carry">ThriftBucks start after 7 days on most items.</p>
        <div className="tbx-bars">
          <div className="tbx-wait" aria-hidden="true">
            <span>
              First 7 days
              <br />
              on our floor:
              <br />
              none yet
            </span>
            <div>
              {Array.from({ length: FIRST_DAYS }, (_, i) => (
                <i key={i} className="w" />
              ))}
            </div>
          </div>
          <div className="tbx-rise">
            <p>They grow every day.</p>
            <div aria-hidden="true">
              {GROW.map((h, i) => (
                <i key={i} className={i === GROW.length - 1 ? 'now' : undefined} style={{ height: `${h}%` }} />
              ))}
            </div>
          </div>
        </div>
        <p className="tbx-now">
          This one carries today:
          <b className="tn">{EXAMPLE.bucks} ThriftBucks</b>
        </p>
        <p className="tbx-pick">Thrift+ members pick one</p>
        <div className="tbx-two">
          <div>
            <small>Keep them</small>
            <b className="tn">
              <span>Pay</span> {whole(EXAMPLE.tag)}
            </b>
            <em>Full value</em>
            <span>
              <strong>{EXAMPLE.bucks} ThriftBucks</strong>
              off your next visit
            </span>
          </div>
          <i className="tbx-or" aria-hidden="true">
            or
          </i>
          <div>
            <small>Use them now</small>
            <b className="tn">
              <span>Pay</span> {whole(EXAMPLE.today)}
            </b>
            <em>Half value</em>
            <span>
              <strong>{EXAMPLE.bucks} ThriftBucks</strong>
              {whole(EXAMPLE.tag - EXAMPLE.today)} off today
            </span>
          </div>
        </div>
        <p className="tbx-non">
          <b>Non-member:</b> pays <b className="tn">{whole(EXAMPLE.tag)}</b>. All sales final.
        </p>
        {joinHref ? (
          <a className="btn tbx-join" href={joinHref}>
            Join Thrift+ free
          </a>
        ) : null}
      </div>
    </div>,
    document.body,
  )
}
