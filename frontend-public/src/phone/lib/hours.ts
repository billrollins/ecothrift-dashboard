/**
 * Open or closed, on the store's clock, from the home feed's `hours` (apps/webstore/services/hours.py
 * public_hours_payload: weekdays are Python's, 0 = Monday ... 6 = Sunday). Words as the mockup: "Open until 6 PM",
 * "Opens 9 AM", "Opens 9 AM tomorrow", "Opens Monday 9 AM".
 */
import { useEffect, useState } from 'react'
import type { Hours, HoursOverride } from './boot'

export const DEFAULT_HOURS: Hours = {
  timezone: 'America/Chicago', open: '09:00', close: '18:00', closed_weekdays: [6], overrides: [],
}

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

function minutes(hhmm: string | undefined, fallback: number): number {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(hhmm || ''))
  return m ? Number(m[1]) * 60 + Number(m[2]) : fallback
}

/** 18:00 -> "6 PM", 17:30 -> "5:30 PM". */
export function clock(total: number): string {
  const h = Math.floor(total / 60) % 24
  const min = total % 60
  const h12 = h % 12 || 12
  return `${h12}${min ? `:${String(min).padStart(2, '0')}` : ''} ${h < 12 ? 'AM' : 'PM'}`
}

function parts(now: Date, tz: string): { ymd: string; wd: number; mins: number } {
  try {
    const f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
      hour12: false,
    }).formatToParts(now)
    const get = (t: string) => f.find((p) => p.type === t)?.value || ''
    const wd = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(get('weekday'))
    return { ymd: `${get('year')}-${get('month')}-${get('day')}`, wd: wd < 0 ? 0 : wd, mins: (Number(get('hour')) % 24) * 60 + Number(get('minute')) }
  } catch {
    return { ymd: now.toISOString().slice(0, 10), wd: (now.getDay() + 6) % 7, mins: now.getHours() * 60 + now.getMinutes() }
  }
}

function addDays(ymd: string, n: number): string {
  const [y, m, d] = ymd.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1, d + n))
  return t.toISOString().slice(0, 10)
}

type Day = { open: boolean; from: number; to: number; override?: HoursOverride }

function dayHours(h: Hours, ymd: string, wd: number): Day {
  const from = minutes(h.open, 540)
  const to = minutes(h.close, 1080)
  const ov = (h.overrides || []).find((o) => o.date_start <= ymd && ymd <= o.date_end)
  if (ov) return { open: !ov.closed, from: minutes(ov.open, from), to: minutes(ov.close, to), override: ov }
  return { open: !(h.closed_weekdays || []).includes(wd), from, to }
}

export type OpenStatus = { open: boolean; label: string }

export function openStatus(hours: Hours | null | undefined, now: Date = new Date()): OpenStatus {
  const h = hours && typeof hours === 'object' ? hours : DEFAULT_HOURS
  const { ymd, wd, mins } = parts(now, h.timezone || DEFAULT_HOURS.timezone)
  const today = dayHours(h, ymd, wd)
  if (today.open && mins >= today.from && mins < today.to) return { open: true, label: `Open until ${clock(today.to)}` }
  if (today.open && mins < today.from) return { open: false, label: `Opens ${clock(today.from)}` }
  for (let i = 1; i <= 14; i += 1) {
    const day = dayHours(h, addDays(ymd, i), (wd + i) % 7)
    if (!day.open) continue
    if (i === 1) return { open: false, label: `Opens ${clock(day.from)} tomorrow` }
    return { open: false, label: `Opens ${DAYS[(wd + i) % 7]} ${clock(day.from)}` }
  }
  return { open: false, label: 'Closed' }
}

/** The status, re-read every minute. */
export function useOpenStatus(hours: Hours | null | undefined): OpenStatus {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 60_000)
    return () => window.clearInterval(id)
  }, [])
  return openStatus(hours, new Date(now))
}

/** The week as rows for the Visit block: runs of open days with their times, then the closed days; then any holiday. */
export function hoursRows(hours: Hours | null | undefined): Array<[string, string]> {
  const h = hours && typeof hours === 'object' ? hours : DEFAULT_HOURS
  const closed = new Set(h.closed_weekdays || [])
  const time = `${clock(minutes(h.open, 540))} to ${clock(minutes(h.close, 1080))}`
  const rows: Array<[string, string]> = []
  const run = (days: number[]) => {
    const out: string[] = []
    let start = -1
    for (let d = 0; d <= 7; d += 1) {
      const inRun = d < 7 && days.includes(d)
      if (inRun && start < 0) start = d
      if (!inRun && start >= 0) {
        const end = d - 1
        out.push(start === end ? DAYS[start] : end === start + 1 ? `${DAYS[start]} and ${DAYS[end]}` : `${DAYS[start]} to ${DAYS[end]}`)
        start = -1
      }
    }
    return out
  }
  const openDays = [0, 1, 2, 3, 4, 5, 6].filter((d) => !closed.has(d))
  for (const label of run(openDays)) rows.push([label, time])
  for (const label of run([...closed])) rows.push([label, 'Closed'])
  for (const ov of h.overrides || []) {
    const [, m, d] = ov.date_start.split('-').map(Number)
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    const when = `${ov.label || 'Holiday'}, ${months[m - 1]} ${d}`
    rows.push([when, ov.closed ? 'Closed' : `${clock(minutes(ov.open, 540))} to ${clock(minutes(ov.close, 1080))}`])
  }
  return rows
}
