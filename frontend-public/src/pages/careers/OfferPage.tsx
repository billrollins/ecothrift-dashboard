import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import '../../careers/careers.css'
import { declineOffer, getOffer, offerPdfUrl, signOffer, type OfferState } from '../../careers/api'
import { useSeo } from '../../useSeo'
import { PracticeBar } from './CareersPage'

/** The letter: paragraphs, with "- " lines as a list. */
function Letter({ text }: { text: string }) {
  return (
    <div className="cr-letter">
      {text.split('\n\n').map((para, i) => {
        const lines = para.split('\n').filter((l) => l.trim())
        if (lines.length && lines.every((l) => l.trimStart().startsWith('- '))) {
          return (
            <ul key={i}>
              {lines.map((l) => (
                <li key={l}>{l.trimStart().slice(2)}</li>
              ))}
            </ul>
          )
        }
        return <p key={i}>{lines.join('\n')}</p>
      })}
    </div>
  )
}

/** Sign with a finger (or mouse). Calls onChange with a PNG data URL, or '' when cleared. */
function SignaturePad({ onChange }: { onChange: (png: string) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const last = useRef<{ x: number; y: number } | null>(null)
  const ink = useRef(0)

  function setup() {
    const el = canvas.current
    if (!el) return
    const ratio = Math.min(window.devicePixelRatio || 1, 2)
    el.width = Math.round(el.clientWidth * ratio)
    el.height = Math.round(el.clientHeight * ratio)
    const ctx = el.getContext('2d')
    if (!ctx) return
    ctx.scale(ratio, ratio)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.lineWidth = 2.4
    ctx.strokeStyle = '#1b2a4a'
  }

  useEffect(() => {
    setup()
    const resize = () => {
      // Resizing wipes the canvas; only redo it while nothing is drawn.
      if (ink.current === 0) setup()
    }
    window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
  }, [])

  function point(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  function down(e: React.PointerEvent<HTMLCanvasElement>) {
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    drawing.current = true
    last.current = point(e)
    const ctx = e.currentTarget.getContext('2d')
    if (ctx && last.current) {
      ctx.beginPath()
      ctx.arc(last.current.x, last.current.y, 1.1, 0, Math.PI * 2)
      ctx.fillStyle = '#1b2a4a'
      ctx.fill()
    }
  }

  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current || !last.current) return
    e.preventDefault()
    const ctx = e.currentTarget.getContext('2d')
    const next = point(e)
    if (ctx) {
      ctx.beginPath()
      ctx.moveTo(last.current.x, last.current.y)
      ctx.lineTo(next.x, next.y)
      ctx.stroke()
    }
    ink.current += Math.hypot(next.x - last.current.x, next.y - last.current.y)
    last.current = next
  }

  function up() {
    if (!drawing.current) return
    drawing.current = false
    last.current = null
    // A real signature has some length to it; a tap or a dot does not count.
    onChange(ink.current > 40 && canvas.current ? canvas.current.toDataURL('image/png') : '')
  }

  function clear() {
    const el = canvas.current
    if (!el) return
    el.getContext('2d')?.clearRect(0, 0, el.width, el.height)
    ink.current = 0
    onChange('')
  }

  return (
    <div className="cr-sigpad">
      <canvas
        ref={canvas}
        aria-label="Sign here with your finger"
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        onPointerLeave={up}
      />
      <span className="cr-sigline" />
      <span className="cr-sighint">Sign above the line with your finger</span>
      <button type="button" className="btn btn--ghost cr-sigclear" onClick={clear}>
        Clear
      </button>
    </div>
  )
}

/** The applicant's private offer page: read the letter, tick, sign with a finger. Opened from our email. */
export default function OfferPage() {
  useSeo({ title: 'Your offer', path: '/careers/offer', noindex: true })
  const [params] = useSearchParams()
  const token = params.get('t') || ''
  const [state, setState] = useState<OfferState | null>(null)
  const [acks, setAcks] = useState<boolean[]>([])
  const [consent, setConsent] = useState(false)
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
    const next = await signOffer(token, { name: name.trim(), signature, acks, consent })
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

  if (state === null) {
    return (
      <div className="wrap" aria-busy="true">
        <div className="pagehead">
          <span className="skline" style={{ width: 220 }} />
        </div>
      </div>
    )
  }

  if (!state.ok) {
    return (
      <div className="wrap cr-done">
        <span className="eyebrow">Your offer</span>
        <h1>This link isn&rsquo;t working</h1>
        <p>{state.detail}</p>
        <p>Questions? Call the store or reply to our email.</p>
        <div className="hbtns" style={{ marginTop: 22 }}>
          <Link className="btn btn--ghost" to="/careers">
            Careers
          </Link>
          <Link className="btn btn--ghost" to="/visit">
            Visit the store
          </Link>
        </div>
      </div>
    )
  }

  if (state.status === 'signed') {
    return (
      <>
        <PracticeBar on={state.practice}>A test offer: the signed copy is stamped PRACTICE.</PracticeBar>
        <div className="wrap cr-done">
          <span className="eyebrow">Signed</span>
          <h1>Welcome to Eco-Thrift, {state.first_name}!</h1>
          <p>
            You start <b>{state.start}</b> as our new {state.position}. We emailed you a copy of the signed offer, and
            we&rsquo;ll send what to expect and what to bring before your first day.
          </p>
          {state.has_pdf && (
            <div className="hbtns" style={{ marginTop: 22 }}>
              <a className="btn btn--primary" href={offerPdfUrl(token)}>
                Download your signed copy
              </a>
            </div>
          )}
        </div>
      </>
    )
  }

  if (state.status === 'declined') {
    return (
      <div className="wrap cr-done">
        <span className="eyebrow">Your offer</span>
        <h1>Thanks for letting us know</h1>
        <p>
          You declined this offer, and we told the hiring manager. If anything changes, call the store or reply to our
          email. We&rsquo;d be glad to hear from you.
        </p>
      </div>
    )
  }

  if (state.status === 'expired') {
    return (
      <div className="wrap cr-done">
        <span className="eyebrow">Your offer</span>
        <h1>This offer has expired</h1>
        <p>
          It needed an answer by {state.respond_by}. If you still want the job, call the store or reply to our email
          and we&rsquo;ll talk.
        </p>
      </div>
    )
  }

  const items = state.acknowledgments ?? []

  return (
    <>
      <PracticeBar on={state.practice}>A test offer, not a real one. Signing it works the same way.</PracticeBar>
      <div className="wrap cr-form">
        <div className="pagehead" style={{ paddingTop: 32 }}>
          <span className="eyebrow">Your offer from Eco-Thrift</span>
          <h1>Congratulations, {state.first_name}!</h1>
          <p className="lead">Read your offer, then sign it below with your finger. Please answer by {state.respond_by}.</p>
        </div>

        <section className="cr-card" style={{ marginTop: 22 }}>
          <h2>The offer</h2>
          <dl className="cr-terms" style={{ marginBottom: 18 }}>
            <dt>Role</dt>
            <dd>{state.position}</dd>
            <dt>Pay</dt>
            <dd>${state.pay_rate} an hour</dd>
            <dt>Start</dt>
            <dd>{state.start}</dd>
          </dl>
          <Letter text={state.letter ?? ''} />
        </section>

        {!declining && (
          <section className="cr-card">
            <h2>Accept and sign</h2>
            <p className="cr-sub">Tick each line, type your name, and sign in the box.</p>
            <div className={errors.acks ? 'cr-bad' : ''}>
              {items.map((text, i) => (
                <label key={text} className="cr-ack">
                  <input
                    type="checkbox"
                    checked={!!acks[i]}
                    onChange={(e) => setAcks((a) => a.map((v, j) => (j === i ? e.target.checked : v)))}
                  />
                  <span>{text}</span>
                </label>
              ))}
              {errors.acks && <div className="cr-err">{errors.acks}</div>}
            </div>
            <label className="cr-ack" style={{ marginTop: 6 }}>
              <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
              <span>{state.consent}</span>
            </label>
            {errors.consent && <div className="cr-err">{errors.consent}</div>}

            <div className={`cr-q${errors.name ? ' cr-bad' : ''}`} style={{ marginTop: 16 }}>
              <span className="cr-label">Your full legal name</span>
              <input type="text" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
              {errors.name && <span className="cr-err">{errors.name}</span>}
            </div>
            <div className={`cr-q${errors.signature ? ' cr-bad' : ''}`}>
              <span className="cr-label">Your signature</span>
              <SignaturePad
                onChange={(png) => {
                  setSignature(png)
                  if (png) setErrors((e) => ({ ...e, signature: '' }))
                }}
              />
              {errors.signature && <span className="cr-err">{errors.signature}</span>}
            </div>

            {error && (
              <div className="formerror" style={{ marginBottom: 14 }}>
                {error}
              </div>
            )}
            <button type="button" className="btn btn--primary cr-submit" disabled={busy} onClick={sign}>
              {busy ? 'Signing…' : 'Sign and accept the offer'}
            </button>
            <button
              type="button"
              className="btn btn--ghost"
              style={{ marginTop: 12 }}
              disabled={busy}
              onClick={() => {
                setDeclining(true)
                setError('')
              }}
            >
              I can&rsquo;t accept this offer
            </button>
          </section>
        )}

        {declining && (
          <section className="cr-card">
            <h2>Decline the offer</h2>
            <p className="cr-sub">We understand. A short reason helps us (optional).</p>
            <div className="cr-q">
              <textarea aria-label="Reason (optional)" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={1000} />
            </div>
            {error && (
              <div className="formerror" style={{ marginBottom: 14 }}>
                {error}
              </div>
            )}
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button type="button" className="btn btn--primary" disabled={busy} onClick={decline}>
                {busy ? 'Sending…' : 'Decline the offer'}
              </button>
              <button type="button" className="btn btn--ghost" disabled={busy} onClick={() => setDeclining(false)}>
                Go back
              </button>
            </div>
          </section>
        )}

        <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 10 }}>
          Eco-Thrift, 8425 West Center Road, Omaha, NE 68124
        </p>
      </div>
    </>
  )
}
