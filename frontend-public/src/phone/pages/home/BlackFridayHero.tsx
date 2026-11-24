/**
 * Black Friday takes over the phone site's front page (owner 2026-11-24, Dash Update #220): "the only thing you see on
 * front page is the sale and a button". The sale in his words, then ONE button: Scan. The header, the search and the
 * bottom bar stay; the rest of home is below the first screen. Phones only: a computer gets the desktop site with its
 * own panel and Get directions (src/components/BlackFridayPanel.tsx), never this page (his rule the same day).
 */
import { Link } from 'react-router-dom'
import { scanIsRoute } from '../../scan/switch'
import './BlackFridayHero.css'

const IconScan = () => (
  <svg className="i" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2M7 12h10" />
  </svg>
)
export default function BlackFridayHero() {
  const scan = (
    <>
      <IconScan /> Scan a tag for its price
    </>
  )
  return (
    <section className="bfh" id="top" aria-label="Black Friday" data-testid="bf-takeover">
      <div className="bfh-in">
        <p className="bfh-when">Fri &amp; Sat · Nov 27 to 28</p>
        <h1 className="disp">
          Black <em>Friday</em>
        </h1>
        <p className="bfh-say">All prices reduced.</p>
        <p className="bfh-sub">No need to sign up for Thrift+. Just good deals.</p>
        <p className="bfh-hours tn">Fri 6 AM to 6 PM · Sat 9 AM to 6 PM</p>
        {scanIsRoute() ? (
          <Link className="btn bfh-btn bfh-scan" to="/scan" data-testid="bf-scan">{scan}</Link>
        ) : (
          <a className="btn bfh-btn bfh-scan" href="/scan" data-testid="bf-scan">{scan}</a>
        )}
      </div>
    </section>
  )
}
