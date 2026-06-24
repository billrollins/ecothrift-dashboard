import type { NavGroupDef, NavIconKey, NavItemDef, ResolvedNavGroup } from './navTypes';

export interface SlotCWorkspaceMeta {
  id: string;
  label: string;
  shortLabel: string;
  helper: string;
  icon: NavIconKey;
}

/** Lifecycle order: source → prep → ingest → restore → records → floor ops → sell → manage. */
export const SLOT_C_DEFAULT_WORKSPACE_ID = 'buying';

/** Workspace-first groups for staff sidebar (presentation only). */
export const SLOT_C_NAV_GROUPS: NavGroupDef[] = [
  {
    id: 'essentials',
    label: null,
    itemIds: ['dashboard', 'timeClock'],
  },
  {
    id: 'buying',
    label: 'Buying',
    itemIds: ['auctions', 'watchlist', 'vendors', 'orders', 'preprocessing'],
  },
  {
    id: 'processing',
    label: 'Processing',
    itemIds: ['receiving', 'processing', 'finalization', 'disputes'],
  },
  {
    id: 'restoration',
    label: 'Restoration',
    itemIds: ['restorationQueue', 'tars'],
  },
  {
    id: 'inventory',
    label: 'Inventory',
    itemIds: ['inventoryWorkbench'],
  },
  {
    id: 'floorOps',
    label: 'Floor Ops',
    itemIds: ['quickReprice'],
  },
  {
    id: 'cashier',
    label: 'Cashier',
    itemIds: ['posTerminal', 'posTransactions', 'posDrawers', 'posCash'],
  },
  {
    id: 'admin',
    label: 'Admin',
    roles: ['Manager', 'Admin'],
    itemIds: ['assumptions', 'posSetup', 'webStore', 'webOrders', 'users', 'customers', 'permissions', 'settings', 'blogStudio', 'payrollHours'],
  },
];

export const SLOT_C_ESSENTIALS_GROUP_ID = 'essentials';

/** Stale bake-off workspace ids → lifecycle ids. */
export const SLOT_C_WORKSPACE_ID_MIGRATION: Record<string, string> = {
  inbound: 'processing',
  catalog: 'inventory',
  floor: 'inventory',
  store: 'cashier',
};

export const SLOT_C_WORKSPACES: SlotCWorkspaceMeta[] = [
  {
    id: 'buying',
    label: 'Buying',
    shortLabel: 'Buying',
    helper: 'Auctions, vendors, orders, and manifest prep',
    icon: 'gavel',
  },
  {
    id: 'processing',
    label: 'Processing',
    shortLabel: 'Processing',
    helper: 'Receive through close-out',
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
    id: 'inventory',
    label: 'Inventory',
    shortLabel: 'Inventory',
    helper: 'Catalog — products, check-ins, items',
    icon: 'inventory',
  },
  {
    id: 'floorOps',
    label: 'Floor Ops',
    shortLabel: 'Floor',
    helper: 'Shelf and floor tasks',
    icon: 'storefront',
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
