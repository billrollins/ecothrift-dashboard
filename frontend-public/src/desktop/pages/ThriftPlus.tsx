/**
 * /thriftplus on a computer (Dash Update #211). One member for the whole site: the session comes from the scanner's
 * store (phone/scan/store.ts, which reads phone/lib/member.ts), never a second ask.
 *
 * - Signed out: what Thrift+ is, on one screen: the headline, Join free and Sign in, and beside them the ONE ThriftBucks
 *   explainer, the standard example (rulebook V12, phone/shell/ThriftBucksExample.tsx), then the three numbers.
 * - A member: the balance big with its line, the member QR (a click shows it large), then the ThriftBucks detail and
 *   the account side by side (on a phone they are two views; a computer has the room, and nothing opens in place).
 * - A member who still has to add a phone or finish joining: the desktop sign-in page's finish screen.
 */
import { useEffect } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { bucks, shortDate } from '../../phone/lib/format'
import { useMember } from '../../phone/lib/member'
import { bucksReady, hasFinishSteps, type ThriftPlusMember } from '../../phone/scan/core'
import { Account, Balance, Wallet, qrLine } from '../../phone/scan/member'
import { actions, useAction, useCart, useMyCard, useScanSession } from '../../phone/scan/store'
import { ThriftBucksExampleBody } from '../../phone/shell/ThriftBucksExample'
import { asset } from '../../phone/shell/Tag'
import { useSeo } from '../../useSeo'
import { useDeskDay } from '../lib/day'
import { JOIN_HREF, SIGN_IN_HREF, THRIFT_PLUS } from '../words'
import './thriftplus.css'

/** The website's own sign-in hint (src/auth.tsx): the server ends that session on sign out; the hint goes too. */
const WEBSITE_HINT_KEY = 'ecothrift.public_session.v1'

export default function ThriftPlus() {
  useSeo({ title: 'Thrift+', path: '/thriftplus' })
  const { session } = useScanSession()
  const known = useMember()
  if (!session) return <div className={`dk-tp-wait ${known.status === 'member' ? 'in' : 'out'}`} data-testid="thriftplus-wait" />
  if (session.status !== 'member') return <SignedOut />
  const member = session.member
  if (member.needs_phone || hasFinishSteps(member)) return <Navigate to="/account/sign-in?view=finish" replace />
  return <MemberPage member={member} />
}

function SignedOut() {
  return (
    <div data-testid="thriftplus-out">
      <section className="dk-tp-hero">
        <div className="dk-w dk-tp-in">
          <div className="dk-tp-say">
            <img className="dk-tp-wm" src={asset('phone/thriftplus-wordmark-white.svg')} width={120} height={44} alt="Thrift+" />
            <h1 className="disp">
              Collect <em>ThriftBucks</em>
            </h1>
            <p className="dk-tp-line">{THRIFT_PLUS.line}</p>
            <div className="dk-tp-cta">
              <Link className="btn btn-lime" to={JOIN_HREF} data-testid="join-free">
                Join free
              </Link>
              <Link className="btn btn-line" to={SIGN_IN_HREF} data-testid="sign-in">
                Sign in
              </Link>
            </div>
          </div>
          <div className="dk-tp-ex">
            <ThriftBucksExampleBody headingId="dk-tbx-h" />
          </div>
        </div>
      </section>
      <section className="dk-w dk-tp-three">
        {THRIFT_PLUS.three.map(([n, line]) => (
          <div key={n}>
            <b className="disp tn">{n}</b>
            <span>{line}</span>
          </div>
        ))}
      </section>
      <p className="dk-w dk-tp-more">
        <Link to="/returns">How 3-day returns work ›</Link>
        <Link to="/terms">Thrift+ terms ›</Link>
      </p>
    </div>
  )
}

function useByOf(member: ThriftPlusMember, fallback: string): string {
  const raw = (member as ThriftPlusMember & { bucks_use_by?: unknown }).bucks_use_by
  return shortDate(typeof raw === 'string' && raw ? raw : fallback)
}

function MemberPage({ member }: { member: ThriftPlusMember }) {
  const known = useMember()
  const card = useMyCard()
  const cart = useCart()
  const day = useDeskDay()
  const out = useAction(actions.signOut)
  const ready = bucksReady(member.banked_rewards, member.bucks_available)
  const amount = bucks(Math.abs(ready.now))
  const useBy = useByOf(member, known.member?.useBy ?? '')
  const line = qrLine(member, card.data)
  const fine =
    line !== 'Show this at the register.'
      ? line
      : day === 'bf'
        ? 'They come off today, in full · Thrift+ members'
        : useBy
          ? `Use by ${useBy} · Thrift+ members`
          : 'Thrift+ members. Most items.'
  const tripTotal = Number.parseFloat(cart.data?.totals.reward_total ?? '0') || 0
  useEffect(() => {
    document.title = 'Thrift+ · Eco-Thrift'
  }, [])
  const signOut = () => {
    try {
      localStorage.removeItem(WEBSITE_HINT_KEY)
    } catch {
      /* private mode: nothing kept */
    }
    void out.run(undefined).catch(() => undefined)
  }
  return (
    <div data-testid="thriftplus-member">
      <section className="dk-tp-hero">
        <div className="dk-w dk-tp-in dk-tp-mem">
          <div>
            <img className="dk-tp-wm" src={asset('phone/thriftplus-wordmark-white.svg')} width={120} height={44} alt="Thrift+" />
            <p className="dk-tp-hi">{member.first_name}, you have</p>
            <p className="dk-tp-bal">
              <b className="disp tn" data-testid="thriftplus-balance">{amount}</b>
              <span>ThriftBucks</span>
            </p>
            <p className="dk-tp-use" data-testid="thriftplus-use">{fine}</p>
          </div>
          <div className="dk-tp-qr">
            <Wallet member={member} />
            <span>{THRIFT_PLUS.qrLine}</span>
          </div>
        </div>
      </section>
      <div className="dk-w dk-tp-two">
        <section className="dk-card dk-tp-panel" aria-labelledby="dk-tp-b">
          <h2 className="dk-h" id="dk-tp-b">Your ThriftBucks</h2>
          <Balance member={member} tripTotal={tripTotal} />
        </section>
        <section className="dk-card dk-tp-panel" aria-labelledby="dk-tp-a">
          <h2 className="dk-h" id="dk-tp-a">Account</h2>
          <Account member={member} onSignOut={signOut} />
        </section>
      </div>
    </div>
  )
}
