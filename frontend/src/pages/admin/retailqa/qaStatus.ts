import type { QaStatusWord } from '../../../api/routines.api';

const ALLOWED: QaStatusWord[] = [
  'Done',
  'Expected',
  'Due',
  'Overdue',
  'Missed',
  'Not tallied',
  'In',
  'Late',
  'Called in',
  'Left',
  'Unassigned',
  'Off',
  'Closed',
  'Projected',
  'Not done',
  'Validated',
  'Issues found',
];

const RAW: Record<string, QaStatusWord> = {
  done: 'Done',
  late: 'Done',
  in_progress: 'Due',
  not_started: 'Due',
  not_assigned: 'Unassigned',
  missed: 'Missed',
  open: 'Due',
  own_part: 'Due',
  projected: 'Projected',
  expected: 'Expected',
  overdue: 'Overdue',
  in: 'In',
  called_in: 'Called in',
  left: 'Left',
  unassigned: 'Unassigned',
  off: 'Off',
  closed: 'Closed',
  not_done: 'Not done',
  not_tallied: 'Not tallied',
  validated: 'Validated',
  issues_found: 'Issues found',
};

export function qaStatusWord(raw: string | null | undefined): QaStatusWord {
  if (!raw) return 'Due';
  if ((ALLOWED as string[]).includes(raw)) return raw as QaStatusWord;
  return RAW[raw.trim().toLowerCase()] ?? 'Due';
}

export function qaChipTone(status: QaStatusWord): 'green' | 'amber' | 'red' | 'plain' {
  if (status === 'Done' || status === 'In' || status === 'Validated') return 'green';
  if (status === 'Overdue' || status === 'Late' || status === 'Issues found') return 'amber';
  if (status === 'Missed' || status === 'Called in' || status === 'Unassigned') return 'red';
  return 'plain';
}

export function qaChipColor(status: QaStatusWord): { bg: string; ink: string; border?: string } {
  const tone = qaChipTone(status);
  if (status === 'Called in' || status === 'Unassigned') {
    return { bg: 'transparent', ink: '#C0301C', border: '#C0301C' };
  }
  if (tone === 'green') return { bg: '#E8F5E9', ink: '#1b5e20' };
  if (tone === 'amber') return { bg: '#FDF3DC', ink: '#4A3200' };
  if (tone === 'red') return { bg: '#FBE9E6', ink: '#C0301C' };
  return { bg: 'rgba(26,31,28,0.08)', ink: 'rgba(26,31,28,0.62)' };
}
