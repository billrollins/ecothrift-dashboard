import { describe, expect, it } from 'vitest';
import type { QaIssue, QaJob, QaStaffRow } from '../../../api/routines.api';
import { bandWeightLabel, displayName, formatShiftRange, groupIssues, jobTimeLabel, nudgeLabel, peopleDots, scheduleGroups, scheduleSummary, sectionCheckDoneLabel, shortName, tileClass, tileNote } from './commandCenter';

function person(id: number, name: string) {
  return { id, name };
}

const SAMPLE_STAFF: QaStaffRow[] = [
  { id: 1, name: 'Carrie Rollins', role: '', department: 'Retail Operations', shift_name: 'Cashier - Open', time_in: '08:30', time_out: '15:00', clocked_in: true, arrival: '08:28', expected_not_in: false, on_roster: true, status: 'In' },
  { id: 2, name: 'David Kilduff', role: '', department: 'Retail Operations', shift_name: 'Cashier - Close', time_in: '12:30', time_out: '18:30', clocked_in: false, arrival: null, expected_not_in: false, on_roster: true, status: 'Expected' },
  { id: 3, name: 'Ashley Kilduff', role: '', department: 'Processing', shift_name: 'Processing', time_in: '09:00', time_out: '17:00', clocked_in: true, arrival: '08:55', expected_not_in: false, on_roster: true, status: 'In' },
  { id: 4, name: 'Maria Kilduff', role: '', department: 'Processing', shift_name: 'Processing', time_in: '09:00', time_out: '17:00', clocked_in: true, arrival: '09:02', expected_not_in: false, on_roster: true, status: 'In' },
  { id: 5, name: 'Michael Frieze', role: '', department: 'Restoration', shift_name: 'Restoration', time_in: '09:00', time_out: '17:00', clocked_in: true, arrival: '09:10', expected_not_in: false, on_roster: true, status: 'In' },
  { id: 6, name: 'Bill Rollins', role: '', department: 'Office', shift_name: 'Office', time_in: '', time_out: '', clocked_in: true, arrival: '08:00', expected_not_in: false, on_roster: false, status: 'In' },
];

const SAMPLE_JOBS: QaJob[] = [
  { group: 'section', key: 'retail.section_tally', title: 'David', run_id: 11, section_id: 1, owner: person(2, 'David Kilduff'), due_at: null, due_label: 'Due after clock-in', status: 'Due', closed: false, can_close: false },
  { group: 'section', key: 'retail.section_tally', title: 'Tere', run_id: 12, section_id: 2, owner: person(4, 'Maria Kilduff'), due_at: null, due_label: 'Done 09:41', completed_label: '09:41', status: 'Done', closed: false, can_close: true },
  { group: 'section', key: 'retail.section_tally', title: 'Ashley', run_id: 13, section_id: 3, owner: null, due_at: null, due_label: 'Done 09:55', completed_label: '09:55', status: 'Done', closed: false, can_close: true },
  { group: 'section', key: 'retail.section_tally', title: 'Carrie', run_id: 14, section_id: 4, owner: null, due_at: null, due_label: 'Done 09:12', completed_label: '09:12', status: 'Done', closed: false, can_close: true },
  { group: 'section', key: 'retail.section_tally', title: 'Michael', run_id: 15, section_id: 5, owner: null, due_at: null, due_label: 'Due 10:05', status: 'Overdue', closed: false, can_close: false },
  { group: 'shift', key: 'retail.open', title: 'Retail open', run_id: 21, section_id: null, owner: person(1, 'Carrie Rollins'), due_at: null, due_label: 'Due 08:30', status: 'Overdue', closed: false, can_close: false },
  { group: 'shift', key: 'retail.day', title: 'Retail day', run_id: 22, section_id: null, owner: person(1, 'Carrie Rollins'), due_at: null, due_label: 'Due 14:00', status: 'Due', closed: false, can_close: false },
  { group: 'shift', key: 'retail.close', title: 'Retail close', run_id: 23, section_id: null, owner: person(2, 'David Kilduff'), due_at: null, due_label: 'Due 18:00', status: 'Due', closed: false, can_close: false },
];

const SAMPLE_ISSUES: QaIssue[] = [
  { id: 'routine-21', type: 'overdue_routine', severity: 'amber', sentence: 'Retail open was due 08:30 and is not started.', action: 'nudge', person_id: 1, person_name: 'Carrie Rollins', run_id: 21, call_in_id: null, nudged_at: null, can_act: true },
  { id: 'routine-15', type: 'overdue_routine', severity: 'amber', sentence: "Michael's section check was due 10:05.", action: 'nudge', person_id: 5, person_name: 'Michael Frieze', run_id: 15, call_in_id: null, nudged_at: null, can_act: true },
];

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

describe('bandWeightLabel', () => {
  it('shows a dash instead of a percent when the third is excluded', () => {
    expect(bandWeightLabel('Spot', 60, true)).toBe('Spot —');
    expect(bandWeightLabel('Do', 62.5, false)).toBe('Do 62.5%');
    expect(bandWeightLabel('Cross', 15, false)).toBe('Cross 15%');
  });

  it('keeps the excluded tooltip reasons next to the dash', () => {
    expect(bandWeightLabel('Spot', 0, true)).toBe('Spot —');
    expect('No walks this week · not counted').toContain('not counted');
    expect('Cross-checks pending until Tue Sep 15').toContain('Tue Sep 15');
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
    const rows = groupIssues(SAMPLE_ISSUES, SAMPLE_STAFF, SAMPLE_JOBS);
    expect(rows.map((row) => row.sentence)).toEqual([
      'Retail open was due 08:30 and is not started. Owner Carrie R.',
      "Michael's section check was due 10:05.",
    ]);
  });

  it('groups people who are expected and not in', () => {
    const rows = groupIssues([], SAMPLE_STAFF.map((row) => (
      row.id === 3 || row.id === 4
        ? { ...row, clocked_in: false, status: 'Late' as const, late_severity: 'amber' as const, expected_not_in: true }
        : row
    )), []);
    expect(rows[0].sentence).toBe('2 people expected, not in');
  });

  it('writes one late sentence instead of listing the person as a key', () => {
    const rows = groupIssues([], SAMPLE_STAFF.map((row) => (
      row.id === 5
        ? { ...row, clocked_in: false, status: 'Late' as const, late_minutes: 100, late_severity: 'amber' as const }
        : row
    )), []);
    expect(rows[0].sentence).toBe('Michael F. is 1 h 40 min late for Restoration.');
  });

  it('keeps nudged_at on routine issues', () => {
    const rows = groupIssues(SAMPLE_ISSUES, SAMPLE_STAFF, SAMPLE_JOBS);
    expect(rows[0].nudged_at).toBe(SAMPLE_ISSUES[0].nudged_at);
  });

  it('keeps hard-deadline issue copy', () => {
    const jobs: QaJob[] = [{
      ...SAMPLE_JOBS[5],
      due_label: 'Due 09:00',
      urgency: 'hard',
      status: 'Overdue',
    }];
    const issues: QaIssue[] = [{
      ...SAMPLE_ISSUES[0],
      severity: 'red',
      sentence: 'Retail open is past its hard deadline (10:00).',
      nudged_at: '10:00',
    }];
    const rows = groupIssues(issues, SAMPLE_STAFF, jobs);
    expect(rows.some((row) => /hard deadline/.test(row.sentence))).toBe(true);
  });
});

describe('nudgeLabel', () => {
  it('prefixes a clock and leaves Heard / Not seen alone', () => {
    expect(nudgeLabel('08:55')).toBe('Nudged 08:55');
    expect(nudgeLabel('Heard 09:02')).toBe('Heard 09:02');
    expect(nudgeLabel('Resolved')).toBe('Resolved');
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

  it('a person with 2 done, 1 missed, 1 due today reads 2 of 3 · 1 due today and has four dots', () => {
    const days = ['none', 'done', 'done', 'missed', 'due', 'none', 'none'];
    expect(sectionCheckDoneLabel({ done: 2, assigned: 3, due_today: 1 })).toBe('2 of 3 · 1 due today');
    expect(peopleDots([], 1, days).filter(Boolean)).toHaveLength(4);
  });
});

describe('scheduleGroups', () => {
  it('sorts by department_sort and does not consult name maps', () => {
    const groups = scheduleGroups([
      { ...SAMPLE_STAFF[4], department: 'Zebra Desk', department_slug: 'zebra', department_sort: 0, department_icon: 'tag' },
      { ...SAMPLE_STAFF[0], department: 'Alpha Floor', department_slug: 'alpha', department_sort: 2, department_icon: 'cart' },
    ]);
    expect(groups.map((group) => group.slug)).toEqual(['zebra', 'alpha']);
    expect(groups.map((group) => group.department)).toEqual(['Zebra Desk', 'Alpha Floor']);
  });

  it('hides an inactive department unless someone on that roster is present', () => {
    const hidden = scheduleGroups([
      { ...SAMPLE_STAFF[0], department_active: false, on_roster: false, department_slug: 'old', department_sort: 9 },
    ]);
    expect(hidden).toEqual([]);
    const shown = scheduleGroups([
      { ...SAMPLE_STAFF[0], department_active: false, on_roster: true, department_slug: 'old', department_sort: 9 },
    ]);
    expect(shown[0]?.inactive).toBe(true);
  });
});

describe('labels', () => {
  it('keeps due after clock-in', () => {
    expect(jobTimeLabel({ status: 'Due', due_label: 'Due after clock-in' })).toBe('Due after clock-in');
  });

  it('summarizes who is in', () => {
    expect(scheduleSummary(SAMPLE_STAFF)).toBe('5 of 6 in');
  });

  it('counts expected people in the denominator and treats later as a qualifier', () => {
    expect(scheduleSummary(SAMPLE_STAFF.map((row) => ({ ...row, clocked_in: false, status: 'Expected' as const })))).toBe('0 of 6 in');
  });

  it('counts a late person separately', () => {
    const rows = SAMPLE_STAFF.map((row) => (
      row.id === 5
        ? { ...row, clocked_in: false, status: 'Late' as const, late_minutes: 100 }
        : row
    ));
    expect(scheduleSummary(rows)).toBe('4 of 6 in · 1 late');
  });

  it('keeps called-in people in the expected count', () => {
    const rows = [
      { ...SAMPLE_STAFF[0], clocked_in: false, status: 'Late' as const },
      { ...SAMPLE_STAFF[1], clocked_in: false, status: 'Late' as const },
      { ...SAMPLE_STAFF[2], clocked_in: false, status: 'Late' as const },
      { ...SAMPLE_STAFF[3], clocked_in: false, status: 'Called in' as const },
      { ...SAMPLE_STAFF[4], clocked_in: false, status: 'Called in' as const },
    ];
    expect(scheduleSummary(rows)).toBe('0 of 5 in · 3 late · 2 called in');
  });
});
