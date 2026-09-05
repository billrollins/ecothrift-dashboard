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
  | 'assignmentReturned'
  | 'balance'
  | 'search'
  | 'localOffer'
  | 'store'
  | 'storefront'
  | 'receiptLong'
  | 'pointOfSale'
  | 'accountBalance'
  | 'gavel'
  | 'star'
  | 'factCheck'
  | 'tune'
  | 'supervisorAccount'
  | 'security'
  | 'settings'
  | 'build'
  | 'schedule'
  | 'print'
  | 'palette'
  | 'email'
  | 'documents'
  | 'checklist'
  | 'payments'
  | 'campaign';

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
  /** Open this destination in a new browser window/tab instead of in-app navigation. */
  openInNewWindow?: boolean;
  /** Extra prefixes that also count as this item (desk/field twins, renamed paths). */
  pathAliases?: string[];
  /** Only visible to Django superusers (the Super Admin); the `roles` ranking can't express this. */
  superuserOnly?: boolean;
}

export interface NavGroupDef {
  id: string;
  /** null = no collapsible header (flat links) */
  label: string | null;
  itemIds: string[];
  /**
   * Pages set apart from the workspace's own list: shortcuts to another
   * workspace, and owner-only tools. Rendered after a hairline, and when
   * role filtering empties the list the hairline goes with it.
   */
  guestItemIds?: string[];
  roles?: UserRole[];
}

export interface ResolvedNavItem extends NavItemDef {
  Icon: ComponentType<SvgIconProps>;
}

export interface ResolvedNavGroup {
  id: string;
  label: string | null;
  items: ResolvedNavItem[];
  guestItems: ResolvedNavItem[];
}
