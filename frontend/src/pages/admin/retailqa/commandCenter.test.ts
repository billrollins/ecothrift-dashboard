import { describe, expect, it } from 'vitest';
import { CALM_ISSUES, CALM_JOBS, CALM_STAFF } from './calmFixture';
import { displayName, formatShiftRange, groupIssues, jobTimeLabel, nudgeLabel, peopleDots, scheduleSummary, shortName, tileClass, tileNote } from './commandCenter';

describe('displayName', () => {
  it('maps routine keys, punch codes, and department keys', () => {
    expect(displayName('retail.open', 'routine')).toBe('Retail open');
    expect(displayName('retail.day', 'routine')).toBe('Retail day');
    expect(displayName('retail.close', 'routine')).toBe('Retail close');
    expect(displayName('office', 'shift')).toBe('Management');
    expect(displayName('restoration', 'shift')).toBe('Restoration');
    expect(displayName('office', 'dept')).toBe('Office');
    expect(displayName('retail', 'dept')).toBe('Retail');
  });

  it('never returns a dotted or lowercase key', () => {
    expect(displayName('retail.open')).not.toMatch(/[.]/);
    expect(displayName('office')).not.toBe('office');
    expect(displayName('restoration')).not.toBe('restoration');
  });
});

describe('tileNote', () => {
  it('shows Do only and a Spot dash when the day has no walk', () => {
    expect(tileNote({ open: true, is_future: false, doing: 92, spot: null })).toBe('Do 92 · Spot —');
  });
});

describe('tileClass', () => {
  it('marks a closed tile selected', () => {
    expect(tileClass(true, true)).toBe('tile closed sel');
    expect(tileClass(false, true)).toBe('tile sel');
  });
});

describe('formatShiftRange', () => {
  it('prints 08:30 to 15:00 from stored clocks', () => {
    expect(formatShiftRange('08:30', '15:00')).toBe('08:30 to 15:00');
    expect(formatShiftRange('8:30:00', '15:00:00')).toBe('08:30 to 15:00');
  });
});

describe('shortName', () => {
  it('uses first name and last initial', () => {
    expect(shortName('Carrie Rollins')).toBe('Carrie R.');
    expect(shortName('Bill')).toBe('Bill');
  });
});

describe('groupIssues', () => {
  it('keeps overdue routines and does not list people who are in', () => {
    const rows = groupIssues(CALM_ISSUES, CALM_STAFF, CALM_JOBS);
    expect(rows.map((row) => row.sentence)).toEqual([
      'Retail open was due 08:30 and is not started. Owner Carrie R.',
      "Michael's section check was due 10:05.",
    ]);
  });

  it('groups people who are expected and not in', () => {
    const staff = CALM_STAFF.map((row) => (
      row.id === 3 || row.id === 4
        ? { ...row, clocked_in: false, status: 'Late' as const, late_severity: 'amber' as const, expected_not_in: true }
        : row
    ));
    const rows = groupIssues([], staff, []);
    expect(rows[0].sentence).toBe('2 people expected, not in');
  });

  it('writes one late sentence instead of listing the person as a key', () => {
    const staff = CALM_STAFF.map((row) => (
      row.id === 5
        ? { ...row, clocked_in: false, status: 'Late' as const, late_minutes: 100, late_severity: 'amber' as const }
        : row
    ));
    const rows = groupIssues([], staff, []);
    expect(rows[0].sentence).toBe('Michael F. is 1 h 40 min late for Restoration.');
  });

  it('keeps nudged_at on routine issues', () => {
    const rows = groupIssues(CALM_ISSUES, CALM_STAFF, CALM_JOBS);
    expect(rows[0].nudged_at).toBe(CALM_ISSUES[0].nudged_at);
  });
});

describe('nudgeLabel', () => {
  it('prefixes a clock and leaves Heard / Not seen alone', () => {
    expect(nudgeLabel('08:55')).toBe('Nudged 08:55');
    expect(nudgeLabel('Heard 09:02')).toBe('Heard 09:02');
    expect(nudgeLabel('Not seen')).toBe('Not seen');
    expect(nudgeLabel(null)).toBe('');
  });
});

describe('peopleDots', () => {
  it('maps week payload section-check days onto dialog dots', () => {
    expect(peopleDots([], 1, ['none', 'done', 'due', 'missed', 'none', 'due', 'none'])).toEqual([
      '', 'ok', 'due', 'miss', '', 'due', '',
    ]);
  });
});

describe('labels', () => {
  it('keeps due after clock-in', () => {
    expect(jobTimeLabel({ status: 'Due', due_label: 'Due after clock-in' })).toBe('Due after clock-in');
  });

  it('summarizes who is in', () => {
    expect(scheduleSummary(CALM_STAFF)).toBe('5 of 6 in');
  });

  it('counts expected people in the denominator and treats later as a qualifier', () => {
    const later = CALM_STAFF.map((row) => ({ ...row, clocked_in: false, status: 'Expected' as const }));
    expect(scheduleSummary(later)).toBe('0 of 6 in');
  });

  it('counts a late person separately', () => {
    const staff = CALM_STAFF.map((row) => (
      row.id === 5
        ? { ...row, clocked_in: false, status: 'Late' as const, late_minutes: 100 }
        : row
    ));
    expect(scheduleSummary(staff)).toBe('4 of 6 in · 1 late');
  });
});
