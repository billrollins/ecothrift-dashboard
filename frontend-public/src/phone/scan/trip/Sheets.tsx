/**
 * The trip's sheets (the live tripSheets.tsx, owner 2026-10-12 and 10-13), on the scanner's Sheet (ui.tsx: a fade, no
 * slide; the page under it never moves):
 * - what Thrift+ is (the terms page's words and a link to the full terms);
 * - a short piece of information (retail prices, 3-day returns or AS IS);
 * - "Price feel off?": what feels off, what they'd pay, then thanks with a little information.
 * Every line is the live one, word for word (coordinator's call 4).
 */
import type { ReactNode } from 'react'
import { money, wouldPayChoices, type PriceFeelReason, type ThriftPlusItemCard } from '../core'
import { asset } from '../../shell/Tag'
import { ThriftBucksExampleBody } from '../../shell/ThriftBucksExample'
import { Button, IconCheck, IconLink, Sheet } from '../ui'

export const TERMS_URL = 'https://ecothrift.us/terms'

export interface Info {
  title: string
  text: string
}

// The owner's words (2026-10-13), tidied.
export const RETAIL_INFO: Info = {
  title: 'About retail prices',
  text: "Retail prices come straight from the retailer; we don't set them. If you've seen it for less, it may be on clearance or an "
    + 'online sale, or the retailer may have changed its price recently. One store can also charge a different price than another '
    + 'store of the same retailer.',
}
const PRICING_INFO: Info = {
  title: 'How we price',
  text: 'Pricing used items is tricky. We start well below retail. After 7 days on our floor, most items start to carry '
    + 'ThriftBucks, and they grow every day. That way every price gets to just right in time.',
}
export const RETURNS_INFO: Record<'yes' | 'no', Info> = {
  yes: {
    title: 'Thrift+ 3-day returns',
    text: 'This item qualifies. Bring it back within 3 days, for any reason: 80% of what you paid comes back as Thrift+ credit. '
      + 'Your receipt marks each item that qualifies.',
  },
  no: {
    title: 'Sold AS IS',
    text: "This item can't be returned. It's marked AS IS, or it doesn't qualify for 3-day returns (like clothing, parts and "
      + 'low-priced items). AS IS sales are final.',
  },
}
const FEEL_DONE: Record<PriceFeelReason, { title: string; text: string; info?: Info }> = {
  too_high: { title: "Thanks, we'll review it", text: 'We recorded your answer.', info: PRICING_INFO },
  retail_wrong: { title: 'Thanks for letting us know', text: 'We recorded your comment and will review it.', info: RETAIL_INFO },
  too_low: { title: 'Thanks for looking out!', text: "We'll review it to make sure it wasn't a mistake." },
  wrong_info: { title: 'Thanks for letting us know', text: "We'll check the item's details and fix the tag if it's wrong." },
  other: { title: 'Thanks for letting us know', text: 'We recorded your comment and will review it.' },
}

/** What Thrift+ is: the terms page's "All you need to know", then the full terms. */
export function AboutSheet({ onClose }: { onClose: () => void }) {
  const facts: Array<{ title: string; text: string }> = [
    { title: 'Free to join.', text: 'Nothing owed.' },
    // Same words as the live scanner's sheet (frontend tripSheets.tsx, v2.328.0) and the standard example (rulebook V12).
    { title: 'ThriftBucks on most items.', text: "After 7 days on our floor. They grow every day, up to 95% of the tag. Scan any tag to see today's ThriftBucks." },
    { title: 'Keep them.', text: 'They come off your next visit at full value: from the next day, for 30 days.' },
    { title: 'Or use them now.', text: "At 50% of their value, off today's price. Just tell the cashier." },
    { title: '3-day returns.', text: 'Bring a qualifying item back within 3 days, for any reason: 80% of what you paid comes back as Thrift+ credit.' },
    // "Non-member", never "guest", in customer words (owner 2026-10-15, APP D10).
    { title: 'Non-members pay the tag.', text: 'Everything a non-member buys is sold AS IS. All sales final.' },
  ]
  return (
    <Sheet label="What is Thrift+?" onClose={onClose} testId="thriftplus-sheet" className="tr-sheet tr-about">
      <div className="tr-about-band">
        <img src={asset('phone/thriftplus-wordmark-white.svg')} width={120} height={30} alt="Thrift+" />
      </div>
      <h2 className="tr-sheet-h">ThriftBucks, 3-day returns and more!</h2>
      {/* The standard example (rulebook V12): the same content as the home's Example window. */}
      <div className="tbx tbx-inline" data-testid="thriftbucks-example">
        <ThriftBucksExampleBody headingId="tbx-h-sheet" />
      </div>
      <ul className="tr-facts">
        {facts.map((p) => (
          <li key={p.title}>
            <span className="tr-fact-i" aria-hidden="true"><IconCheck /></span>
            <span>
              <b>{p.title}</b> {p.text}
            </span>
          </li>
        ))}
      </ul>
      <a className="btn btn-ink sa-wide tr-terms" href={TERMS_URL} target="_blank" rel="noopener" data-testid="terms-link">
        Read the full terms
        <IconLink />
      </a>
      <p className="tr-fine">ecothrift.us/terms · English and Español</p>
    </Sheet>
  )
}

/** A short piece of information (retail prices, returns). */
export function InfoSheet({ info, onClose }: { info: Info; onClose: () => void }) {
  return (
    <Sheet label={info.title} onClose={onClose} testId="info-sheet" className="tr-sheet">
      <h2 className="tr-sheet-h">{info.title}</h2>
      <p className="tr-sheet-p">{info.text}</p>
    </Sheet>
  )
}

export type Feel = { step: 'reasons' | 'too_high' } | { step: 'done'; reason: PriceFeelReason }

const FEEL_REASONS: Array<{ reason: PriceFeelReason; label: string }> = [
  { reason: 'too_high', label: 'Price is too high' },
  { reason: 'retail_wrong', label: 'Retail price is wrong' },
  { reason: 'wrong_info', label: 'Wrong item info' },
  { reason: 'too_low', label: 'Price is too low' },
  { reason: 'other', label: 'Something else' },
]

function Choice({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" className="tr-choice" onClick={onClick}>
      {children}
    </button>
  )
}

/**
 * What feels off, and for "too high", what they'd pay (the live scanner's questions, sent as before); then thanks,
 * we'll review it, with a little information for too high and for retail (owner 2026-10-13). Each step swaps in place
 * inside the same sheet.
 */
export function FeelSheet({ item, feel, onFeel, onSend, onClose }: {
  item: ThriftPlusItemCard
  feel: Feel
  onFeel: (feel: Feel) => void
  onSend: (reason: PriceFeelReason, wouldPay: string | null) => void
  onClose: () => void
}) {
  if (feel.step === 'done') {
    const done = FEEL_DONE[feel.reason]
    return (
      <Sheet label="Price feel off?" onClose={onClose} testId="feel-sheet" className="tr-sheet">
        <div className="tr-done" data-testid="feel-done">
          <span className="tr-done-i" aria-hidden="true"><IconCheck /></span>
          <h2 className="tr-sheet-h">{done.title}</h2>
          <p className="tr-sheet-p">{done.text}</p>
        </div>
        {done.info ? (
          <div className="tr-done-info">
            <b>{done.info.title}</b>
            <p>{done.info.text}</p>
          </div>
        ) : null}
        <Button kind="ink" wide onClick={onClose} testId="feel-close" className="tr-done-btn">
          Done
        </Button>
      </Sheet>
    )
  }
  const send = (reason: PriceFeelReason, wouldPay: string | null = null) => {
    onSend(reason, wouldPay)
    onFeel({ step: 'done', reason })
  }
  return (
    <Sheet label="Price feel off?" onClose={onClose} testId="feel-sheet" className="tr-sheet">
      <h2 className="tr-sheet-h">{feel.step === 'reasons' ? 'What feels off?' : "I'd buy it at"}</h2>
      <p className="tr-feel-of tn">{item.title} · {money(item.price)}</p>
      {feel.step === 'reasons' ? (
        <div className="tr-choices">
          {FEEL_REASONS.map((r) => (
            <Choice key={r.reason} onClick={() => (r.reason === 'too_high' ? onFeel({ step: 'too_high' }) : send(r.reason))}>
              {r.label}
            </Choice>
          ))}
        </div>
      ) : (
        <div className="tr-choices">
          <div className="tr-pays">
            {wouldPayChoices(item.price).map((c) => (
              <button key={c.under_pct} type="button" className="tr-pay tn" onClick={() => send('too_high', c.would_pay)}>
                {money(c.would_pay, true)}
              </button>
            ))}
          </div>
          <Choice onClick={() => send('too_high')}>Just too high</Choice>
        </div>
      )}
    </Sheet>
  )
}
