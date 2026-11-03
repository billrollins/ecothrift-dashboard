/**
 * Schedule at a glance (Bill, Dash Updates #55, 2026-11-03): the pure logic behind the page.
 * - Sections: one per home department, fixed (Retail) first, then the server's department order.
 * - Usual pattern: each person's usual weekly shifts said once ("Mon-Fri 9-5"); a flexible row only draws a day that
 *   differs from usual (day off, call-in, extra or changed shift).
 * - Floor coverage: how many fixed (Retail) shifts are on the floor through store hours, with gaps and single coverage.
 */
import type { CallIn, ScheduledShift, ScheduleWeek, UsualShift } from '../../api/schedule.api';

export type Person = ScheduleWeek['people'][number];

export interface Section {
  key: string;
  name: string;
  fixed: boolean;
  people: Person[];
}

/** Home departments as sections, fixed first; people keep the server's order (my row first when `meFirst`). */
export function groupSections(people: Person[], meFirst?: number): Section[] {
  const sections: Section[] = [];
  const byKey = new Map<string, Section>();
  for (const p of people) {
    const key = p.department == null ? 'none' : String(p.department);
    let s = byKey.get(key);
    if (!s) {
      s = { key, name: p.department_name || '', fixed: Boolean(p.fixed), people: [] };
      byKey.set(key, s);
      sections.push(s);
    }
    s.people.push(p);
  }
  if (meFirst != null) {
    for (const s of sections) s.people.sort((a, b) => Number(b.id === meFirst) - Number(a.id === meFirst));
  }
  const rank = (s: Section) => (s.fixed ? 0 : s.key === 'none' ? 2 : 1);
  return sections.map((s, i) => ({ s, i })).sort((a, b) => rank(a.s) - rank(b.s) || a.i - b.i).map(({ s }) => s);
}

/** '09:00' → minutes after midnight. */
export const minutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + (m || 0);
};

/** Minutes → '9', '8:30', '12' (no am/pm: store hours make it plain). */
export function short(mins: number): string {
  const h = Math.floor(mins / 60) % 24;
  const m = mins % 60;
  const h12 = ((h + 11) % 12) + 1;
  return m ? `${h12}:${String(m).padStart(2, '0')}` : String(h12);
}

export const range = (start: string, end: string) => `${short(minutes(start))}-${short(minutes(end))}`;

/** Weekday runs: [0,1,2,3,4] → 'Mon-Fri', [0,2,3] → 'Mon, Wed-Thu'. `names` is Monday first. */
export function dayRuns(days: number[], names: string[]): string {
  const sorted = [...new Set(days)].sort((a, b) => a - b);
  const parts: string[] = [];
  for (let i = 0; i < sorted.length;) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j] + 1) j += 1;
    parts.push(j === i ? names[sorted[i]] : `${names[sorted[i]]}-${names[sorted[j]]}`);
    i = j + 1;
  }
  return parts.join(', ');
}

/** The usual week once: 'Mon-Fri 9-5' or 'Mon-Fri 9-5 · Sat 8:30-4:30'; '' when there is none. */
export function usualText(usual: UsualShift[], names: string[]): string {
  const groups = new Map<string, number[]>();
  for (const u of usual) {
    const key = range(u.start_time, u.end_time);
    groups.set(key, [...(groups.get(key) ?? []), u.weekday]);
  }
  return [...groups.entries()]
    .sort((a, b) => Math.min(...a[1]) - Math.min(...b[1]))
    .map(([times, days]) => `${dayRuns(days, names)} ${times}`)
    .join(' · ');
}

export type DayKind = 'none' | 'usual' | 'off' | 'extra' | 'changed' | 'callin';

/**
 * What a flexible row shows on one day (weekday 0 = Monday). A call-in always wins and replaces the shift. A usual day
 * with no shift is a day off, but only once the week has been built (`weekBuilt`), so an empty week is not all "Off".
 */
export function dayKind(usual: UsualShift[], weekday: number, shifts: ScheduledShift[], calls: CallIn[], weekBuilt: boolean): DayKind {
  if (calls.length) return 'callin';
  const today = usual.filter((u) => u.weekday === weekday);
  if (!shifts.length) return today.length && weekBuilt ? 'off' : 'none';
  if (!today.length) return 'extra';
  const same = shifts.length === today.length
    && shifts.every((s) => today.some((u) => u.start_time === s.start_time && u.end_time === s.end_time));
  return same ? 'usual' : 'changed';
}

export interface Segment { from: number; to: number; count: number }

/** People on the floor through the open hours, as runs of the same head count. */
export function coverage(shifts: Array<{ start_time: string; end_time: string }>, open: string, close: string): Segment[] {
  const a = minutes(open);
  const b = minutes(close);
  if (b <= a) return [];
  const spans = shifts.map((s) => {
    const from = minutes(s.start_time);
    let to = minutes(s.end_time);
    if (to <= from) to += 24 * 60;
    return [Math.max(from, a), Math.min(to, b)] as const;
  }).filter(([f, t]) => t > f);
  const cuts = [...new Set([a, b, ...spans.flat()])].sort((x, y) => x - y);
  const out: Segment[] = [];
  for (let i = 0; i < cuts.length - 1; i += 1) {
    const from = cuts[i];
    const to = cuts[i + 1];
    const count = spans.filter(([f, t]) => f <= from && t >= to).length;
    const last = out[out.length - 1];
    if (last && last.count === count) last.to = to;
    else out.push({ from, to, count });
  }
  return out;
}

export interface CoverageSummary {
  gaps: Segment[];
  singles: Segment[];
  peak: number;
}

export function summarize(segments: Segment[]): CoverageSummary {
  return {
    gaps: segments.filter((s) => s.count === 0),
    singles: segments.filter((s) => s.count === 1),
    peak: segments.reduce((m, s) => Math.max(m, s.count), 0),
  };
}

/** One timeline for the whole week: store hours widened to every fixed shift, whole hours. */
export function timelineWindow(hours: Array<{ open: boolean; start: string; end: string }>, shifts: Array<{ start_time: string; end_time: string }>): [number, number] {
  const starts = [...hours.filter((h) => h.open).map((h) => minutes(h.start)), ...shifts.map((s) => minutes(s.start_time))];
  const ends = [...hours.filter((h) => h.open).map((h) => minutes(h.end)), ...shifts.map((s) => {
    const e = minutes(s.end_time);
    return e <= minutes(s.start_time) ? 24 * 60 : e;
  })];
  if (!starts.length) return [9 * 60, 18 * 60];
  return [Math.floor(Math.min(...starts) / 60) * 60, Math.ceil(Math.max(...ends) / 60) * 60];
}
