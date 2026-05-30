import type { NavigateFunction } from 'react-router-dom';
import type { UserRole } from '../types/accounts.types';
import type { NavItemDef } from './navTypes';

/** Rank for nav access: Admin 3, Manager 2, Employee 1, Consignee 0. */
export const ROLE_RANK: Record<UserRole, number> = {
  Admin: 3,
  Manager: 2,
  Employee: 1,
  Consignee: 0,
};

export function effectiveRoleRank(user: { role: UserRole | null; roles?: UserRole[] } | null): number {
  if (!user) return -1;
  if (user.roles?.length) {
    return Math.max(...user.roles.map((r) => ROLE_RANK[r] ?? -1));
  }
  if (user.role) return ROLE_RANK[user.role] ?? -1;
  return -1;
}

export function canAccessNav(
  user: { role: UserRole | null; roles?: UserRole[] } | null,
  itemRoles?: UserRole[],
): boolean {
  if (!itemRoles || itemRoles.length === 0) return true;
  const ur = effectiveRoleRank(user);
  if (ur < 0) return false;
  const minRequired = Math.min(...itemRoles.map((r) => ROLE_RANK[r]));
  return ur >= minRequired;
}

export function navItemIsActive(
  pathname: string,
  search: string,
  hash: string,
  item: Pick<NavItemDef, 'path' | 'navSearch' | 'navigateHash' | 'inactiveWhenHash'>,
): boolean {
  if (item.navSearch != null && item.navSearch !== '') {
    const canon = item.navSearch.startsWith('?') ? item.navSearch : `?${item.navSearch}`;
    return pathname === item.path && search === canon;
  }
  const itemPathRaw = item.path;
  if (itemPathRaw.includes('?')) {
    const [p, qs] = itemPathRaw.split('?');
    if (!p) return false;
    return pathname === p && search === `?${qs}`;
  }
  const pathOk = pathname === itemPathRaw || pathname.startsWith(`${itemPathRaw}/`);

  if (item.navigateHash) {
    return pathOk && hash === item.navigateHash;
  }
  if (item.inactiveWhenHash && hash === item.inactiveWhenHash) {
    return false;
  }
  return pathOk;
}

export function navigateForNavItem(
  navigateFn: NavigateFunction,
  item: NavItemDef,
  options?: { fromSidebar?: boolean },
) {
  const navOptions = options?.fromSidebar ? { state: { navFromSidebar: true } } : undefined;

  if (item.navSearch != null && item.navSearch !== '') {
    const canon = item.navSearch.startsWith('?') ? item.navSearch : `?${item.navSearch}`;
    navigateFn({ pathname: item.path, search: canon, hash: '' }, navOptions);
    return;
  }
  const raw = item.path;
  if (raw.includes('?')) {
    const [p, qs] = raw.split('?');
    if (p) navigateFn({ pathname: p, search: qs ? `?${qs}` : '' }, navOptions);
    return;
  }
  navigateFn(
    {
      pathname: raw,
      hash: item.navigateHash ?? '',
    },
    navOptions,
  );
}
