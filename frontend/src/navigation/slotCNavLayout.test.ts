import { describe, expect, it } from 'vitest';
import { NAV_ITEM_CATALOG } from './navItemCatalog';
import { resolveNavGroups } from './navResolve';
import { navItemIsActive } from './navUtils';
import {
  glowColorForNavItem,
  resolveWorkspaceForRoute,
  rollupWorkspaceBadgeCounts,
  SLOT_C_NAV_GROUPS,
  SLOT_C_WORKSPACES,
  startWorkspaceId,
  workspaceIdForDigit,
  workspaceIdForKey,
  workspaceShortcutLetter,
} from './slotCNavLayout';

describe('workspaceIdForDigit', () => {
  it('maps 1 to the first visible workspace', () => {
    expect(workspaceIdForDigit(SLOT_C_WORKSPACES, '1')).toBe('buying');
  });

  it('maps 3 to the third visible workspace', () => {
    expect(workspaceIdForDigit(SLOT_C_WORKSPACES, '3')).toBe('restoration');
  });

  it('maps 0 to HR', () => {
    expect(workspaceIdForDigit(SLOT_C_WORKSPACES, '0')).toBe('hr');
  });

  it('maps 7 to Studios and 8 to Facilities', () => {
    expect(workspaceIdForDigit(SLOT_C_WORKSPACES, '7')).toBe('studios');
    expect(workspaceIdForDigit(SLOT_C_WORKSPACES, '8')).toBe('facilities');
  });

  it('maps 9 to Admin', () => {
    expect(workspaceIdForDigit(SLOT_C_WORKSPACES, '9')).toBe('admin');
  });

  it('refuses a digit past the list rather than wrapping', () => {
    expect(workspaceIdForDigit(SLOT_C_WORKSPACES.slice(0, 3), '4')).toBeNull();
  });

  it('refuses a letter', () => {
    expect(workspaceIdForDigit(SLOT_C_WORKSPACES, 'b')).toBeNull();
  });

  it('numbers the role-filtered list, not the full catalog', () => {
    const employeeSees = SLOT_C_WORKSPACES.filter((w) => w.id !== 'onlineSales' && w.id !== 'admin');
    expect(employeeSees).toHaveLength(8);
    expect(workspaceIdForDigit(employeeSees, '4')).toBe('storeSales');
    expect(workspaceIdForDigit(employeeSees, '6')).toBe('deliveries');
    expect(workspaceIdForDigit(employeeSees, '9')).toBeNull();
    expect(workspaceIdForDigit(employeeSees, '5')).toBeNull();
  });
});

describe('workspaceShortcutLetter', () => {
  it('is the first letter of the short name, uppercased', () => {
    expect(workspaceShortcutLetter(SLOT_C_WORKSPACES[0]!)).toBe('B');
    expect(workspaceShortcutLetter(SLOT_C_WORKSPACES.find((w) => w.id === 'storeSales')!)).toBe('R');
    expect(workspaceShortcutLetter(SLOT_C_WORKSPACES.find((w) => w.id === 'hr')!)).toBe('H');
  });

  it('gives every workspace its own letter color', () => {
    const colors = SLOT_C_WORKSPACES.map((w) => w.shortcutColor);
    expect(new Set(colors).size).toBe(colors.length);
  });
});

describe('workspaceIdForKey', () => {
  it('still maps digits the same way', () => {
    expect(workspaceIdForKey(SLOT_C_WORKSPACES, '3')).toBe('restoration');
  });

  it('maps a letter to the workspace whose short name starts with it', () => {
    expect(workspaceIdForKey(SLOT_C_WORKSPACES, 'r')).toBe('restoration');
    expect(workspaceIdForKey(SLOT_C_WORKSPACES, 'R')).toBe('restoration'); // before Retail, which is 4
    expect(workspaceIdForKey(SLOT_C_WORKSPACES, 'f')).toBe('facilities');
    expect(workspaceIdForKey(SLOT_C_WORKSPACES, 'h')).toBe('hr');
    expect(workspaceIdForKey(SLOT_C_WORKSPACES, 's')).toBe('studios');
    expect(workspaceIdForKey(SLOT_C_WORKSPACES, 'a')).toBe('admin');
    expect(workspaceIdForKey(SLOT_C_WORKSPACES, 'i')).toBeNull();
    expect(workspaceIdForKey(SLOT_C_WORKSPACES, 'l')).toBeNull();
  });

  it('assigns each digit to at most one workspace', () => {
    const digits = SLOT_C_WORKSPACES.map((w) => w.shortcutDigit).filter(
      (d): d is number => d != null,
    );
    expect(new Set(digits).size).toBe(digits.length);
  });

  it('ignores a letter that no visible workspace starts with', () => {
    expect(workspaceIdForKey(SLOT_C_WORKSPACES, 'z')).toBeNull();
  });

  it('picks the earlier row when two short names share a first letter', () => {
    const collision = [
      SLOT_C_WORKSPACES.find((w) => w.id === 'storeSales')!,
      SLOT_C_WORKSPACES.find((w) => w.id === 'admin')!,
    ];
    // Force a shared first letter: the earlier row wins.
    const forced = [
      { ...collision[0]!, shortLabel: 'Sales' },
      { ...collision[1]!, shortLabel: 'Setup' },
    ];
    expect(workspaceIdForKey(forced, 's')).toBe('storeSales');
  });
});

describe('rollupWorkspaceBadgeCounts', () => {
  const groups = [
    { id: 'onlineSales', items: [{ id: 'onlineSalesCustomers' }, { id: 'onlineSalesHolds' }] },
    { id: 'buying', items: [{ id: 'auctions' }] },
  ];

  it('sums item counts onto the workspace that owns them', () => {
    expect(
      rollupWorkspaceBadgeCounts(groups, {
        onlineSalesCustomers: 3,
        onlineSalesHolds: 1,
      }),
    ).toEqual({ onlineSales: 4 });
  });

  it('omits a workspace with nothing waiting', () => {
    expect(rollupWorkspaceBadgeCounts(groups, { auctions: 0 })).toEqual({});
  });
});

describe('Processing workspace pages', () => {
  const processing = SLOT_C_NAV_GROUPS.find((g) => g.id === 'processing');

  it('keeps Receiving and Processing, and drops Finalization and Disputes', () => {
    expect(processing?.itemIds).toEqual(['receiving', 'processing', 'processingMyNumbers']);
    expect(NAV_ITEM_CATALOG.finalization).toBeUndefined();
    expect(NAV_ITEM_CATALOG.disputes).toBeUndefined();
  });

  it('lists Returns under an "In progress" caption, for every staff login (#83)', () => {
    expect(processing?.setupItemIds).toEqual(['processingReturns', 'processingFloorIssues', 'processingPhotoSheets']);
    expect(processing?.setupLabel).toBe('In progress');
    expect(NAV_ITEM_CATALOG.processingReturns).toMatchObject({ path: '/inventory/returns', label: 'Returns' });
    const employee = resolveNavGroups({ role: 'Employee', is_superuser: false }, SLOT_C_NAV_GROUPS);
    expect(employee.find((g) => g.id === 'processing')?.items.map((i) => i.id)).toEqual(['receiving', 'processing', 'processingMyNumbers', 'processingReturns', 'processingFloorIssues', 'processingPhotoSheets']);
  });

  it('gives every processor My numbers and only leads the Command Center (#87)', () => {
    const pages = (role: 'Employee' | 'Manager') => {
      const group = resolveNavGroups({ role, is_superuser: false }, SLOT_C_NAV_GROUPS).find((g) => g.id === 'processing');
      return { all: group?.items.map((i) => i.id) ?? [], managers: group?.managerItems.map((i) => i.id) ?? [] };
    };
    expect(pages('Employee').all).toContain('processingMyNumbers');
    expect(pages('Employee').all).not.toContain('processingCommandCenter');
    expect(pages('Manager').managers).toEqual(['processingCommandCenter']);
    expect(NAV_ITEM_CATALOG.processingCommandCenter?.path).toBe('/processing/command-center');
    expect(NAV_ITEM_CATALOG.processingMyNumbers?.path).toBe('/processing/my-numbers');
  });

  it('pins Restoration overview and Search behind the out-of-workspace divider', () => {
    expect(processing?.guestItemIds).toEqual(['restorations', 'inventoryWorkbench']);
    expect(NAV_ITEM_CATALOG.restorations?.label).toBe('Restoration');
    expect(NAV_ITEM_CATALOG.restorations?.path).toBe('/restoration/overview');
  });

  it('opens Floorplans in Studios, its only home (owner, 2026-10-02)', () => {
    const groups = resolveNavGroups({ role: 'Admin', is_superuser: true }, SLOT_C_NAV_GROUPS);
    const isActive = (item: { path: string; pathAliases?: string[] }) =>
      navItemIsActive('/floor-ops/floorplans', '', '', item);
    expect(resolveWorkspaceForRoute(groups, SLOT_C_WORKSPACES, isActive)).toBe('studios');
  });

  it('does not let that shortcut steal Overview away from the Restoration workspace', () => {
    const groups = resolveNavGroups({ role: 'Admin', is_superuser: true }, SLOT_C_NAV_GROUPS);
    const isActive = (item: { path: string; pathAliases?: string[] }) =>
      navItemIsActive('/restoration/overview', '', '', item);
    expect(resolveWorkspaceForRoute(groups, SLOT_C_WORKSPACES, isActive)).toBe('restoration');
  });
});

describe('Studios, Admin, HR and Retail placement (#67)', () => {
  const admin = SLOT_C_NAV_GROUPS.find((g) => g.id === 'admin');
  const studios = SLOT_C_NAV_GROUPS.find((g) => g.id === 'studios');
  const onlineSales = SLOT_C_NAV_GROUPS.find((g) => g.id === 'onlineSales');

  it('keeps Admin to the owner page, approvals, routines and settings', () => {
    expect(admin?.itemIds).toEqual(['owner', 'superRequests', 'contractors', 'adminRoutines', 'settings']);
    expect(NAV_ITEM_CATALOG.contractors?.superuserOnly).toBe(true);
    expect(NAV_ITEM_CATALOG.superRequests).toMatchObject({ label: 'Approvals', superuserOnly: true });
    expect(NAV_ITEM_CATALOG.adminRoutines?.superuserOnly).toBe(true);
    expect(admin?.guestItemIds).toEqual(['designLab', 'icons']); // owner-only tools, under the line
    expect(NAV_ITEM_CATALOG.icons?.superuserOnly).toBe(true);
    expect(NAV_ITEM_CATALOG.designLab?.superuserOnly).toBe(true);
  });

  it('puts every studio under Studios', () => {
    expect(studios?.itemIds).toEqual(['socialStudio']);
    expect(studios?.managerItemIds).toEqual(['labelStudio', 'floorplans', 'announcements', 'blogStudio']);
    expect(SLOT_C_NAV_GROUPS.find((g) => g.id === 'library')).toBeUndefined();
    expect(SLOT_C_NAV_GROUPS.find((g) => g.id === 'mail')).toBeUndefined();
  });

  it('opens Studios to staff for Social Studio only (Lane F, 2026-10-21)', () => {
    const groups = resolveNavGroups({ role: 'Employee', is_superuser: false }, SLOT_C_NAV_GROUPS);
    expect(groups.find((g) => g.id === 'studios')?.items.map((i) => i.id)).toEqual(['socialStudio']);
    const managers = resolveNavGroups({ role: 'Manager', is_superuser: false }, SLOT_C_NAV_GROUPS);
    expect(managers.find((g) => g.id === 'studios')?.items.map((i) => i.id))
      .toEqual(['socialStudio', 'labelStudio', 'floorplans', 'announcements']);
  });

  it('makes HR one workspace: My HR for everyone, HR Admin for managers', () => {
    const hr = SLOT_C_NAV_GROUPS.find((g) => g.id === 'hr');
    expect(SLOT_C_NAV_GROUPS.find((g) => g.id === 'people')).toBeUndefined();
    expect(hr?.itemIds).toEqual(['hrRequests', 'schedule', 'profile']);
    expect(hr?.itemsLabel).toBe('My HR');
    expect(hr?.managerLabel).toBe('HR Admin');
    expect(hr?.roles).toBeUndefined();
    const employee = resolveNavGroups({ role: 'Employee', is_superuser: false }, SLOT_C_NAV_GROUPS);
    expect(employee.find((g) => g.id === 'hr')?.items.map((i) => i.id)).toEqual(['hrRequests', 'schedule', 'profile']);
    const manager = resolveNavGroups({ role: 'Manager', is_superuser: false }, SLOT_C_NAV_GROUPS);
    expect(manager.find((g) => g.id === 'hr')?.managerItems.map((i) => i.id)).toEqual([
      'users', 'permissions', 'applicants', 'interviews', 'onboarding', 'checkins',
      'departments', 'shifts', 'payrollDeductions', 'jobs', 'hiringEmails',
    ]);
    expect(NAV_ITEM_CATALOG.applicants?.path).toBe('/people/applicants');
    // HR documents (#62) is the owner's, under HR Admin.
    expect(hr?.managerItemIds).toContain('hrDocuments');
    expect(manager.find((g) => g.id === 'hr')?.managerItems.map((i) => i.id)).not.toContain('hrDocuments');
  });

  it('has no Inventory workspace: its pages are Retail shortcuts and keep the Inventory dial', () => {
    expect(SLOT_C_NAV_GROUPS.find((g) => g.id === 'retailFloor')).toBeUndefined();
    const retail = SLOT_C_NAV_GROUPS.find((g) => g.id === 'storeSales');
    expect(retail?.guestItemIds).toEqual(['inventoryWorkbench', 'inventoryCount', 'inventoryReview', 'tagErrors']);
    expect(retail?.managerItemIds).toContain('inventories');
    for (const id of ['inventoryWorkbench', 'inventoryCount', 'inventoryReview', 'tagErrors', 'quickReprice']) {
      expect(NAV_ITEM_CATALOG[id]?.area, id).toBe('inventory');
    }
    expect(NAV_ITEM_CATALOG.tagErrors).toMatchObject({ path: '/inventory/tag-errors', label: 'Tag errors' });
    // PR Fix-it is archived (its address still opens); Quick reprice is its reprice tab.
    expect(SLOT_C_NAV_GROUPS.some((g) => [...g.itemIds, ...(g.guestItemIds ?? [])].includes('prFixit'))).toBe(false);
    expect(NAV_ITEM_CATALOG.quickReprice).toMatchObject({ path: '/inventory/pr-fixit', query: 'tab=reprice' });
    expect(SLOT_C_NAV_GROUPS.find((g) => g.id === 'essentials')).toBeUndefined();
    for (const id of ['dashboard', 'reports']) {
      expect(SLOT_C_NAV_GROUPS.some((g) => g.itemIds.includes(id) || g.guestItemIds?.includes(id))).toBe(false);
    }
    expect(NAV_ITEM_CATALOG.reports?.superuserOnly).toBe(true);
    expect(NAV_ITEM_CATALOG.owner).toMatchObject({ path: '/owner', superuserOnly: true, pathAliases: ['/brief'] });
    expect(onlineSales?.itemIds).toContain('onlineSalesCustomers');
  });

  it('opens Retail for the Customers list and HR for the Staff list', () => {
    const groups = resolveNavGroups({ role: 'Admin', is_superuser: true }, SLOT_C_NAV_GROUPS);
    const at = (search: string) => resolveWorkspaceForRoute(groups, SLOT_C_WORKSPACES,
      (item) => navItemIsActive('/admin/users', search, '', item));
    expect(at('?tab=members')).toBe('storeSales');
    expect(at('')).toBe('hr');
  });
});

describe('Retail and the Managers section (Bill 2026-11-04)', () => {
  const retail = SLOT_C_NAV_GROUPS.find((g) => g.id === 'storeSales');

  it('opens with Register, Transactions, Customers; managers get Command Center and Cash Drops first', () => {
    expect(retail?.itemIds.slice(0, 3)).toEqual(['posTerminal', 'posTransactions', 'customers']);
    expect(NAV_ITEM_CATALOG.posTerminal?.label).toBe('Register');
    expect(retail?.managerItemIds?.slice(0, 2)).toEqual(['retailQa', 'posCash']);
    expect(NAV_ITEM_CATALOG.posCash?.label).toBe('Cash Drops');
  });

  it('shows an Employee no Managers section, and a Manager the pages their dials open', () => {
    const employee = resolveNavGroups({ role: 'Employee', is_superuser: false }, SLOT_C_NAV_GROUPS);
    expect(employee.flatMap((g) => g.managerItems).map((i) => i.id)).toEqual([]);
    const manager = resolveNavGroups({ role: 'Manager', is_superuser: false }, SLOT_C_NAV_GROUPS);
    expect(manager.find((g) => g.id === 'storeSales')?.managerItems.map((i) => i.id))
      .toEqual(['retailQa', 'posCash', 'posSetup', 'inventories']);
  });

  it('lists every page once per workspace', () => {
    for (const g of SLOT_C_NAV_GROUPS) {
      const ids = [...g.itemIds, ...(g.setupItemIds ?? []), ...(g.managerItemIds ?? []), ...(g.guestItemIds ?? [])];
      expect(new Set(ids).size, g.id).toBe(ids.length);
    }
  });
});

describe('Finalize Thrift+ placement', () => {
  it('sits in Retail for every staff role', () => {
    const storeSales = SLOT_C_NAV_GROUPS.find((g) => g.id === 'storeSales');
    expect(storeSales?.itemIds).toContain('thriftPlusFinalize');
    expect(NAV_ITEM_CATALOG.thriftPlusFinalize).toMatchObject({ path: '/staff/find', label: 'Thrift+ Staff' });
    expect(NAV_ITEM_CATALOG.thriftPlusFinalize?.roles).toBeUndefined();
    expect(NAV_ITEM_CATALOG.thriftPlusFinalize?.superuserOnly).toBeUndefined();
    const groups = resolveNavGroups({ role: 'Employee', is_superuser: false }, SLOT_C_NAV_GROUPS);
    expect(groups.find((g) => g.id === 'storeSales')?.items.map((item) => item.id)).toContain('thriftPlusFinalize');
  });
});

describe('Command Center placement', () => {
  const storeSales = SLOT_C_NAV_GROUPS.find((g) => g.id === 'storeSales');

  it('is a Retail page now that Admin is the owner tools (#67)', () => {
    expect(storeSales?.managerItemIds).toContain('retailQa');
    expect(SLOT_C_NAV_GROUPS.find((g) => g.id === 'admin')?.itemIds).not.toContain('retailQa');
    expect(NAV_ITEM_CATALOG.retailQa?.label).toBe('Command Center');
    expect(NAV_ITEM_CATALOG.retailQa?.roles).toEqual(['Manager', 'Admin']);
    expect(NAV_ITEM_CATALOG.retailQa?.path).toBe('/admin/retail-qa');
  });

  it('shows a Manager the page in Retail and not an Employee', () => {
    const managers = resolveNavGroups({ role: 'Manager', is_superuser: false }, SLOT_C_NAV_GROUPS);
    expect(managers.find((g) => g.id === 'storeSales')?.items.map((item) => item.id)).toContain('retailQa');
    const employees = resolveNavGroups({ role: 'Employee', is_superuser: false }, SLOT_C_NAV_GROUPS);
    expect(employees.find((g) => g.id === 'storeSales')?.items.map((item) => item.id)).not.toContain('retailQa');
  });

  it('opens Retail when the Command Center URL is entered', () => {
    const groups = resolveNavGroups({ role: 'Admin', is_superuser: true }, SLOT_C_NAV_GROUPS);
    const isActive = (item: { path: string; pathAliases?: string[] }) =>
      navItemIsActive('/admin/retail-qa', '', '', item);
    expect(resolveWorkspaceForRoute(groups, SLOT_C_WORKSPACES, isActive)).toBe('storeSales');
  });
});

describe('Dash Updates placement', () => {
  it('is a catalog page for every staff login but sits in no workspace sidebar', () => {
    expect(NAV_ITEM_CATALOG.dashFixes).toMatchObject({ path: '/dash-updates', label: 'Dash Updates' });
    expect(NAV_ITEM_CATALOG.dashFixes?.superuserOnly).toBeUndefined();
    expect(NAV_ITEM_CATALOG.dashFixes?.roles).toBeUndefined();
    for (const group of SLOT_C_NAV_GROUPS) {
      expect(group.itemIds).not.toContain('dashFixes');
      expect(group.setupItemIds ?? []).not.toContain('dashFixes');
      expect(group.guestItemIds ?? []).not.toContain('dashFixes');
    }
  });

  it('gives Restoration only the Search shortcut', () => {
    const groups = resolveNavGroups({ role: 'Admin', is_superuser: true }, SLOT_C_NAV_GROUPS);
    expect(groups.find((g) => g.id === 'restoration')?.guestItems.map((i) => i.id)).toEqual(['inventoryWorkbench']);
  });
});

describe('glowColorForNavItem', () => {
  const restoration = SLOT_C_WORKSPACES.find((w) => w.id === 'restoration')!.shortcutColor;
  const processing = SLOT_C_WORKSPACES.find((w) => w.id === 'processing')!.shortcutColor;
  const buying = SLOT_C_WORKSPACES.find((w) => w.id === 'buying')!.shortcutColor;

  it('uses the workspace letter colour for a native page', () => {
    expect(glowColorForNavItem('receiving')).toBe(processing);
    expect(glowColorForNavItem('auctions')).toBe(buying);
    expect(glowColorForNavItem('retailQa')).toBe(
      SLOT_C_WORKSPACES.find((w) => w.id === 'storeSales')!.shortcutColor,
    );
  });

  it('uses the home workspace colour for a guest shortcut', () => {
    expect(glowColorForNavItem('restorations')).toBe(restoration);
    expect(glowColorForNavItem('restorations')).not.toBe(processing);
  });

  it('gives pages in no workspace no letter colour', () => {
    expect(glowColorForNavItem('dashboard')).toBeUndefined();
    expect(glowColorForNavItem('dashFixes')).toBeUndefined();
    expect(glowColorForNavItem('pay')).toBeUndefined();
    expect(glowColorForNavItem('routines')).toBeUndefined();
    expect(glowColorForNavItem('documents')).toBeUndefined();
  });

  it('glows Supplies in the Facilities colour now that it lives there', () => {
    expect(glowColorForNavItem('supplies')).toBe('#DB2777');
  });
});

describe('Sidebar = the workspace you are in (phase 1 redesign)', () => {
  it('has exactly the ten workspaces with the same digits, 0 = HR', () => {
    expect(SLOT_C_NAV_GROUPS.map((g) => g.id)).toEqual(SLOT_C_WORKSPACES.map((w) => w.id));
    expect(SLOT_C_WORKSPACES.map((w) => w.shortcutDigit)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 0]);
    expect(SLOT_C_WORKSPACES.map((w) => w.label)).toEqual([
      'Buying', 'Processing', 'Restoration', 'Retail', 'Online Sales', 'Deliveries', 'Studios', 'Facilities', 'Admin', 'HR',
    ]);
  });

  it('gives every staff login Store map, Signage and Supplies in Facilities, and Keys to the owner and Admins (#67, #105, #106)', () => {
    expect(SLOT_C_NAV_GROUPS.find((g) => g.id === 'facilities')?.itemIds).toEqual(['storeMap', 'signage', 'supplies']);
    expect(SLOT_C_NAV_GROUPS.find((g) => g.id === 'facilities')?.managerItemIds).toEqual(['keys']);
    expect(NAV_ITEM_CATALOG.supplies?.need).toBeUndefined();
    const employee = resolveNavGroups({ role: 'Employee', is_superuser: false }, SLOT_C_NAV_GROUPS);
    expect(employee.find((g) => g.id === 'facilities')?.items.map((i) => i.id)).toEqual(['storeMap', 'signage', 'supplies']);
  });

  it('keeps Owner and Reports owner-only in the catalog', () => {
    expect(NAV_ITEM_CATALOG.owner?.superuserOnly).toBe(true);
    expect(NAV_ITEM_CATALOG.reports?.superuserOnly).toBe(true);
  });
});

describe('No hiding from staff (#67)', () => {
  // Every page each level saw in the sidebar before #67 (v2.259.0). PR Fix-it was archived by Bill (2026-11-04). Returns
  // folded into the Register's Return window (#71); /pos/returns opens it.
  const EMPLOYEE_BEFORE = [
    'wishlist', 'auctions', 'watchlist', 'reportCards', 'vendors', 'orders', 'preprocessing', 'receiving', 'processing',
    'restorations', 'restorationQueue', 'tars', 'restorationPartsRequests', 'restorationTracking', 'inventoryWorkbench',
    'inventoryReview', 'inventoryCount', 'tagErrors', 'posTerminal', 'thriftPlusFinalize', 'posTransactions',
    'posDrawers', 'posTestTerminal', 'posPrintables', 'deliverySchedule', 'deliveryTable', 'socialStudio',
  ];
  const MANAGER_BEFORE = [
    ...EMPLOYEE_BEFORE,
    'posCash', 'posSetup', 'retailQa', 'inventories', 'onlineSalesListings', 'onlineSalesHolds', 'onlineSalesCustomers',
    'labelStudio', 'floorplans', 'announcements', 'users', 'permissions', 'schedule', 'applicants', 'interviews',
    'onboarding', 'checkins', 'payrollDeductions', 'jobs', 'hiringEmails', 'departments', 'shifts', 'supplies', 'settings',
  ];

  it('leaves every level every page it could open before', () => {
    for (const [role, before] of [['Employee', EMPLOYEE_BEFORE], ['Manager', MANAGER_BEFORE]] as const) {
      const seen = resolveNavGroups({ role, is_superuser: false }, SLOT_C_NAV_GROUPS)
        .flatMap((g) => [...g.items, ...g.guestItems])
        .map((i) => i.id);
      for (const id of before) expect(seen, `${role} ${id}`).toContain(id);
    }
  });
});

describe('Buying legacy pages (Bill 2026-11-06)', () => {
  it('puts every buying page not yet rebuilt under a Legacy caption, rebuilt ones on top', () => {
    const buying = SLOT_C_NAV_GROUPS.find((g) => g.id === 'buying')!;
    expect(buying.itemIds.slice(0, 2)).toEqual(['auctions', 'estimateProfit']);
    expect(buying.setupLabel).toBe('Legacy');
    expect(buying.setupItemIds).toEqual(['wishlist', 'auctionsOld', 'watchlist', 'reportCards']);
  });
});

/** #86 (Bill 2026-11-10): the menu opens on a person's own department when they have no remembered workspace. */
describe('startWorkspaceId (nothing remembered)', () => {
  const all = SLOT_C_WORKSPACES;

  it('opens a register computer on Retail, before the department', () => {
    expect(startWorkspaceId(all, { registerDevice: true, departmentStart: 'processing' })).toBe('storeSales');
  });

  it("opens on the department's workspace anywhere else", () => {
    expect(startWorkspaceId(all, { registerDevice: false, departmentStart: 'processing' })).toBe('processing');
    expect(startWorkspaceId(all, { registerDevice: false, departmentStart: 'restoration' })).toBe('restoration');
    expect(startWorkspaceId(all, { registerDevice: false, departmentStart: 'storeSales' })).toBe('storeSales');
  });

  it('opens on Buying when the department sets none', () => {
    expect(startWorkspaceId(all, { registerDevice: false, departmentStart: '' })).toBe('buying');
    expect(startWorkspaceId(all, { registerDevice: false, departmentStart: null })).toBe('buying');
    expect(startWorkspaceId(all, { registerDevice: false })).toBe('buying');
  });

  it('never picks a workspace the person cannot see', () => {
    const noAdmin = all.filter((w) => w.id !== 'admin');
    expect(startWorkspaceId(noAdmin, { registerDevice: false, departmentStart: 'admin' })).toBe('buying');
    expect(startWorkspaceId(all, { registerDevice: false, departmentStart: 'noSuchWorkspace' })).toBe('buying');
    const noRetail = all.filter((w) => w.id !== 'storeSales');
    expect(startWorkspaceId(noRetail, { registerDevice: true, departmentStart: 'processing' })).toBe('processing');
    const hrOnly = all.filter((w) => w.id === 'hr');
    expect(startWorkspaceId(hrOnly, { registerDevice: false, departmentStart: 'processing' })).toBe('hr');
    expect(startWorkspaceId([], { registerDevice: false, departmentStart: 'processing' })).toBeNull();
  });

  it('reads a renamed workspace id as its new one', () => {
    expect(startWorkspaceId(all, { registerDevice: false, departmentStart: 'cashier' })).toBe('storeSales');
  });
});
