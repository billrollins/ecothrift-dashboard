/**
 * Returns (critic cycle 11-20): the plain answer one tap from the home's close, the menu and Questions, instead of the
 * middle of the 11,800 px terms. Thrift+ members' 3-day returns in three steps and one big number, non-members' AS IS,
 * then the full policy (terms section 8, wording untouched). Opens whole; nothing on it opens or moves.
 */
import { Link } from 'react-router-dom'
import { useMember } from '../lib/member'
import { BackRow } from './infoParts'
import { RETURNS } from './words'
import './Returns.css'

const JOIN = '/scan?view=join'

export default function Returns() {
  const member = useMember().status === 'member'
  return (
    <div className="rt">
      <BackRow />
      <section className="rt-hd">
        <p className="lbl">Thrift+ members</p>
        <h1 className="disp">3-day returns</h1>
      </section>

      <section className="rt-steps" aria-label="How returns work">
        {RETURNS.steps.map((s, i) => (
          <div className="rt-step" key={s}>
            <b className="disp">{i + 1}</b>
            <span>{s}</span>
          </div>
        ))}
        <div className="rt-back">
          <span className="disp tn">{RETURNS.back}</span>
          <b>{RETURNS.backLine}</b>
        </div>
      </section>

      <section className="rt-non">
        <p className="lbl">Non-members</p>
        <p className="rt-non-t">{RETURNS.non}</p>
        {member ? null : (
          <a className="btn btn-ink" href={JOIN}>
            Join free
          </a>
        )}
      </section>

      <Link className="rt-full" to="/terms#s8">
        The full returns policy<span aria-hidden="true">›</span>
      </Link>
    </div>
  )
}
