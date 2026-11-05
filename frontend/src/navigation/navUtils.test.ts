import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NAV_ITEM_CATALOG } from './navItemCatalog';
import { navigateForNavItem, navItemIsActive } from './navUtils';

describe('navigateForNavItem', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('opens Today on the desk and on a phone', () => {
    const navigate = vi.fn();
    navigateForNavItem(navigate, {
      id: 'today',
      path: '/today',
      label: 'Today',
      icon: 'commandCenter',
    });
    expect(navigate).toHaveBeenCalledWith({ pathname: '/today', hash: '' }, undefined);
  });

  it('opens Pay on the desk and on a phone', () => {
    const navigate = vi.fn();
    navigateForNavItem(navigate, {
      id: 'pay',
      path: '/pay',
      label: 'Pay',
      icon: 'thriftPlus',
    });
    expect(navigate).toHaveBeenCalledWith({ pathname: '/pay', hash: '' }, undefined);
  });
});

describe('every catalog link (#69)', () => {
  const items = Object.values(NAV_ITEM_CATALOG);

  it('lights up on the page it opens', () => {
    for (const item of items) {
      const navigate = vi.fn();
      navigateForNavItem(navigate, item);
      if (item.openInNewWindow) continue; // opens outside Dash (Blog studio)
      const to = navigate.mock.calls[0]?.[0] as { pathname: string; search?: string; hash?: string };
      expect(navItemIsActive(to.pathname, to.search ?? '', to.hash ?? '', item), item.id).toBe(true);
    }
  });

  it('never puts search words in the address', () => {
    for (const item of items) {
      const navigate = vi.fn();
      navigateForNavItem(navigate, item);
      const to = navigate.mock.calls[0]?.[0] as { search?: string } | undefined;
      expect(to?.search ?? '', item.id).not.toMatch(/\s/);
      if (item.query) expect(item.query, item.id).toMatch(/^\??[\w-]+=[\w-]+(&[\w-]+=[\w-]+)*$/);
    }
  });
});
