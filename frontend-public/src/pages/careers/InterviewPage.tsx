import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import '../../careers/careers.css'
import {
  bookInterview,
  cancelInterview,
  getInterview,
  type InterviewState,
  type InterviewTimeOption,
} from '../../careers/api'
import { useSeo } from '../../useSeo'
import { PracticeBar } from './CareersPage'
import { InterviewPicker } from './InterviewPicker'

/** The applicant's private interview page: pick a time, then change or cancel it. Opened from our email. */
export default function InterviewPage() {
  useSeo({ title: 'Your interview', path: '/careers/interview', noindex: true })
  const [params] = useSearchParams()
  const token = params.get('t') || ''
  const [state, setState] = useState<InterviewState | null>(null)
  const [changing, setChanging] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!token) {
      setState({ ok: false, detail: 'This page needs the link from your email.' })
      return
    }
    getInterview(token).then(setState)
  }, [token])

  async function confirm(picked: InterviewTimeOption) {
    setBusy(true)
    setError('')
    const next = await bookInterview(token, picked.start)
    setBusy(false)
    if (!next.ok) {
      setError(next.detail || 'That time did not work. Pick another.')
      const fresh = await getInterview(token)
      if (fresh.ok) setState(fresh)
      return
    }
    setState(next)
    setChanging(false)
    window.scrollTo({ top: 0 })
  }

  async function cancel() {
    if (!window.confirm('Cancel your interview?')) return
    setBusy(true)
    const next = await cancelInterview(token)
    setBusy(false)
    if (next.ok) {
      setState(next)
      setChanging(false)
    } else setError(next.detail || 'Could not cancel. Please call the store.')
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
        <span className="eyebrow">Interview</span>
        <h1>This link isn&rsquo;t working</h1>
        <p>{state.detail}</p>
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

  const booked = state.interview
  const roles = (state.roles ?? []).join(' and ')

  return (
    <>
      <PracticeBar on={state.practice} />
      <div className="wrap cr-form">
        <div className="pagehead" style={{ paddingTop: 32 }}>
          <span className="eyebrow">Interview at Eco-Thrift</span>
          <h1>{booked && !changing ? `You're set, ${state.first_name}.` : `Pick a time, ${state.first_name}`}</h1>
          <p className="lead">
            {booked && !changing
              ? `Your interview for ${roles}.`
              : `For ${roles}. Interviews take about ${state.length_minutes} minutes at ${state.place}.`}
          </p>
        </div>

        {error && (
          <div className="formerror" style={{ marginTop: 18 }}>
            {error}
          </div>
        )}

        {booked && !changing && (
          <section className="cr-card" style={{ marginTop: 22 }}>
            <h2>{booked.when}</h2>
            <p className="cr-sub" style={{ marginBottom: 6 }}>
              At {booked.place}. Come to the register and ask for {booked.interviewer}.
            </p>
            <p className="cr-sub">We emailed you a calendar file so it&rsquo;s on your phone.</p>
            <div className="hbtns" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 8 }}>
              <button type="button" className="btn btn--ghost" onClick={() => setChanging(true)} disabled={busy}>
                Change time
              </button>
              <button type="button" className="btn btn--ghost" onClick={cancel} disabled={busy}>
                Cancel interview
              </button>
            </div>
          </section>
        )}

        {(!booked || changing) &&
          ((state.times ?? []).length === 0 ? (
            <section className="cr-card" style={{ marginTop: 22 }}>
              <h2>No open times right now</h2>
              <p className="cr-sub">
                Every open time is taken. Reply to our email or call the store, and we&rsquo;ll find one.
              </p>
            </section>
          ) : (
            <div style={{ marginTop: 22 }}>
              <InterviewPicker times={state.times ?? []} busy={busy} onBook={confirm} />
              {changing && (
                <button type="button" className="btn btn--ghost" style={{ marginTop: 12 }} onClick={() => setChanging(false)}>
                  Keep my current time
                </button>
              )}
            </div>
          ))}

        <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 10 }}>
          Eco-Thrift, 8425 West Center Road, Omaha, NE 68124
        </p>
      </div>
    </>
  )
}
