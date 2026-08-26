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

function asHhmm(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return fallback;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return fallback;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
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

export function setDayOpen(hours: StoreHours, weekday: number, open: boolean): StoreHours {
  const closed = new Set(hours.closed_weekdays);
  if (open) closed.delete(weekday);
  else closed.add(weekday);
  return { ...hours, closed_weekdays: [...closed].sort((a, b) => a - b) };
}
