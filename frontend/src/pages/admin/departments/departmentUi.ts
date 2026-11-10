import { SLOT_C_DEFAULT_WORKSPACE_ID, SLOT_C_WORKSPACES } from '../../../navigation/slotCNavLayout';
import type { DepartmentDependencies, DepartmentIcon } from '../../../types/hr.types';

export const DEPARTMENT_SUBTITLE =
  'Home department for staff and the department a shift belongs to. It also sets where their menu starts. Grouping only; departments grant no permissions.';

/** "Starts in" (#86): the menu workspaces a department can start in, by name. '' = the house default. */
export const START_WORKSPACE_OPTIONS = SLOT_C_WORKSPACES.map((workspace) => ({ id: workspace.id, label: workspace.label }));

export const START_WORKSPACE_HELP =
  'The menu opens here for people in this department. Their own last choice still wins.';

/** A stored id that is no longer a workspace reads as the default. */
export function knownStartWorkspace(id?: string | null): string {
  return START_WORKSPACE_OPTIONS.some((option) => option.id === id) ? (id as string) : '';
}

/** "Processing", or "Default (Buying)" when the department sets none. */
export function startWorkspaceLabel(id?: string | null): string {
  const known = knownStartWorkspace(id);
  const pick = START_WORKSPACE_OPTIONS.find((option) => option.id === (known || SLOT_C_DEFAULT_WORKSPACE_ID));
  return known ? pick?.label ?? known : `Default (${pick?.label ?? 'none'})`;
}

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
