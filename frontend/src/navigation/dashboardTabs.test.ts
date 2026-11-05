import { beforeEach, describe, expect, it } from 'vitest';
import {
  dashboardTabHref,
  defaultDashboardTab,
  loadDashboardTab,
  resolveDashboardTab,
  saveDashboardTab,
} from './dashboardTabs';

const employee = { id: 1, role: 'Employee', is_superuser: false };
const manager = { id: 2, role: 'Manager', is_superuser: false };
const admin = { id: 3, role: 'Admin', is_superuser: false };
const owner = { id: 4, role: 'Employee', is_superuser: true };

describe('dashboard tabs', () => {
  beforeEach(() => localStorage.clear());

  it('defaults to Store for Manager, Admin and the owner, and Today for an Employee', () => {
    expect(defaultDashboardTab(manager)).toBe('store');
    expect(defaultDashboardTab(admin)).toBe('store');
    expect(defaultDashboardTab(owner)).toBe('store');
    expect(defaultDashboardTab(employee)).toBe('myday');
    expect(defaultDashboardTab(null)).toBe('myday');
  });

  it('remembers the last choice per user', () => {
    saveDashboardTab(1, 'store');
    saveDashboardTab(2, 'myday');
    expect(loadDashboardTab(1)).toBe('store');
    expect(loadDashboardTab(2)).toBe('myday');
    expect(resolveDashboardTab('/dashboard', '', employee)).toBe('store');
    expect(resolveDashboardTab('/dashboard', '', manager)).toBe('myday');
    expect(resolveDashboardTab('/dashboard', '', admin)).toBe('store');
  });

  it('ignores junk in storage', () => {
    localStorage.setItem('ecothrift.dashboard.tab.v1.1', 'settings');
    expect(loadDashboardTab(1)).toBeNull();
    expect(resolveDashboardTab('/dashboard', '', employee)).toBe('myday');
  });

  it('lets the URL win over the remembered tab', () => {
    saveDashboardTab(1, 'store');
    expect(resolveDashboardTab('/dashboard', '?tab=myday', employee)).toBe('myday');
    saveDashboardTab(2, 'myday');
    expect(resolveDashboardTab('/dashboard', '?tab=store', manager)).toBe('store');
  });

  it('treats a routine, a draft or the hours panel as Today', () => {
    saveDashboardTab(2, 'store');
    expect(resolveDashboardTab('/dashboard', '?run=12', manager)).toBe('myday');
    expect(resolveDashboardTab('/dashboard', '?routine=3&draft=9', manager)).toBe('myday');
    expect(resolveDashboardTab('/dashboard', '?hours=1', manager)).toBe('myday');
  });

  it('keeps /today, /routines and /pay on Today', () => {
    saveDashboardTab(2, 'store');
    expect(resolveDashboardTab('/today', '', manager)).toBe('myday');
    expect(resolveDashboardTab('/routines/catalog', '', manager)).toBe('myday');
    expect(resolveDashboardTab('/pay', '', manager)).toBe('myday');
  });

  it('builds the tab link', () => {
    expect(dashboardTabHref('store')).toBe('/dashboard?tab=store');
    expect(dashboardTabHref('myday')).toBe('/dashboard?tab=myday');
  });
});
