import type { DepartmentDependencies, DepartmentIcon } from '../../../types/hr.types';

export const DEPARTMENT_SUBTITLE =
  'Home department for staff and the department a shift belongs to. Grouping only; departments grant no permissions.';

export const DEPARTMENT_ICONS: DepartmentIcon[] = [
  'cart', 'box', 'tool', 'home', 'tag', 'truck', 'none',
];

export function slugifyName(name: string) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'department';
}

export function deleteLockTooltip(deps?: DepartmentDependencies | null): string | null {
  if (!deps) return null;
  const parts: string[] = [];
  const labels: Array<[keyof DepartmentDependencies, string, string]> = [
    ['shifts', 'shift', 'shifts'],
    ['assignments', 'assignment', 'assignments'],
    ['sections', 'section', 'sections'],
    ['routines', 'routine', 'routines'],
    ['documents', 'document', 'documents'],
  ];
  for (const [key, one, many] of labels) {
    const count = deps[key] || 0;
    if (count) parts.push(`${count} ${count === 1 ? one : many}`);
  }
  if (!parts.length) return null;
  return `Can't delete: ${parts.join(', ')}. Deactivate instead.`;
}

export function fieldError(err: unknown, field: string): string {
  if (!err || typeof err !== 'object' || !('response' in err)) return '';
  const data = (err as { response?: { data?: Record<string, unknown> } }).response?.data;
  const value = data?.[field];
  if (Array.isArray(value)) return String(value[0] || '');
  if (typeof value === 'string') return value;
  return '';
}

export function errorDetail(err: unknown, fallback: string): string {
  if (!err || typeof err !== 'object' || !('response' in err)) return fallback;
  const data = (err as { response?: { data?: { detail?: unknown } } }).response?.data;
  if (typeof data?.detail === 'string' && data.detail.trim()) return data.detail;
  return fallback;
}
