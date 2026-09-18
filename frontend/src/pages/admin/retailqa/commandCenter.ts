import type { DayGrade, GradeLetter, QaIssue, QaJob, QaStaffRow, QaStatusWord } from '../../../api/routines.api';
import { qaStatusWord } from './qaStatus';

export const CHIP_LABEL: Record<string, string> = {
  in: 'In',
  exp: 'Expected',
  late: 'Late',
  call: 'Called in',
  left: 'Left',
  off: 'Off',
  done: 'Done',
  due: 'Due',
  over: 'Overdue',
  hard: 'Overdue',
  miss: 'Missed',
  unas: 'Unassigned',
};

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
  dock: 'Dock',
  sorting: 'Sorting',
  listings: 'Listings',
  shipping: 'Shipping',
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
  if (value.includes('.') || (/^[a-z][a-z0-9._]*$/.test(value))) {
    return value.split(/[._]/).filter(Boolean).map((part) => (
      part.charAt(0).toUpperCase() + part.slice(1)
    )).join(' ');
  }
  return value;
}

export function tileCounts(tile: { open?: boolean; graded?: boolean }) {
  return tile.graded ?? Boolean(tile.open);
}

export function tileClass(
  closed: boolean,
  selected: boolean,
  opts?: { letter?: GradeLetter | null; projected?: boolean; graded?: boolean },
) {
  const idle = closed && !opts?.graded;
  const grade = idle
    ? ''
    : opts?.projected
      ? ' projected'
      : opts?.letter
        ? ` g-${letterTintKey(opts.letter)}`
        : '';
  return `tile${idle ? ' closed' : ''}${grade}${selected ? ' sel' : ''}`;
}

export function walkDots(tiles: Array<{ open?: boolean; graded?: boolean; spot?: number | null }>) {
  return tiles.map((tile) => {
    if (!tileCounts(tile)) return 'off' as const;
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
  if (word === 'Left') return 'left';
  if (word === 'Off') return 'off';
  return 'exp';
}

export const CHIP_ICON: Record<keyof typeof CHIP_LABEL, 'check' | 'clock' | 'alert' | 'person' | 'door'> = {
  in: 'check',
  exp: 'clock',
  late: 'clock',
  call: 'person',
  left: 'door',
  off: 'door',
  done: 'check',
  due: 'clock',
  over: 'alert',
  hard: 'alert',
  miss: 'alert',
  unas: 'alert',
};

export function jobChip(
  status: string | undefined,
  owner?: { name?: string } | null,
  urgency?: QaJob['urgency'],
): keyof typeof CHIP_LABEL {
  const word = qaStatusWord(status);
  if (word === 'Done') return 'done';
  if (urgency === 'hard') return 'hard';
  if (word === 'Overdue') return 'over';
  if (word === 'Missed') return 'miss';
  if (!owner) return 'unas';
  return 'due';
}

export function barTone(jobs: Array<{ status: string; owner?: { name?: string } | null; urgency?: QaJob['urgency'] }>) {
  const chips = jobs.map((job) => jobChip(job.status, job.owner, job.urgency));
  const done = chips.filter((chip) => chip === 'done').length;
  const needed = jobs.length;
  const pct = needed ? Math.round((100 * done) / needed) : 0;
  if (!needed || pct === 100) return { pct, tone: 'ok' as const };
  if (chips.some((chip) => chip === 'miss' || chip === 'unas' || chip === 'hard')) return { pct, tone: '' as const };
  return { pct, tone: 'warn' as const };
}

export function letterTintKey(letter: string | null | undefined): string {
  const raw = (letter || '').trim().toUpperCase();
  if (!raw) return '';
  const band = raw.charAt(0).toLowerCase();
  if (raw.endsWith('+')) return `${band}plus`;
  if (raw.length > 1 && raw.endsWith('-')) return `${band}minus`;
  return band;
}

export function letterClass(letter: GradeLetter | null | undefined) {
  return letterTintKey(letter);
}

export function scoreText(value: number | null | undefined) {
  return value == null ? '—' : String(Math.round(value));
}

export function formatWeight(value: number | null | undefined): string {
  if (value == null) return '';
  return Number.isInteger(value) ? String(value) : String(value);
}

export function bandWeightLabel(
  name: string,
  weight: number | null | undefined,
  excluded: boolean,
): string {
  return excluded ? `${name} —` : `${name} ${formatWeight(weight)}%`;
}

export function tileNote(tile: {
  open: boolean;
  graded?: boolean;
  is_future?: boolean;
  doing?: number | null;
  spot?: number | null;
}) {
  if (!tile.open && tileCounts(tile)) return 'Closed · Reset';
  if (!tile.open) return '\u00a0';
  if (tile.is_future) return 'Projected';
  return `Do ${scoreText(tile.doing)} · Spot ${scoreText(tile.spot)}`;
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
  if (label.includes('23:59')) return job.key === 'retail.day' ? 'Due 14:00' : label.replace('23:59', '14:00');
  if (label === 'Due after clock-in' || label.startsWith('Due')) return label;
  if (/^\d{1,2}:\d{2}/.test(label)) return `Due ${label.slice(0, 5)}`;
  return label;
}

export function dueClock(label: string) {
  const match = /(\d{1,2}:\d{2})/.exec(label);
  return match ? match[1] : label.replace(/^Due\s+/i, '');
}

export function clockHHMM(raw: string | null | undefined) {
  if (!raw) return '';
  const match = /(\d{1,2}):(\d{2})/.exec(raw);
  if (!match) return '';
  return `${match[1].padStart(2, '0')}:${match[2]}`;
}

export function formatShiftRange(timeIn: string | null | undefined, timeOut: string | null | undefined) {
  const start = clockHHMM(timeIn);
  const end = clockHHMM(timeOut);
  if (!start || !end) return '';
  return `${start} to ${end}`;
}

export function scheduleGroups(staff: QaStaffRow[]) {
  const on = staff.filter((row) => qaStatusWord(row.status) !== 'Off');
  const buckets = new Map<string, QaStaffRow[]>();
  for (const row of on) {
    const key = row.department_slug || 'unscheduled';
    const list = buckets.get(key) ?? [];
    list.push(row);
    buckets.set(key, list);
  }
  const keys = [...buckets.keys()].sort((a, b) => {
    const left = buckets.get(a)![0];
    const right = buckets.get(b)![0];
    const as = left.department_sort ?? 99;
    const bs = right.department_sort ?? 99;
    return as - bs || (left.department || a).localeCompare(right.department || b);
  });
  return keys.flatMap((slug) => {
    const rows = (buckets.get(slug) ?? []).slice().sort((a, b) => (
      (a.time_in || '99').localeCompare(b.time_in || '99') || a.name.localeCompare(b.name)
    ));
    const sample = rows[0];
    const inactive = sample?.department_active === false;
    if (inactive && !rows.some((row) => row.on_roster)) return [];
    const icon = sample?.department_icon || 'none';
    return [{
      department: sample?.department || displayName(slug, 'dept') || 'Unscheduled',
      slug,
      icon,
      inactive,
      rows,
    }];
  });
}

export function scheduleSummary(staff: QaStaffRow[]) {
  const expected = staff.filter((row) => qaStatusWord(row.status) !== 'Off');
  const late = expected.filter((row) => qaStatusWord(row.status) === 'Late').length;
  const called = expected.filter((row) => qaStatusWord(row.status) === 'Called in').length;
  const inn = expected.filter((row) => {
    const word = qaStatusWord(row.status);
    return word === 'In' || (row.clocked_in && word !== 'Late' && word !== 'Called in');
  }).length;
  const parts = [`${inn} of ${expected.length} in`];
  if (late) parts.push(`${late} late`);
  if (called) parts.push(`${called} called in`);
  return parts.join(' · ');
}

export type BoardIssue = {
  id: string;
  severity: 'red' | 'amber' | 'grey';
  sentence: string;
  action: QaIssue['action'] | null;
  person_id: number | null;
  run_id: number | null;
  can_act: boolean;
  icon: 'person' | 'clip' | 'walk' | 'alert';
  nudged_at: string | null;
};

export function nudgeLabel(stamp: string | null | undefined) {
  if (!stamp) return '';
  if (/^(Nudged|Heard|Resolved|Not seen)\b/i.test(stamp)) return stamp;
  return `Nudged ${stamp}`;
}

export function formatLateMinutes(mins: number) {
  const safe = Math.max(0, Math.round(mins));
  if (safe < 60) return `${safe} min`;
  const hours = Math.floor(safe / 60);
  const rest = safe % 60;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}

export function lateSentence(row: QaStaffRow) {
  const dept = row.department || displayName(row.department_slug, 'dept') || 'their shift';
  return `${shortName(row.name)} is ${formatLateMinutes(row.late_minutes ?? 0)} late for ${dept}.`;
}

function issueIcon(type: QaIssue['type'] | 'late-group'): BoardIssue['icon'] {
  if (type === 'late' || type === 'late-group') return 'person';
  if (type === 'no_spot') return 'walk';
  if (type === 'cross_overdue') return 'alert';
  return 'clip';
}

export function groupIssues(issues: QaIssue[], staff: QaStaffRow[], jobs: QaJob[]): BoardIssue[] {
  const late = issues.filter((row) => row.type === 'late');
  const rest = issues.filter((row) => row.type !== 'late');
  const notIn = staff.filter((row) => qaStatusWord(row.status) === 'Late');
  const out: BoardIssue[] = [];
  if (notIn.length >= 2) {
    const red = notIn.some((row) => row.late_severity === 'red');
    out.push({
      id: 'expected-not-in',
      severity: red ? 'red' : 'amber',
      sentence: `${notIn.length} people expected, not in`,
      action: null,
      person_id: null,
      run_id: null,
      can_act: false,
      icon: 'person',
      nudged_at: null,
    });
  } else if (notIn.length === 1) {
    const row = notIn[0];
    const issue = late.find((item) => item.person_id === row.id) ?? late[0];
    out.push({
      id: issue?.id || `late-${row.id}`,
      severity: row.late_severity === 'red' || issue?.severity === 'red' ? 'red' : 'amber',
      sentence: lateSentence(row),
      action: issue?.action ?? 'call_in',
      person_id: row.id,
      run_id: issue?.run_id ?? null,
      can_act: issue?.can_act ?? true,
      icon: 'person',
      nudged_at: issue?.nudged_at ?? null,
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
      icon: issueIcon(issue.type),
      nudged_at: issue.nudged_at ?? null,
    });
  }
  return out;
}

function formatRoutineIssue(issue: QaIssue, jobs: QaJob[]) {
  if (issue.type !== 'overdue_routine') return issue.sentence;
  const job = jobs.find((row) => row.run_id === issue.run_id);
  if (!job) return issue.sentence;
  if (job.urgency === 'hard' || job.urgency === 'missed' || job.status === 'Missed') {
    return issue.sentence;
  }
  const clock = dueClock(job.due_label || '');
  const title = displayName(job.title, 'routine');
  if (job.group === 'section') {
    return `${title}'s section check was due ${clock}.`;
  }
  const owner = job.owner?.name ? ` Owner ${shortName(job.owner.name)}` : '';
  return `${title} was due ${clock} and is not started.${owner}`;
}

export function sectionCheckDoneLabel(row: {
  done: number;
  assigned: number;
  due_today?: number;
}): string {
  const text = `${row.done} of ${row.assigned}`;
  const due = row.due_today ?? 0;
  return due ? `${text} · ${due} due today` : text;
}

export function peopleDots(
  days: DayGrade[] | undefined,
  personId: number,
  sectionDays?: Array<'done' | 'due' | 'missed' | 'none' | string>,
): Array<'ok' | 'miss' | 'due' | ''> {
  if (sectionDays && sectionDays.length === 7) {
    return sectionDays.map((status) => {
      if (status === 'done') return 'ok';
      if (status === 'missed') return 'miss';
      if (status === 'due') return 'due';
      return '';
    });
  }
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
