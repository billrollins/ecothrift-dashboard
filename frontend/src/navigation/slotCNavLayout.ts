import type { NavGroupDef, NavIconKey, NavItemDef, ResolvedNavGroup } from './navTypes';

export interface SlotCWorkspaceMeta {
  id: string;
  label: string;
  shortLabel: string;
  helper: string;
  icon: NavIconKey;
}

/** Lifecycle order: source → ingest → restore → merchandise → sell → manage. */
export const SLOT_C_DEFAULT_WORKSPACE_ID = 'buying';

/** Workspace-first groups for staff sidebar (presentation only). */
export const SLOT_C_NAV_GROUPS: NavGroupDef[] = [
  {
    id: 'essentials',
    label: null,
    itemIds: ['dashboard', 'employees'],
  },
  {
    id: 'buying',
    label: 'Buying',
    itemIds: ['vendors', 'auctions', 'watchlist'],
  },
  {
    id: 'processing',
    label: 'Processing',
    itemIds: ['orders', 'preprocessing', 'receiving', 'processing', 'finalization', 'disputes', 'searchItems'],
  },
  {
    id: 'restoration',
    label: 'Restoration',
    itemIds: ['tars'],
  },
  {
    id: 'floor',
    label: 'Floor',
    itemIds: ['searchItems', 'quickReprice'],
  },
  {
    id: 'cashier',
    label: 'Cashier',
    itemIds: ['posTerminal', 'posTransactions', 'searchItems', 'posDrawers', 'posCash'],
  },
  {
    id: 'admin',
    label: 'Admin',
    roles: ['Manager', 'Admin'],
    itemIds: ['assumptions', 'posSetup', 'webStore', 'webOrders', 'users', 'customers', 'permissions', 'settings', 'blogStudio'],
  },
];

export const SLOT_C_ESSENTIALS_GROUP_ID = 'essentials';

/** Stale bake-off workspace ids → lifecycle ids. */
export const SLOT_C_WORKSPACE_ID_MIGRATION: Record<string, string> = {
  inbound: 'processing',
  catalog: 'floor',
  store: 'cashier',
};

export const SLOT_C_WORKSPACES: SlotCWorkspaceMeta[] = [
  {
    id: 'buying',
    label: 'Buying',
    shortLabel: 'Buying',
    helper: 'Vendors and auctions',
    icon: 'gavel',
  },
  {
    id: 'processing',
    label: 'Processing',
    shortLabel: 'Processing',
    helper: 'Ingest pipeline',
    icon: 'localShipping',
  },
  {
    id: 'restoration',
    label: 'Restoration',
    shortLabel: 'Restoration',
    helper: 'Test, assemble, repair, salvage',
    icon: 'build',
  },
  {
    id: 'floor',
    label: 'Floor',
    shortLabel: 'Floor',
    helper: 'Lookup and reprice',
    icon: 'search',
  },
  {
    id: 'cashier',
    label: 'Cashier',
    shortLabel: 'Cashier',
    helper: 'Register and cash',
    icon: 'pointOfSale',
  },
  {
    id: 'admin',
    label: 'Admin',
    shortLabel: 'Admin',
    helper: 'Setup and access',
    icon: 'settings',
  },
];

/**
 * For external URL entry: pick the lowest lifecycle-order workspace containing the active route.
 * Returns null when the route matches only Essentials or no nav item.
 */
export function resolveWorkspaceForRoute(
  workspaceGroups: ResolvedNavGroup[],
  workspaceOrder: SlotCWorkspaceMeta[],
  isActive: (item: NavItemDef) => boolean,
): string | null {
  for (const meta of workspaceOrder) {
    const group = workspaceGroups.find((g) => g.id === meta.id);
    if (group?.items.some((item) => isActive(item))) {
      return meta.id;
    }
  }
  return null;
}
