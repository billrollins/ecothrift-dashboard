import type { Routine } from '../../api/routines.api';

export const UNASSIGNED_GROUP = 'Unassigned';

export interface CatalogGroup {
  name: string;
  routines: Routine[];
}

export function groupCatalog(routines: Routine[]): CatalogGroup[] {
  const byName = new Map<string, Routine[]>();
  for (const routine of routines) {
    const name = routine.assigned_department_name?.trim() || UNASSIGNED_GROUP;
    const rows = byName.get(name) ?? [];
    rows.push(routine);
    byName.set(name, rows);
  }
  return [...byName.entries()]
    .sort(([a], [b]) => {
      if (a === UNASSIGNED_GROUP) return 1;
      if (b === UNASSIGNED_GROUP) return -1;
      return a.localeCompare(b);
    })
    .map(([name, rows]) => ({
      name,
      routines: rows.slice().sort((a, b) => a.title.localeCompare(b.title)),
    }));
}
