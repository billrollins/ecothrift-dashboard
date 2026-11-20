/**
 * Home 1, the specials (mockup blocks/10-specials.html): cards swiped sideways, the next card's edge showing.
 * Normal days: Don't shop without Thrift+, the Black Friday teaser (to Nov 27), BO-HO-GO (to Dec 31), 3-day returns.
 * The Black Friday set (by useDay()) shares the card shapes and sizes; the dots follow the swipe.
 */
import { useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useDay } from '../../lib/day'
import { useMember } from '../../lib/member'
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
const BF_TEASER_ENDS = Date.parse('2026-11-28T06:00:00Z') // after Fri Nov 27
const BOHO_STARTS = Date.parse('2026-11-27T06:00:00Z') // Fri Nov 27
const BOHO_ENDS = Date.parse('2027-01-01T06:00:00Z') // after Thu Dec 31

/**
 * The first card on every normal day (owner 2026-11-20: "Do not shop without Thrift+ ... Needs to stop people NOW";
 * rulebook V11). Signed out it opens the join; a member's button says "My Thrift+". The button keeps one width, so
 * nothing moves when the session answers.
 */
function Shout() {
  const { status } = useMember()
  const member = status === 'member'
  const inner = (
    <>
      <span className="lbl">Please read</span>
      <h2 className="disp">
        Don’t shop <em>without Thrift+</em>
      </h2>
      <ul className="hc-why">
        <li>Without it, you pay the full tag.</li>
        <li>Members collect ThriftBucks on most items.</li>
        <li>Only members can return.</li>
      </ul>
      <div className="hc-cta">
        <span className="btn btn-lime">{member ? 'My Thrift+' : 'Join free'}</span>
        <p className="fine">
          Thrift+ members. Most items.
          <br />
          Free to join. Nothing owed.
        </p>
      </div>
    </>
  )
  return member ? (
    <Link className="hc hc-shout" to="/thriftplus">
      {inner}
    </Link>
  ) : (
    <a className="hc hc-shout" href="/scan?view=join">
      {inner}
    </a>
  )
}

/** BO-HO-GO on clothing and shoes, Nov 27 to Dec 31 (the same card in the Black Friday set). */
function Boho({ label }: { label: string }) {
  return (
    <Link className="hc hc-lime hc-boho" to="/store?cat=apparel">
      <span className="lbl">{label}</span>
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
          <Tag price={4.5} cents="auto" />
          <small>for both</small>
        </div>
      </div>
      <p className="fine">Thrift+ members. Nov 27 to Dec 31.</p>
    </Link>
  )
}

function Normal() {
  // Dated cards come and go by themselves: the Black Friday teaser until Nov 27, BO-HO-GO until Dec 31.
  const now = Date.now()
  const teaser = now < BF_TEASER_ENDS
  const boho = now < BOHO_ENDS
  return (
    <Rail n={2 + (teaser ? 1 : 0) + (boho ? 1 : 0)}>
      <Shout />
      {teaser && (
      <Link className="hc hc-black" to="/#thriftplus">
        <span className="lbl">Fri Nov 27</span>
        <h2 className="disp">
          Black <em>Friday</em>
        </h2>
        <p className="sub">Your ThriftBucks come off that day, in full.</p>
        <p className="fine">Thrift+ members. Most items.</p>
        <div className="hc-sum">
          <span className="was tn">$100</span>
          <Tag price={80} cents="auto" />
          <span className="cap">A $100.00 tag with 20.00 ThriftBucks</span>
        </div>
      </Link>
      )}
      {boho && <Boho label={now < BOHO_STARTS ? 'Starts Fri Nov 27 · Clothing and shoes' : 'Through Dec 31 · Clothing and shoes'} />}
      <Link className="hc hc-green" to="/#thriftplus">
        <span className="lbl">Every day</span>
        <h2 className="disp">
          3-day returns<em>Thrift+ members only</em>
        </h2>
        <p className="sub">Changed your mind? Bring it back.</p>
        <p className="fine">Qualifying items.</p>
        <div className="pct disp tn">
          80%<small>back as Thrift+ credit</small>
        </div>
      </Link>
    </Rail>
  )
}

/** Door busters as the store wrote them for the day (round-3 content: ECO.deals.bf). */
const DOOR: Array<[name: string, price: number, note: string]> = [
  ['Dyson V11 Animal vacuum', 99, 'Retail $650.00'],
  ['Traeger Pro 34 pellet grill', 149, ''],
  ['Star Wars 9in Vehicle and Figure', 19.99, ''],
]

function BlackFriday() {
  return (
    <Rail n={3}>
      <Link className="hc hc-cran" to="/#thriftplus">
        <span className="lbl">Black Friday · Everything</span>
        <h2 className="disp">
          Your
          <br />
          ThriftBucks <em>come off today</em>
        </h2>
        <p className="fine">Thrift+ members. Most items.</p>
        <div className="hc-sum">
          <span className="was tn">$100</span>
          <span className="hc-arrow" aria-hidden="true">→</span>
          <Tag price={80} cents="auto" />
          <span className="cap">with 20.00 ThriftBucks</span>
        </div>
      </Link>
      <Boho label="Clothing and shoes" />
      <Link className="hc hc-door" to="/#visit">
        <span className="lbl">Door busters</span>
        <h2 className="disp">One of a kind</h2>
        <p className="fine">Everyone, Thrift+ members or not.</p>
        <div className="hc-rows tn">
          {DOOR.map(([name, price, note]) => (
            <div key={name}>
              <p>
                {name}
                {note ? <s>{note}</s> : null}
              </p>
              <Tag price={price} cents="auto" />
            </div>
          ))}
        </div>
      </Link>
    </Rail>
  )
}

export default function Specials() {
  const day = useDay()
  return (
    <section className="hc-hero" id="top" aria-label="Specials">
      {day === 'bf' ? <BlackFriday /> : <Normal />}
    </section>
  )
}
