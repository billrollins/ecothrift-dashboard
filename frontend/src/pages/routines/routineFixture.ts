import type { Routine, RoutineRun } from '../../api/routines.api';

/**
 * Complete Routine and RoutineRun values for tests, so a new server field only
 * has to be filled in here rather than in every stub across the suite.
 */
export function fakeRoutine(overrides: Partial<Routine> = {}): Routine {
  return {
    id: 1,
    title: 'Close',
    intro: '',
    icon: '',
    kind: 'checklist',
    system_key: null,
    verifies: null,
    subject_source: 'pool',
    definition: { sections: [] },
    trigger: 'daily',
    weekdays: [],
    anchor_date: null,
    remind_time: null,
    due_time: '10:30:00',
    late_after: 'end_of_day',
    grace_days: 0,
    assignment: 'pooled',
    assigned_role: 'Staff',
    assigned_department: null,
    assigned_department_name: null,
    assigned_user_ids: [],
    subject_pool: [],
    is_blocking: false,
    is_active: true,
    created_at: '',
    updated_at: '',
    ...overrides,
  };
}

export function fakeRun(overrides: Partial<RoutineRun> = {}): RoutineRun {
  const due = overrides.due_at ?? new Date().toISOString();
  return {
    id: 1,
    routine: 1,
    title: 'Close',
    intro: '',
    period_key: '2026-09-01',
    subject: '',
    due_at: due,
    remind_at: due,
    nag_at: due,
    late_at: due,
    kind: 'checklist',
    system_key: null,
    section: null,
    section_name: null,
    generated: {},
    assigned_to: null,
    assigned_to_name: null,
    department_name: 'Retail',
    status: 'open',
    is_blocking: false,
    is_overdue: false,
    trigger: 'daily',
    assignment: 'pooled',
    href: '/routines/run/1',
    completed_at: null,
    completed_by: null,
    completed_by_name: null,
    completed_late: false,
    failed_count: 0,
    has_critical_fail: false,
    ...overrides,
  };
}
