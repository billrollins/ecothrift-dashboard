/**
 * Schedule at a glance (Bill, Dash Updates #55, 2026-11-03): the pure logic behind the page.
 * - Sections: one per home department, fixed (Retail) first, then the server's department order.
 * - Hours (Dash Updates #74, 2026-11-05): planned for the week, planned so far against worked so far, and the pace.
 * - Floor coverage: how many fixed (Retail) shifts are on the floor through store hours, with gaps and single coverage.
 * - Part A (Bill, 2026-11-03): coverage for every department (only fixed ones flag gaps), drag snapping (15 minutes on
 *   the week, 5 in the enlarged day).
 */
import type { ScheduleWeek } from '../../api/schedule.api';

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

/** Minutes → '08:30' (what the API takes). */
export const toHHMM = (mins: number) => {
  const m = Math.max(0, Math.min(24 * 60 - 1, Math.round(mins)));
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};

/** Round to the nearest step (15 on the week, 5 enlarged). */
export const snap = (mins: number, step: number) => Math.round(mins / step) * step;

/** A shift's end in minutes; one that runs past midnight ends at midnight on this timeline. */
export const endMinutes = (s: { start_time: string; end_time: string }) => {
  const e = minutes(s.end_time);
  return e <= minutes(s.start_time) ? 24 * 60 : e;
};

export const range = (start: string, end: string) => `${short(minutes(start))}-${short(minutes(end))}`;

export interface Pace {
  /** Scheduled for the whole week. */
  planned: number;
  /** Scheduled up to now: past days whole, today's shift up to this minute. */
  toDate: number;
  /** Clocked so far (null when the reader may not see it). */
  worked: number | null;
  /** Worked minus scheduled so far; null when there is nothing to compare yet. */
  delta: number | null;
  /** What the week ends at if the rest goes as planned. */
  pace: number | null;
}

/** Within this many hours of plan counts as on track. */
export const ON_TRACK = 0.5;

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Hours for one person this week (Bill, Dash Updates #74): planned for the week, planned so far against worked so far,
 * and where the week lands at this pace. `today` is 'yyyy-MM-dd'; a week wholly past counts every day, a future one none.
 */
export function hoursPace(shifts: Array<{ date: string; start_time: string; end_time: string; hours: number }>, worked: number | null | undefined, today: string, nowMinutes: number): Pace {
  let planned = 0;
  let toDate = 0;
  for (const s of shifts) {
    planned += s.hours;
    if (s.date < today) toDate += s.hours;
    else if (s.date === today) {
      const from = minutes(s.start_time);
      const to = endMinutes(s);
      // Today counts up to this minute, the same way clocked time does (Bill, 2026-11-05: both through now).
      const done = Math.min(Math.max(nowMinutes - from, 0), to - from);
      toDate += to > from ? s.hours * (done / (to - from)) : 0;
    }
  }
  const started = shifts.some((s) => s.date <= today) || (worked ?? 0) > 0;
  // Every number is rounded before it is compared, so what shows adds up.
  const w = worked == null ? null : round1(worked);
  const p = round1(planned);
  const d = round1(toDate);
  return {
    planned: p,
    toDate: d,
    worked: w,
    delta: w == null || !started ? null : round1(w - d),
    pace: w == null || !started ? null : round1(w + p - d),
  };
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

export interface SectionCoverage {
  /** Null when there is nothing to judge (a closed day nobody works). */
  window: [number, number] | null;
  segments: Segment[];
  /** Gaps and single coverage are flagged (fixed departments on an open day). */
  flagged: boolean;
}

/**
 * Coverage for one section on one day. Fixed departments are judged across store hours; on a day the store is closed,
 * and for flexible departments, across the span the shifts themselves cover, without flags.
 */
export function sectionCoverage(shifts: Array<{ start_time: string; end_time: string }>, store: { open: boolean; start: string; end: string } | undefined, fixed: boolean): SectionCoverage {
  if (fixed && store?.open) {
    return { window: [minutes(store.start), minutes(store.end)], segments: coverage(shifts, store.start, store.end), flagged: true };
  }
  if (!shifts.length) return { window: null, segments: [], flagged: false };
  const a = Math.min(...shifts.map((s) => minutes(s.start_time)));
  const b = Math.max(...shifts.map(endMinutes));
  return { window: [a, b], segments: coverage(shifts, toHHMM(a), toHHMM(b)), flagged: false };
}

/** The server's reason, or the fallback: `{detail}` or the first field's first message. */
export function errorText(err: unknown, fallback: string): string {
  const data = (err as { response?: { data?: Record<string, unknown> } })?.response?.data;
  if (!data) return fallback;
  if (typeof data.detail === 'string') return data.detail;
  const first = Object.values(data)[0];
  return Array.isArray(first) ? String(first[0]) : typeof first === 'string' ? first : fallback;
}
