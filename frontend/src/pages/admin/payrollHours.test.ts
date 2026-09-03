import { describe, expect, it } from 'vitest';
import type { TimeEntryRosterRow } from '../../types/hr.types';
import {
  buildEmployeePayrollRows,
  fmtWeekHeader,
  mondaysCoveringRange,
  splitWeeklyHours,
  sumEmployeePayroll,
  sumPeriodTime,
  WEEKLY_HOUR_LIMIT,
} from './payrollHours';

describe('splitWeeklyHours', () => {
  it('treats a blank or invalid total as zero of each', () => {
    expect(splitWeeklyHours(Number.NaN)).toEqual({ regular: 0, overtime: 0 });
    expect(splitWeeklyHours(0)).toEqual({ regular: 0, overtime: 0 });
    expect(splitWeeklyHours(-4)).toEqual({ regular: 0, overtime: 0 });
  });

  it('keeps a short week entirely regular', () => {
    expect(splitWeeklyHours(32.5)).toEqual({ regular: 32.5, overtime: 0 });
    expect(splitWeeklyHours(WEEKLY_HOUR_LIMIT)).toEqual({ regular: 40, overtime: 0 });
  });

  it('caps regular at 40 and sends the rest to overtime', () => {
    expect(splitWeeklyHours(47.25)).toEqual({ regular: 40, overtime: 7.25 });
  });
});

describe('sumPeriodTime', () => {
  it('adds regular and overtime across weeks independently', () => {
    expect(sumPeriodTime([30, 45])).toEqual({ regular: 70, overtime: 5 });
  });

  it('does not invent overtime from a two-week total that never crossed 40 in one week', () => {
    expect(sumPeriodTime([22, 22])).toEqual({ regular: 44, overtime: 0 });
  });

  it('keeps regular plus overtime equal to the hours that were split', () => {
    const weeks = [141.81, 0.09];
    const { regular, overtime } = sumPeriodTime(weeks);
    expect(regular + overtime).toBeCloseTo(141.9, 2);
  });
});

describe('mondaysCoveringRange / fmtWeekHeader', () => {
  it('lists each Monday that the range touches', () => {
    expect(mondaysCoveringRange('2026-08-17', '2026-08-30')).toEqual([
      '2026-08-17',
      '2026-08-24',
    ]);
  });

  it('labels a same-month week without repeating the month', () => {
    expect(fmtWeekHeader('2026-08-17')).toBe('Aug 17-23');
  });
});

describe('buildEmployeePayrollRows', () => {
  const weeks = ['2026-08-17', '2026-08-24'];

  function shift(partial: Partial<TimeEntryRosterRow> & Pick<TimeEntryRosterRow, 'id' | 'week_start' | 'total_hours' | 'pay'>): TimeEntryRosterRow {
    return {
      employee_id: 9,
      employee_name: 'Ada Lovelace',
      date: partial.week_start,
      clock_in: `${partial.week_start}T09:00:00Z`,
      clock_out: `${partial.week_start}T18:00:00Z`,
      shift: '',
      shift_label: '',
      break_minutes: 0,
      break_label: '-',
      on_break: false,
      pay_rate: '15.00',
      week_end: partial.week_start,
      weekly_cumulative_hours: partial.total_hours,
      is_open: false,
      ...partial,
    };
  }

  it('flattens weeks and splits overtime from the same hours used for pay', () => {
    const rows = buildEmployeePayrollRows(
      [
        shift({ id: 1, week_start: '2026-08-17', total_hours: '30.00', pay: '450.00' }),
        shift({ id: 2, week_start: '2026-08-24', total_hours: '45.00', pay: '675.00' }),
      ],
      weeks,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].shifts).toBe(2);
    expect(rows[0].weekHours['2026-08-17']).toBe(30);
    expect(rows[0].weekHours['2026-08-24']).toBe(45);
    expect(rows[0].regular).toBe(70);
    expect(rows[0].overtime).toBe(5);
    expect(rows[0].pay).toBe(1125);
    expect(rows[0].regular + rows[0].overtime).toBe(75);
  });

  it('sums a footer that matches the rows', () => {
    const rows = buildEmployeePayrollRows(
      [
        shift({ id: 1, week_start: '2026-08-17', total_hours: '30.00', pay: '450.00' }),
        shift({
          id: 3,
          employee_id: 2,
          employee_name: 'Maria',
          week_start: '2026-08-24',
          total_hours: '40.09',
          pay: '601.35',
        }),
      ],
      weeks,
    );
    const totals = sumEmployeePayroll(rows, weeks);
    expect(totals.shifts).toBe(2);
    expect(totals.regular + totals.overtime).toBeCloseTo(
      totals.weekHours['2026-08-17'] + totals.weekHours['2026-08-24'],
      2,
    );
  });
});
