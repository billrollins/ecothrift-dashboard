/**
 * Home 1, the specials (mockup blocks/10-specials.html): cards swiped sideways, the next card's edge showing.
 * Normal days: Don't shop without Thrift+, the Black Friday teaser (to Nov 28), BO-HO-GO (to Dec 31), 3-day returns.
 * The Black Friday set (by useDay(), on while the Black Friday window is on, #220) shares the card shapes and sizes.
 */
import { useRef, useState, type ReactNode } from 'react'
import BlackFridayHero from './BlackFridayHero'
import { Link } from 'react-router-dom'
import { useHome } from '../../lib/boot'
import { useDay } from '../../lib/day'
import { useMember } from '../../lib/member'
import { IconCheck } from '../../shell/icons'
import { ThriftBucksExample } from '../../shell/ThriftBucksExample'
import { Tag } from '../../shell/Tag'
import './Specials.css'

function Rail({ children, n }: { children: ReactNode; n: number }) {
  const rail = useRef<HTMLDivElement>(null)
  const [at, setAt] = useState(0)
  function onScroll() {
    const el = rail.current
    const card = el?.firstElementChild as HTMLElement | null
    if (!el || !card || !card.offsetWidth) return
    const i = Math.min(n - 1, Math.max(0, Math.round(el.scrollLeft / (card.offsetWidth + 10))))
    if (i !== at) setAt(i)
  }
  return (
    <>
      <div className="rail" ref={rail} onScroll={onScroll}>
        {children}
      </div>
      <div className="hc-dots" aria-hidden="true">
        {Array.from({ length: n }, (_, i) => (
          <i key={i} className={i === at ? 'on' : undefined} />
        ))}
      </div>
    </>
  )
}

/** Store-time (Omaha, UTC-6 in winter) day boundaries for the dated cards. */
const BF_TEASER_ENDS = Date.parse('2026-11-29T06:00:00Z') // after Sat Nov 28 (the Black Friday set shows from Thu)
const BOHO_STARTS = Date.parse('2026-11-27T06:00:00Z') // Fri Nov 27
const BOHO_ENDS = Date.parse('2027-01-01T06:00:00Z') // after Thu Dec 31
/** BO-HO-GO is hidden until the owner decides (2026-11-24, Dash Update #220): the register cannot ring it, so the site
 *  must not promise it. Set to true to bring the card back (it still ends itself after Dec 31). */
export const BOHO_ON = false

/**
 * The first card on every normal day (owner 2026-11-20: "BIGGEST thing is if they do not have Thrift+ they are paying
 * WAY TOO MUCH"; rulebook V11). One big line in his words, three quiet check lines that prove it with today's floor
 * (home.json `bucks`: the share of items that carry ThriftBucks and the typical item's share of its tag), one button.
 * No fine print (owner: "this is website UI not a form or contract"; the join page carries the terms): the proof
 * lines carry the qualifiers. Join free opens the join (a member: My Thrift+); Example opens the standard ThriftBucks
 * example (shell/ThriftBucksExample.tsx, rulebook V12) in a window over the page.
 * LOOK picks the colours while the owner chooses: 'cream' (the loss in cranberry) or 'lime' (a price tag).
 */
const LOOK: 'cream' | 'lime' = 'cream'
const JOIN = '/scan?view=join'

function Shout() {
  const { status } = useMember()
  const feed = useHome()
  const member = status === 'member'
  const b = feed?.bucks
  const known = Boolean(b && b.share > 0 && b.typical > 0)
  const [example, setExample] = useState(false)
  return (
    <div className={`hc hc-shout hc-shout-${LOOK}`}>
      <h2 className="disp">
        <span>No Thrift+?</span>
        <span>You’re paying</span>
        <em>way too much.</em>
      </h2>
      <ul className="hc-ok">
        <li>
          <IconCheck />
          {known ? `ThriftBucks on ${b!.share}% of our items` : 'ThriftBucks on most of our items'}
        </li>
        <li>
          <IconCheck />
          {known ? `Typically ${b!.typical}% of the tag` : 'Collected by Thrift+ members'}
        </li>
        <li>
          <IconCheck />
          3-day returns for members
        </li>
      </ul>
      <div className="hc-acts">
        {member ? (
          <Link className="btn hc-join" to="/thriftplus">
            My Thrift+
          </Link>
        ) : (
          <a className="btn hc-join" href={JOIN}>
            Join free
          </a>
        )}
        <button type="button" className="btn hc-ex" onClick={() => setExample(true)}>
          Example
        </button>
      </div>
      {example ? <ThriftBucksExample onClose={() => setExample(false)} joinHref={member ? undefined : JOIN} /> : null}
    </div>
  )
}

/** BO-HO-GO on clothing and shoes for Thrift+ members, Nov 27 to Dec 31 (the same card in the Black Friday set). No fine
 *  print (owner 2026-11-20, rulebook V14): who and what are in the label, the dates in their own line. */
function Boho({ when }: { when: string }) {
  return (
    <Link className="hc hc-lime hc-boho" to="/store?cat=apparel">
      <span className="lbl">Thrift+ members · Clothing</span>
      <h2 className="disp">BO-HO-GO</h2>
      <div className="hc-steps">
        {[['BO', 'Buy one'], ['HO', 'Half off'], ['GO', 'Get one free']].map(([k, v]) => (
          <div key={k}>
            <b className="disp">{k}</b>
            <span>{v}</span>
          </div>
        ))}
      </div>
      <div className="hc-pair">
        <ul className="tn">
          <li>
            Jeans <s>$8.99</s>
          </li>
          <li>
            Sweater <s>$6.00</s>
          </li>
        </ul>
        <div className="hc-both">
          <Tag price={4.5} cents="auto" deal />
          <small>for both</small>
        </div>
      </div>
      <p className="hc-when">{when}</p>
    </Link>
  )
}

function Normal() {
  // Dated cards come and go by themselves: the Black Friday teaser until Nov 27, BO-HO-GO until Dec 31.
  const now = Date.now()
  const teaser = now < BF_TEASER_ENDS
  const boho = BOHO_ON && now < BOHO_ENDS
  return (
    <Rail n={2 + (teaser ? 1 : 0) + (boho ? 1 : 0)}>
      <Shout />
      {teaser && (
      <a className="hc hc-black" href="/scan">
        <span className="lbl">Fri &amp; Sat, Nov 27 to 28</span>
        <h2 className="disp">
          Black <em>Friday</em>
        </h2>
        <p className="sub">Store averages over 78% off retail. One price for everyone. Fri 6 AM to 6 PM, Sat 9 AM to 6 PM.</p>
      </a>
      )}
      {boho && <Boho when={now < BOHO_STARTS ? 'Starts Fri Nov 27' : 'Through Dec 31'} />}
      <Link className="hc hc-green" to="/returns">
        <span className="lbl">Every day</span>
        <h2 className="disp">
          3-day returns<em>Thrift+ members only</em>
        </h2>
        <div className="pct disp tn">
          80%<small>back as Thrift+ credit</small>
        </div>
      </Link>
    </Rail>
  )
}

export default function Specials() {
  const day = useDay()
  // Black Friday takes over the front page (#220): the sale and one button, nothing else on the first screen.
  if (day === 'bf') return <BlackFridayHero />
  return (
    <section className="hc-hero" id="top" aria-label="Specials">
      <Normal />
    </section>
  )
}
