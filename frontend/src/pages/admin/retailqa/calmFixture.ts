import type { GradeLetter, QaDayTile, QaIssue, QaJob, QaStaffRow, QaToday, QaWeek } from '../../../api/routines.api';

const WEEK = '2026-W38';
const DATE = '2026-09-16';

function person(id: number, name: string) {
  return { id, name };
}

export const CALM_DATE = DATE;

export const CALM_STAFF: QaStaffRow[] = [
  { id: 1, name: 'Carrie Rollins', role: '', department: 'Retail', shift_name: 'Cashier - Open', time_in: '08:30', time_out: '15:00', clocked_in: true, arrival: '08:28', expected_not_in: false, on_roster: true, status: 'In' },
  { id: 2, name: 'David Kilduff', role: '', department: 'Retail', shift_name: 'Cashier - Close', time_in: '12:30', time_out: '18:30', clocked_in: false, arrival: null, expected_not_in: false, on_roster: true, status: 'Expected' },
  { id: 3, name: 'Ashley Kilduff', role: '', department: 'Processing', shift_name: 'Processing', time_in: '09:00', time_out: '17:00', clocked_in: true, arrival: '08:55', expected_not_in: false, on_roster: true, status: 'In' },
  { id: 4, name: 'Maria Kilduff', role: '', department: 'Processing', shift_name: 'Processing', time_in: '09:00', time_out: '17:00', clocked_in: true, arrival: '09:02', expected_not_in: false, on_roster: true, status: 'In' },
  { id: 5, name: 'Michael Frieze', role: '', department: 'Restoration', shift_name: 'Restoration', time_in: '09:00', time_out: '17:00', clocked_in: true, arrival: '09:10', expected_not_in: false, on_roster: true, status: 'In' },
  { id: 6, name: 'Bill Rollins', role: '', department: 'Office', shift_name: 'Office', time_in: '', time_out: '', clocked_in: true, arrival: '08:00', expected_not_in: false, on_roster: false, status: 'In' },
];

export const CALM_JOBS: QaJob[] = [
  { group: 'section', key: 'retail.section_tally', title: 'David', run_id: 11, section_id: 1, owner: person(2, 'David Kilduff'), due_at: null, due_label: 'Due after clock-in', status: 'Due', closed: false, can_close: false },
  { group: 'section', key: 'retail.section_tally', title: 'Tere', run_id: 12, section_id: 2, owner: person(4, 'Maria Kilduff'), due_at: null, due_label: 'Done 09:41', completed_label: '09:41', status: 'Done', closed: false, can_close: true },
  { group: 'section', key: 'retail.section_tally', title: 'Ashley', run_id: 13, section_id: 3, owner: null, due_at: null, due_label: 'Done 09:55', completed_label: '09:55', status: 'Done', closed: false, can_close: true },
  { group: 'section', key: 'retail.section_tally', title: 'Carrie', run_id: 14, section_id: 4, owner: null, due_at: null, due_label: 'Done 09:12', completed_label: '09:12', status: 'Done', closed: false, can_close: true },
  { group: 'section', key: 'retail.section_tally', title: 'Michael', run_id: 15, section_id: 5, owner: null, due_at: null, due_label: 'Due 10:05', status: 'Overdue', closed: false, can_close: false },
  { group: 'shift', key: 'retail.open', title: 'Retail open', run_id: 21, section_id: null, owner: person(1, 'Carrie Rollins'), due_at: null, due_label: 'Due 08:30', status: 'Overdue', closed: false, can_close: false },
  { group: 'shift', key: 'retail.day', title: 'Retail day', run_id: 22, section_id: null, owner: person(1, 'Carrie Rollins'), due_at: null, due_label: 'Due 14:00', status: 'Due', closed: false, can_close: false },
  { group: 'shift', key: 'retail.close', title: 'Retail close', run_id: 23, section_id: null, owner: person(2, 'David Kilduff'), due_at: null, due_label: 'Due 18:00', status: 'Due', closed: false, can_close: false },
];

export const CALM_ISSUES: QaIssue[] = [
  { id: 'routine-21', type: 'overdue_routine', severity: 'amber', sentence: 'Retail open was due 08:30 and is not started.', action: 'nudge', person_id: 1, person_name: 'Carrie Rollins', run_id: 21, call_in_id: null, nudged_at: null, can_act: true },
  { id: 'routine-15', type: 'overdue_routine', severity: 'amber', sentence: "Michael's section check was due 10:05.", action: 'nudge', person_id: 5, person_name: 'Michael Frieze', run_id: 15, call_in_id: null, nudged_at: null, can_act: true },
];

export const CALM_TILES: QaDayTile[] = [
  { date: '2026-09-14', weekday: 'Mon', open: false, letter: null, projected_letter: null, doing: null, spot: null, cross: null, is_today: false, is_future: false },
  { date: '2026-09-15', weekday: 'Tue', open: true, letter: 'A', projected_letter: null, doing: 100, spot: 91, cross: 100, is_today: false, is_future: false },
  { date: '2026-09-16', weekday: 'Wed', open: true, letter: 'B', projected_letter: null, doing: 88, spot: null, cross: null, is_today: true, is_future: false },
  { date: '2026-09-17', weekday: 'Thu', open: true, letter: null, projected_letter: 'A', doing: null, spot: null, cross: null, is_today: false, is_future: true },
  { date: '2026-09-18', weekday: 'Fri', open: true, letter: null, projected_letter: 'A', doing: null, spot: null, cross: null, is_today: false, is_future: true },
  { date: '2026-09-19', weekday: 'Sat', open: true, letter: null, projected_letter: 'A', doing: null, spot: null, cross: null, is_today: false, is_future: true },
  { date: '2026-09-20', weekday: 'Sun', open: false, letter: null, projected_letter: null, doing: null, spot: null, cross: null, is_today: false, is_future: false },
];

export const CALM_WEEK: QaWeek = {
  week: WEEK,
  monday: '2026-09-14',
  score: 90,
  letter: 'B',
  thirds: { doing: 92, owner: 88, cross: 100 },
  projected: { doing: 100, owner: 100, cross: 100, score: 100, letter: 'A' },
  days: [],
  store: 'Eco-Thrift',
  today: DATE,
  open_today: true,
  alerts: { unassigned_cross_checks: 0, sections_without_owner: 0, checker_flags: 0, safety_flags: 0, total: 2 },
  tiles: CALM_TILES,
  cross_diagnostics: [
    { section: 'David', owner: 'David Kilduff', checker: 'Michael Frieze', result: 'Issues found', items_fixed: 6, flag: 'Owner not maintaining.' },
  ],
};

export const CALM_BOARD: QaToday = {
  date: DATE,
  open: true,
  store: 'Eco-Thrift',
  week: {
    monday: '2026-09-14',
    label: 'Sep 14 to Sep 20, 2026',
    thirds: { doing: 92, owner: 88, cross: 100 },
    letter: 'B',
    score: 90,
    projected: { doing: 100, owner: 100, cross: 100, score: 100, letter: 'A' },
  },
  alerts: CALM_WEEK.alerts,
  doing: { done: 3, needed: 8, score: 88, routines: [] },
  staff: CALM_STAFF,
  off: [],
  jobs: CALM_JOBS,
  issues: CALM_ISSUES,
  spot: { done: false, run_id: 99, score: null, state: 'open' },
  cross: {
    due: '2026-09-15',
    due_label: 'Tue Sep 15',
    total: 5,
    done: 5,
    missing: [],
    rows: [
      { run_id: 31, section_id: 3, section_name: 'Ashley', owner: person(3, 'Ashley Kilduff'), checker: person(1, 'Carrie Rollins'), status: 'Validated', items_fixed: 1, score: 100, notes: '' },
      { run_id: 32, section_id: 4, section_name: 'Carrie', owner: person(1, 'Carrie Rollins'), checker: person(2, 'David Kilduff'), status: 'Validated', items_fixed: 0, score: 100, notes: '' },
      { run_id: 33, section_id: 1, section_name: 'David', owner: person(2, 'David Kilduff'), checker: person(5, 'Michael Frieze'), status: 'Issues found', items_fixed: 6, score: 100, notes: '' },
      { run_id: 34, section_id: 5, section_name: 'Michael', owner: person(5, 'Michael Frieze'), checker: person(4, 'Maria Kilduff'), status: 'Validated', items_fixed: 2, score: 100, notes: '' },
      { run_id: 35, section_id: 2, section_name: 'Tere', owner: person(4, 'Maria Kilduff'), checker: person(3, 'Ashley Kilduff'), status: 'Validated', items_fixed: 0, score: 100, notes: '' },
    ],
    score: 100,
  },
  checklists: [],
  sections: [],
};

export const CALM_SPOTS = [
  { date: '2026-09-15', section_name: 'Ashley', attributed_to: person(6, 'Bill Rollins'), spot_score: 91, run_id: 41 },
];

export const CALM_PEOPLE = [
  { id: 3, name: 'Ashley Kilduff', assigned: 4, done: 2, late: 0, missed: 0, verify_average: null, cross_check_average: null, spot_count: 1, spot_average: 91, open_flags: 0, on_task: 78, dots: ['', 'ok', 'ok', 'due', 'due', '', ''] as const },
  { id: 1, name: 'Carrie Rollins', assigned: 5, done: 2, late: 0, missed: 0, verify_average: null, cross_check_average: null, spot_count: 0, spot_average: null, open_flags: 0, on_task: 84, dots: ['', 'ok', 'ok', 'due', 'due', 'due', ''] as const },
  { id: 2, name: 'David Kilduff', assigned: 5, done: 0, late: 0, missed: 1, verify_average: null, cross_check_average: null, spot_count: 0, spot_average: null, open_flags: 0, on_task: null, dots: ['', 'miss', 'due', 'due', 'due', 'due', ''] as const },
  { id: 4, name: 'Maria Kilduff', assigned: 4, done: 2, late: 0, missed: 0, verify_average: null, cross_check_average: null, spot_count: 0, spot_average: null, open_flags: 0, on_task: 71, dots: ['', 'ok', 'ok', 'due', 'due', '', ''] as const },
  { id: 5, name: 'Michael Frieze', assigned: 5, done: 1, late: 0, missed: 0, verify_average: null, cross_check_average: null, spot_count: 0, spot_average: null, open_flags: 0, on_task: 62, dots: ['', 'ok', 'due', 'due', 'due', 'due', ''] as const },
];

export function isCalmLetter(letter: GradeLetter | null): letter is GradeLetter {
  return Boolean(letter);
}
