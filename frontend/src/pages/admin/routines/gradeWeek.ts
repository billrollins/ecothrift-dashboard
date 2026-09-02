import { addDays, format, parseISO, startOfISOWeek } from 'date-fns';
import type { CrossCheckRow, GradeLetter, TallyTotals, WeekGrade } from '../../../api/routines.api';
import type { StatusTagTone } from '../../../components/duty/tokens';

/** `YYYY-Www` for a date, which is the shape the grades endpoint takes. */
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

export function weekLabel(week: string, today: Date): string {
  if (week === isoWeekKey(today)) return 'This week';
  if (week === shiftWeek(isoWeekKey(today), -1)) return 'Last week';
  const [year, part] = week.split('-W');
  const monday = addDays(startOfISOWeek(parseISO(`${year}-01-04`)), (Number(part) - 1) * 7);
  return `${format(monday, 'MMM d')} - ${format(addDays(monday, 5), 'MMM d')}`;
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
  if (letter === 'A' || letter === 'B') return 'green';
  if (letter === 'C' || letter === 'D') return 'amber';
  if (letter === 'F') return 'red';
  return 'plain';
}

/** What the week's headline says under the letter. */
export function weekNote(week: WeekGrade | undefined, loading: boolean, failed: boolean): string {
  if (failed) return 'Could not load the week.';
  if (loading || !week) return 'Scoring the week.';
  if (week.score == null) return 'Nothing has been graded in this week yet.';
  const days = week.days.filter((day) => day.graded).length;
  const audits = week.cross_checks.filter((row) => row.status === 'done').length;
  const assigned = week.cross_checks.length;
  const auditPart = assigned
    ? `${audits} of ${assigned} cross-check${assigned === 1 ? '' : 's'} done`
    : 'no cross-checks assigned';
  return `${days} day${days === 1 ? '' : 's'} graded, ${auditPart}.`;
}

export interface TallyGrid {
  keys: Array<{ key: string; label: string }>;
  rows: Array<{ row: TallyTotals; total: number }>;
}

/**
 * Section tallies, widest problem first, and only the categories anybody
 * actually logged. A grid of thirty mostly-empty columns says nothing.
 */
export function tallyGrid(
  tallies: TallyTotals[],
  keys: Array<{ key: string; label: string }>,
): TallyGrid {
  const used = keys.filter((entry) =>
    tallies.some((row) => (row.counts[entry.key] ?? 0) > 0));
  const rows = tallies
    .map((row) => ({
      row,
      total: Object.values(row.counts).reduce((sum, n) => sum + (n ?? 0), 0),
    }))
    .sort((a, b) => b.total - a.total || a.row.section_name.localeCompare(b.row.section_name));
  return { keys: used, rows };
}

/** The findings on one cross-check, worst first, for the row's detail line. */
export function auditFindings(
  row: CrossCheckRow,
  labels: Map<string, string>,
): Array<{ label: string; count: number }> {
  return Object.entries(row.counts)
    .filter(([, count]) => (count ?? 0) > 0)
    .map(([key, count]) => ({ label: labels.get(key) ?? key, count: count ?? 0 }))
    .sort((a, b) => b.count - a.count);
}
