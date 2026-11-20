/**
 * About (mockup pages/about.html): who Eco-Thrift is as colour bands and numbers, no paragraphs. The numbers come
 * from the home feed (stamped in the page): pieces on the shelf and its date, the category count, the hours.
 * Each number band is one tap target: pieces -> the in-store list, categories -> /categories, trucks -> home's
 * "On the truck", Omaha -> home's visit block.
 */
import { Link } from 'react-router-dom'
import { useHome } from '../lib/boot'
import { count, shortDate } from '../lib/format'
import { hoursRows } from '../lib/hours'
import { CATS } from '../lib/stock'
import { catPic, HERO_SOFA } from '../shell/pictures'
import { asset } from '../shell/Tag'
import { BackRow } from './infoParts'
import { ABOUT } from './words'
import './About.css'

const FOUR = ['furniture', 'kitchen', 'tools', 'apparel']

/** The open days and their hours for the Omaha band (the first open row of the week). */
export function openRow(rows: Array<[string, string]>): [string, string] {
  return rows.find(([, t]) => t !== 'Closed') || ['Monday to Saturday', '9 AM to 6 PM']
}

export default function About() {
  const feed = useHome()
  const pieces = feed?.shelf.pieces
  const asOf = shortDate(feed?.as_of)
  const cats = feed?.shelf.categories || CATS.length
  const [days, time] = openRow(hoursRows(feed?.hours))
  const hide = (gone: boolean) => (gone ? { opacity: 0 } : undefined)
  return (
    <div className="ab">
      <BackRow />

      <section className="ab-band ab-hero">
        <p className="lbl">{ABOUT.label}</p>
        <h1 className="disp">
          {ABOUT.head} <em>{ABOUT.headEm}</em>
        </h1>
        <p className="ab-sub">
          {ABOUT.sub[0]}
          <br />
          {ABOUT.sub[1]}
        </p>
        <div className="ab-pic">
          <img src={HERO_SOFA.src} width={HERO_SOFA.width} height={HERO_SOFA.height} alt="" decoding="async" />
        </div>
      </section>

      <Link className="ab-band ab-lime ab-go" to="/store">
        <p className="lbl">
          On the shelf<span style={hide(!asOf)}> · {asOf || 'Nov 1'}</span>
        </p>
        <p className="disp ab-num tn" style={hide(pieces === undefined)}>
          {pieces === undefined ? '0' : count(pieces)}
        </p>
        <p className="disp ab-unit">Items</p>
        <span className="ab-arw" aria-hidden="true">›</span>
      </Link>

      <Link className="ab-band ab-white ab-go" to="/categories">
        <p className="disp ab-num mid tn">{cats}</p>
        <p className="disp ab-unit">Categories</p>
        <div className="ab-deps">
          {FOUR.map((id) => {
            const pic = catPic(id)
            return (
              <span key={id}>
                {pic ? <img src={pic.src} width={pic.width} height={pic.height} alt="" loading="lazy" decoding="async" /> : null}
              </span>
            )
          })}
        </div>
        <span className="ab-arw" aria-hidden="true">›</span>
      </Link>

      <Link className="ab-band ab-black ab-go" to="/#coming">
        <p className="lbl">New stock</p>
        <p className="disp ab-num mid">Trucks</p>
        <p className="disp ab-unit">most weeks</p>
        <svg className="ab-truck" viewBox="0 0 358 70" aria-hidden="true">
          <rect x="0" y="66" width="358" height="2" fill="var(--ink-2)" />
          <rect x="60" y="6" width="190" height="46" rx="5" fill="var(--lime)" />
          <path d="M254 18h40l22 18v16h-62z" fill="#fff" />
          <path d="M266 24h24l14 12h-38z" fill="#000" />
          <circle cx="96" cy="56" r="10" fill="#000" stroke="#fff" strokeWidth="4" />
          <circle cx="210" cy="56" r="10" fill="#000" stroke="#fff" strokeWidth="4" />
          <circle cx="290" cy="56" r="10" fill="#000" stroke="#fff" strokeWidth="4" />
          <rect x="12" y="20" width="34" height="4" rx="2" fill="var(--ink-2)" />
          <rect x="22" y="32" width="24" height="4" rx="2" fill="var(--ink-2)" />
        </svg>
        <span className="ab-arw" aria-hidden="true">›</span>
      </Link>

      <section className="ab-band ab-cream">
        <p className="lbl">How we work</p>
        <h2 className="disp ab-h2">{ABOUT.stepsHead}</h2>
        <div className="ab-steps">
          {ABOUT.steps.map((s, i) => (
            <div className="ab-step" key={s}>
              <b className="disp">{i + 1}</b>
              <span>{s}</span>
            </div>
          ))}
        </div>
      </section>

      <Link className="ab-band ab-green ab-go" to="/#visit">
        <p className="lbl">One store</p>
        <p className="disp ab-num mid">Omaha</p>
        <p className="ab-note">8425 W Center Rd</p>
        <div className="ab-hrs">
          <span>{days}</span>
          <b className="tn">{time}</b>
        </div>
        <span className="ab-arw" aria-hidden="true">›</span>
      </Link>

      <section className="ab-tagline">
        <img src={asset('eco-thrift-logo-color.svg')} width={187} height={46} alt="Eco-Thrift" loading="lazy" decoding="async" />
        <p className="disp">
          {ABOUT.tagline} <em>{ABOUT.taglineEm}</em>
        </p>
      </section>
    </div>
  )
}
