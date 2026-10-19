import { describe, expect, it } from 'vitest';
import { NAV_ITEM_CATALOG } from './navItemCatalog';
import { resolveNavGroups } from './navResolve';
import { navItemIsActive } from './navUtils';
import { SLOT_C_NAV_GROUPS } from './slotCNavLayout';

const cashierItems = (role: 'Employee' | 'Manager' | 'Admin' | 'Consignee') =>
  resolveNavGroups({ role, is_superuser: false }, SLOT_C_NAV_GROUPS)
    .find((g) => g.id === 'storeSales')?.items.map((item) => item.id) ?? [];

describe('Test terminal in the Cashier nav (2026-10-16)', () => {
  it('links to /pos/test, first under Setup (2026-10-19), after the daily pages', () => {
    expect(NAV_ITEM_CATALOG.posTestTerminal?.path).toBe('/pos/test');
    expect(NAV_ITEM_CATALOG.posTestTerminal?.label).toBe('Test terminal');
    const group = resolveNavGroups({ role: 'Employee', is_superuser: false }, SLOT_C_NAV_GROUPS)
      .find((g) => g.id === 'storeSales');
    expect(group?.setupItems.map((item) => item.id)).toEqual(['posTestTerminal', 'posPrintables']);
    expect(cashierItems('Employee').slice(0, 5)).toEqual(
      ['posTerminal', 'thriftPlusFinalize', 'posTransactions', 'posDrawers', 'posCash']);
  });

  it('shows for Employee and up, not below', () => {
    expect(cashierItems('Employee')).toContain('posTestTerminal');
    expect(cashierItems('Manager')).toContain('posTestTerminal');
    expect(cashierItems('Admin')).toContain('posTestTerminal');
    expect(cashierItems('Consignee')).not.toContain('posTestTerminal');
  });

  it('the real Terminal link is unchanged and the two never light up together', () => {
    expect(NAV_ITEM_CATALOG.posTerminal?.path).toBe('/pos/terminal');
    expect(navItemIsActive('/pos/test', '', '', NAV_ITEM_CATALOG.posTerminal!)).toBe(false);
    expect(navItemIsActive('/pos/terminal', '', '', NAV_ITEM_CATALOG.posTestTerminal!)).toBe(false);
  });
});
