/**
 * The applicant's steps on a computer (Dash Update #211): Apply, the interview page and the offer page. These are long
 * forms with every check, upload and signature the live pages have; tonight they are the phone's own flows, imported
 * whole (phone/pages/CareersApply.tsx, CareersInterview.tsx, CareersOffer.tsx: the same calls, checks and words), set in
 * a desktop frame: the form in a column of reading width on the left, the steps' place in the hiring line on the
 * right. Their Back and Next bar sits under the form here instead of fixed to the screen's bottom (desk CSS).
 * A fully desktop-built version of the three is a follow-up.
 */
import { Link } from 'react-router-dom'
import PhoneApply from '../../phone/pages/CareersApply'
import PhoneInterview from '../../phone/pages/CareersInterview'
import PhoneOffer from '../../phone/pages/CareersOffer'
import { CAREERS } from '../words'
import './careers.css'

const STEPS: Array<['apply' | 'interview' | 'offer', string]> = [
  ['apply', 'Apply'],
  ['interview', 'Interview'],
  ['offer', 'Offer'],
]

export default function CareersFlow({ step }: { step: 'apply' | 'interview' | 'offer' }) {
  return (
    <div className="dk-w dk-cr dk-flow">
      <div className="dk-crumbs">
        <Link to="/careers">Careers</Link>
        <span className="sep">›</span>
        <span>{STEPS.find(([s]) => s === step)?.[1]}</span>
      </div>
      <div className="dk-flow-grid">
        <div className="dk-flow-form">
          {step === 'apply' ? <PhoneApply /> : step === 'interview' ? <PhoneInterview /> : <PhoneOffer />}
        </div>
        <aside className="dk-flow-side">
          <p className="dk-kick">{CAREERS.kick}</p>
          <ol>
            {STEPS.map(([s, name]) => (
              <li key={s} className={s === step ? 'on' : undefined}>
                {name}
              </li>
            ))}
          </ol>
          <p className="dk-note">{CAREERS.where}</p>
        </aside>
      </div>
    </div>
  )
}
