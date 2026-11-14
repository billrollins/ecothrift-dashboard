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

  it('lands everyone on Store (Bill 2026-11-13)', () => {
    expect(defaultDashboardTab(manager)).toBe('store');
    expect(defaultDashboardTab(admin)).toBe('store');
    expect(defaultDashboardTab(owner)).toBe('store');
    expect(defaultDashboardTab(employee)).toBe('store');
    expect(defaultDashboardTab(null)).toBe('store');
  });

  it('knows all seven Home tabs', () => {
    for (const tab of ['store', 'myday', 'hr', 'routines', 'calendar', 'messages', 'profile']) {
      expect(resolveDashboardTab('/dashboard', `?tab=${tab}`, employee)).toBe(tab);
    }
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
    expect(resolveDashboardTab('/dashboard', '', employee)).toBe('store');
  });

  it('lets the URL win over the remembered tab', () => {
    saveDashboardTab(1, 'store');
    expect(resolveDashboardTab('/dashboard', '?tab=myday', employee)).toBe('myday');
    saveDashboardTab(2, 'myday');
    expect(resolveDashboardTab('/dashboard', '?tab=store', manager)).toBe('store');
  });

  it('opens a routine or a draft on Routines (#137), the hours panel on Time clock', () => {
    saveDashboardTab(2, 'store');
    expect(resolveDashboardTab('/dashboard', '?run=12', manager)).toBe('routines');
    expect(resolveDashboardTab('/dashboard', '?routine=3&draft=9', manager)).toBe('routines');
    // An old Time clock link with a routine in it opens the routine where it runs now.
    expect(resolveDashboardTab('/dashboard', '?tab=myday&run=12', manager)).toBe('routines');
    expect(resolveDashboardTab('/dashboard', '?hours=1', manager)).toBe('myday');
    expect(resolveDashboardTab('/dashboard', '?tab=myday&view=everyone', manager)).toBe('myday');
  });

  it('keeps /today and /pay on Time clock, /routines on Routines', () => {
    saveDashboardTab(2, 'store');
    expect(resolveDashboardTab('/today', '', manager)).toBe('myday');
    expect(resolveDashboardTab('/today', '?run=4', manager)).toBe('routines');
    expect(resolveDashboardTab('/routines/catalog', '', manager)).toBe('routines');
    expect(resolveDashboardTab('/pay', '', manager)).toBe('myday');
  });

  it('builds the tab link', () => {
    expect(dashboardTabHref('store')).toBe('/dashboard?tab=store');
    expect(dashboardTabHref('myday')).toBe('/dashboard?tab=myday');
  });
});
