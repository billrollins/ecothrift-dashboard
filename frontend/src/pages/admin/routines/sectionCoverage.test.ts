import { describe, expect, it } from 'vitest';
import { coverageNote, sectionCoverage } from './sectionCoverage';
import type { RoutineAssignee, Section } from '../../../api/routines.api';

function section(over: Partial<Section> & { id: number; name: string }): Section {
  return {
    department: 1,
    department_name: 'Retail',
    owner: null,
    owner_name: null,
    is_active: true,
    sort_order: 0,
    created_at: '',
    updated_at: '',
    ...over,
  };
}

function person(id: number, full_name: string, department_id: number | null = 1): RoutineAssignee {
  return { id, full_name, email: '', role: 'Employee', department_id, department_name: 'Retail' };
}

const sam = person(1, 'Sam');
const alex = person(2, 'Alex');
const jo = person(3, 'Jo');

describe('sectionCoverage', () => {
  it('names areas with no keeper and people with no area', () => {
    const coverage = sectionCoverage(
      [
        section({ id: 1, name: 'Housewares', owner: 1, owner_name: 'Sam' }),
        section({ id: 2, name: 'Toys' }),
      ],
      [sam, alex],
      1,
    );
    expect(coverage.orphans.map((s) => s.name)).toEqual(['Toys']);
    expect(coverage.idle.map((p) => p.full_name)).toEqual(['Alex']);
  });

  it('ignores retired sections and people from other departments', () => {
    const coverage = sectionCoverage(
      [
        section({ id: 1, name: 'Housewares', owner: 1, owner_name: 'Sam' }),
        section({ id: 2, name: 'Old aisle', is_active: false }),
      ],
      [sam, person(9, 'Warehouse Pat', 7)],
      1,
    );
    expect(coverage.orphans).toHaveLength(0);
    expect(coverage.idle).toHaveLength(0);
  });

  it('flags a keeper who is holding more than one area', () => {
    const coverage = sectionCoverage(
      [
        section({ id: 1, name: 'Housewares', owner: 1, owner_name: 'Sam' }),
        section({ id: 2, name: 'Toys', owner: 1, owner_name: 'Sam' }),
      ],
      [sam, jo],
      1,
    );
    expect(coverage.doubled).toEqual([{ owner: 'Sam', count: 2 }]);
    expect(coverage.idle.map((p) => p.full_name)).toEqual(['Jo']);
  });
});

describe('coverageNote', () => {
  it('says the floor is covered when it is', () => {
    const coverage = sectionCoverage(
      [section({ id: 1, name: 'Housewares', owner: 1, owner_name: 'Sam' })],
      [sam],
      1,
    );
    expect(coverageNote(coverage, 1)).toBe('1 section · every one has an owner');
  });

  it('counts the gaps otherwise', () => {
    const coverage = sectionCoverage(
      [section({ id: 1, name: 'Toys' }), section({ id: 2, name: 'Books' })],
      [sam],
      1,
    );
    expect(coverageNote(coverage, 2)).toBe('2 sections · 2 with no owner · 1 person keeps nothing');
  });

  it('asks for a first section when there are none', () => {
    expect(coverageNote(sectionCoverage([], [], 1), 0)).toBe('No sections yet. Add the first area of the floor.');
  });
});
