import { addDays, format, parseISO, startOfISOWeek } from 'date-fns';
import type { GradeLetter } from '../../../api/routines.api';
import type { StatusTagTone } from '../../../components/duty/tokens';

/** `YYYY-Www` for a date, which is the shape Command Center week queries take. */
export function isoWeekKey(day: Date): string {
  const monday = startOfISOWeek(day);
  return format(monday, "RRRR-'W'II");
}

export function shiftWeek(week: string, weeks: number): string {
  const [year, part] = week.split('-W');
  // Any Thursday is in the same ISO week as its Monday in every year shape.
  const monday = startOfISOWeek(parseISO(`${year}-01-04`));
  return isoWeekKey(addDays(monday, (Number(part) - 1 + weeks) * 7));
}

export function weekMonday(week: string): Date {
  const [year, part] = week.split('-W');
  return addDays(startOfISOWeek(parseISO(`${year}-01-04`)), (Number(part) - 1) * 7);
}

export function weekLabel(week: string, today: Date): string {
  if (week === isoWeekKey(today)) return 'This week';
  if (week === shiftWeek(isoWeekKey(today), -1)) return 'Last week';
  const monday = weekMonday(week);
  return `${format(monday, 'MMM d')} - ${format(addDays(monday, 5), 'MMM d')}`;
}

/** Calendar span for a week key, e.g. "Sep 14 to Sep 20, 2026". */
export function weekRangeLabel(week: string): string {
  const monday = weekMonday(week);
  const sunday = addDays(monday, 6);
  if (monday.getFullYear() === sunday.getFullYear()) {
    return `${format(monday, 'MMM d')} to ${format(sunday, 'MMM d, yyyy')}`;
  }
  return `${format(monday, 'MMM d, yyyy')} to ${format(sunday, 'MMM d, yyyy')}`;
}

export function isFutureWeek(week: string, today: Date): boolean {
  return week >= shiftWeek(isoWeekKey(today), 1);
}

/**
 * A letter's colour. C is deliberately amber rather than neutral: an average
 * week is not a good week on a floor where the standard is that everything
 * gets done.
 */
export function letterTone(letter: GradeLetter | null): StatusTagTone {
  const band = (letter || '').charAt(0);
  if (band === 'A' || band === 'B') return 'green';
  if (band === 'C' || band === 'D') return 'amber';
  if (band === 'F') return 'red';
  return 'plain';
}
