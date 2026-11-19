/**
 * The applicant's offer page (W4): `/careers/offer?t=<token>`, opened from our email. Same calls, checks and states as
 * the live page (src/pages/careers/OfferPage.tsx): GET the offer; sign (every statement ticked, the e-sign consent,
 * the typed legal name of 3+ letters, a drawn signature, the optional text tick never pre-ticked); decline with an
 * optional reason; signed shows the PDF link (a plain link to the API); declined and expired have their own screens.
 */
import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { declineOffer, getOffer, offerPdfUrl, signOffer, type OfferState } from '../../careers/api'
import { useSeo } from '../../useSeo'
import { Loading, PracticeBar } from './careers/parts'
import { Letter, SignaturePad } from './careers/Sign'
import './careers.css'

function Tick() {
  return (
    <div className="cr-tick" aria-hidden="true">
      <svg className="i" viewBox="0 0 24 24">
        <path d="M5 12.5l4.5 4.5L19 7.5" />
      </svg>
    </div>
  )
}

export default function CareersOffer() {
  useSeo({ title: 'Your offer', path: '/careers/offer', noindex: true })
  const [params] = useSearchParams()
  const token = params.get('t') || ''
  const [state, setState] = useState<OfferState | null>(null)
  const [acks, setAcks] = useState<boolean[]>([])
  const [consent, setConsent] = useState(false)
  // The optional text tick (never pre-ticked): texts about their first day, on the current wording.
  const [textsOk, setTextsOk] = useState(false)
  const [name, setName] = useState('')
  const [signature, setSignature] = useState('')
  const [declining, setDeclining] = useState(false)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!token) {
      setState({ ok: false, detail: 'This page needs the link from your email.' })
      return
    }
    getOffer(token).then((next) => {
      setState(next)
      setAcks((next.acknowledgments ?? []).map(() => false))
      if (next.full_name) setName(next.full_name)
    })
  }, [token])

  async function sign() {
    const missing: Record<string, string> = {}
    if (!acks.every(Boolean)) missing.acks = 'Tick each statement to accept.'
    if (!consent) missing.consent = 'Tick the box to sign electronically.'
    if (name.trim().length < 3) missing.name = 'Type your full legal name.'
    if (!signature) missing.signature = 'Sign in the box with your finger.'
    setErrors(missing)
    if (Object.keys(missing).length) {
      setError('A few things are missing. See the notes in red.')
      return
    }
    setBusy(true)
    setError('')
    const next = await signOffer(token, { name: name.trim(), signature, acks, consent, texts_consent: textsOk })
    setBusy(false)
    if (!next.ok) {
      setError(next.detail || 'That did not go through. Please try again.')
      setErrors(next.errors ?? {})
      return
    }
    setState(next)
    window.scrollTo({ top: 0 })
  }

  async function decline() {
    setBusy(true)
    setError('')
    const next = await declineOffer(token, reason.trim())
    setBusy(false)
    if (!next.ok) {
      setError(next.detail || 'That did not go through. Please try again.')
      return
    }
    setState(next)
    window.scrollTo({ top: 0 })
  }

  if (state === null) return <Loading />

  if (!state.ok) {
    return (
      <>
        <section className="cr-hero">
          <div className="lbl">Your offer</div>
          <h1 className="disp cr-h1">
            This link <span>isn&rsquo;t working</span>
          </h1>
          <p className="cr-sub">{state.detail}</p>
          <p className="cr-sub2">Questions? Call the store or reply to our email.</p>
        </section>
        <section className="cr-band cr-lime cr-two">
          <Link className="btn btn-ink" to="/careers">
            Careers
          </Link>
          <Link className="btn btn-line" to="/#visit">
            Visit the store
          </Link>
        </section>
      </>
    )
  }

  if (state.status === 'signed') {
    return (
      <>
        <PracticeBar on={state.practice}>A test offer: the signed copy is stamped PRACTICE.</PracticeBar>
        <section className="cr-hero cr-done">
          <Tick />
          <div className="lbl">Signed</div>
          <h1 className="disp cr-h1 cr-h1-role">{/* a hyphen that never breaks the name over two lines */}
          Welcome to Eco{'‑'}Thrift, {state.first_name}</h1>
          <p className="cr-sub">
            You start <b>{state.start}</b> as our new {state.position}.
          </p>
          <p className="cr-sub2">
            We emailed you a copy of the signed offer, and we&rsquo;ll send what to expect and what to bring before your
            first day.
          </p>
        </section>
        {state.has_pdf && (
          <section className="cr-band cr-lime">
            <a className="btn btn-ink cr-wide" href={offerPdfUrl(token)}>
              Download your signed copy
            </a>
          </section>
        )}
      </>
    )
  }

  if (state.status === 'declined' || state.status === 'expired') {
    const declined = state.status === 'declined'
    return (
      <section className="cr-hero">
        <div className="lbl">Your offer</div>
        <h1 className="disp cr-h1 cr-h1-role">{declined ? 'Thanks for letting us know' : 'This offer has expired'}</h1>
        <p className="cr-sub">
          {declined
            ? 'You declined this offer, and we told the hiring manager.'
            : `It needed an answer by ${state.respond_by}.`}
        </p>
        <p className="cr-sub2">
          {declined
            ? 'If anything changes, call the store or reply to our email. We’d be glad to hear from you.'
            : 'If you still want the job, call the store or reply to our email and we’ll talk.'}
        </p>
      </section>
    )
  }

  const items = state.acknowledgments ?? []

  return (
    <>
      <PracticeBar on={state.practice}>A test offer, not a real one. Signing it works the same way.</PracticeBar>
      <section className="cr-hero">
        <div className="lbl">Your offer from Eco-Thrift</div>
        <h1 className="disp cr-h1 cr-h1-role">Congratulations, {state.first_name}</h1>
        <p className="cr-sub">Read your offer, then sign it below with your finger.</p>
        <p className="cr-sub2">Please answer by {state.respond_by}.</p>
      </section>

      <section className="cr-facts">
        <div>
          <span>Role</span>
          <b>{state.position}</b>
        </div>
        <div>
          <span>Pay</span>
          <b className="tn">${state.pay_rate} an hour</b>
        </div>
        <div>
          <span>Start</span>
          <b>{state.start}</b>
        </div>
      </section>

      <section className="cr-text">
        <div className="cr-sec">
          <h2>The offer</h2>
          <Letter text={state.letter ?? ''} />
        </div>
      </section>

      {!declining && (
        <section className="cr-band cr-cream cr-signbox">
          <h2 className="disp">Accept and sign</h2>
          <p className="cr-line">Tick each line, type your name, and sign in the box.</p>
          <div className={errors.acks ? 'cr-bad' : ''}>
            {items.map((text, i) => (
              <label key={text} className="cr-check">
                <input
                  type="checkbox"
                  checked={!!acks[i]}
                  onChange={(e) => setAcks((a) => a.map((v, j) => (j === i ? e.target.checked : v)))}
                />
                <span>{text}</span>
              </label>
            ))}
            <div className="cr-err">{errors.acks}</div>
          </div>
          <div className={errors.consent ? 'cr-bad' : ''}>
            <label className="cr-check">
              <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
              <span>{state.consent}</span>
            </label>
            <div className="cr-err">{errors.consent}</div>
          </div>

          <div className={`cr-q${errors.name ? ' cr-bad' : ''}`}>
            <label className="cr-label" htmlFor="cr-signer">
              Your full legal name
            </label>
            <input id="cr-signer" type="text" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
            <div className="cr-err">{errors.name}</div>
          </div>
          <div className={`cr-q${errors.signature ? ' cr-bad' : ''}`}>
            <span className="cr-label">Your signature</span>
            <SignaturePad
              onChange={(png) => {
                setSignature(png)
                if (png) setErrors((e) => ({ ...e, signature: '' }))
              }}
            />
            <div className="cr-err">{errors.signature}</div>
          </div>

          {state.texts && (
            <div className="cr-q">
              <span className="cr-label">
                Optional
              </span>
              <label className="cr-check">
                <input type="checkbox" checked={textsOk} onChange={(e) => setTextsOk(e.target.checked)} />
                <span>
                  {state.texts.wording} <i>(to your number ending {state.texts.phone_last4})</i>
                </span>
              </label>
            </div>
          )}

          <button type="button" className="btn btn-ink cr-wide" disabled={busy} onClick={sign}>
            {busy ? 'Signing…' : 'Sign and accept the offer'}
          </button>
          <button
            type="button"
            className="btn btn-line cr-wide cr-gap"
            disabled={busy}
            onClick={() => {
              setDeclining(true)
              setError('')
            }}
          >
            I can&rsquo;t accept this offer
          </button>
          {error && (
            <div className="cr-alert cr-alert-in cr-alert-after" role="alert">
              {error}
            </div>
          )}
        </section>
      )}

      {declining && (
        <section className="cr-band cr-cream cr-signbox">
          <h2 className="disp">Decline the offer</h2>
          <p className="cr-line">We understand. A short reason helps us (optional).</p>
          <div className="cr-q">
            <textarea aria-label="Reason (optional)" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={1000} />
          </div>
          <div className="cr-two">
            <button type="button" className="btn btn-ink" disabled={busy} onClick={decline}>
              {busy ? 'Sending…' : 'Decline the offer'}
            </button>
            <button type="button" className="btn btn-line" disabled={busy} onClick={() => setDeclining(false)}>
              Go back
            </button>
          </div>
          {error && (
            <div className="cr-alert cr-alert-in cr-alert-after" role="alert">
              {error}
            </div>
          )}
        </section>
      )}

      <p className="fine cr-foot">Eco-Thrift, 8425 West Center Road, Omaha, NE 68124</p>
    </>
  )
}
