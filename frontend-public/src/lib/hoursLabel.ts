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

function phraseRange(first: number, last: number, rangeSep = '-'): string {
  if (first === last) return DAY_NAMES[first]
  if (last === first + 1) return `${DAY_NAMES[first]} & ${DAY_NAMES[last]}`
  return `${DAY_NAMES[first]} ${rangeSep} ${DAY_NAMES[last]}`
}

function dayPhrase(ids: number[], rangeSep = '-'): string {
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
  const parts = ranges.map(([first, last]) => phraseRange(first, last, rangeSep))
  if (parts.length === 2 && ranges.every(([first, last]) => first === last)) {
    return `${parts[0]} & ${parts[1]}`
  }
  return parts.join(', ')
}

export function hoursScheduleRows(hours: {
  open: string
  close: string
  closed_weekdays: number[]
}): { days: string; time: string }[] {
  const closed = [...new Set(hours.closed_weekdays.filter((n) => Number.isInteger(n) && n >= 0 && n <= 6))].sort(
    (a, b) => a - b,
  )
  const openDays = [0, 1, 2, 3, 4, 5, 6].filter((d) => !closed.includes(d))
  const clock = `${formatClockLabel(hours.open)} to ${formatClockLabel(hours.close)}`
  if (!openDays.length) return [{ days: 'Every day', time: 'Closed' }]
  const rows = [{ days: dayPhrase(openDays, '–'), time: clock }]
  if (closed.length) {
    rows.push({ days: dayPhrase(closedDisplayOrder(closed), '–'), time: 'Closed' })
  }
  return rows
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

function parseIsoDate(iso: string): Date {
  const [year, month, day] = iso.slice(0, 10).split('-').map(Number)
  return new Date(year, (month || 1) - 1, day || 1)
}

function shortDate(iso: string): string {
  const date = parseIsoDate(iso)
  const weekday = date.toLocaleDateString('en-US', { weekday: 'short' })
  const month = date.toLocaleDateString('en-US', { month: 'short' })
  return `${weekday}, ${month} ${date.getDate()}`
}

export function formatHolidayLine(override: {
  label: string
  date_start: string
  date_end: string
  closed: boolean
  open?: string
  close?: string
  note?: string
  sentence?: string
}): string {
  if (override.sentence) return override.sentence
  const when =
    override.date_start === override.date_end
      ? shortDate(override.date_start)
      : `${shortDate(override.date_start)} – ${shortDate(override.date_end)}`
  const label = (override.label || '').trim()
  const head = label ? `${when} (${label})` : when
  const hours = override.closed
    ? 'Closed'
    : `${formatClockLabel(override.open || '09:00')} to ${formatClockLabel(override.close || '18:00')}`
  const note = (override.note || '').trim().replace(/\.+$/, '')
  if (note) return `${head}: ${hours}, ${note}.`
  return `${head}: ${hours}.`
}
