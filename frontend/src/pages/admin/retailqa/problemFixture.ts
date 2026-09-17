import type { QaIssue, QaJob, QaStaffRow, QaToday } from '../../../api/routines.api';
import { CALM_BOARD, CALM_DATE, CALM_PEOPLE, CALM_SPOTS, CALM_STAFF, CALM_TILES, CALM_WEEK } from './calmFixture';

function person(id: number, name: string) {
  return { id, name };
}

export const PROBLEM_DATE = CALM_DATE;
export const PROBLEM_WEEK = CALM_WEEK;
export const PROBLEM_TILES = CALM_TILES;
export const PROBLEM_SPOTS = CALM_SPOTS;
export const PROBLEM_PEOPLE = CALM_PEOPLE;

export const PROBLEM_STAFF: QaStaffRow[] = [
  ...CALM_STAFF.map((row) => (
    row.id === 5
      ? { ...row, clocked_in: false, arrival: null, status: 'Late' as const, late_minutes: 100, late_severity: 'amber' as const, expected_not_in: true }
      : row
  )),
  { id: 7, name: 'Priya Natarajan', role: '', department: 'Donations', shift_name: 'Dock', time_in: '10:00', time_out: '18:00', clocked_in: true, arrival: '10:01', expected_not_in: false, on_roster: true, status: 'In' },
  { id: 8, name: 'Tom Okafor', role: '', department: 'Donations', shift_name: 'Dock', time_in: '10:00', time_out: '18:00', clocked_in: true, arrival: '09:58', expected_not_in: false, on_roster: true, status: 'In' },
  { id: 9, name: 'Lena Brandt', role: '', department: 'Donations', shift_name: 'Sorting', time_in: '11:00', time_out: '19:00', clocked_in: false, arrival: null, expected_not_in: false, on_roster: true, status: 'Expected' },
  { id: 10, name: 'Sam Delgado', role: '', department: 'Ecommerce', shift_name: 'Listings', time_in: '09:00', time_out: '17:00', clocked_in: true, arrival: '08:54', expected_not_in: false, on_roster: true, status: 'In' },
  { id: 11, name: 'Jo Whitfield', role: '', department: 'Ecommerce', shift_name: 'Shipping', time_in: '09:00', time_out: '17:00', clocked_in: true, arrival: '09:00', expected_not_in: false, on_roster: true, status: 'In' },
];

export const PROBLEM_JOBS: QaJob[] = [
  { group: 'section', key: 'retail.section_tally', title: 'David', run_id: 11, section_id: 1, owner: person(2, 'David Kilduff'), due_at: null, due_label: 'Due after clock-in', status: 'Due', closed: false, can_close: false },
  { group: 'section', key: 'retail.section_tally', title: 'Tere', run_id: 12, section_id: 2, owner: person(4, 'Maria Kilduff'), due_at: null, due_label: 'Done 09:41', completed_label: '09:41', status: 'Done', closed: false, can_close: true },
  { group: 'section', key: 'retail.section_tally', title: 'Ashley', run_id: 13, section_id: 3, owner: person(3, 'Ashley Kilduff'), due_at: null, due_label: 'Done 09:55', completed_label: '09:55', status: 'Done', closed: false, can_close: true },
  { group: 'section', key: 'retail.section_tally', title: 'Carrie', run_id: 14, section_id: 4, owner: person(1, 'Carrie Rollins'), due_at: null, due_label: 'Done 09:12', completed_label: '09:12', status: 'Done', closed: false, can_close: true },
  { group: 'section', key: 'retail.section_tally', title: 'Michael', run_id: 15, section_id: 5, owner: person(5, 'Michael Frieze'), due_at: null, due_label: 'Due after clock-in', status: 'Due', closed: false, can_close: false },
  { group: 'shift', key: 'retail.open', title: 'Retail open', run_id: 21, section_id: null, owner: person(1, 'Carrie Rollins'), due_at: null, due_label: 'Due 08:30', status: 'Overdue', closed: false, can_close: false },
  { group: 'shift', key: 'retail.day', title: 'Retail day', run_id: 22, section_id: null, owner: person(1, 'Carrie Rollins'), due_at: null, due_label: 'Due 14:00', status: 'Due', closed: false, can_close: false },
  { group: 'shift', key: 'retail.close', title: 'Retail close', run_id: 23, section_id: null, owner: person(2, 'David Kilduff'), due_at: null, due_label: 'Due 18:00', status: 'Due', closed: false, can_close: false },
];

export const SCROLL_JOBS: QaJob[] = [
  ...PROBLEM_JOBS,
  { group: 'section', key: 'retail.section_tally', title: 'Priya', run_id: 16, section_id: 6, owner: person(7, 'Priya Natarajan'), due_at: null, due_label: 'Due after clock-in', status: 'Due', closed: false, can_close: false },
  { group: 'section', key: 'retail.section_tally', title: 'Tom', run_id: 17, section_id: 7, owner: person(8, 'Tom Okafor'), due_at: null, due_label: 'Done 10:12', completed_label: '10:12', status: 'Done', closed: false, can_close: true },
  { group: 'section', key: 'retail.section_tally', title: 'Sam', run_id: 18, section_id: 8, owner: person(10, 'Sam Delgado'), due_at: null, due_label: 'Due after clock-in', status: 'Due', closed: false, can_close: false },
  { group: 'section', key: 'retail.section_tally', title: 'Jo', run_id: 19, section_id: 9, owner: person(11, 'Jo Whitfield'), due_at: null, due_label: 'Due after clock-in', status: 'Due', closed: false, can_close: false },
];

export const PROBLEM_ISSUES: QaIssue[] = [
  { id: 'late-5', type: 'late', severity: 'amber', sentence: 'Michael F. is 1 h 40 min late for Restoration.', action: 'call_in', person_id: 5, person_name: 'Michael Frieze', run_id: null, call_in_id: null, nudged_at: null, can_act: true },
  { id: 'routine-21', type: 'overdue_routine', severity: 'amber', sentence: 'Retail open was due 08:30 and is not started.', action: 'nudge', person_id: 1, person_name: 'Carrie Rollins', run_id: 21, call_in_id: null, nudged_at: null, can_act: true },
];

export const PROBLEM_BOARD: QaToday = {
  ...CALM_BOARD,
  staff: PROBLEM_STAFF,
  jobs: PROBLEM_JOBS,
  issues: PROBLEM_ISSUES,
};

export const SCROLL_BOARD: QaToday = {
  ...PROBLEM_BOARD,
  jobs: SCROLL_JOBS,
  doing: { done: 4, needed: 12, score: 88, routines: [] },
};
