/**
 * Home 1, the specials (mockup blocks/10-specials.html): three cards swiped sideways, the next card's edge showing.
 * The normal set and the Black Friday set (by useDay()) share the card shapes and sizes; the dots follow the swipe.
 */
import { useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useHome } from '../../lib/boot'
import { useDay } from '../../lib/day'
import { count } from '../../lib/format'
import { HERO_SOFA } from '../../shell/pictures'
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

function Normal({ pieces }: { pieces: number | null }) {
  // The Black Friday teaser is for the days before it: after Nov 27 (store time) the card goes away by itself.
  const teaser = Date.now() < Date.parse('2026-11-28T06:00:00Z')
  return (
    <Rail n={teaser ? 3 : 2}>
      <Link className="hc hc-lime" to="/categories">
        <span className="lbl">In store today</span>
        <h2 className="disp tn">
          {pieces === null ? ' ' : count(pieces)}
          <span>pieces</span>
        </h2>
        <img src={HERO_SOFA.src} width={HERO_SOFA.width} height={HERO_SOFA.height} alt="" {...{ fetchpriority: 'high' }} />
      </Link>
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
      <Link className="hc hc-green" to="/#thriftplus">
        <span className="lbl">Every day</span>
        <h2 className="disp">3-day returns</h2>
        <p className="sub">Changed your mind? Bring it back.</p>
        <p className="fine">Thrift+ members. Qualifying items.</p>
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
      <Link className="hc hc-lime hc-boho" to="/store?cat=apparel">
        <span className="lbl">Clothing and shoes</span>
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
  const feed = useHome()
  const day = useDay()
  return (
    <section className="hc-hero" id="top" aria-label="Specials">
      {day === 'bf' ? <BlackFriday /> : <Normal pieces={feed ? feed.shelf.pieces : null} />}
    </section>
  )
}
