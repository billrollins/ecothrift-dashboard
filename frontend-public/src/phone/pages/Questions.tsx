/**
 * Questions (mockup pages/questions.html + policies.html, calmed down by the owner 11-19: "a touch of CALM DOWN ness
 * in the jumping and poping and expanding"). Every answer shows under its question, always: no tap-to-open, nothing
 * shifts. The ThriftBucks answer uses the rulebook's words and opens the one standard example in a window over the page
 * (V12; no second explainer). Then the four policies as plain links with one line each (returns live here once), then
 * the store's phone number as selectable text (no tel: link) and hours.
 */
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { STORE } from '../../data/content'
import { useHome } from '../lib/boot'
import { hoursRows } from '../lib/hours'
import { useMember } from '../lib/member'
import { ThriftBucksExample } from '../shell/ThriftBucksExample'
import { BackRow, hoursLine } from './infoParts'
import { FAQ, POLICIES } from './words'
import './Questions.css'

const JOIN = '/scan?view=join'

export { hoursLine }

export default function Questions() {
  const hours = useHome()?.hours
  const member = useMember().status === 'member'
  const [example, setExample] = useState(false)
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
            {f.example ? (
              <button type="button" className="qa-ex" onClick={() => setExample(true)}>
                See the example<span aria-hidden="true">›</span>
              </button>
            ) : null}
          </div>
        ))}
      </section>

      <section className="qa-pol" aria-labelledby="qa-pol-h">
        <h2 className="qa-pl" id="qa-pol-h">Policies</h2>
        {POLICIES.map((p) =>
          p.to ? (
            <Link className="qa-pr" key={p.head} to={p.to}>
              <span className="qa-pt">
                <b>{p.head}</b>
                <span>{p.line}</span>
              </span>
              <span className="qa-go" aria-hidden="true">›</span>
            </Link>
          ) : (
            <div className="qa-pr" key={p.head}>
              <span className="qa-pt">
                <b>{p.head}</b>
                <span>{p.line}</span>
              </span>
            </div>
          ),
        )}
      </section>

      <section className="qa-call">
        <p className="lbl">Call the store</p>
        <p className="disp qa-ph tn">{STORE.retail.phone}</p>
        <p className="qa-hrs">{hoursLine(hoursRows(hours))}</p>
      </section>
      {example ? <ThriftBucksExample onClose={() => setExample(false)} joinHref={member ? undefined : JOIN} /> : null}
    </div>
  )
}
