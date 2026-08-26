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

  it('maps 0 to Admin', () => {
    expect(workspaceIdForDigit(SLOT_C_WORKSPACES, '0')).toBe('admin');
  });

  it('maps 8 to Studios', () => {
    expect(workspaceIdForDigit(SLOT_C_WORKSPACES, '8')).toBe('studios');
  });

  it('leaves 9 unused', () => {
    expect(workspaceIdForDigit(SLOT_C_WORKSPACES, '9')).toBeNull();
  });

  it('refuses a digit past the list rather than wrapping', () => {
    expect(workspaceIdForDigit(SLOT_C_WORKSPACES.slice(0, 3), '4')).toBeNull();
  });

  it('refuses a letter', () => {
    expect(workspaceIdForDigit(SLOT_C_WORKSPACES, 'b')).toBeNull();
  });

  it('numbers the role-filtered list, not the full catalog', () => {
    const employeeSees = SLOT_C_WORKSPACES.filter(
      (w) => w.id !== 'onlineSales' && w.id !== 'admin' && w.id !== 'studios',
    );
    expect(employeeSees).toHaveLength(6);
    expect(workspaceIdForDigit(employeeSees, '5')).toBe('storeSales');
    expect(workspaceIdForDigit(employeeSees, '6')).toBe('deliveries');
    expect(workspaceIdForDigit(employeeSees, '7')).toBeNull();
  });
});

describe('workspaceShortcutLetter', () => {
  it('is the first letter of the short name, uppercased', () => {
    expect(workspaceShortcutLetter(SLOT_C_WORKSPACES[0]!)).toBe('B');
    expect(workspaceShortcutLetter(SLOT_C_WORKSPACES.find((w) => w.id === 'retailFloor')!)).toBe('F');
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
    expect(workspaceIdForKey(SLOT_C_WORKSPACES, 'R')).toBe('restoration');
    expect(workspaceIdForKey(SLOT_C_WORKSPACES, 'f')).toBe('retailFloor');
    expect(workspaceIdForKey(SLOT_C_WORKSPACES, 's')).toBe('studios');
    expect(workspaceIdForKey(SLOT_C_WORKSPACES, 'a')).toBe('admin');
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
    // Store Sales is "Sales"; if Admin were also "Setup" it would lose. Force it.
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
    expect(processing?.itemIds).toEqual(['receiving', 'processing']);
    expect(NAV_ITEM_CATALOG.finalization).toBeUndefined();
    expect(NAV_ITEM_CATALOG.disputes).toBeUndefined();
  });

  it('pins Restoration overview behind the out-of-workspace divider, without the plural s', () => {
    expect(processing?.guestItemIds).toEqual(['restorations']);
    expect(NAV_ITEM_CATALOG.restorations?.label).toBe('Restoration');
    expect(NAV_ITEM_CATALOG.restorations?.path).toBe('/restoration/overview');
  });

  it('keeps a dual-listed Floorplan on Retail Floor, not Studios', () => {
    const groups = resolveNavGroups(
      { role: 'Admin', is_superuser: true },
      SLOT_C_NAV_GROUPS,
    );
    const workspaces = groups.filter((g) => g.id !== 'essentials');
    const isActive = (item: { path: string; pathAliases?: string[] }) =>
      navItemIsActive('/floor-ops/floorplans', '', '', item);
    expect(resolveWorkspaceForRoute(workspaces, SLOT_C_WORKSPACES, isActive)).toBe('retailFloor');
  });

  it('does not let that shortcut steal Overview away from the Restoration workspace', () => {
    const groups = resolveNavGroups(
      { role: 'Admin', is_superuser: true },
      SLOT_C_NAV_GROUPS,
    );
    const workspaces = groups.filter((g) => g.id !== 'essentials');
    const isActive = (item: { path: string; pathAliases?: string[] }) =>
      navItemIsActive('/restoration/overview', '', '', item);
    expect(resolveWorkspaceForRoute(workspaces, SLOT_C_WORKSPACES, isActive)).toBe('restoration');
  });
});

describe('Studios and Admin placement', () => {
  const admin = SLOT_C_NAV_GROUPS.find((g) => g.id === 'admin');
  const studios = SLOT_C_NAV_GROUPS.find((g) => g.id === 'studios');
  const retailFloor = SLOT_C_NAV_GROUPS.find((g) => g.id === 'retailFloor');
  const onlineSales = SLOT_C_NAV_GROUPS.find((g) => g.id === 'onlineSales');

  it('keeps Admin as Users, Retail inbox, Settings, and Time & payroll', () => {
    expect(admin?.itemIds).toEqual(['users', 'retailInbox', 'settings', 'payrollHours']);
    expect(admin?.guestItemIds ?? []).toEqual([]);
  });

  it('puts every studio under Studios', () => {
    expect(studios?.itemIds).toEqual(['labelStudio', 'floorplans', 'qualityAuditForms', 'blogStudio']);
    expect(SLOT_C_NAV_GROUPS.find((g) => g.id === 'people')).toBeUndefined();
    expect(SLOT_C_NAV_GROUPS.find((g) => g.id === 'mail')).toBeUndefined();
  });

  it('keeps Floorplans on Retail Floor and Messages on Online Sales', () => {
    expect(retailFloor?.itemIds).toEqual(['inventoryWorkbench', 'quickReprice', 'floorplans', 'qualityAudit']);
    expect(onlineSales?.itemIds).toContain('onlineSalesCustomers');
  });
});

describe('Enhancement requests placement', () => {
  const restoration = SLOT_C_NAV_GROUPS.find((g) => g.id === 'restoration');
  const admin = SLOT_C_NAV_GROUPS.find((g) => g.id === 'admin');

  it('sits in Restoration behind the divider, not under Admin', () => {
    expect(restoration?.guestItemIds).toEqual(['enhancementRequests']);
    expect(admin?.itemIds).not.toContain('enhancementRequests');
    expect(NAV_ITEM_CATALOG.enhancementRequests?.superuserOnly).toBe(true);
    expect(NAV_ITEM_CATALOG.enhancementRequests?.label).toBe('Enhancements');
  });

  it('shows the owner the page after the Restoration list', () => {
    const groups = resolveNavGroups({ role: 'Admin', is_superuser: true }, SLOT_C_NAV_GROUPS);
    const group = groups.find((g) => g.id === 'restoration');
    expect(group?.guestItems.map((item) => item.id)).toEqual(['enhancementRequests']);
  });

  it('leaves a Manager neither the page nor the divider above it', () => {
    const groups = resolveNavGroups({ role: 'Admin', is_superuser: false }, SLOT_C_NAV_GROUPS);
    const group = groups.find((g) => g.id === 'restoration');
    expect(group?.items.map((item) => item.id)).toEqual([
      'restorationQueue',
      'tars',
      'restorationPartsRequests',
    ]);
    // The Sidebar draws the hairline only for a non-empty guest list.
    expect(group?.guestItems).toEqual([]);
  });
});

describe('glowColorForNavItem', () => {
  const restoration = SLOT_C_WORKSPACES.find((w) => w.id === 'restoration')!.shortcutColor;
  const processing = SLOT_C_WORKSPACES.find((w) => w.id === 'processing')!.shortcutColor;
  const buying = SLOT_C_WORKSPACES.find((w) => w.id === 'buying')!.shortcutColor;

  it('uses the workspace letter colour for a native page', () => {
    expect(glowColorForNavItem('receiving')).toBe(processing);
    expect(glowColorForNavItem('auctions')).toBe(buying);
  });

  it('uses the home workspace colour for a guest shortcut', () => {
    expect(glowColorForNavItem('restorations')).toBe(restoration);
    expect(glowColorForNavItem('restorations')).not.toBe(processing);
  });

  it('gives a set-apart page with no other home the colour of its own workspace', () => {
    expect(glowColorForNavItem('enhancementRequests')).toBe(restoration);
  });

  it('gives Essentials no letter colour', () => {
    expect(glowColorForNavItem('dashboard')).toBeUndefined();
    expect(glowColorForNavItem('timeClock')).toBeUndefined();
  });
});
