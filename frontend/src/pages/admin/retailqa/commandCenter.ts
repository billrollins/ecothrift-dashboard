import type { DayGrade, GradeLetter, QaIssue, QaJob, QaStaffRow, QaStatusWord } from '../../../api/routines.api';
import { qaStatusWord } from './qaStatus';

export const CHIP_LABEL: Record<string, string> = {
  in: 'In',
  exp: 'Expected',
  late: 'Late',
  call: 'Called in',
  done: 'Done',
  due: 'Due',
  over: 'Overdue',
  miss: 'Missed',
  unas: 'Unassigned',
};

export const DEPT_ORDER = ['Retail', 'Retail Operations', 'Processing', 'Restoration', 'Office', 'Warehouse'];

const ROUTINE_NAMES: Record<string, string> = {
  'retail.open': 'Retail open',
  'retail.day': 'Retail day',
  'retail.close': 'Retail close',
  'retail.section_tally': 'Section check',
  'retail.owner_spot': 'Spot walk',
  'retail.cross_check': 'Cross-check',
};

const SHIFT_NAMES: Record<string, string> = {
  retail_open: 'Cashier - Open',
  retail_day: 'Cashier - Day',
  retail_close: 'Cashier - Close',
  retail_cs: 'Customer Service',
  processing: 'Processing',
  restoration: 'Restoration',
  office: 'Management',
};

const DEPT_NAMES: Record<string, string> = {
  retail: 'Retail',
  warehouse: 'Warehouse',
  office: 'Office',
  processing: 'Processing',
  restoration: 'Restoration',
};

export function displayName(raw: string | null | undefined, kind: 'auto' | 'routine' | 'shift' | 'dept' = 'auto') {
  const value = (raw || '').trim();
  if (!value) return '';
  const dotted = value.toLowerCase();
  const underscored = dotted.replace(/\./g, '_');
  if (kind === 'routine' || kind === 'auto') {
    const hit = ROUTINE_NAMES[value] || ROUTINE_NAMES[dotted];
    if (hit) return hit;
  }
  if (kind === 'shift' || kind === 'auto') {
    const hit = SHIFT_NAMES[value] || SHIFT_NAMES[underscored];
    if (hit) return hit;
  }
  if (kind === 'dept' || kind === 'auto') {
    const hit = DEPT_NAMES[value] || DEPT_NAMES[underscored];
    if (hit) return hit;
  }
  if (value.includes('.') || (/^[a-z][a-z0-9._]*$/.test(value))) {
    return value.split(/[._]/).filter(Boolean).map((part) => (
      part.charAt(0).toUpperCase() + part.slice(1)
    )).join(' ');
  }
  return value;
}

export function tileClass(
  closed: boolean,
  selected: boolean,
  opts?: { letter?: GradeLetter | null; projected?: boolean },
) {
  const grade = closed
    ? ''
    : opts?.projected
      ? ' proj'
      : opts?.letter
        ? ` g-${opts.letter.toLowerCase()}`
        : '';
  return `tile${closed ? ' closed' : ''}${grade}${selected ? ' sel' : ''}`;
}

export function walkDots(tiles: Array<{ open: boolean; spot?: number | null }>) {
  return tiles.map((tile) => {
    if (!tile.open) return 'off' as const;
    if (tile.spot != null) return 'on' as const;
    return '' as const;
  });
}

export function shortName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return parts[0] || '';
  return `${parts[0]} ${parts[parts.length - 1][0]}.`;
}

export function staffChip(status: string | undefined): keyof typeof CHIP_LABEL {
  const word = qaStatusWord(status);
  if (word === 'In') return 'in';
  if (word === 'Expected') return 'exp';
  if (word === 'Late') return 'late';
  if (word === 'Called in') return 'call';
  return 'exp';
}

export function jobChip(status: string | undefined, owner?: { name?: string } | null): keyof typeof CHIP_LABEL {
  const word = qaStatusWord(status);
  if (word === 'Done') return 'done';
  if (word === 'Overdue') return 'over';
  if (word === 'Missed') return 'miss';
  if (word === 'Unassigned' && !owner) return 'unas';
  return 'due';
}

export function letterClass(letter: GradeLetter | null | undefined) {
  if (!letter) return '';
  return letter.toLowerCase();
}

export function scoreText(value: number | null | undefined) {
  return value == null ? '—' : String(Math.round(value));
}

export function jobTimeLabel(job: Pick<QaJob, 'status' | 'due_label' | 'completed_label' | 'owner'>) {
  const chip = jobChip(job.status, job.owner);
  if (chip === 'done') {
    if (job.due_label?.startsWith('Done')) return job.due_label;
    if (job.completed_label) return `Done ${job.completed_label}`;
    return 'Done';
  }
  const label = job.due_label || '';
  if (!label && job.owner) return 'Due after clock-in';
  if (label === 'Due after clock-in' || label.startsWith('Due')) return label;
  if (/^\d{1,2}:\d{2}/.test(label)) return `Due ${label.slice(0, 5)}`;
  return label;
}

export function dueClock(label: string) {
  const match = /(\d{1,2}:\d{2})/.exec(label);
  return match ? match[1] : label.replace(/^Due\s+/i, '');
}

export function scheduleGroups(staff: QaStaffRow[]) {
  const on = staff.filter((row) => qaStatusWord(row.status) !== 'Off');
  const buckets = new Map<string, QaStaffRow[]>();
  for (const row of on) {
    const name = displayName(row.department, 'dept') || 'Office';
    const list = buckets.get(name) ?? [];
    list.push(row);
    buckets.set(name, list);
  }
  const names = [...buckets.keys()].sort((a, b) => {
    const ai = DEPT_ORDER.indexOf(a);
    const bi = DEPT_ORDER.indexOf(b);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi) || a.localeCompare(b);
  });
  return names.map((department) => ({
    department,
    rows: (buckets.get(department) ?? []).slice().sort((a, b) => (
      (a.time_in || '99').localeCompare(b.time_in || '99') || a.name.localeCompare(b.name)
    )),
  }));
}

export function scheduleSummary(staff: QaStaffRow[]) {
  const on = staff.filter((row) => qaStatusWord(row.status) !== 'Off');
  const later = on.filter((row) => qaStatusWord(row.status) === 'Expected' && !row.clocked_in);
  const dueNow = on.filter((row) => !later.includes(row));
  const inn = dueNow.filter((row) => row.clocked_in || qaStatusWord(row.status) === 'In').length;
  return later.length ? `${inn} of ${dueNow.length} in · ${later.length} later` : `${inn} of ${dueNow.length} in`;
}

export type BoardIssue = {
  id: string;
  severity: 'red' | 'amber' | 'grey';
  sentence: string;
  action: QaIssue['action'] | null;
  person_id: number | null;
  run_id: number | null;
  can_act: boolean;
};

export function groupIssues(issues: QaIssue[], staff: QaStaffRow[], jobs: QaJob[]): BoardIssue[] {
  const late = issues.filter((row) => row.type === 'late');
  const rest = issues.filter((row) => row.type !== 'late');
  const notIn = staff.filter((row) => qaStatusWord(row.status) === 'Late');
  const out: BoardIssue[] = [];
  if (notIn.length) {
    const red = notIn.some((row) => row.late_severity === 'red');
    out.push({
      id: 'expected-not-in',
      severity: red ? 'red' : 'amber',
      sentence: notIn.length === 1
        ? `${shortName(notIn[0].name)} expected, not in`
        : `${notIn.length} people expected, not in`,
      action: null,
      person_id: notIn.length === 1 ? notIn[0].id : null,
      run_id: null,
      can_act: false,
    });
  } else if (late.length === 1) {
    const row = late[0];
    out.push({
      id: row.id,
      severity: row.severity,
      sentence: row.sentence,
      action: row.action,
      person_id: row.person_id,
      run_id: row.run_id,
      can_act: row.can_act,
    });
  }

  for (const issue of rest) {
    out.push({
      id: issue.id,
      severity: issue.severity,
      sentence: formatRoutineIssue(issue, jobs),
      action: issue.action,
      person_id: issue.person_id,
      run_id: issue.run_id,
      can_act: issue.can_act,
    });
  }
  return out;
}

function formatRoutineIssue(issue: QaIssue, jobs: QaJob[]) {
  if (issue.type !== 'overdue_routine') return issue.sentence;
  const job = jobs.find((row) => row.run_id === issue.run_id);
  if (!job) return issue.sentence;
  const clock = dueClock(job.due_label || '');
  const title = displayName(job.title, 'routine');
  if (job.group === 'section') {
    return `${title}'s section check was due ${clock}.`;
  }
  const owner = job.owner?.name ? ` Owner ${shortName(job.owner.name)}` : '';
  return `${title} was due ${clock} and is not started.${owner}`;
}

export function peopleDots(
  days: DayGrade[] | undefined,
  personId: number,
): Array<'ok' | 'miss' | 'due' | ''> {
  const byDate = new Map((days ?? []).map((row) => [row.date, row]));
  const monday = days?.[0]?.date;
  if (!monday) return ['', '', '', '', '', '', ''];
  const start = new Date(`${monday}T12:00:00`);
  return Array.from({ length: 7 }, (_, index) => {
    const iso = new Date(start.getTime() + index * 86400000).toISOString().slice(0, 10);
    const day = byDate.get(iso);
    if (!day?.open_day) return '';
    const rows = (day.doing?.routines ?? []).filter((row) => (
      row.key === 'retail.section_tally' && row.assigned_to?.id === personId
    ));
    if (!rows.length) return '';
    const statuses = rows.map((row) => qaStatusWord(row.status as QaStatusWord));
    if (statuses.some((status) => status === 'Done')) return 'ok';
    if (statuses.some((status) => status === 'Missed')) return 'miss';
    return 'due';
  });
}

export function sectionWeekCounts(days: DayGrade[] | undefined) {
  let done = 0;
  let total = 0;
  for (const day of days ?? []) {
    for (const row of day.doing?.routines ?? []) {
      if (row.key !== 'retail.section_tally') continue;
      total += 1;
      if (qaStatusWord(row.status as QaStatusWord) === 'Done') done += 1;
    }
  }
  return { done, total };
}
