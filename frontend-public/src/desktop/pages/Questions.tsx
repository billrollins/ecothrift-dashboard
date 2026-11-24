/**
 * Questions on a computer (Dash Update #211): the phone's questions and policies (phone/pages/words.ts FAQ, POLICIES),
 * every answer shown under its question (nothing opens), two across. The ThriftBucks answer opens the one standard
 * example in a window over the page (rulebook V12). Then the store's phone number as selectable text and the hours.
 */
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { STORE } from '../../data/content'
import { useHome } from '../../phone/lib/boot'
import { hoursRows } from '../../phone/lib/hours'
import { useMember } from '../../phone/lib/member'
import { hoursLine } from '../../phone/pages/infoParts'
import { FAQ, POLICIES } from '../../phone/pages/words'
import { ThriftBucksExample } from '../../phone/shell/ThriftBucksExample'
import { useSeo } from '../../useSeo'
import { JOIN_HREF } from '../words'
import './info.css'

export default function Questions() {
  useSeo({ title: 'Questions', path: '/questions' })
  const hours = useHome()?.hours
  const member = useMember().status === 'member'
  const [example, setExample] = useState(false)
  return (
    <div className="dk-w dk-info">
      <div className="dk-pt">
        <p className="dk-kick">Eco-Thrift</p>
        <h1 className="disp">Questions</h1>
      </div>
      <section className="dk-qa">
        {FAQ.map((f) => (
          <div className="dk-qa-row" key={f.q}>
            <h2>{f.q}</h2>
            <p>{f.a}</p>
            {f.example ? (
              <button type="button" className="dk-qa-ex" onClick={() => setExample(true)}>
                See the example ›
              </button>
            ) : null}
          </div>
        ))}
      </section>
      <h2 className="dk-h" style={{ marginTop: 56 }}>Policies</h2>
      <div className="dk-boxes four" style={{ marginTop: 20 }}>
        {POLICIES.map((p) =>
          p.to ? (
            <Link className="dk-box" key={p.head} to={p.to}>
              <b>{p.head}</b>
              <span>{p.line}</span>
              <em>Read ›</em>
            </Link>
          ) : (
            <div className="dk-box" key={p.head}>
              <b>{p.head}</b>
              <span>{p.line}</span>
            </div>
          ),
        )}
      </div>
      <section className="dk-call">
        <div>
          <p className="lbl">Call the store</p>
          <p className="disp tn">{STORE.retail.phone}</p>
        </div>
        <p>{hoursLine(hoursRows(hours))}</p>
      </section>
      {example ? <ThriftBucksExample onClose={() => setExample(false)} joinHref={member ? undefined : JOIN_HREF} /> : null}
    </div>
  )
}
