import { describe, expect, it } from 'vitest';
import { groupCatalog } from './groupCatalog';
import { fakeRoutine as stub } from './routineFixture';

describe('groupCatalog', () => {
  it('groups by department and parks unassigned last', () => {
    const groups = groupCatalog([
      stub({ id: 1, title: 'Close', assigned_department_name: 'Retail Operations' }),
      stub({ id: 2, title: 'Open', assigned_department_name: 'Retail Operations' }),
      stub({ id: 3, title: 'Bales' }),
    ]);
    expect(groups.map((row) => row.name)).toEqual(['Retail Operations', 'Unassigned']);
    expect(groups[0].routines.map((row) => row.title)).toEqual(['Close', 'Open']);
  });
});
