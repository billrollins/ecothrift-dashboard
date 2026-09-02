import { addWeeks, endOfWeek, format, parseISO, startOfWeek } from 'date-fns';
import type { TimeEntryRosterRow } from '../../types/hr.types';

/** Calendar-week overtime threshold used on Time & payroll. */
export const WEEKLY_HOUR_LIMIT = 40;

/**
 * Below this, overtime is just a number. Amber only when it is worth a look
 * (about an hour, not five minutes).
 */
export const OT_NOTICE_HOURS = 1;

export function roundHours(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

export function roundMoney(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

export function parseHours(v: string | number | null | undefined): number {
  const n = typeof v === 'string' ? parseFloat(v) : Number(v);
  return roundHours(n);
}

export function fmtHours(v: string | number | null | undefined): string {
  return parseHours(v).toFixed(2);
}

export function splitWeeklyHours(total: number): { regular: number; overtime: number } {
  const hours = roundHours(total);
  if (hours <= 0) return { regular: 0, overtime: 0 };
  if (hours <= WEEKLY_HOUR_LIMIT) return { regular: hours, overtime: 0 };
  return { regular: WEEKLY_HOUR_LIMIT, overtime: roundHours(hours - WEEKLY_HOUR_LIMIT) };
}

/** Regular / overtime for a payroll range, from completed hours grouped by Mon-Sun week. */
export function sumPeriodTime(weekHours: Iterable<number>): { regular: number; overtime: number } {
  let regular = 0;
  let overtime = 0;
  for (const hours of weekHours) {
    const part = splitWeeklyHours(hours);
    regular = roundHours(regular + part.regular);
    overtime = roundHours(overtime + part.overtime);
  }
  return { regular, overtime };
}

/** Mondays covering an inclusive date range, as yyyy-MM-dd. */
export function mondaysCoveringRange(dateFrom: string, dateTo: string): string[] {
  const from = parseISO(dateFrom);
  const to = parseISO(dateTo);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) return [];
  let day = startOfWeek(from, { weekStartsOn: 1 });
  const last = startOfWeek(to, { weekStartsOn: 1 });
  const weeks: string[] = [];
  while (day <= last) {
    weeks.push(format(day, 'yyyy-MM-dd'));
    day = addWeeks(day, 1);
  }
  return weeks;
}

/** Compact Mon-Sun label for a column header: Aug 17-23 or Aug 31-Sep 6. */
export function fmtWeekHeader(weekStart: string): string {
  const start = parseISO(weekStart);
  const end = endOfWeek(start, { weekStartsOn: 1 });
  if (start.getMonth() === end.getMonth()) {
    return `${format(start, 'MMM d')}-${format(end, 'd')}`;
  }
  return `${format(start, 'MMM d')}-${format(end, 'MMM d')}`;
}

export type EmployeePayrollRow = {
  employee_id: number;
  employee_name: string;
  shifts: number;
  rate: number;
  weekHours: Record<string, number>;
  regular: number;
  overtime: number;
  pay: number;
};

export function buildEmployeePayrollRows(
  roster: TimeEntryRosterRow[],
  weekStarts: string[],
): EmployeePayrollRow[] {
  const byEmp = new Map<number, EmployeePayrollRow>();
  for (const row of roster) {
    if (row.is_open) continue;
    const hours = parseHours(row.total_hours);
    const pay = parseHours(row.pay);
    const rate = parseHours(row.pay_rate);
    let emp = byEmp.get(row.employee_id);
    if (!emp) {
      emp = {
        employee_id: row.employee_id,
        employee_name: row.employee_name,
        shifts: 0,
        rate,
        weekHours: Object.fromEntries(weekStarts.map((week) => [week, 0])),
        regular: 0,
        overtime: 0,
        pay: 0,
      };
      byEmp.set(row.employee_id, emp);
    }
    emp.shifts += 1;
    emp.pay = roundMoney(emp.pay + pay);
    emp.rate = rate;
    const week = row.week_start;
    emp.weekHours[week] = roundHours((emp.weekHours[week] ?? 0) + hours);
  }
  for (const emp of byEmp.values()) {
    const time = sumPeriodTime(Object.values(emp.weekHours));
    emp.regular = time.regular;
    emp.overtime = time.overtime;
  }
  return [...byEmp.values()].sort((a, b) => a.employee_name.localeCompare(b.employee_name));
}

export function sumEmployeePayroll(rows: EmployeePayrollRow[], weekStarts: string[]) {
  const weekHours: Record<string, number> = Object.fromEntries(weekStarts.map((week) => [week, 0]));
  let shifts = 0;
  let regular = 0;
  let overtime = 0;
  let pay = 0;
  for (const row of rows) {
    shifts += row.shifts;
    regular = roundHours(regular + row.regular);
    overtime = roundHours(overtime + row.overtime);
    pay = roundMoney(pay + row.pay);
    for (const week of weekStarts) {
      weekHours[week] = roundHours(weekHours[week] + (row.weekHours[week] ?? 0));
    }
  }
  return { shifts, regular, overtime, pay, weekHours };
}
