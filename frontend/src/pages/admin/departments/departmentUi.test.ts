import { describe, expect, it } from 'vitest';
import { mergeCurrentDepartment, mergeCurrentDepartments } from '../../../api/hr.api';
import {
  deleteLockTooltip,
  knownStartWorkspace,
  slugifyName,
  startWorkspaceLabel,
  START_WORKSPACE_OPTIONS,
} from './departmentUi';

describe('Starts in (#86)', () => {
  it('offers every menu workspace by name', () => {
    const labels = START_WORKSPACE_OPTIONS.map((option) => option.label);
    expect(labels).toEqual(expect.arrayContaining(['Buying', 'Processing', 'Restoration', 'Retail']));
  });

  it('names the workspace, or the default when none is set', () => {
    expect(startWorkspaceLabel('processing')).toBe('Processing');
    expect(startWorkspaceLabel('storeSales')).toBe('Retail');
    expect(startWorkspaceLabel('')).toBe('Default (Buying)');
    expect(startWorkspaceLabel(undefined)).toBe('Default (Buying)');
  });

  it('reads an id that is no longer a workspace as the default', () => {
    expect(knownStartWorkspace('goneWorkspace')).toBe('');
    expect(startWorkspaceLabel('goneWorkspace')).toBe('Default (Buying)');
  });
});

describe('mergeCurrentDepartment', () => {
  it('keeps the inactive current value so the picker is not blank', () => {
    const active = [{ id: 1, name: 'Retail', slug: 'retail-operations' }];
    const merged = mergeCurrentDepartment(active, { id: 9, name: 'Ghost' });
    expect(merged.map((row) => row.id)).toEqual([1, 9]);
    expect(mergeCurrentDepartment(active, { id: 1, name: 'Retail' })).toEqual(active);
  });

  it('merges several selected ids', () => {
    const merged = mergeCurrentDepartments(
      [{ id: 1, name: 'Retail' }],
      [{ id: 2, name: 'Office' }, { id: 1, name: 'Retail' }],
    );
    expect(merged.map((row) => row.id)).toEqual([1, 2]);
  });
});

describe('deleteLockTooltip', () => {
  it('lists live counts', () => {
    expect(deleteLockTooltip({
      shifts: 4,
      assignments: 0,
      sections: 5,
      routines: 7,
      documents: 0,
    })).toBe("Can't delete: 4 shifts, 5 sections, 7 routines. Deactivate instead.");
  });

  it('is empty when every count is zero', () => {
    expect(deleteLockTooltip({
      shifts: 0, assignments: 0, sections: 0, routines: 0, documents: 0,
    })).toBeNull();
  });
});

describe('slugifyName', () => {
  it('builds a url slug on create', () => {
    expect(slugifyName('Retail')).toBe('retail');
  });
});
