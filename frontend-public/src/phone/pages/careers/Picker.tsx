/**
 * The interview time picker in the phone look (W4). The live picker's logic (src/pages/careers/InterviewPicker.tsx):
 * a month calendar where only days with open times can be tapped (each shows how many), then that day's times
 * grouped Morning / Afternoon / Evening, arrows to the next or last open day, and one Book button. One step shows at a
 * time, as the live picker does on a phone.
 */
import { useEffect, useMemo, useState } from 'react'
import type { InterviewTimeOption } from '../../../careers/api'

type Day = { date: string; day: string; times: InterviewTimeOption[] }

const at = (iso: string) => new Date(`${iso}T12:00`)
const monthKey = (iso: string) => iso.slice(0, 7)
export const shortDay = (iso: string) => at(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
const longDay = (iso: string) => at(iso).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })

/** "10:00 AM" -> Morning; noon to 4:59 PM -> Afternoon; 5 PM on -> Evening. */
export function partOfDay(label: string) {
  const [hm, ap] = label.split(' ')
  const hour = (Number(hm.split(':')[0]) % 12) + (ap === 'PM' ? 12 : 0)
  return hour < 12 ? 'Morning' : hour < 17 ? 'Afternoon' : 'Evening'
}

function Arrow({ dir, label, disabled, onClick }: { dir: 'prev' | 'next'; label: string; disabled: boolean; onClick: () => void }) {
  return (
    <button type="button" className="cr-arrow" aria-label={label} disabled={disabled} onClick={onClick}>
      <svg className="i" viewBox="0 0 24 24" aria-hidden="true">
        <path d={dir === 'prev' ? 'M15 5l-7 7 7 7' : 'M9 5l7 7-7 7'} />
      </svg>
    </button>
  )
}

export function Picker({
  times,
  busy,
  onBook,
}: {
  times: InterviewTimeOption[]
  busy: boolean
  onBook: (time: InterviewTimeOption) => void
}) {
  const days = useMemo(() => {
    const map = new Map<string, Day>()
    for (const t of times) {
      if (!map.has(t.date)) map.set(t.date, { date: t.date, day: t.day, times: [] })
      map.get(t.date)!.times.push(t)
    }
    return [...map.values()].sort((a, b) => a.date.localeCompare(b.date))
  }, [times])
  const byDate = useMemo(() => new Map(days.map((d) => [d.date, d])), [days])
  const months = useMemo(() => [...new Set(days.map((d) => monthKey(d.date)))], [days])

  const [step, setStep] = useState<'day' | 'time'>('day')
  const [day, setDay] = useState('')
  const [month, setMonth] = useState(months[0] ?? '')
  const [picked, setPicked] = useState<InterviewTimeOption | null>(null)

  // Times can change under us (someone else books): drop a day or time that is gone.
  useEffect(() => {
    if (day && !byDate.has(day)) {
      setDay('')
      setStep('day')
    }
    if (picked && !times.some((t) => t.start === picked.start)) setPicked(null)
    if (!months.includes(month) && months.length) setMonth(months[0])
  }, [byDate, day, month, months, picked, times])

  const index = days.findIndex((d) => d.date === day)
  const current = byDate.get(day)

  function openDay(date: string) {
    setDay(date)
    setMonth(monthKey(date))
    setPicked(null)
    setStep('time')
  }

  if (step === 'time' && current) {
    const groups = new Map<string, InterviewTimeOption[]>()
    for (const t of current.times) {
      const part = partOfDay(t.label)
      if (!groups.has(part)) groups.set(part, [])
      groups.get(part)!.push(t)
    }
    return (
      <div className="cr-pk">
        <div className="lbl cr-pk-step">2. Pick a time</div>
        <div className="cr-pk-head">
          <Arrow dir="prev" label="Earlier day" disabled={index <= 0} onClick={() => openDay(days[index - 1].date)} />
          <strong>{longDay(current.date)}</strong>
          <Arrow dir="next" label="Later day" disabled={index >= days.length - 1} onClick={() => openDay(days[index + 1].date)} />
        </div>
        <button type="button" className="cr-pk-back" onClick={() => setStep('day')}>
          ‹ All days
        </button>
        {[...groups.entries()].map(([part, list]) => (
          <div key={part} className="cr-pk-part">
            <h3>{part}</h3>
            <div className="cr-pk-slots">
              {list.map((t) => (
                <button key={t.start} type="button" aria-pressed={picked?.start === t.start} onClick={() => setPicked(t)}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        ))}
        <button type="button" className="btn btn-ink cr-wide cr-pk-book" disabled={!picked || busy} onClick={() => picked && onBook(picked)}>
          {busy ? 'Booking…' : picked ? `Book ${shortDay(picked.date)} at ${picked.label}` : 'Pick a time'}
        </button>
      </div>
    )
  }

  // the month grid, Sunday first
  const [y, m] = month.split('-').map(Number)
  const first = new Date(y, m - 1, 1)
  const count = new Date(y, m, 0).getDate()
  const cells: (string | null)[] = Array(first.getDay()).fill(null)
  for (let d = 1; d <= count; d++) cells.push(`${month}-${String(d).padStart(2, '0')}`)
  const monthIndex = months.indexOf(month)

  return (
    <div className="cr-pk">
      <div className="lbl cr-pk-step">1. Pick a day</div>
      <div className="cr-pk-head">
        <Arrow dir="prev" label="Earlier month" disabled={monthIndex <= 0} onClick={() => setMonth(months[monthIndex - 1])} />
        <strong>{first.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</strong>
        <Arrow dir="next" label="Later month" disabled={monthIndex < 0 || monthIndex >= months.length - 1}
          onClick={() => setMonth(months[monthIndex + 1])} />
      </div>
      <div className="cr-pk-grid" role="grid">
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
          <span key={i} className="cr-pk-dow" aria-hidden="true">
            {d}
          </span>
        ))}
        {cells.map((date, i) => {
          if (!date) return <span key={`x${i}`} />
          const open = byDate.get(date)
          return (
            <button
              key={date}
              type="button"
              className={`cr-pk-day${open ? ' open' : ''}${date === day ? ' on' : ''}`}
              disabled={!open}
              aria-label={open ? `${longDay(date)}, ${open.times.length} times` : longDay(date)}
              onClick={() => openDay(date)}
            >
              <span>{Number(date.slice(8))}</span>
              {open && <small>{open.times.length}</small>}
            </button>
          )
        })}
      </div>
      <p className="fine cr-pk-note">Bold days have open times. The number is how many.</p>
    </div>
  )
}
