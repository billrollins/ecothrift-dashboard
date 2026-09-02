import type { RoutineAssignee, Section } from '../../../api/routines.api';

export interface SectionCoverage {
  /** Sections nobody keeps. Their daily tally is never asked for. */
  orphans: Section[];
  /** Staff in the department who own nothing, so nobody checks after them. */
  idle: RoutineAssignee[];
  /** Owners keeping more than one, in case the floor is lopsided. */
  doubled: Array<{ owner: string; count: number }>;
}

/**
 * The two ways a floor plan goes wrong: an area with no keeper, and a keeper
 * with no area. Both are quiet failures — the tally simply never appears — so
 * the Sections view says them out loud.
 */
export function sectionCoverage(
  sections: Section[],
  people: RoutineAssignee[],
  departmentId: number | null,
): SectionCoverage {
  const live = sections.filter((section) => section.is_active);
  const owned = new Map<number, { name: string; count: number }>();
  for (const section of live) {
    if (section.owner == null) continue;
    const seen = owned.get(section.owner);
    if (seen) seen.count += 1;
    else owned.set(section.owner, { name: section.owner_name || 'Someone', count: 1 });
  }
  const inDepartment = departmentId == null
    ? people
    : people.filter((person) => person.department_id === departmentId);
  return {
    orphans: live.filter((section) => section.owner == null),
    idle: inDepartment.filter((person) => !owned.has(person.id)),
    doubled: [...owned.values()]
      .filter((row) => row.count > 1)
      .map((row) => ({ owner: row.name, count: row.count })),
  };
}

export function coverageNote(coverage: SectionCoverage, total: number): string {
  if (!total) return 'No sections yet. Add the first area of the floor.';
  const parts = [`${total} section${total === 1 ? '' : 's'}`];
  parts.push(coverage.orphans.length
    ? `${coverage.orphans.length} with no owner`
    : 'every one has an owner');
  if (coverage.idle.length) {
    parts.push(`${coverage.idle.length} ${coverage.idle.length === 1 ? 'person keeps' : 'people keep'} nothing`);
  }
  for (const row of coverage.doubled) parts.push(`${row.owner} keeps ${row.count}`);
  return parts.join(' · ');
}
