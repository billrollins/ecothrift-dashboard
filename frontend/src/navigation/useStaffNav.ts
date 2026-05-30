import { useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import type { NavItemDef } from './navTypes';
import { navItemIsActive, navigateForNavItem } from './navUtils';

export function useStaffNav() {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const pathname = location.pathname;
  const search = location.search;
  const hash = location.hash || '';

  const isActive = useCallback(
    (item: NavItemDef) => navItemIsActive(pathname, search, hash, item),
    [pathname, search, hash],
  );

  const navigateToItem = useCallback(
    (item: NavItemDef, options?: { fromSidebar?: boolean }) =>
      navigateForNavItem(navigate, item, options),
    [navigate],
  );

  return {
    user,
    pathname,
    search,
    hash,
    locationState: location.state,
    isActive,
    navigateToItem,
  };
}
