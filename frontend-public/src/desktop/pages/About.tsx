/**
 * About on a computer (Dash Update #211): the phone's About words (phone/pages/words.ts ABOUT; owner 11-20: no fluff,
 * never a claim that we check or test items) as equal boxes, then the four places a shopper looks for (words.ts INFO).
 */
import { Link } from 'react-router-dom'
import { useHome } from '../../phone/lib/boot'
import { hoursRows } from '../../phone/lib/hours'
import { hoursLine } from '../../phone/pages/infoParts'
import { ABOUT } from '../../phone/pages/words'
import { useSeo } from '../../useSeo'
import { InfoBoxes } from './infoBoxes'
import './info.css'

export default function About() {
  useSeo({ title: 'About', path: '/about' })
  const hours = useHome()?.hours
  return (
    <div className="dk-w dk-info">
      <div className="dk-pt">
        <p className="dk-kick">{ABOUT.label}</p>
        <h1 className="disp">{ABOUT.head}</h1>
      </div>
      <div className="dk-boxes">
        {ABOUT.facts.map((f) =>
          f.to ? (
            <Link className="dk-box" key={f.head} to={f.to}>
              <b>{f.head}</b>
              {f.line ? <span>{f.line}</span> : null}
              <em>{f.go} ›</em>
            </Link>
          ) : (
            <div className="dk-box" key={f.head}>
              <b>{f.head}</b>
              <span>{f.line}</span>
            </div>
          ),
        )}
        <Link className="dk-box" to="/visit">
          <b>One store: 8425 W Center Rd</b>
          <span>{hoursLine(hoursRows(hours))}</span>
          <em>Directions ›</em>
        </Link>
      </div>
      <h2 className="dk-h" style={{ marginTop: 56 }}>More</h2>
      <InfoBoxes skip="/about" />
    </div>
  )
}
