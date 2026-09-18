export const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
export const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

export const LAST_DEPT_KEY = 'ecothrift.shifts.lastDepartment';
export const CARD_MAX = 880;
export const NAME_COL = 240;
export const TITLE_MAX_CHARS = 'Cashier - Open'.length + 10;
export const TITLE_COL = `${TITLE_MAX_CHARS}ch`;
export const DAY_CHIP = 36;
export const DAY_CHIP_GAP = 4;
export const DAYS_COL = ALL_DAYS.length * DAY_CHIP + (ALL_DAYS.length - 1) * DAY_CHIP_GAP;
export const ACTION_COL = 120;

export function lockTooltip(title?: string | null) {
  const name = (title || '').trim() || 'this';
  return `Used by ${name} routine. Edit times and people, but this shift can't be removed.`;
}

export function hhmm(value: string) {
  return value.slice(0, 5);
}

export function asTime(value: string) {
  return value.length === 5 ? `${value}:00` : value;
}

export function normalizeHhmm(raw: string, fallback: string) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(raw.trim());
  if (match) {
    const hour = Number(match[1]);
    const minute = Number(match[2]);
    if (hour <= 23 && minute <= 59) {
      return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
    }
  }
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 3 || digits.length === 4) {
    const padded = digits.padStart(4, '0');
    const hour = Number(padded.slice(0, 2));
    const minute = Number(padded.slice(2, 4));
    if (hour <= 23 && minute <= 59) {
      return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
    }
  }
  return fallback;
}

export function shiftDays(shift: { weekdays: number[] }) {
  return shift.weekdays.length ? [...shift.weekdays].sort((a, b) => a - b) : [...ALL_DAYS];
}

export function personDays(row: { weekdays: number[] }, shift: { weekdays: number[] }) {
  const allowed = new Set(shiftDays(shift));
  return [...row.weekdays].filter((day) => allowed.has(day)).sort((a, b) => a - b);
}

export function sameDays(left: number[], right: number[]) {
  if (left.length !== right.length) return false;
  return left.every((day, index) => day === right[index]);
}

export function formatDayRange(days: number[]) {
  const sorted = [...new Set(days)].sort((a, b) => a - b);
  if (!sorted.length) return '';
  if (sorted.length === 1) return DAY_LABELS[sorted[0]];
  const contiguous = sorted.every((day, index) => index === 0 || day === sorted[index - 1] + 1);
  if (contiguous) {
    return `${DAY_LABELS[sorted[0]]} to ${DAY_LABELS[sorted[sorted.length - 1]]}`;
  }
  return sorted.map((day) => DAY_LABELS[day]).join(', ');
}

export function exceptionDays(person: number[], shift: number[]) {
  const mine = new Set(person);
  const roster = new Set(shift);
  return {
    missing: shift.filter((day) => !mine.has(day)),
    extra: person.filter((day) => !roster.has(day)),
    allMatch: sameDays(person, shift),
  };
}

export function coverageSummary(
  days: number[],
  assigned: Array<{ days: number[] }>,
) {
  const uncovered = days.filter((day) => !assigned.some((row) => row.days.includes(day)));
  if (uncovered.length) {
    return { text: `${formatDayRange(uncovered)} out`, tone: 'bad' as const };
  }
  const n = assigned.length;
  return { text: n ? `${n} covered` : 'Covered', tone: 'good' as const };
}

export function dayCovered(
  day: number,
  shiftDaysOn: number[],
  assigned: Array<{ days: number[] }>,
) {
  if (!shiftDaysOn.includes(day)) return 'off' as const;
  return assigned.some((row) => row.days.includes(day)) ? 'covered' as const : 'uncovered' as const;
}

export function dayAssignedCount(day: number, assigned: Array<{ days: number[] }>) {
  return assigned.filter((row) => row.days.includes(day)).length;
}

const PUNCH_ORDER: Record<string, number> = {
  retail_open: 0,
  retail_day: 1,
  retail_close: 2,
};

export function shiftSortKey(shift: { punch_code: string; time_in: string; name: string }) {
  const punch = PUNCH_ORDER[shift.punch_code] ?? 10;
  return [punch, shift.time_in, shift.name] as const;
}

export function sectionCountLabel(shiftCount: number, personCount: number) {
  const shifts = shiftCount === 1 ? '1 shift' : `${shiftCount} shifts`;
  const people = personCount === 1 ? '1 person' : `${personCount} people`;
  return `${shifts} · ${people}`;
}

export function byPersonName(left: string, right: string) {
  return left.localeCompare(right, undefined, { sensitivity: 'base' });
}

export function sortByPersonName<T>(rows: T[], name: (row: T) => string) {
  return [...rows].sort((a, b) => byPersonName(name(a), name(b)));
}
