import { NAV_ITEM_CATALOG } from './navItemCatalog';
import { resolveNavIcon } from './navIcons';
import type { NavGroupDef, ResolvedNavGroup, ResolvedNavItem } from './navTypes';
import { canAccessNav } from './navUtils';

/** Shape accepted by role-gating helpers (matches `canAccessNav`). */
export type NavAccessUser = Parameters<typeof canAccessNav>[0];

/** Resolve a catalog item id into a renderable item (icon component attached). */
export function resolveNavItem(itemId: string): ResolvedNavItem | null {
  const def = NAV_ITEM_CATALOG[itemId];
  if (!def) return null;
  return { ...def, Icon: resolveNavIcon(def.icon) };
}

/** Resolve + role-filter a list of catalog item ids. */
export function resolveNavItems(user: NavAccessUser, itemIds: string[]): ResolvedNavItem[] {
  return itemIds
    .map(resolveNavItem)
    .filter((item): item is ResolvedNavItem => item != null && canAccessNav(user, item.roles));
}

/**
 * Resolve + role-filter a list of group definitions.
 * Groups (and their items) the user cannot access are dropped; empty groups are removed.
 * Reusable across variants so a new slot does not need to edit `useStaffNav`.
 */
export function resolveNavGroups(user: NavAccessUser, defs: NavGroupDef[]): ResolvedNavGroup[] {
  return defs
    .filter((group) => canAccessNav(user, group.roles))
    .map((group) => ({
      id: group.id,
      label: group.label,
      items: resolveNavItems(user, group.itemIds),
    }))
    .filter((group) => group.items.length > 0);
}
