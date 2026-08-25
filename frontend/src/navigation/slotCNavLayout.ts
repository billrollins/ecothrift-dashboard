import { NAV_ITEM_CATALOG } from './navItemCatalog';
import type { NavGroupDef, NavIconKey, NavItemDef, ResolvedNavGroup } from './navTypes';

export interface SlotCWorkspaceMeta {
  id: string;
  label: string;
  shortLabel: string;
  helper: string;
  icon: NavIconKey;
  /** Color of the jump-letter chip. Unique per workspace so a glance finds the key. */
  shortcutColor: string;
}

/** Lifecycle order: source → prep → ingest → restore → records → floor → sell → deliver → online → manage. */
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
    itemIds: ['receiving', 'processing'],
    guestItemIds: ['restorations'],
  },
  {
    id: 'restoration',
    label: 'Restoration',
    itemIds: ['restorationQueue', 'tars', 'restorationPartsRequests'],
    guestItemIds: ['enhancementRequests'],
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
    label: 'Cashier',
    itemIds: ['posTerminal', 'posTransactions', 'posDrawers', 'posCash', 'posPrintables', 'posSetup'],
  },
  {
    id: 'deliveries',
    label: 'Deliveries',
    itemIds: ['deliverySchedule', 'deliveryTable'],
  },
  {
    id: 'onlineSales',
    label: 'Online Sales',
    roles: ['Manager', 'Admin'],
    itemIds: [
      'onlineSalesListings',
      'onlineSalesHolds',
      'onlineSalesCustomers',
    ],
  },
  {
    id: 'admin',
    label: 'Admin',
    roles: ['Manager', 'Admin'],
    itemIds: [
      'assumptions',
      'users',
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
    shortcutColor: '#0D9488',
  },
  {
    id: 'processing',
    label: 'Processing',
    shortLabel: 'Processing',
    helper: 'Receive and process inbound orders',
    icon: 'localShipping',
    shortcutColor: '#2563EB',
  },
  {
    id: 'restoration',
    label: 'Restoration',
    shortLabel: 'Restoration',
    helper: 'Test, assemble, repair, salvage',
    icon: 'build',
    shortcutColor: '#EA580C',
  },
  {
    id: 'inventory',
    label: 'Inventory',
    shortLabel: 'Inventory',
    helper: 'Catalog - products, check-ins, items',
    icon: 'inventory',
    shortcutColor: '#7C3AED',
  },
  {
    id: 'retailFloor',
    label: 'Retail Floor',
    shortLabel: 'Floor',
    helper: 'Shelf, floorplans, and quality audit',
    icon: 'storefront',
    shortcutColor: '#DB2777',
  },
  {
    id: 'storeSales',
    label: 'Cashier',
    shortLabel: 'Cashier',
    helper: 'Register, drawers, and POS setup',
    icon: 'pointOfSale',
    shortcutColor: '#CA8A04',
  },
  {
    id: 'deliveries',
    label: 'Deliveries',
    shortLabel: 'Deliveries',
    helper: 'Schedule days and every delivery',
    icon: 'localShipping',
    shortcutColor: '#16A34A',
  },
  {
    id: 'onlineSales',
    label: 'Online Sales',
    shortLabel: 'Online Sales',
    helper: 'List, reserve, message, and hand off at the register',
    icon: 'storefront',
    shortcutColor: '#0284C7',
  },
  {
    id: 'admin',
    label: 'Admin',
    shortLabel: 'Admin',
    helper: 'Setup and access',
    icon: 'settings',
    shortcutColor: '#1E293B',
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

/**
 * Map a digit key onto the visible (role-filtered) workspace list.
 *
 * 1 is the first workspace the user can actually see, not a fixed catalog
 * index — an Employee with six workspaces and a Manager with eight both
 * press 3 for the third row on their own list. 0, letters, and digits past
 * the list all return null rather than wrapping.
 */
export function workspaceIdForDigit(
  visible: SlotCWorkspaceMeta[],
  key: string,
): string | null {
  if (key.length !== 1 || key < '1' || key > '9') return null;
  const index = Number(key) - 1;
  return visible[index]?.id ?? null;
}

/** The letter that jumps to this workspace: the first letter of its short name. */
export function workspaceShortcutLetter(workspace: SlotCWorkspaceMeta): string {
  const letter = workspace.shortLabel.trim().charAt(0);
  return letter ? letter.toUpperCase() : '';
}

/**
 * Digit or first letter of a visible workspace's short name.
 *
 * Letters are case-insensitive. If two rows ever share a first letter, the
 * earlier one on the visible list wins — the same order the cards are drawn.
 */
export function workspaceIdForKey(
  visible: SlotCWorkspaceMeta[],
  key: string,
): string | null {
  const byDigit = workspaceIdForDigit(visible, key);
  if (byDigit) return byDigit;
  if (key.length !== 1 || !/^[a-z]$/i.test(key)) return null;
  const wanted = key.toUpperCase();
  return visible.find((w) => workspaceShortcutLetter(w) === wanted)?.id ?? null;
}

function shortcutColorForWorkspace(id: string): string | undefined {
  return SLOT_C_WORKSPACES.find((w) => w.id === id)?.shortcutColor;
}

function pathsOverlap(a: NavItemDef, b: NavItemDef): boolean {
  if (a.path === b.path) return true;
  if (a.pathAliases?.includes(b.path)) return true;
  if (b.pathAliases?.includes(a.path)) return true;
  return false;
}

/**
 * Hover glow for a sidebar page link: the jump-letter colour of the workspace
 * that owns the page. Essentials have no letter, so they return undefined.
 * Guest shortcuts (Restoration under Processing) use the home workspace, not
 * the workspace they are visiting.
 */
export function glowColorForNavItem(itemId: string): string | undefined {
  for (const group of SLOT_C_NAV_GROUPS) {
    if (group.id === SLOT_C_ESSENTIALS_GROUP_ID) continue;
    if (group.itemIds.includes(itemId)) {
      return shortcutColorForWorkspace(group.id);
    }
  }
  const def = NAV_ITEM_CATALOG[itemId];
  if (!def) return undefined;
  for (const group of SLOT_C_NAV_GROUPS) {
    if (group.id === SLOT_C_ESSENTIALS_GROUP_ID) continue;
    const nativeHome = group.itemIds.some((id) => {
      const native = NAV_ITEM_CATALOG[id];
      return native != null && pathsOverlap(def, native);
    });
    if (nativeHome) return shortcutColorForWorkspace(group.id);
  }
  // Set-apart pages with no other home (owner-only tools) glow as the workspace
  // that lists them.
  for (const group of SLOT_C_NAV_GROUPS) {
    if (group.guestItemIds?.includes(itemId)) {
      return shortcutColorForWorkspace(group.id);
    }
  }
  return undefined;
}

/**
 * Sum item waiting-counts onto the workspace that owns those items.
 * Workspaces with nothing waiting are omitted, same as the item map.
 */
export function rollupWorkspaceBadgeCounts(
  workspaceGroups: { id: string; items: { id: string }[] }[],
  itemCounts: Record<string, number>,
): Record<string, number> {
  const byWorkspace: Record<string, number> = {};
  for (const group of workspaceGroups) {
    let sum = 0;
    for (const item of group.items) {
      sum += itemCounts[item.id] ?? 0;
    }
    if (sum > 0) byWorkspace[group.id] = sum;
  }
  return byWorkspace;
}

