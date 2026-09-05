/**
 * Live open/closed status for Eco-Thrift - Canfield.
 *
 * Weekdays on the API are Python `date.weekday()`: 0=Mon … 6=Sun.
 * Intl / Date.getDay() use 0=Sun … 6=Sat — convert before comparing.
 */
import { useEffect, useState } from 'react'
import type { StoreHoursPublic } from '../api'
import { STORE } from '../data/content'
import { useOnlineSalesConfig } from '../onlineSalesConfig'
import type { HoursOverridePublic } from '../api'
import { DEFAULT_HOURS_LABEL, formatHolidayLine, formatHoursLabel } from './hoursLabel'

export const DEFAULT_STORE_HOURS_PUBLIC: StoreHoursPublic = {
  timezone: STORE.retail.hoursConfig.timezone,
  open: '09:00',
  close: '18:00',
  closed_weekdays: [0, 6],
  label: DEFAULT_HOURS_LABEL,
  overrides: [],
}

const DAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const

export type StoreStatus = {
  open: boolean
  text: string
}

function asHhmm(value: string | undefined, fallback: string): string {
  if (!value) return fallback
  const match = /^(\d{1,2}):(\d{2})/.exec(value.trim())
  if (!match) return fallback
  const hour = Number(match[1])
  const minute = Number(match[2])
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return fallback
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

export function resolveHours(hours?: StoreHoursPublic | null): StoreHoursPublic {
  const closed = Array.isArray(hours?.closed_weekdays)
    ? hours.closed_weekdays
        .map((n) => Number(n))
        .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6)
    : DEFAULT_STORE_HOURS_PUBLIC.closed_weekdays
  const open = asHhmm(hours?.open, DEFAULT_STORE_HOURS_PUBLIC.open)
  const close = asHhmm(hours?.close, DEFAULT_STORE_HOURS_PUBLIC.close)
  const closed_weekdays = [...new Set(closed)].sort((a, b) => a - b)
  return {
    timezone:
      typeof hours?.timezone === 'string' && hours.timezone.trim()
        ? hours.timezone.trim()
        : DEFAULT_STORE_HOURS_PUBLIC.timezone,
    open,
    close,
    closed_weekdays,
    label: formatHoursLabel({ open, close, closed_weekdays }),
    regular_label: hours?.regular_label,
    resume_label: hours?.resume_label,
    overrides: Array.isArray(hours?.overrides) ? hours.overrides : [],
    today: hours?.today,
  }
}

/** Python 0=Mon … 6=Sun → JS Date.getDay() 0=Sun … 6=Sat. */
export function pythonWeekdayToJs(py: number): number {
  return (py + 1) % 7
}

function parseHhmmToMinutes(hhmm: string): number {
  const [hour, minute] = asHhmm(hhmm, '00:00').split(':').map(Number)
  return hour * 60 + minute
}

function chicagoParts(now: Date, timeZone: string): {
  weekday: number
  minutes: number
  ymd: string
} {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
  const parts = formatter.formatToParts(now)
  const weekdayToken = parts.find((p) => p.type === 'weekday')?.value ?? 'Sun'
  const hourRaw = parts.find((p) => p.type === 'hour')?.value ?? '00'
  const minuteRaw = parts.find((p) => p.type === 'minute')?.value ?? '00'
  const year = parts.find((p) => p.type === 'year')?.value ?? '1970'
  const month = parts.find((p) => p.type === 'month')?.value ?? '01'
  const day = parts.find((p) => p.type === 'day')?.value ?? '01'
  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  }
  // Intl can return "24" for midnight in some engines - normalize.
  let hour = Number.parseInt(hourRaw, 10)
  if (hour === 24) hour = 0
  const minute = Number.parseInt(minuteRaw, 10)
  return {
    weekday: weekdayMap[weekdayToken] ?? 0,
    minutes: hour * 60 + minute,
    ymd: `${year}-${month}-${day}`,
  }
}

function overrideFor(ymd: string, overrides: HoursOverridePublic[]): HoursOverridePublic | undefined {
  return overrides.find((row) => row.date_start <= ymd && ymd <= row.date_end)
}

function addDaysYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number)
  const date = new Date(y, m - 1, d + days)
  const yy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}

function jsWeekdayFromYmd(ymd: string): number {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(y, m - 1, d).getDay()
}

function formatClock(totalMinutes: number): string {
  const hour24 = Math.floor(totalMinutes / 60) % 24
  const minute = totalMinutes % 60
  const suffix = hour24 >= 12 ? 'PM' : 'AM'
  const hour12 = hour24 % 12 || 12
  if (minute === 0) return `${hour12} ${suffix}`
  return `${hour12}:${String(minute).padStart(2, '0')} ${suffix}`
}

function dayHours(
  ymd: string,
  jsWeekday: number,
  resolved: StoreHoursPublic,
): { open: boolean; openHhmm: string; closeHhmm: string; override?: HoursOverridePublic } {
  const ov = overrideFor(ymd, resolved.overrides || [])
  if (ov) {
    return {
      open: !ov.closed,
      openHhmm: ov.open || resolved.open,
      closeHhmm: ov.close || resolved.close,
      override: ov,
    }
  }
  const closedJs = new Set(resolved.closed_weekdays.map(pythonWeekdayToJs))
  return {
    open: !closedJs.has(jsWeekday),
    openHhmm: resolved.open,
    closeHhmm: resolved.close,
  }
}

function nextOpen(
  startYmd: string,
  resolved: StoreHoursPublic,
): { ymd: string; weekday: number; openHhmm: string } {
  let ymd = startYmd
  for (let i = 0; i < 14; i += 1) {
    const weekday = jsWeekdayFromYmd(ymd)
    const hours = dayHours(ymd, weekday, resolved)
    if (hours.open) return { ymd, weekday, openHhmm: hours.openHhmm }
    ymd = addDaysYmd(ymd, 1)
  }
  return { ymd: startYmd, weekday: jsWeekdayFromYmd(startYmd), openHhmm: resolved.open }
}

/** Pure status calculator - pass a Date for tests. */
export function getStoreStatus(
  now: Date = new Date(),
  hours: StoreHoursPublic = DEFAULT_STORE_HOURS_PUBLIC,
): StoreStatus {
  const resolved = resolveHours(hours)
  const { weekday, minutes, ymd } = chicagoParts(now, resolved.timezone)
  const today = dayHours(ymd, weekday, resolved)
  const openMinutes = parseHhmmToMinutes(today.openHhmm)
  const closeMinutes = parseHhmmToMinutes(today.closeHhmm)
  const openLabel = formatClock(openMinutes)
  const closeLabel = formatClock(closeMinutes)
  const holidayName = today.override?.label || ''

  if (today.open && minutes >= openMinutes && minutes < closeMinutes) {
    if (today.override && today.closeHhmm !== resolved.close) {
      return { open: true, text: `Open now, closing early today at ${closeLabel}` }
    }
    return { open: true, text: `Open now, closes at ${closeLabel}` }
  }

  if (today.open && minutes < openMinutes) {
    return { open: false, text: `Closed, opens today at ${openLabel}` }
  }

  const nxt = nextOpen(addDaysYmd(ymd, 1), resolved)
  const nextLabel = formatClock(parseHhmmToMinutes(nxt.openHhmm))
  if (today.override && !today.open) {
    return {
      open: false,
      text: `Closed today for ${holidayName || 'holiday hours'}, opens ${DAY_NAMES[nxt.weekday]} at ${nextLabel}`,
    }
  }
  return { open: false, text: `Closed, opens ${DAY_NAMES[nxt.weekday]} at ${nextLabel}` }
}

export function useStoreStatus(
  hours?: StoreHoursPublic | null,
  pollMs = 60_000,
): StoreStatus {
  const resolved = resolveHours(hours)
  const key = `${resolved.timezone}|${resolved.open}|${resolved.close}|${resolved.closed_weekdays.join(',')}|${(resolved.overrides || []).map((o) => o.id).join(',')}`
  const [status, setStatus] = useState<StoreStatus>(() => getStoreStatus(new Date(), resolved))

  useEffect(() => {
    const tick = () => setStatus(getStoreStatus(new Date(), resolved))
    tick()
    const id = window.setInterval(tick, pollMs)
    return () => window.clearInterval(id)
  }, [key, pollMs])

  return status
}

export function useStoreHoursLabel() {
  const { config } = useOnlineSalesConfig()
  return resolveHours(config.hours).label
}

export function usePublicHours() {
  const { config } = useOnlineSalesConfig()
  const hours = resolveHours(config.hours)
  const status = useStoreStatus(hours)
  return { hours, status, label: hours.label }
}

export function useHolidayNote() {
  const { hours } = usePublicHours()
  if (!hours.today?.is_override) return ''
  const match = (hours.overrides || []).find((row) => row.label === hours.today?.label)
  if (match) return formatHolidayLine(match)
  return hours.today.label
}
