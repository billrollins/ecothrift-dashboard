import { describe, expect, it } from 'vitest';
import type { ScheduledShift, UsualShift } from '../../api/schedule.api';
import { coverage, dayKind, dayRuns, groupSections, sectionCoverage, snap, summarize, timelineWindow, toHHMM, usualText, type Person } from './scheduleLayout';

const NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const usual = (days: number[], start = '09:00', end = '17:00'): UsualShift[] =>
  days.map((weekday) => ({ weekday, start_time: start, end_time: end, department: 2, department_name: 'Processing', flexible: true }));
const shift = (start_time: string, end_time: string, id = 1) => ({ id, start_time, end_time } as ScheduledShift);
const person = (id: number, department: number | null, department_name: string, fixed = false) =>
  ({ id, name: `P${id}`, department, department_name, fixed, usual: [], hours: 0 } as Person);

describe('groupSections', () => {
  it('puts fixed (Retail) first, keeps the server order, and no department last', () => {
    const people = [person(1, 3, 'Processing'), person(2, null, ''), person(3, 1, 'Retail', true), person(4, 3, 'Processing'), person(5, 4, 'Office')];
    expect(groupSections(people).map((s) => [s.name, s.people.map((p) => p.id)])).toEqual([
      ['Retail', [3]], ['Processing', [1, 4]], ['Office', [5]], ['', [2]],
    ]);
  });

  it('puts my row first in my section', () => {
    const people = [person(1, 3, 'Processing'), person(4, 3, 'Processing')];
    expect(groupSections(people, 4)[0].people.map((p) => p.id)).toEqual([4, 1]);
  });
});

describe('usual pattern', () => {
  it('says the usual week once', () => {
    expect(usualText(usual([0, 1, 2, 3, 4]), NAMES)).toBe('Mon-Fri 9-5');
    expect(usualText([...usual([0, 1, 3, 4]), ...usual([5], '08:30', '16:30')], NAMES)).toBe('Mon-Tue, Thu-Fri 9-5 · Sat 8:30-4:30');
    expect(usualText([], NAMES)).toBe('');
    expect(dayRuns([4, 0, 2], NAMES)).toBe('Mon, Wed, Fri');
  });

  it('shows a day only when it differs from usual', () => {
    const u = usual([0, 1, 2, 3, 4]);
    expect(dayKind(u, 0, [shift('09:00', '17:00')], [], true)).toBe('usual');
    expect(dayKind(u, 0, [shift('10:00', '14:00')], [], true)).toBe('changed');
    expect(dayKind(u, 5, [shift('09:00', '13:00')], [], true)).toBe('extra');
    expect(dayKind(u, 1, [], [], true)).toBe('off');
    expect(dayKind(u, 1, [], [], false)).toBe('none'); // an unbuilt week is not all "Off"
    expect(dayKind(u, 6, [], [], true)).toBe('none');
    expect(dayKind(u, 0, [shift('09:00', '17:00')], [{ id: 1 } as never], true)).toBe('callin');
  });
});

describe('floor coverage', () => {
  it('counts people on the floor through store hours and flags gaps and single coverage', () => {
    const segs = coverage([shift('08:30', '14:30'), shift('10:30', '18:30')], '09:00', '18:00');
    expect(segs).toEqual([
      { from: 540, to: 630, count: 1 },
      { from: 630, to: 870, count: 2 },
      { from: 870, to: 1080, count: 1 },
    ]);
    const sum = summarize(segs);
    expect(sum.peak).toBe(2);
    expect(sum.singles.length).toBe(2);
    expect(sum.gaps).toEqual([]);
  });

  it('finds a gap', () => {
    const sum = summarize(coverage([shift('09:00', '12:00'), shift('13:00', '18:00')], '09:00', '18:00'));
    expect(sum.gaps).toEqual([{ from: 720, to: 780, count: 0 }]);
    expect(summarize(coverage([], '09:00', '18:00')).gaps).toEqual([{ from: 540, to: 1080, count: 0 }]);
  });

  it('draws one timeline for the week, widened to every shift', () => {
    const hours = [{ open: true, start: '09:00', end: '18:00' }, { open: false, start: '09:00', end: '18:00' }];
    expect(timelineWindow(hours, [shift('08:30', '14:30'), shift('10:30', '18:30')])).toEqual([480, 1140]);
    expect(timelineWindow(hours, [])).toEqual([540, 1080]);
  });
});

describe('part A helpers', () => {
  it('snaps drags and writes times the API takes', () => {
    expect(snap(8 * 60 + 37, 15)).toBe(8 * 60 + 30);
    expect(snap(8 * 60 + 38, 15)).toBe(8 * 60 + 45);
    expect(snap(8 * 60 + 38, 5)).toBe(8 * 60 + 40);
    expect(toHHMM(8 * 60 + 5)).toBe('08:05');
    expect(toHHMM(24 * 60)).toBe('23:59');
  });

  it('judges coverage per section: fixed across store hours, flexible across its own shifts', () => {
    const open = { open: true, start: '09:00', end: '18:00' };
    const retail = sectionCoverage([shift('10:00', '18:00')], open, true);
    expect(retail.window).toEqual([540, 1080]);
    expect(retail.flagged).toBe(true);
    expect(summarize(retail.segments).gaps).toEqual([{ from: 540, to: 600, count: 0 }]);
    const flex = sectionCoverage([shift('09:00', '17:00'), shift('08:00', '16:00')], open, false);
    expect(flex.flagged).toBe(false);
    expect(flex.window).toEqual([480, 1020]);
    expect(summarize(flex.segments).peak).toBe(2);
    // A closed day: Retail is judged on who works it, without flags; nobody working means nothing to judge.
    expect(sectionCoverage([shift('09:00', '13:00')], { ...open, open: false }, true).flagged).toBe(false);
    expect(sectionCoverage([], { ...open, open: false }, true).window).toBeNull();
  });
});
