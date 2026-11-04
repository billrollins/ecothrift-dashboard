import { describe, expect, it } from 'vitest';
import { hrPath, hrTabsFor } from './HrPage';

const keys = (user: Parameters<typeof hrTabsFor>[0]) => hrTabsFor(user).map((t) => [t.key, t.sections.map((s) => s.key)]);

describe('HR tabs', () => {
  it('staff see Requests, Me and Schedule only', () => {
    expect(keys({ role: 'Employee', is_superuser: false, access: [] })).toEqual([
      ['requests', ['all']],
      ['me', ['me']],
      ['schedule', ['week']],
    ]);
  });

  it('a manager with the People dial at Manage also sees hiring and onboarding, not payroll', () => {
    const access = ['people:manage', 'hiring:manage', 'people.permissions:read', 'people.pay:read', 'hr.schedule:write', 'users.customers:manage'];
    const tabs = keys({ role: 'Manager', is_superuser: false, access });
    expect(tabs.map(([key]) => key)).toEqual(['requests', 'me', 'schedule', 'people', 'hiring', 'onboarding', 'payroll']);
    // Time & payroll itself is the owner's; a manager only gets Payroll deductions there.
    expect(tabs.find(([key]) => key === 'payroll')?.[1]).toEqual(['deductions']);
    expect(tabs.find(([key]) => key === 'people')?.[1]).toEqual(['staff', 'permissions']);
  });

  it('the owner sees every tab and section', () => {
    const tabs = hrTabsFor({ role: 'Admin', is_superuser: true, access: [] });
    expect(tabs).toHaveLength(7);
    expect(tabs.find((t) => t.key === 'payroll')?.sections.map((s) => s.key)).toEqual(['periods', 'deductions']);
    // HR documents to e-sign (#62) are the owner's section of Requests.
    expect(tabs.find((t) => t.key === 'requests')?.sections.map((s) => s.key)).toEqual(['all', 'documents']);
  });

  it('builds each tab URL', () => {
    expect(hrPath('requests')).toBe('/hr');
    expect(hrPath('requests', 'all')).toBe('/hr');
    expect(hrPath('requests', 'documents')).toBe('/hr/requests/documents');
    expect(hrPath('me')).toBe('/hr/me');
    expect(hrPath('hiring')).toBe('/hr/hiring');
    expect(hrPath('hiring', 'jobs')).toBe('/hr/hiring/jobs');
  });
});
