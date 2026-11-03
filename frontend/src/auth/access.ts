import type { User, UserRole } from '../types/accounts.types';

/**
 * Staff permissions (People → Permissions, Dash Update #53). The server sends `user.access`: the item ids the person
 * holds plus each dial step reached (`buying:view` … `buying:full`); `apps/accounts/capabilities.py` is the catalog.
 */

/** The permission areas, in sidebar order (the same ids as `capabilities.AREAS`). */
export const AREA_IDS = [
  'buying', 'processing', 'restoration', 'inventory', 'cashier',
  'deliveries', 'online_sales', 'studios', 'people', 'admin',
] as const;
export type AreaId = (typeof AREA_IDS)[number];

export const STEP_KEYS = ['none', 'view', 'work', 'manage', 'full'] as const;
export const STEP_NAMES = ['None', 'View', 'Work', 'Manage', 'Full'] as const;

/** Sidebar workspace id → permission area. */
export const WORKSPACE_AREA: Record<string, AreaId> = {
  buying: 'buying',
  processing: 'processing',
  restoration: 'restoration',
  retailFloor: 'inventory',
  storeSales: 'cashier',
  deliveries: 'deliveries',
  onlineSales: 'online_sales',
  studios: 'studios',
  people: 'people',
  admin: 'admin',
};

/** What a page, menu entry or button needs: an item id, a dial step (`admin:manage`), or any one of a list. */
export type AccessNeed = string | readonly string[];

const DIAL_RE = new RegExp(`^(${AREA_IDS.join('|')}):(view|work|manage|full)$`);

export function isDialStep(need: string): boolean {
  return DIAL_RE.test(need);
}

export function dialStep(area: string, step: number): string {
  return `${area}:${STEP_KEYS[step]}`;
}

/** The old level rule, for a user object without `access` (a sign-in from before #53, or a test double). */
function legacyStep(role: UserRole | null | undefined): number {
  if (role === 'Admin' || role === 'Manager') return 3;
  if (role === 'Employee') return 2;
  return -1;
}

type AccessUser = { is_superuser?: boolean; role: User['role']; access?: string[] | null };

/**
 * Does this person hold `need`? The owner always does. Items decide when the list names any (so a personal "no"
 * on an item hides it even when the dial reaches its step); a list of dial steps alone asks for the dial.
 * List both the item and its dial step (`['settings:write', 'admin:manage']`): a single tick then opens it, and a
 * user object without `access` falls back to the old Manager / owner rule through the dial step.
 */
export function canAccess(user: AccessUser | null | undefined, need: AccessNeed | null | undefined): boolean {
  if (need == null || (Array.isArray(need) && need.length === 0)) return true;
  if (!user) return false;
  if (user.is_superuser) return true;
  const needs: readonly string[] = typeof need === 'string' ? [need] : need;
  const dials = needs.filter(isDialStep);
  const items = needs.filter((n) => !isDialStep(n));
  if (Array.isArray(user.access)) {
    const held = new Set(user.access);
    return (items.length ? items : dials).some((n) => held.has(n));
  }
  const step = legacyStep(user.role);
  return dials.some((d) => step >= STEP_KEYS.indexOf(d.split(':')[1] as (typeof STEP_KEYS)[number]));
}
