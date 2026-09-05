export interface StoreHours {
  timezone: string;
  open: string;
  close: string;
  closed_weekdays: number[];
}

export const DEFAULT_STORE_HOURS: StoreHours = {
  timezone: 'America/Chicago',
  open: '09:00',
  close: '18:00',
  closed_weekdays: [0, 6],
};

export const WEEKDAYS: { id: number; label: string }[] = [
  { id: 0, label: 'Monday' },
  { id: 1, label: 'Tuesday' },
  { id: 2, label: 'Wednesday' },
  { id: 3, label: 'Thursday' },
  { id: 4, label: 'Friday' },
  { id: 5, label: 'Saturday' },
  { id: 6, label: 'Sunday' },
];

const DAY_NAMES = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
] as const;

function asHhmm(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const match = /^(\d{1,2}):(\d{2})/.exec(value.trim());
  if (!match) return fallback;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return fallback;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function formatClockLabel(hhmm: string): string {
  const match = /^(\d{1,2}):(\d{2})/.exec(String(hhmm).trim());
  const hour24 = match ? Number(match[1]) : 0;
  const minute = match ? Number(match[2]) : 0;
  const suffix = hour24 >= 12 ? 'PM' : 'AM';
  const hour12 = hour24 % 12 || 12;
  if (minute === 0) return `${hour12} ${suffix}`;
  return `${hour12}:${String(minute).padStart(2, '0')} ${suffix}`;
}

function phraseRange(first: number, last: number): string {
  if (first === last) return DAY_NAMES[first];
  if (last === first + 1) return `${DAY_NAMES[first]} & ${DAY_NAMES[last]}`;
  return `${DAY_NAMES[first]} - ${DAY_NAMES[last]}`;
}

function dayPhrase(ids: number[]): string {
  if (!ids.length) return '';
  const ranges: Array<[number, number]> = [];
  let start = ids[0];
  let prev = ids[0];
  for (const day of ids.slice(1)) {
    if (day === prev + 1) {
      prev = day;
      continue;
    }
    ranges.push([start, prev]);
    start = prev = day;
  }
  ranges.push([start, prev]);
  const parts = ranges.map(([first, last]) => phraseRange(first, last));
  if (parts.length === 2 && ranges.every(([first, last]) => first === last)) {
    return `${parts[0]} & ${parts[1]}`;
  }
  return parts.join(', ');
}

/** Same sentence the public site prints from these hours. */
export function formatHoursLabel(hours: StoreHours): string {
  const closed = [...new Set(hours.closed_weekdays.filter((n) => Number.isInteger(n) && n >= 0 && n <= 6))].sort(
    (a, b) => a - b,
  );
  const openDays = [0, 1, 2, 3, 4, 5, 6].filter((d) => !closed.includes(d));
  const clock = `${formatClockLabel(hours.open)} - ${formatClockLabel(hours.close)}`;
  if (!openDays.length) return `Closed · ${clock}`;
  const openBit = dayPhrase(openDays);
  if (!closed.length) return `${clock}, ${openBit}`;
  const closedOrder = closed.length === 2 && closed.includes(0) && closed.includes(6) ? [6, 0] : closed;
  return `${clock}, ${openBit} · Closed ${dayPhrase(closedOrder)}`;
}

export function parseStoreHours(raw: unknown): StoreHours {
  const src = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const closed = Array.isArray(src.closed_weekdays)
    ? src.closed_weekdays
        .map((n) => Number(n))
        .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6)
    : DEFAULT_STORE_HOURS.closed_weekdays;
  return {
    timezone:
      typeof src.timezone === 'string' && src.timezone.trim()
        ? src.timezone.trim()
        : DEFAULT_STORE_HOURS.timezone,
    open: asHhmm(src.open, DEFAULT_STORE_HOURS.open),
    close: asHhmm(src.close, DEFAULT_STORE_HOURS.close),
    closed_weekdays: [...new Set(closed)].sort((a, b) => a - b),
  };
}

function parseIsoDate(iso: string): Date {
  const [year, month, day] = iso.slice(0, 10).split('-').map(Number);
  return new Date(year, (month || 1) - 1, day || 1);
}

function shortDate(iso: string): string {
  const date = parseIsoDate(iso);
  const weekday = date.toLocaleDateString('en-US', { weekday: 'short' });
  const month = date.toLocaleDateString('en-US', { month: 'short' });
  return `${weekday}, ${month} ${date.getDate()}`;
}

export function holidayHoursLine(override: {
  label: string;
  date_start: string;
  date_end: string;
  closed: boolean;
  open?: string;
  close?: string;
  note?: string;
}): string {
  const when =
    override.date_start === override.date_end
      ? shortDate(override.date_start)
      : `${shortDate(override.date_start)} – ${shortDate(override.date_end)}`;
  const label = (override.label || '').trim();
  const head = label ? `${when} (${label})` : when;
  const hours = override.closed
    ? 'Closed'
    : `${formatClockLabel(override.open || '09:00')} to ${formatClockLabel(override.close || '18:00')}`;
  const note = (override.note || '').trim().replace(/\.+$/, '');
  if (note) return `${head}: ${hours}, ${note}.`;
  return `${head}: ${hours}.`;
}

export function setDayOpen(hours: StoreHours, weekday: number, open: boolean): StoreHours {
  const closed = new Set(hours.closed_weekdays);
  if (open) closed.delete(weekday);
  else closed.add(weekday);
  return { ...hours, closed_weekdays: [...closed].sort((a, b) => a - b) };
}
