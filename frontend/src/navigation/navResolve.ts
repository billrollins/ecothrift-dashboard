import { canAccess, dialStep, WORKSPACE_AREA, type AccessNeed } from '../auth/access';
import { NAV_ITEM_CATALOG } from './navItemCatalog';
import { resolveNavIcon } from './navIcons';
import type { NavGroupDef, NavItemDef, ResolvedNavGroup, ResolvedNavItem } from './navTypes';
import { canAccessNav } from './navUtils';
import { SLOT_C_NAV_GROUPS } from './slotCNavLayout';

/** Shape accepted by role-gating helpers (matches `canAccessNav`), plus the `access` list from the server. */
export type NavAccessUser = (Parameters<typeof canAccessNav>[0] & { access?: string[] | null }) | null;

/** Each page's permission area: the workspace that lists it as its own (not as a guest link). */
const ITEM_AREA: Record<string, string> = Object.fromEntries(
  SLOT_C_NAV_GROUPS.flatMap((group) => {
    const area = WORKSPACE_AREA[group.id];
    return area ? [...group.itemIds, ...(group.setupItemIds ?? [])].map((id) => [id, area]) : [];
  }),
);

/** What a menu entry needs (People → Permissions, #53): its own `need`, else its area's View step. */
export function navNeed(item: NavItemDef): AccessNeed | undefined {
  if (item.need) return item.need;
  const area = item.area ?? ITEM_AREA[item.id];
  return area ? dialStep(area, 1) : undefined;
}

function canSeeItem(user: NavAccessUser, item: NavItemDef): boolean {
  if (Array.isArray(user?.access)) return canAccess(user, navNeed(item));
  // A user object from before #53 (no `access`): the old role rule.
  return canAccessNav(user, item.roles) && (!item.superuserOnly || Boolean(user?.is_superuser));
}

/** Resolve a catalog item id into a renderable item (icon component attached). */
export function resolveNavItem(itemId: string): ResolvedNavItem | null {
  const def = NAV_ITEM_CATALOG[itemId];
  if (!def) return null;
  return { ...def, Icon: resolveNavIcon(def.icon) };
}

/** Resolve + access-filter a list of catalog item ids. */
export function resolveNavItems(user: NavAccessUser, itemIds: string[]): ResolvedNavItem[] {
  return itemIds
    .map(resolveNavItem)
    .filter((item): item is ResolvedNavItem => item != null && canSeeItem(user, item));
}

/**
 * Resolve + access-filter a list of group definitions.
 * Groups (and their items) the user cannot access are dropped; empty groups are removed. With `access`, a workspace
 * shows when any of its pages does (a grant can open one); without it, the group's own `roles` still gate it.
 * Reusable across variants so a new slot does not need to edit `useStaffNav`.
 */
export function resolveNavGroups(user: NavAccessUser, defs: NavGroupDef[]): ResolvedNavGroup[] {
  return defs
    .filter((group) => Array.isArray(user?.access) || canAccessNav(user, group.roles))
    .map((group) => {
      const setupItems = resolveNavItems(user, group.setupItemIds ?? []);
      return {
        id: group.id,
        label: group.label,
        items: [...resolveNavItems(user, group.itemIds), ...setupItems],
        setupItems,
        guestItems: resolveNavItems(user, group.guestItemIds ?? []),
      };
    })
    .filter((group) => group.items.length > 0 || group.guestItems.length > 0);
}
