import { useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { hasRunner } from '../pages/routines/todayRunner';

/**
 * The Dashboard has two tabs and nothing else: Store (today's numbers) and My day (what /today showed:
 * shift, routines, hours and pay). The tab lives in the URL (`/dashboard?tab=myday`); with no `tab` in the
 * URL the last choice per user wins, and a first-time visitor gets Store (Manager / Admin / owner) or
 * My day (Employee).
 */
export type DashboardTab = 'store' | 'myday';

export const DASHBOARD_TAB_IDS: readonly DashboardTab[] = ['store', 'myday'];

const LS_DASHBOARD_TAB = 'ecothrift.dashboard.tab.v1';

type TabUser = { id?: number; role?: string | null; is_superuser?: boolean } | null | undefined;

function tabKey(userId: number | undefined): string {
  return `${LS_DASHBOARD_TAB}.${userId ?? 'anon'}`;
}

function isTab(value: unknown): value is DashboardTab {
  return value === 'store' || value === 'myday';
}

/** Store for Manager / Admin / owner, My day for an Employee. */
export function defaultDashboardTab(user: TabUser): DashboardTab {
  if (user?.is_superuser || user?.role === 'Manager' || user?.role === 'Admin') return 'store';
  return 'myday';
}

export function loadDashboardTab(userId: number | undefined): DashboardTab | null {
  try {
    const raw = localStorage.getItem(tabKey(userId));
    return isTab(raw) ? raw : null;
  } catch {
    return null;
  }
}

export function saveDashboardTab(userId: number | undefined, tab: DashboardTab): void {
  try {
    localStorage.setItem(tabKey(userId), tab);
  } catch {
    /* ignore quota / private mode */
  }
}

/** The link that opens a tab. */
export function dashboardTabHref(tab: DashboardTab): string {
  return `/dashboard?tab=${tab}`;
}

/** Old My-day paths (/today, /routines, /pay) belong to the My day tab. */
function isMyDayPath(pathname: string): boolean {
  const path = (pathname || '/').toLowerCase().replace(/\/+$/, '') || '/';
  return ['/today', '/routines', '/pay'].some((p) => path === p || path.startsWith(`${p}/`));
}

export function resolveDashboardTab(pathname: string, search: string, user: TabUser): DashboardTab {
  if (isMyDayPath(pathname)) return 'myday';
  const params = new URLSearchParams(search.replace(/^\?/, ''));
  const explicit = params.get('tab');
  if (isTab(explicit)) return explicit;
  // A routine or the hours panel open in the URL is My day, whatever was chosen last.
  if (hasRunner(params) || params.get('hours')) return 'myday';
  return loadDashboardTab(user?.id) ?? defaultDashboardTab(user);
}

/** The Dashboard tab showing right now (or that a My-day style path belongs to). */
export function useDashboardTab(): DashboardTab {
  const { user } = useAuth();
  const { pathname, search } = useLocation();
  return useMemo(
    () => resolveDashboardTab(pathname, search, user),
    [pathname, search, user],
  );
}
