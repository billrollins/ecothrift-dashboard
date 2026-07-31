import type { NavGroupDef, NavIconKey, NavItemDef, ResolvedNavGroup } from './navTypes';

export interface SlotCWorkspaceMeta {
  id: string;
  label: string;
  shortLabel: string;
  helper: string;
  icon: NavIconKey;
}

/** Lifecycle order: source → prep → ingest → restore → records → floor → sell → online → manage. */
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
    itemIds: ['receiving', 'processing', 'finalization', 'disputes', 'restorations'],
  },
  {
    id: 'restoration',
    label: 'Restoration',
    itemIds: ['tars', 'restorationPartsRequests'],
  },
  {
    id: 'inventory',
    label: 'Inventory',
    itemIds: ['inventoryWorkbench'],
  },
  {
    id: 'retailFloor',
    label: 'Retail Floor',
    itemIds: ['quickReprice', 'floorplans', 'qualityAudit', 'qualityAuditForms'],
  },
  {
    id: 'storeSales',
    label: 'Store Sales',
    itemIds: ['posTerminal', 'posTransactions', 'posDeliveries', 'posDrawers', 'posCash', 'posPrintables', 'posSetup'],
  },
  {
    id: 'onlineSales',
    label: 'Online Sales',
    roles: ['Manager', 'Admin'],
    itemIds: [
      'onlineSalesQueue',
      'onlineSalesListings',
      'onlineSalesInbox',
      'onlineSalesSales',
    ],
  },
  {
    id: 'admin',
    label: 'Admin',
    roles: ['Manager', 'Admin'],
    itemIds: [
      'assumptions',
      'users',
      'customers',
      'retailInbox',
      'permissions',
      'settings',
      'labelStudio',
      'blogStudio',
      'payrollHours',
    ],
  },
];

export const SLOT_C_ESSENTIALS_GROUP_ID = 'essentials';

/** Stale bake-off / renamed workspace ids → lifecycle ids. */
export const SLOT_C_WORKSPACE_ID_MIGRATION: Record<string, string> = {
  inbound: 'processing',
  catalog: 'inventory',
  floor: 'inventory',
  store: 'storeSales',
  floorOps: 'retailFloor',
  cashier: 'storeSales',
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
    id: 'retailFloor',
    label: 'Retail Floor',
    shortLabel: 'Floor',
    helper: 'Shelf, floorplans, and quality audit',
    icon: 'storefront',
  },
  {
    id: 'storeSales',
    label: 'Store Sales',
    shortLabel: 'Sales',
    helper: 'Register, drawers, and POS setup',
    icon: 'pointOfSale',
  },
  {
    id: 'onlineSales',
    label: 'Online Sales',
    shortLabel: 'Online',
    helper: 'List, reserve, message, and hand off at the register',
    icon: 'storefront',
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
