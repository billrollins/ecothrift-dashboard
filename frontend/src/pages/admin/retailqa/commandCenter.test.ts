import { describe, expect, it } from 'vitest';
import { CALM_ISSUES, CALM_JOBS, CALM_STAFF } from './calmFixture';
import { displayName, groupIssues, jobTimeLabel, scheduleSummary, shortName, tileClass } from './commandCenter';

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

describe('tileClass', () => {
  it('marks a closed tile selected', () => {
    expect(tileClass(true, true)).toBe('tile closed sel');
    expect(tileClass(false, true)).toBe('tile sel');
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
});

describe('labels', () => {
  it('keeps due after clock-in', () => {
    expect(jobTimeLabel({ status: 'Due', due_label: 'Due after clock-in' })).toBe('Due after clock-in');
  });

  it('summarizes who is in', () => {
    expect(scheduleSummary(CALM_STAFF)).toBe('5 of 5 in · 1 later');
  });
});
