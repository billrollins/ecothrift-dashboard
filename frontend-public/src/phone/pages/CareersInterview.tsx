/**
 * The applicant's interview page (W4): `/careers/interview?t=<token>`, opened from our email. Same calls and states as
 * the live page (src/pages/careers/InterviewPage.tsx): GET the state, POST a time to book or move it, POST cancel.
 * A failed booking shows why and reloads the open times. Cancel asks in place (no browser pop-up) before it calls.
 */
import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { bookInterview, cancelInterview, getInterview, type InterviewState, type InterviewTimeOption } from '../../careers/api'
import { useSeo } from '../../useSeo'
import { Picker } from './careers/Picker'
import { Loading, PracticeBar } from './careers/parts'
import './careers.css'

export default function CareersInterview() {
  useSeo({ title: 'Your interview', path: '/careers/interview', noindex: true })
  const [params] = useSearchParams()
  const token = params.get('t') || ''
  const [state, setState] = useState<InterviewState | null>(null)
  const [changing, setChanging] = useState(false)
  const [asking, setAsking] = useState(false)
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
    setBusy(true)
    const next = await cancelInterview(token)
    setBusy(false)
    setAsking(false)
    if (next.ok) {
      setState(next)
      setChanging(false)
    } else setError(next.detail || 'Could not cancel. Please call the store.')
  }

  if (state === null) return <Loading />

  if (!state.ok) {
    return (
      <>
        <section className="cr-hero">
          <div className="lbl">Interview</div>
          <h1 className="disp cr-h1">
            This link <span>isn&rsquo;t working</span>
          </h1>
          <p className="cr-sub">{state.detail}</p>
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

  const booked = state.interview
  const roles = (state.roles ?? []).join(' and ')
  const set = booked && !changing

  return (
    <>
      <PracticeBar on={state.practice} />
      <section className="cr-hero">
        <div className="lbl">Interview at Eco-Thrift</div>
        <h1 className="disp cr-h1 cr-h1-role">{set ? `You're set, ${state.first_name}` : `Pick a time, ${state.first_name}`}</h1>
        <p className="cr-sub">
          {set
            ? `Your interview for ${roles}.`
            : `For ${roles}. Interviews take about ${state.length_minutes} minutes at ${state.place}.`}
        </p>
      </section>

      {error && (
        <div className="cr-alert" role="alert">
          {error}
        </div>
      )}

      {set && booked && (
        <section className="cr-band cr-white">
          <div className="lbl cr-green">Your interview</div>
          <h2 className="disp cr-when">{booked.when}</h2>
          <p className="cr-line">
            At {booked.place}. Come to the register and ask for {booked.interviewer}.
          </p>
          <p className="fine cr-grey">We emailed you a calendar file so it&rsquo;s on your phone.</p>
          {asking ? (
            <div className="cr-ask">
              <b>Cancel your interview?</b>
              <div className="cr-two">
                <button type="button" className="btn btn-ink" onClick={cancel} disabled={busy}>
                  {busy ? 'Cancelling…' : 'Yes, cancel it'}
                </button>
                <button type="button" className="btn btn-line" onClick={() => setAsking(false)} disabled={busy}>
                  Keep it
                </button>
              </div>
            </div>
          ) : (
            <div className="cr-ask">
              <span />
              <div className="cr-two">
                <button type="button" className="btn btn-ink" onClick={() => setChanging(true)} disabled={busy}>
                  Change time
                </button>
                <button type="button" className="btn btn-line" onClick={() => setAsking(true)} disabled={busy}>
                  Cancel interview
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      {!set &&
        ((state.times ?? []).length === 0 ? (
          <section className="cr-band cr-white">
            <h2 className="disp cr-when">No open times right now</h2>
            <p className="cr-line">Every open time is taken. Reply to our email or call the store, and we&rsquo;ll find one.</p>
          </section>
        ) : (
          <section className="cr-band cr-white">
            <Picker times={state.times ?? []} busy={busy} onBook={confirm} />
            {changing && (
              <button type="button" className="btn btn-line cr-wide cr-keep" onClick={() => setChanging(false)}>
                Keep my current time
              </button>
            )}
          </section>
        ))}

      <p className="fine cr-foot">Eco-Thrift, 8425 West Center Road, Omaha, NE 68124</p>
    </>
  )
}
