/**
 * About (owner 11-20 on the cut-down version: "ugly AF too much info that is fluff"; no claim that we check or test
 * items; no lime). Only what a shopper needs: what the store is, when new stock comes, where it is, each a plain row
 * that opens the home block that answers it; then the way onward (Questions, Careers). No mission lines, no counts,
 * no pictures, no second logo.
 */
import { Link } from 'react-router-dom'
import { STORE } from '../../data/content'
import { useHome } from '../lib/boot'
import { hoursRows } from '../lib/hours'
import { InfoTiles } from './home/Footer'
import { BackRow, hoursLine } from './infoParts'
import { ABOUT } from './words'
import './About.css'

export default function About() {
  const hours = useHome()?.hours
  return (
    <div className="ab">
      <BackRow />
      <section className="ab-hd">
        <p className="lbl">{ABOUT.label}</p>
        <h1 className="disp">{ABOUT.head}</h1>
      </section>

      <section className="ab-facts">
        {ABOUT.facts.map((f) =>
          f.to ? (
            <Link className="ab-f" key={f.head} to={f.to}>
              <b>{f.head}</b>
              {f.line ? <span>{f.line}</span> : null}
              <em>{f.go} ›</em>
            </Link>
          ) : (
            <div className="ab-f" key={f.head}>
              <b>{f.head}</b>
              <span>{f.line}</span>
            </div>
          ),
        )}
        <a className="ab-f" href={STORE.retail.mapsPlaceUrl} target="_blank" rel="noopener">
          <b>One store: 8425 W Center Rd</b>
          <span>{hoursLine(hoursRows(hours))}</span>
          <em>Directions ›</em>
        </a>
      </section>

      <InfoTiles title="More" only={['/questions', '/careers']} />
    </div>
  )
}
