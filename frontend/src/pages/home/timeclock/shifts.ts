/** The pay period's shifts as rows, for TimeClock > Past shifts (Dash Updates #137, #179). */
import { format, parseISO } from 'date-fns';
import { es as esLocale } from 'date-fns/locale';
import type { Tone } from '../../../components/page/PageKit';
import type { MyPeriod, MyPeriodWorked } from '../../../types/hr.types';
import { clockLabel } from '../../routines/runDeadline';
import type { Tc, TimeClockCopyKey } from './copy';

export const hrs = (value: string | number) => {
  const n = typeof value === 'number' ? value : parseFloat(value);
  return Number.isFinite(n) ? n.toFixed(2) : '0.00';
};

export interface ShiftRowModel {
  key: string;
  date: string;
  isToday: boolean;
  /** Only on a day's first row: the card title on a phone. */
  day: string;
  scheduled: string;
  worked: string;
  hours: string;
  status: { tone: Tone; label: TimeClockCopyKey } | null;
  /** A finished shift with no fix waiting: it can be fixed. */
  fix: MyPeriodWorked | null;
}

function workedStatus(entry: MyPeriodWorked): ShiftRowModel['status'] {
  if (!entry.clock_out) return { tone: 'good', label: entry.on_break ? 'onBreak' : 'onClock' };
  if (entry.change?.status === 'pending') return { tone: 'wait', label: 'fixAsked' };
  if (entry.status === 'flagged') return { tone: 'problem', label: 'needsFix' };
  if (entry.change?.status === 'approved') return { tone: 'good', label: 'fixed' };
  if (entry.change?.status === 'denied') return { tone: 'quiet', label: 'fixDeclined' };
  return null;
}

/** The period's days as table rows: one per shift worked (the schedule on the first), else one for the day. */
export function shiftRows(period: MyPeriod, tc: Tc, lang: string): ShiftRowModel[] {
  const locale = lang === 'es' ? { locale: esLocale } : undefined;
  const rows: ShiftRowModel[] = [];
  for (const d of period.days) {
    const dayText = format(parseISO(d.date), 'EEE MMM d', locale);
    const scheduled = d.scheduled
      .map((s) => `${s.text}${s.department_name ? ` ${s.department_name}` : ''}`)
      .join(', ');
    if (d.worked.length) {
      d.worked.forEach((entry, i) => {
        const open = !entry.clock_out;
        const breakText = entry.break_minutes ? ` · ${tc('breakMin', { m: entry.break_minutes })}` : '';
        rows.push({
          key: `${d.date}-${entry.id}`,
          date: d.date,
          isToday: d.is_today,
          day: i === 0 ? dayText : '',
          scheduled: i === 0 ? scheduled : '',
          worked: `${clockLabel(entry.clock_in)} – ${open ? tc('nowWord') : clockLabel(entry.clock_out)}${breakText}`,
          hours: `${hrs(open ? entry.hours_so_far ?? '0' : entry.total_hours ?? '0')} h`,
          status: workedStatus(entry),
          fix: open || entry.change?.status === 'pending' ? null : entry,
        });
      });
      continue;
    }
    let status: ShiftRowModel['status'] = null;
    if (d.day_off) status = d.day_off.status === 'approved' ? { tone: 'info', label: 'dayOff' } : { tone: 'wait', label: 'dayOffAsked' };
    else if (d.scheduled.some((s) => parseFloat(s.hours_ahead) > 0)) status = { tone: 'quiet', label: 'upcoming' };
    else if (d.scheduled.length && (d.is_past || d.is_today)) status = { tone: 'quiet', label: 'notWorked' };
    rows.push({
      key: d.date, date: d.date, isToday: d.is_today, day: dayText, scheduled, worked: '', hours: '', status, fix: null,
    });
  }
  return rows;
}

/**
 * Past shifts, newest first: every day up to today that was worked, and past days that were scheduled or asked off
 * but not worked. Today's shift still ahead is on My schedule, not here.
 */
export function pastRows(period: MyPeriod, tc: Tc, lang: string): ShiftRowModel[] {
  const days = period.days
    .filter((d) => d.worked.length > 0 || (d.is_past && (d.scheduled.length > 0 || d.day_off)))
    .slice()
    .reverse();
  return shiftRows({ ...period, days }, tc, lang);
}
