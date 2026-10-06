import { useEffect, useMemo, useState } from 'react'
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

/** The applicant's private interview page: pick a time, then change or cancel it. Opened from our email. */
export default function InterviewPage() {
  useSeo({ title: 'Your interview', path: '/careers/interview', noindex: true })
  const [params] = useSearchParams()
  const token = params.get('t') || ''
  const [state, setState] = useState<InterviewState | null>(null)
  const [picked, setPicked] = useState<InterviewTimeOption | null>(null)
  const [changing, setChanging] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [day, setDay] = useState('')

  useEffect(() => {
    if (!token) {
      setState({ ok: false, detail: 'This page needs the link from your email.' })
      return
    }
    getInterview(token).then(setState)
  }, [token])

  const days = useMemo(() => {
    const map = new Map<string, { date: string; day: string; times: InterviewTimeOption[] }>()
    for (const t of state?.times ?? []) {
      if (!map.has(t.date)) map.set(t.date, { date: t.date, day: t.day, times: [] })
      map.get(t.date)!.times.push(t)
    }
    return [...map.values()]
  }, [state])

  useEffect(() => {
    if (days.length && !days.some((d) => d.date === day)) setDay(days[0].date)
  }, [days, day])

  async function confirm() {
    if (!picked) return
    setBusy(true)
    setError('')
    const next = await bookInterview(token, picked.start)
    setBusy(false)
    if (!next.ok) {
      setError(next.detail || 'That time did not work. Pick another.')
      const fresh = await getInterview(token)
      if (fresh.ok) setState(fresh)
      setPicked(null)
      return
    }
    setState(next)
    setPicked(null)
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
  const current = days.find((d) => d.date === day)

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

        {(!booked || changing) && (
          <section className="cr-card" style={{ marginTop: 22 }}>
            {days.length === 0 ? (
              <>
                <h2>No open times right now</h2>
                <p className="cr-sub">
                  Every time in the next two weeks is taken. Reply to our email or call the store, and we&rsquo;ll find
                  one.
                </p>
              </>
            ) : (
              <>
                <h2>1. Pick a day</h2>
                <div className="cr-chips" style={{ marginTop: 10 }}>
                  {days.map((d) => (
                    <button
                      key={d.date}
                      type="button"
                      className={`cr-chip${d.date === day ? ' on' : ''}`}
                      onClick={() => {
                        setDay(d.date)
                        setPicked(null)
                      }}
                    >
                      {d.day.replace(/^(\w{3})\w*,/, '$1,')}
                    </button>
                  ))}
                </div>
                <h2 style={{ marginTop: 22 }}>2. Pick a time</h2>
                <div className="cr-chips" style={{ marginTop: 10 }}>
                  {(current?.times ?? []).map((t) => (
                    <button
                      key={t.start}
                      type="button"
                      className={`cr-chip${picked?.start === t.start ? ' on' : ''}`}
                      onClick={() => setPicked(t)}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  className="btn btn--primary cr-submit"
                  style={{ marginTop: 22 }}
                  disabled={!picked || busy}
                  onClick={confirm}
                >
                  {busy ? 'Booking…' : picked ? `Book ${picked.day.split(',')[0]} at ${picked.label}` : 'Pick a time'}
                </button>
                {changing && (
                  <button type="button" className="btn btn--ghost" style={{ marginTop: 10 }} onClick={() => setChanging(false)}>
                    Keep my current time
                  </button>
                )}
              </>
            )}
          </section>
        )}

        <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 10 }}>
          Eco-Thrift, 8425 West Center Road, Omaha, NE 68124
        </p>
      </div>
    </>
  )
}
