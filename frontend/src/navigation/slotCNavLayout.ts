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
  /**
 * Digit pressed in the open switcher. Same key always opens this workspace
 * when the user can see it. 1-7 are lifecycle + Studios; 8 is Facilities, 9 Admin, 0 HR (#67).
   */
  shortcutDigit?: number;
}

/** Lifecycle order: source → prep → ingest → restore → records → floor → sell → deliver → online → manage. */
export const SLOT_C_DEFAULT_WORKSPACE_ID = 'buying';
/** A computer set up as a register starts here (critic review 2026-10-21: cashiers start in Retail, not Buying). */
export const SLOT_C_REGISTER_WORKSPACE_ID = 'storeSales';

/**
 * Workspace-first groups for staff sidebar (presentation only).
 * #67 (Bill 2026-11-04): a workspace is the position someone works that day, and its pages become its phone buttons.
 * Inventory is not a workspace (its pages are shortcuts where they are used), Cashier is Retail, HR replaces People
 * for everyone, Facilities is new, Admin is the owner's tools. No page anyone can open today left the menu.
 */
export const SLOT_C_NAV_GROUPS: NavGroupDef[] = [
  {
    id: 'buying',
    label: 'Buying',
    // Bill 2026-11-06: every buying page not yet fully rebuilt sits under a "Legacy" caption until its rebuild
    // ships. Vendors, Orders and Preprocessing are intake tools (not part of the auctions rebuild) and stay on top.
    itemIds: ['auctions', 'estimateProfit', 'vendors', 'orders', 'preprocessing'],
    setupItemIds: ['wishlist', 'auctionsOld', 'watchlist', 'reportCards'],
    setupLabel: 'Legacy',
  },
  {
    id: 'processing',
    label: 'Processing',
    // #87: My numbers is every processor's own line; the Command Center sits under the line like Retail's.
    itemIds: ['receiving', 'processing', 'processingMyNumbers', 'photoDrops'],
    managerItemIds: ['processingCommandCenter'],
    // Processing Enhancements (Bill 2026-11-10): items back in Processing. Under "In progress" until he signs off.
    setupItemIds: ['processingReturns', 'processingFloorIssues', 'processingPhotoSheets'],
    setupLabel: 'In progress',
    guestItemIds: ['restorations', 'inventoryWorkbench'],
  },
  {
    id: 'restoration',
    label: 'Restoration',
    itemIds: ['restorationQueue', 'tars', 'restorationPartsRequests', 'restorationTracking'],
    guestItemIds: ['inventoryWorkbench'],
  },
  {
    id: 'storeSales',
    label: 'Retail',
    // Every shift on top; practice, printing and setup below (owner, 2026-10-19: "the cashier workspace is messy").
    // Retail windows (#49, 2026-11-02): a member opens as the Member window from anywhere, so Thrift+ members (the same
    // find as Thrift+ Staff) left the list; /pos/members still works.
    // #67 (Bill 2026-11-04): Register, Transactions, Customers; managers: Command Center and Cash Drops. Returns folded
    // into the Register (#71, its Return window; /pos/returns opens it). Drawers stays until it folds into Cash Drops.
    // The floor's inventory pages are shortcuts. PR Fix-it is archived (its address still opens); Quick reprice is its reprice tab.
    itemIds: [
      'posTerminal', 'posTransactions', 'customers', 'posDrawers', 'thriftPlusFinalize', 'quickReprice',
    ],
    setupItemIds: ['posTestTerminal', 'posPrintables'],
    managerItemIds: ['retailQa', 'posCash', 'posSetup', 'thriftPlus', 'inventories'],
    guestItemIds: ['inventoryWorkbench', 'inventoryCount', 'inventoryReview', 'tagErrors'],
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
    id: 'deliveries',
    label: 'Deliveries',
    itemIds: ['deliverySchedule', 'deliveryTable'],
  },
  {
    id: 'studios',
    label: 'Studios',
    // No group gate: Social Studio is for every staff login; each other studio carries its own roles.
    itemIds: ['socialStudio'],
    managerItemIds: ['labelStudio', 'floorplans', 'announcements', 'blogStudio'],
  },
  {
    id: 'facilities',
    label: 'Facilities',
    // The building and its gear (#67): Supplies for everyone, Keys for the owner and Admins. Service vendors,
    // maintenance and fire-extinguisher checks (as routines) and the cameras link join when they exist.
    itemIds: ['storeMap', 'signage', 'supplies'],
    managerItemIds: ['keys'],
  },
  {
    id: 'admin',
    label: 'Admin',
    // The owner's tools (#67). Settings stays: managers who open it today still find it here.
    roles: ['Manager', 'Admin'],
    // Contractors (#21) is the owner's, off the staff side.
    itemIds: ['owner', 'superRequests', 'contractors', 'adminRoutines', 'settings'],
    guestItemIds: ['designLab', 'icons'],
  },
  {
    id: 'hr',
    label: 'HR',
    // Managers and the owner only (#140, Bill 2026-11-13, .ai/extended/home-and-hr-structure.md decision 6): the
    // Requests inbox, the Schedule builder and incidents first, then people, hiring, onboarding and payroll; set-once
    // pages under Setup. Every page keeps its own dial, so the workspace shows for whoever can open one of them.
    // Staff have their requests, the week, their files and their profile on Home (HR, Time clock, Profile tabs).
    roles: ['Manager', 'Admin'],
    itemIds: [
      'hrInbox', 'schedule', 'hrIncidents', 'users', 'applicants', 'interviews', 'onboarding', 'checkins',
      'payrollHours', 'payrollDeductions',
    ],
    setupItemIds: [
      'permissions', 'departments', 'shifts', 'jobs', 'hiringEmails',
      // Documents to e-sign (#62): the owner sends them; staff sign theirs on Home > HR.
      'hrDocuments',
    ],
  },
];

/** Stale bake-off / renamed workspace ids → lifecycle ids. */
export const SLOT_C_WORKSPACE_ID_MIGRATION: Record<string, string> = {
  inbound: 'processing',
  catalog: 'storeSales',
  inventory: 'storeSales',
  floor: 'storeSales',
  store: 'storeSales',
  floorOps: 'storeSales',
  cashier: 'storeSales',
  mail: 'onlineSales',
  // #67: Inventory's pages moved to Retail; People became HR.
  retailFloor: 'storeSales',
  retail: 'storeSales',
  people: 'hr',
};

export const SLOT_C_WORKSPACES: SlotCWorkspaceMeta[] = [
  {
    id: 'buying',
    label: 'Buying',
    shortLabel: 'Buying',
    helper: 'Auctions, vendors, orders, and manifest prep',
    icon: 'auction',
    shortcutColor: '#0D9488',
    shortcutDigit: 1,
  },
  {
    id: 'processing',
    label: 'Processing',
    shortLabel: 'Processing',
    helper: 'Receive and process inbound orders',
    icon: 'processing',
    shortcutColor: '#2563EB',
    shortcutDigit: 2,
  },
  {
    id: 'restoration',
    label: 'Restoration',
    shortLabel: 'Restoration',
    helper: 'Test, assemble, repair, salvage',
    icon: 'restoration',
    shortcutColor: '#EA580C',
    shortcutDigit: 3,
  },
  {
    id: 'storeSales',
    label: 'Retail',
    shortLabel: 'Retail',
    helper: 'Register, sales, drawers, customers, Thrift+ and the floor',
    icon: 'register',
    shortcutColor: '#CA8A04',
    shortcutDigit: 4,
  },
  {
    id: 'onlineSales',
    label: 'Online Sales',
    shortLabel: 'Online Sales',
    helper: 'List, reserve, message, and hand off at the register',
    icon: 'webStore',
    shortcutColor: '#0284C7',
    shortcutDigit: 5,
  },
  {
    id: 'deliveries',
    label: 'Deliveries',
    shortLabel: 'Deliveries',
    helper: 'Schedule days and every delivery',
    icon: 'delivery',
    shortcutColor: '#16A34A',
    shortcutDigit: 6,
  },
  {
    id: 'studios',
    label: 'Studios',
    shortLabel: 'Studios',
    helper: 'Social posts, labels, floorplans, announcements, and the blog',
    icon: 'studio',
    shortcutColor: '#C026D3',
    shortcutDigit: 7,
  },
  {
    id: 'facilities',
    label: 'Facilities',
    shortLabel: 'Facilities',
    helper: 'Store map, signage, supplies and keys',
    icon: 'workbench',
    shortcutColor: '#DB2777',
    shortcutDigit: 8,
  },
  {
    id: 'admin',
    label: 'Admin',
    shortLabel: 'Admin',
    helper: 'Owner page, approvals, routines, and settings',
    icon: 'settings',
    shortcutColor: '#1E293B',
    shortcutDigit: 9,
  },
  {
    id: 'hr',
    label: 'HR',
    shortLabel: 'HR',
    helper: 'Requests, the schedule, incidents, staff, hiring and payroll',
    icon: 'people',
    shortcutColor: '#7C3AED',
    shortcutDigit: 0,
  },
];

/**
 * Where the menu opens when a person has no remembered workspace (#86, Bill 2026-11-10: "by default have users
 * workspace default to their department"). In order: a register computer opens on Retail, then the person's
 * department's "Starts in" workspace (Admin > Departments), then the house default, then the first one they can see.
 * Only a workspace the person can see is ever picked, so this hides nothing and opens nothing new.
 */
export function startWorkspaceId(
  visible: { id: string }[],
  options: { registerDevice: boolean; departmentStart?: string | null },
): string | null {
  const departmentStart = options.departmentStart
    ? SLOT_C_WORKSPACE_ID_MIGRATION[options.departmentStart] ?? options.departmentStart
    : null;
  const wanted = [
    options.registerDevice ? SLOT_C_REGISTER_WORKSPACE_ID : null,
    departmentStart,
    SLOT_C_DEFAULT_WORKSPACE_ID,
  ];
  for (const id of wanted) {
    if (id && visible.some((w) => w.id === id)) return id;
  }
  return visible[0]?.id ?? null;
}

/**
 * For external URL entry: pick the lowest lifecycle-order workspace containing the active route.
 * Returns null when the route matches no workspace item.
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
  // Divider-only pages with no native home (none today).
  // Guest shortcuts that already have a home (Restoration under Processing,
  // Command Center under Retail) stay with that home from the first pass.
  for (const meta of workspaceOrder) {
    const group = workspaceGroups.find((g) => g.id === meta.id);
    if (group?.guestItems.some((item) => isActive(item))) {
      return meta.id;
    }
  }
  return null;
}

/**
 * Map a digit key onto a workspace by its assigned `shortcutDigit`.
 *
 * The same key always opens the same workspace. If that workspace is not in
 * `visible` (role-filtered out), the key does nothing. 0 is HR.
 */
export function workspaceIdForDigit(
  visible: SlotCWorkspaceMeta[],
  key: string,
): string | null {
  if (key.length !== 1 || key < '0' || key > '9') return null;
  const digit = Number(key);
  return visible.find((w) => w.shortcutDigit === digit)?.id ?? null;
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
 * earlier one on the visible list wins - the same order the cards are drawn.
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
 * that owns the page. Pages in no workspace (Dashboard, Owner, Reports) have no letter, so they return undefined.
 * Guest shortcuts (Restoration under Processing) use the home workspace, not
 * the workspace they are visiting.
 */
export function glowColorForNavItem(itemId: string): string | undefined {
  for (const group of SLOT_C_NAV_GROUPS) {
    if (group.itemIds.includes(itemId) || group.setupItemIds?.includes(itemId) || group.managerItemIds?.includes(itemId)) {
      return shortcutColorForWorkspace(group.id);
    }
  }
  const def = NAV_ITEM_CATALOG[itemId];
  if (!def) return undefined;
  for (const group of SLOT_C_NAV_GROUPS) {
    const nativeHome = [...group.itemIds, ...(group.setupItemIds ?? []), ...(group.managerItemIds ?? [])].some((id) => {
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

