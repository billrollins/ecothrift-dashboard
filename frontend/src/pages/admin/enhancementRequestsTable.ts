import type {
  EnhancementArea,
  EnhancementPriority,
  EnhancementRequestDTO,
  EnhancementStatus,
} from '../../types/enhancementRequests.types';

export const ENHANCEMENT_AREAS: EnhancementArea[] = ['restoration', 'processing'];
export const ENHANCEMENT_STATUSES: EnhancementStatus[] = ['open', 'planned', 'done', 'declined'];
export const ENHANCEMENT_PRIORITIES: EnhancementPriority[] = ['unset', 'low', 'medium', 'high'];

export type EnhancementAreaFilter = 'all' | EnhancementArea;
export type EnhancementStatusFilter = 'all' | EnhancementStatus;

const PRIORITY_RANK: Record<EnhancementPriority, number> = {
  high: 0,
  medium: 1,
  low: 2,
  unset: 3,
};

export function areaWord(area: EnhancementArea): string {
  if (area === 'processing') return 'Processing';
  return 'Restoration';
}

export function statusWord(status: EnhancementStatus): string {
  if (status === 'planned') return 'Planned';
  if (status === 'done') return 'Done';
  if (status === 'declined') return 'Declined';
  return 'Open';
}

export function priorityWord(priority: EnhancementPriority): string {
  if (priority === 'high') return 'High';
  if (priority === 'medium') return 'Medium';
  if (priority === 'low') return 'Low';
  return '—';
}

export function formatRequestWhen(iso: string): string {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(iso);
  if (!match) return iso;
  return `${match[1]} ${match[2]}`;
}

export function whoWhenLine(request: EnhancementRequestDTO): string {
  const who = request.submitted_by_name?.trim() || 'Unknown';
  return `${who} · ${formatRequestWhen(request.created_at)}`;
}

export function targetDateLabel(request: EnhancementRequestDTO): string {
  return request.target_date || '—';
}

export function sortEnhancementRequests(rows: EnhancementRequestDTO[]): EnhancementRequestDTO[] {
  return [...rows].sort((a, b) => {
    const byPriority = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
    if (byPriority !== 0) return byPriority;
    return b.created_at.localeCompare(a.created_at);
  });
}

export function requestsForFilter(
  rows: EnhancementRequestDTO[],
  area: EnhancementAreaFilter,
  status: EnhancementStatusFilter,
): EnhancementRequestDTO[] {
  return sortEnhancementRequests(rows).filter((row) => {
    if (area !== 'all' && row.area !== area) return false;
    if (status !== 'all' && row.status !== status) return false;
    return true;
  });
}
