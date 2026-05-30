import type { ComponentType } from 'react';
import type { SvgIconProps } from '@mui/material/SvgIcon';
import type { UserRole } from '../types/accounts.types';

export type NavIconKey =
  | 'dashboard'
  | 'people'
  | 'shoppingCart'
  | 'article'
  | 'localShipping'
  | 'inventory'
  | 'assignmentTurnedIn'
  | 'balance'
  | 'search'
  | 'localOffer'
  | 'store'
  | 'pointOfSale'
  | 'accountBalance'
  | 'gavel'
  | 'star'
  | 'factCheck'
  | 'tune'
  | 'supervisorAccount'
  | 'security'
  | 'settings'
  | 'build';

export interface NavItemDef {
  id: string;
  path: string;
  label: string;
  icon: NavIconKey;
  roles?: UserRole[];
  navSearch?: string;
  navigateHash?: string;
  inactiveWhenHash?: string;
  legacy?: boolean;
}

export interface NavGroupDef {
  id: string;
  /** null = no collapsible header (flat links) */
  label: string | null;
  itemIds: string[];
  roles?: UserRole[];
}

export interface ResolvedNavItem extends NavItemDef {
  Icon: ComponentType<SvgIconProps>;
}

export interface ResolvedNavGroup {
  id: string;
  label: string | null;
  items: ResolvedNavItem[];
}
