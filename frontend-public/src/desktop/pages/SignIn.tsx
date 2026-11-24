/**
 * Sign in and Join on a computer (Dash Update #211): `/account/sign-in` (`?view=join` opens Join). The scanner's own
 * sign-in steps, imported whole (phone/scan/signin: the same steps, words and API as on a phone: Continue with Google,
 * or a mobile number and a texted code; Join takes a name the same way), on a desktop page: what Thrift+ is on the
 * left, the steps in a card on the right. Its two phone-only ways in (the store's sign-in QR read with the camera, and
 * scanning without signing in) are left out on a computer (desk CSS).
 *
 * Signed in: the member's /thriftplus. A member who still has a step to do (their mobile number, the selfie and the
 * terms: phone-camera steps) is told to finish on their phone or at the register, with a QR to ecothrift.us/scan.
 */
import { Link, Navigate, useSearchParams } from 'react-router-dom'
import { hasFinishSteps } from '../../phone/scan/core'
import { CardQr } from '../../phone/scan/member/Qr'
import PhoneSignIn from '../../phone/scan/signin'
import { actions, useAction, useScanSession } from '../../phone/scan/store'
import { asset } from '../../phone/shell/Tag'
import { useSeo } from '../../useSeo'
import { SIGN_IN, THRIFT_PLUS } from '../words'
import './signin.css'

export default function SignIn() {
  const [params] = useSearchParams()
  const join = params.get('view') === 'join'
  useSeo({ title: join ? 'Join Thrift+' : 'Sign in', path: '/account/sign-in', noindex: true })
  const { session, open } = useScanSession()
  const out = useAction(actions.signOut)

  let body
  if (open === false) {
    body = (
      <div className="dk-si-msg">
        <h2 className="dk-h">{SIGN_IN.soon}</h2>
        <p>{SIGN_IN.soonLine}</p>
      </div>
    )
  } else if (!session) {
    body = <div className="dk-si-msg" aria-busy="true" />
  } else if (session.status === 'member') {
    const m = session.member
    if (!m.needs_phone && !hasFinishSteps(m) && params.get('view') !== 'finish') return <Navigate to="/thriftplus" replace />
    body = (
      <div className="dk-si-msg dk-si-fin" data-testid="desk-finish">
        <h2 className="dk-h">{SIGN_IN.finishHead(m.first_name)}</h2>
        <p>{SIGN_IN.finishLine}</p>
        <div className="dk-si-qr">
          <CardQr text={SIGN_IN.finishUrl} testId="finish-qr" />
        </div>
        <button type="button" className="btn btn-line" onClick={() => void out.run(undefined).catch(() => undefined)}>
          Sign out
        </button>
      </div>
    )
  } else {
    body = <PhoneSignIn key={join ? 'join' : 'email'} start={join ? 'join' : 'email'} notice={params.get('link') ? SIGN_IN.linkUsed : ''} />
  }

  return (
    <div className="dk-w dk-si">
      <section className="dk-si-side">
        <img src={asset('phone/thriftplus-wordmark-white.svg')} width={110} height={40} alt="Thrift+" />
        <h1 className="disp">{join ? SIGN_IN.joinHead : SIGN_IN.head}</h1>
        <ul>
          {THRIFT_PLUS.three.map(([n, line]) => (
            <li key={n}>
              <b className="disp tn">{n}</b>
              <span>{line}</span>
            </li>
          ))}
        </ul>
        <p className="dk-si-alt">
          {join ? (
            <>
              {SIGN_IN.haveOne} <Link to="/account/sign-in">Sign in</Link>
            </>
          ) : (
            <>
              {SIGN_IN.newHere} <Link to="/account/sign-in?view=join">Join free</Link>
            </>
          )}
        </p>
      </section>
      <section className="dk-si-card" aria-label={join ? 'Join Thrift+' : 'Sign in'}>
        {body}
      </section>
    </div>
  )
}
