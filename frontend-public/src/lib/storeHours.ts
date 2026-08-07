/**
 * Live open/closed status for Eco-Thrift - Canfield.
 *
 * Hours mirror apps/webstore/services/hours.py DEFAULT_HOURS
 * (09:00-18:00 America/Chicago, closed Sunday). AppSetting overrides
 * are not exposed on the public API today, so this stays local.
 */
import { useEffect, useState } from 'react'
import { STORE } from '../data/content'

const TZ = STORE.retail.hoursConfig.timezone
const OPEN_MINUTES = STORE.retail.hoursConfig.openMinutes
const CLOSE_MINUTES = STORE.retail.hoursConfig.closeMinutes
const CLOSED_WEEKDAYS = new Set<number>(STORE.retail.hoursConfig.closedWeekdays)

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

function chicagoParts(now: Date): { weekday: number; minutes: number } {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
  const parts = formatter.formatToParts(now)
  const weekdayToken = parts.find((p) => p.type === 'weekday')?.value ?? 'Sun'
  const hourRaw = parts.find((p) => p.type === 'hour')?.value ?? '00'
  const minuteRaw = parts.find((p) => p.type === 'minute')?.value ?? '00'
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
  }
}

function formatClock(totalMinutes: number): string {
  const hour24 = Math.floor(totalMinutes / 60) % 24
  const minute = totalMinutes % 60
  const suffix = hour24 >= 12 ? 'PM' : 'AM'
  const hour12 = hour24 % 12 || 12
  if (minute === 0) return `${hour12} ${suffix}`
  return `${hour12}:${String(minute).padStart(2, '0')} ${suffix}`
}

function isOpenDay(weekday: number): boolean {
  return !CLOSED_WEEKDAYS.has(weekday)
}

/** Next open weekday strictly after `weekday` (0-6). */
function nextOpenWeekdayAfter(weekday: number): number {
  for (let offset = 1; offset <= 7; offset += 1) {
    const day = (weekday + offset) % 7
    if (isOpenDay(day)) return day
  }
  return (weekday + 1) % 7
}

/** Pure status calculator - pass a Date for tests. */
export function getStoreStatus(now: Date = new Date()): StoreStatus {
  const { weekday, minutes } = chicagoParts(now)
  const openLabel = formatClock(OPEN_MINUTES)
  const closeLabel = formatClock(CLOSE_MINUTES)

  if (isOpenDay(weekday) && minutes >= OPEN_MINUTES && minutes < CLOSE_MINUTES) {
    return { open: true, text: `Open now, closes at ${closeLabel}` }
  }

  if (isOpenDay(weekday) && minutes < OPEN_MINUTES) {
    return { open: false, text: `Closed, opens today at ${openLabel}` }
  }

  // After close on an open day, or any closed day (Sunday) → next open day.
  // Saturday evening rolls to Monday; Sunday rolls to Monday.
  const openDay = nextOpenWeekdayAfter(weekday)
  return { open: false, text: `Closed, opens ${DAY_NAMES[openDay]} at ${openLabel}` }
}

export function useStoreStatus(pollMs = 60_000): StoreStatus {
  const [status, setStatus] = useState<StoreStatus>(() => getStoreStatus())

  useEffect(() => {
    const tick = () => setStatus(getStoreStatus())
    tick()
    const id = window.setInterval(tick, pollMs)
    return () => window.clearInterval(id)
  }, [pollMs])

  return status
}
