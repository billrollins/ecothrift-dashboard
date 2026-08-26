/** Build the public schedule line from AppSetting `online_sales.hours`.
 * Weekdays are Python `date.weekday()`: 0=Mon … 6=Sun.
 * Example: 9 AM - 6 PM, Tuesday - Saturday · Closed Sunday & Monday
 */
const DAY_NAMES = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
] as const

export function formatClockLabel(hhmm: string): string {
  const match = /^(\d{1,2}):(\d{2})/.exec(String(hhmm).trim())
  const hour24 = match ? Number(match[1]) : 0
  const minute = match ? Number(match[2]) : 0
  const suffix = hour24 >= 12 ? 'PM' : 'AM'
  const hour12 = hour24 % 12 || 12
  if (minute === 0) return `${hour12} ${suffix}`
  return `${hour12}:${String(minute).padStart(2, '0')} ${suffix}`
}

function phraseRange(first: number, last: number): string {
  if (first === last) return DAY_NAMES[first]
  if (last === first + 1) return `${DAY_NAMES[first]} & ${DAY_NAMES[last]}`
  return `${DAY_NAMES[first]} - ${DAY_NAMES[last]}`
}

function dayPhrase(ids: number[]): string {
  if (!ids.length) return ''
  const ranges: Array<[number, number]> = []
  let start = ids[0]
  let prev = ids[0]
  for (const day of ids.slice(1)) {
    if (day === prev + 1) {
      prev = day
      continue
    }
    ranges.push([start, prev])
    start = prev = day
  }
  ranges.push([start, prev])
  const parts = ranges.map(([first, last]) => phraseRange(first, last))
  if (parts.length === 2 && ranges.every(([first, last]) => first === last)) {
    return `${parts[0]} & ${parts[1]}`
  }
  return parts.join(', ')
}

function closedDisplayOrder(closed: number[]): number[] {
  if (closed.length === 2 && closed.includes(0) && closed.includes(6)) return [6, 0]
  return closed
}

export function formatHoursLabel(hours: {
  open: string
  close: string
  closed_weekdays: number[]
}): string {
  const closed = [...new Set(hours.closed_weekdays.filter((n) => Number.isInteger(n) && n >= 0 && n <= 6))].sort(
    (a, b) => a - b,
  )
  const openDays = [0, 1, 2, 3, 4, 5, 6].filter((d) => !closed.includes(d))
  const clock = `${formatClockLabel(hours.open)} - ${formatClockLabel(hours.close)}`
  if (!openDays.length) return `Closed · ${clock}`
  const openBit = dayPhrase(openDays)
  if (!closed.length) return `${clock}, ${openBit}`
  return `${clock}, ${openBit} · Closed ${dayPhrase(closedDisplayOrder(closed))}`
}

export const DEFAULT_HOURS_LABEL = formatHoursLabel({
  open: '09:00',
  close: '18:00',
  closed_weekdays: [0, 6],
})
