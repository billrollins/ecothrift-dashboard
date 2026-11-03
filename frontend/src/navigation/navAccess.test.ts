import { describe, expect, it } from 'vitest';
import { resolveNavGroups } from './navResolve';
import { SLOT_C_NAV_GROUPS } from './slotCNavLayout';
import dayOne from './dayOneAccess.fixture.json';

/** The sidebar a person sees, as "workspace: page, page". */
function sidebar(user: Parameters<typeof resolveNavGroups>[0]): string[] {
  return resolveNavGroups(user, SLOT_C_NAV_GROUPS).map(
    (g) => `${g.id}: ${[...g.items, ...g.guestItems].map((i) => i.id).join(', ')}`,
  );
}

describe('sidebar with People → Permissions (#53)', () => {
  it('day one: each level sees exactly what it saw before', () => {
    for (const role of ['Employee', 'Manager'] as const) {
      const before = sidebar({ role, is_superuser: false });
      const after = sidebar({ role, is_superuser: false, access: dayOne[role] });
      expect(after, role).toEqual(before);
    }
  });

  it('a single granted page shows its workspace', () => {
    const access = [...dayOne.Employee, 'settings:write'];
    const groups = resolveNavGroups({ role: 'Employee', is_superuser: false, access }, SLOT_C_NAV_GROUPS);
    expect(groups.find((g) => g.id === 'admin')?.items.map((i) => i.id)).toEqual(['settings']);
  });

  it('an area set to None hides its workspace', () => {
    const access = dayOne.Employee.filter((id) => !id.startsWith('deliver'));
    const groups = resolveNavGroups({ role: 'Employee', is_superuser: false, access }, SLOT_C_NAV_GROUPS);
    expect(groups.some((g) => g.id === 'deliveries')).toBe(false);
  });
});
