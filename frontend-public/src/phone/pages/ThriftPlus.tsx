/**
 * /thriftplus (piece S5; mockup pages/thriftplus.html, prefix `ac`; PLAN-SCANNER.md rows 21-24 and the coordinator's
 * call 1: the scanner has no tabs, the member's own live here).
 *
 * - Signed out (and a phone scanning without signing in): what Thrift+ is in one screen: the headline, the example sum
 *   as the home band shows it, "Join free" (/scan?view=join), "Sign in" (/scan), the three number tiles; a phone that
 *   scans without signing in also sees its trip under them.
 * - A member: the balance big with the use-by date and the small member QR (a tap shows it large: `?show=qr`), two
 *   quiet rows to the ThriftBucks detail (`?show=bucks`) and Account (`?show=account`), then My trip (S4's `TripList`,
 *   "Scan a tag" when it is empty). Each `?show=` is its own view (owner 2026-11-19 night: calm, nothing opens in place,
 *   no scripted scrolling); the old /scan?view=qr|card|join, bucks, account hand over here (scan/route.ts).
 * - A member who still has to add a phone or finish joining goes to the scanner, which holds them there (as live:
 *   both are required).
 *
 * One member for the whole site: the session comes from scan/store.ts (which reads lib/member.ts), never a second ask.
 */
import { useEffect, useLayoutEffect } from 'react'
import { Link, Navigate, useLocation, useNavigate, useNavigationType, useSearchParams } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useDay } from '../lib/day'
import { bucks, shortDate } from '../lib/format'
import { useMember } from '../lib/member'
import type { ThriftPlusShow } from '../scan/contracts'
import { bucksReady, hasFinishSteps, type ThriftPlusMember } from '../scan/core'
import { Account, Balance, Wallet, qrLine } from '../scan/member'
import { actions, useAction, useCart, useMyCard, useScanSession } from '../scan/store'
import { TripList } from '../scan/trip'
import { leaveGuest, scanIsRoute } from '../scan/switch'
import { asset, Tag } from '../shell/Tag'
import { TP_BLACK_FRIDAY } from './words'
import './ThriftPlus.css'

/** The website's own sign-in hint (src/auth.tsx): the server ends that session on sign out; the hint goes too. */
const WEBSITE_HINT_KEY = 'ecothrift.public_session.v1'

const SHOWS: ThriftPlusShow[] = ['qr', 'bucks', 'account']

function showOf(v: string | null): ThriftPlusShow | null {
  return v && (SHOWS as string[]).includes(v) ? (v as ThriftPlusShow) : null
}

/** A link into the scanner: a route when the new scanner is on for this visit, else a page load (scan/switch.ts). */
function ScanLink({ to, className, children, onClick, testId }: { to: string; className: string; children: ReactNode; onClick?: () => void; testId?: string }) {
  return scanIsRoute() ? (
    <Link className={className} to={to} onClick={onClick} data-testid={testId}>{children}</Link>
  ) : (
    <a className={className} href={to} onClick={onClick} data-testid={testId}>{children}</a>
  )
}

/** Over to the scanner, replacing this address (Add your mobile number, Finish joining: required, as live). */
function ToScan({ to }: { to: string }) {
  const route = scanIsRoute()
  useEffect(() => {
    if (!route) window.location.replace(to)
  }, [route, to])
  return route ? <Navigate to={to} replace /> : <div className="ac-hold" />
}

const IconNext = () => (
  <svg className="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
)
const IconBack = () => (
  <svg className="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>
)

export default function ThriftPlus() {
  const { session } = useScanSession()
  const known = useMember()
  const [params] = useSearchParams()
  const show = showOf(params.get('show'))
  const how = useNavigationType()
  useDay()

  useEffect(() => {
    const prev = document.title
    document.title = 'Thrift+ · Eco-Thrift'
    return () => {
      document.title = prev
    }
  }, [])

  // A new view opens at its top (the app's Scroll only does this for a new path); Back keeps the browser's place.
  const view = show === 'bucks' || show === 'account' ? show : 'main'
  useLayoutEffect(() => {
    if (how !== 'POP') window.scrollTo(0, 0)
  }, [view]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!session) {
    // Not known yet: the band the answer will most likely fill, so nothing jumps when it lands.
    return <div className={known.status === 'member' ? 'ac-hero ac-wait-in' : 'ac-hero ac-wait-out'} data-testid="thriftplus-wait" />
  }
  if (session.status !== 'member') return <SignedOut guest={session.status === 'guest'} />
  const member = session.member
  if (member.needs_phone) return <ToScan to="/scan" />
  if (hasFinishSteps(member)) return <ToScan to="/scan?view=finish" />
  if (view === 'bucks') return <BucksView member={member} />
  if (view === 'account') return <AccountView member={member} />
  return <MemberMain member={member} />
}

// ── Signed out ──────────────────────────────────────────────────────────────

function SignedOut({ guest }: { guest: boolean }) {
  return (
    <div className="ac" data-testid="thriftplus-out">
      <section className="ac-hero">
        <img className="ac-wm" src={asset('phone/thriftplus-wordmark-white.svg')} width={70} height={26} alt="Thrift+" />
        <h1 className="disp">
          Collect <em>ThriftBucks</em>
        </h1>
        <div className="ac-sum">
          <Tag price={100} cents="auto" />
          <div className="ac-outs">
            <div className="ac-out if-normal">
              <b className="tn">Keep 20.00 ThriftBucks</b>for your next visit
            </div>
            <div className="ac-out if-bf">
              <b className="tn">Black Friday $80.00</b>the same price for everyone
            </div>
            <div className="ac-out if-normal">
              <b className="tn">Or pay $90.00</b>at the register today
            </div>
            <div className="ac-out if-bf">
              <b className="tn">Or keep 20.00 ThriftBucks</b>pay $100.00 and ask to build
            </div>
          </div>
        </div>
        <div className="ac-cta">
          <ScanLink className="btn btn-lime" to="/scan?view=join" testId="join-free">
            Join free
          </ScanLink>
          <ScanLink className="btn btn-line" to="/scan" onClick={leaveGuest} testId="sign-in">
            Sign in
          </ScanLink>
        </div>
      </section>
      <BlackFridayNote />
      <section className="ac-three">
        <div>
          <b className="disp tn">30</b>
          <span>days at full value</span>
        </div>
        <div>
          <b className="disp tn">50%</b>
          <span>if you redeem the same day</span>
        </div>
        <div>
          <b className="disp tn">3</b>
          <span>day returns, qualifying items</span>
        </div>
      </section>
      {guest ? <GuestTrip /> : null}
    </div>
  )
}

/** Black Friday's two lines (owner 2026-11-25), for members and everyone else, under the band. The day is known at the
 *  first paint (the stamped feed), so the card never appears or goes later. */
function BlackFridayNote() {
  if (useDay() !== 'bf') return null
  return (
    <section className="ac-bf" data-testid="thriftplus-bf">
      <div>
        <h2 className="disp">{TP_BLACK_FRIDAY.head}</h2>
        {TP_BLACK_FRIDAY.lines.map((l) => (
          <p key={l}>{l}</p>
        ))}
      </div>
    </section>
  )
}

/** A phone scanning without signing in keeps its trip on the phone: shown here when it has lines (at the bottom). */
function GuestTrip() {
  const cart = useCart()
  if (!cart.data?.lines.length) return null
  return (
    <section className="ac-trip" data-testid="thriftplus-trip">
      <div className="sh">
        <h2>My trip</h2>
        <ScanLink className="ac-more" to="/scan">Scan more</ScanLink>
      </div>
      <TripList />
    </section>
  )
}

// ── A member ────────────────────────────────────────────────────────────────

function useByOf(member: ThriftPlusMember, fallback: string): string {
  const raw = (member as ThriftPlusMember & { bucks_use_by?: unknown }).bucks_use_by
  return shortDate(typeof raw === 'string' && raw ? raw : fallback)
}

function MemberMain({ member }: { member: ThriftPlusMember }) {
  const known = useMember()
  const card = useMyCard()
  const day = useDay()
  const ready = bucksReady(member.banked_rewards, member.bucks_available)
  const amount = bucks(Math.abs(ready.now))
  const useBy = useByOf(member, known.member?.useBy ?? '')
  const line = qrLine(member, card.data)
  const fine =
    line !== 'Show this at the register.'
      ? line
      : day === 'bf'
        ? 'Black Friday: one price for everyone · Like to build? Ask at the register'
        : useBy
          ? `Use by ${useBy} · Thrift+ members`
          : 'Thrift+ members. Most items.'
  return (
    <div className="ac" data-testid="thriftplus-member">
      <section className="ac-hero">
        <img className="ac-wm" src={asset('phone/thriftplus-wordmark-white.svg')} width={70} height={26} alt="Thrift+" />
        <div className="ac-bal">
          <div>
            <span className="ac-hi">{member.first_name}, you have</span>
            <b className={`disp tn ac-n${amount.length > 6 ? ' ac-n-long' : ''}`} data-testid="thriftplus-balance">{amount}</b>
            <span className="ac-u">ThriftBucks</span>
            <p className="fine ac-use" data-testid="thriftplus-use">{fine}</p>
          </div>
          <Wallet member={member} />
        </div>
      </section>

      <BlackFridayNote />

      <nav className="ac-go" aria-label="Thrift+">
        <Link to="/thriftplus?show=bucks" data-testid="go-bucks">
          <span>
            <b>Your ThriftBucks</b>
            <span>Each one&apos;s use-by date, in the order used</span>
          </span>
          <IconNext />
        </Link>
        <Link to="/thriftplus?show=account" data-testid="go-account">
          <span>
            <b>Account</b>
            <span>Name, phone, people, emails, sign out</span>
          </span>
          <IconNext />
        </Link>
      </nav>

      <MemberTrip />
    </div>
  )
}

function MemberTrip() {
  const cart = useCart()
  const empty = !!cart.data && cart.data.lines.length === 0
  return (
    <section className="ac-trip" data-testid="thriftplus-trip">
      <div className="sh">
        <h2>My trip</h2>
        {cart.data && !empty ? <ScanLink className="ac-more" to="/scan">Scan more</ScanLink> : null}
      </div>
      {empty ? (
        <div className="ac-empty" data-testid="trip-empty">
          <p>Nothing in your trip yet</p>
          <ScanLink className="btn btn-ink" to="/scan">Scan a tag</ScanLink>
        </div>
      ) : (
        <TripList />
      )}
    </section>
  )
}

/** Back to the Thrift+ page: the phone's Back when we came from it, else the page itself. */
function BackRow() {
  const nav = useNavigate()
  const loc = useLocation()
  return (
    <button
      type="button"
      className="backrow ac-back"
      onClick={() => (loc.key !== 'default' ? nav(-1) : nav('/thriftplus', { replace: true }))}
    >
      <IconBack />
      Thrift+
    </button>
  )
}

function BucksView({ member }: { member: ThriftPlusMember }) {
  const cart = useCart()
  const tripTotal = Number.parseFloat(cart.data?.totals.reward_total ?? '0') || 0
  return (
    <div className="ac ac-view" data-testid="thriftplus-bucks">
      <BackRow />
      <h1 className="disp pg-h ac-title">Your ThriftBucks</h1>
      <Balance member={member} tripTotal={tripTotal} />
    </div>
  )
}

function AccountView({ member }: { member: ThriftPlusMember }) {
  const out = useAction(actions.signOut)
  const nav = useNavigate()
  const signOut = () => {
    try {
      localStorage.removeItem(WEBSITE_HINT_KEY)
    } catch {
      /* private mode: nothing kept */
    }
    void out
      .run(undefined)
      .catch(() => undefined)
      .then(() => nav('/thriftplus', { replace: true }))
  }
  return (
    <div className="ac ac-view" data-testid="thriftplus-account">
      <BackRow />
      <h1 className="disp pg-h ac-title">Account</h1>
      <Account member={member} onSignOut={signOut} />
    </div>
  )
}
