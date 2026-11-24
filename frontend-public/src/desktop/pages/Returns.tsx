/**
 * Returns on a computer (Dash Update #211): the phone's plain answer (phone/pages/words.ts RETURNS: terms section 8 in
 * three steps and one big number, non-members AS IS), as equal boxes in one row, then the full policy (/terms#s8).
 */
import { Link } from 'react-router-dom'
import { useMember } from '../../phone/lib/member'
import { RETURNS } from '../../phone/pages/words'
import { useSeo } from '../../useSeo'
import { JOIN_HREF } from '../words'
import './info.css'

export default function Returns() {
  useSeo({ title: 'Returns', path: '/returns' })
  const member = useMember().status === 'member'
  return (
    <div className="dk-w dk-info">
      <div className="dk-pt">
        <p className="dk-kick">Thrift+ members</p>
        <h1 className="disp">3-day returns</h1>
      </div>
      <section className="dk-rt-steps" aria-label="How returns work">
        {RETURNS.steps.map((s, i) => (
          <div className="dk-rt-step" key={s}>
            <b className="disp">{i + 1}</b>
            <span>{s}</span>
          </div>
        ))}
        <div className="dk-rt-back">
          <span className="disp tn">{RETURNS.back}</span>
          <b>{RETURNS.backLine}</b>
        </div>
      </section>
      <section className="dk-rt-non">
        <div>
          <p className="dk-kick">Non-members</p>
          <p>{RETURNS.non}</p>
        </div>
        {member ? null : (
          <Link className="btn btn-ink" to={JOIN_HREF}>
            Join free
          </Link>
        )}
      </section>
      <Link className="dk-rt-full" to="/terms#s8">
        The full returns policy ›
      </Link>
    </div>
  )
}
