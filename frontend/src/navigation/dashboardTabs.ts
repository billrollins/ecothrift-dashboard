import { useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { hasRunner } from '../pages/routines/todayRunner';

/**
 * Dash Home (Bill 2026-11-13, .ai/extended/home-and-hr-structure.md): Store · Time clock · HR · Routines · Calendar ·
 * Messages · Profile. The tab lives in the URL (`/dashboard?tab=hr`); with no `tab` the last choice per user wins, and a
 * first-time visitor lands on Store (everyone). `myday` is the Time clock tab's id (it was My day / Today; the id stays so
 * routine and clock links keep working).
 */
export type DashboardTab = 'store' | 'myday' | 'hr' | 'routines' | 'calendar' | 'messages' | 'profile';

export const DASHBOARD_TAB_IDS: readonly DashboardTab[] = ['store', 'myday', 'hr', 'routines', 'calendar', 'messages', 'profile'];

const LS_DASHBOARD_TAB = 'ecothrift.dashboard.tab.v1';

type TabUser = { id?: number; role?: string | null; is_superuser?: boolean } | null | undefined;

function tabKey(userId: number | undefined): string {
  return `${LS_DASHBOARD_TAB}.${userId ?? 'anon'}`;
}

function isTab(value: unknown): value is DashboardTab {
  return typeof value === 'string' && (DASHBOARD_TAB_IDS as readonly string[]).includes(value);
}

/** Everyone lands on Store (Bill 2026-11-13: clocking in is the header's time button). */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function defaultDashboardTab(_user: TabUser): DashboardTab {
  return 'store';
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
