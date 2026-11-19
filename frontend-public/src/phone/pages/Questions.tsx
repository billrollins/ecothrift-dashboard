/**
 * Questions (mockup pages/questions.html + policies.html, calmed down by the owner 11-19: "a touch of CALM DOWN ness
 * in the jumping and poping and expanding"). Every answer shows under its question, always: no tap-to-open, no state,
 * no motion, nothing shifts. Then the four policies as plain links with one line each, then the store's phone number
 * as selectable text (no tel: link) and hours.
 */
import { Link } from 'react-router-dom'
import { STORE } from '../../data/content'
import { useHome } from '../lib/boot'
import { hoursRows } from '../lib/hours'
import { BackRow } from './infoParts'
import { FAQ, POLICIES } from './words'
import './Questions.css'

/** The week as one quiet line: "Monday to Saturday 9 AM to 6 PM · Sunday closed". */
export function hoursLine(rows: Array<[string, string]>): string {
  return rows.map(([d, t]) => `${d} ${t === 'Closed' ? 'closed' : t}`).join(' · ')
}

export default function Questions() {
  const hours = useHome()?.hours
  return (
    <div className="qa">
      <BackRow />
      <section className="qa-hd">
        <p className="lbl">Eco-Thrift</p>
        <h1 className="disp">Questions</h1>
      </section>

      <section className="qa-list">
        {FAQ.map((f) => (
          <div className="qa-row" key={f.q}>
            <h2 className="qa-q">{f.q}</h2>
            <p className="qa-a">{f.a}</p>
          </div>
        ))}
      </section>

      <section className="qa-pol" aria-labelledby="qa-pol-h">
        <h2 className="qa-pl" id="qa-pol-h">Policies</h2>
        {POLICIES.map((p) => (
          <Link className="qa-pr" key={p.head} to={p.to}>
            <span className="qa-pt">
              <b>{p.head}</b>
              <span>{p.line}</span>
            </span>
            <span className="qa-go" aria-hidden="true">›</span>
          </Link>
        ))}
      </section>

      <section className="qa-call">
        <p className="lbl">Call the store</p>
        <p className="disp qa-ph tn">{STORE.retail.phone}</p>
        <p className="fine">{hoursLine(hoursRows(hours))}</p>
      </section>
    </div>
  )
}
