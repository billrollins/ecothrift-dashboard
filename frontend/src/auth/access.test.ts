import { describe, expect, it } from 'vitest';
import { canAccess, isDialStep } from './access';

const employee = { is_superuser: false, role: 'Employee' as const, access: ['cashier:view', 'cashier:work', 'pos.terminal:use'] };

describe('canAccess (People → Permissions, #53)', () => {
  it('lets the owner through and nobody signed out', () => {
    expect(canAccess({ is_superuser: true, role: 'Admin' }, ['blog:write', 'studios:full'])).toBe(true);
    expect(canAccess(null, 'cashier:view')).toBe(false);
  });

  it('decides on the item when the list names one, else on the dial', () => {
    expect(canAccess(employee, ['pos.terminal:use', 'cashier:work'])).toBe(true);
    expect(canAccess(employee, ['pos.cash:manage', 'cashier:work'])).toBe(false);
    expect(canAccess(employee, 'cashier:work')).toBe(true);
    expect(canAccess(employee, 'cashier:manage')).toBe(false);
  });

  it('a single granted item opens its page without the dial', () => {
    const granted = { ...employee, access: [...employee.access, 'settings:write'] };
    expect(canAccess(granted, ['settings:write', 'admin:manage'])).toBe(true);
  });

  it('falls back to the old level rule without an access list', () => {
    expect(canAccess({ is_superuser: false, role: 'Manager' }, ['settings:write', 'admin:manage'])).toBe(true);
    expect(canAccess({ is_superuser: false, role: 'Employee' }, ['settings:write', 'admin:manage'])).toBe(false);
    expect(canAccess({ is_superuser: false, role: 'Manager' }, ['blog:write', 'studios:full'])).toBe(false);
  });

  it('tells dial steps from items', () => {
    expect(isDialStep('online_sales:manage')).toBe(true);
    expect(isDialStep('online_sales.listings:manage')).toBe(false);
    expect(isDialStep('thriftplus:manage')).toBe(false);
  });
});
