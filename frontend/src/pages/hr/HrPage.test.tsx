import { describe, expect, it } from 'vitest';
import { MOVED, hrPath, hrTabsFor } from './HrPage';

const keys = (user: Parameters<typeof hrTabsFor>[0]) => hrTabsFor(user).map((t) => [t.key, t.sections.map((s) => s.key)]);

describe('HR tabs', () => {
  it('staff see Requests, Me and Incidents only (the week is on Home > Time clock, #137)', () => {
    expect(keys({ role: 'Employee', is_superuser: false, access: [] })).toEqual([
      ['requests', ['all']],
      ['me', ['me']],
      ['incidents', ['all']],
    ]);
  });

  it('managers and the owner get the same three: their pages live in the HR workspace (#140)', () => {
    const access = ['people:manage', 'hiring:manage', 'people.permissions:read', 'people.pay:read', 'hr.schedule:write', 'users.customers:manage'];
    expect(keys({ role: 'Manager', is_superuser: false, access }).map(([key]) => key)).toEqual(['requests', 'me', 'incidents']);
    const tabs = hrTabsFor({ role: 'Admin', is_superuser: true, access: [] });
    expect(tabs.map((t) => t.key)).toEqual(['requests', 'me', 'incidents']);
    // HR documents to e-sign (#62) are still the owner's section of Requests.
    expect(tabs.find((t) => t.key === 'requests')?.sections.map((s) => s.key)).toEqual(['all', 'documents']);
  });

  it('sends an old address of a moved page to the page itself', () => {
    expect(MOVED['hiring/jobs']).toBe('/people/jobs');
    expect(MOVED.payroll).toBe('/admin/time-payroll');
    expect(MOVED['people/permissions']).toBe('/people/permissions');
    expect(MOVED.schedule).toBe('/people/schedule');
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
