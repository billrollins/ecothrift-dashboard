// Two floor tabs: Dashboard (the store's numbers) and Today (shift, routines, hours and pay).
// Routines and Pay live inside Today; their old tabs are gone.
export const FLOOR_NAV_IDS = ['dashboard', 'today'] as const;

export type FloorNavId = (typeof FLOOR_NAV_IDS)[number];

export const FLOOR_NAV_LABEL_KEYS: Record<FloorNavId, string> = {
  dashboard: 'dashboard',
  today: 'today',
};

export const FLOOR_NAV_EXTRA_IDS = ['settings'] as const;

export function isFloorNavId(id: string): id is FloorNavId {
  return (FLOOR_NAV_IDS as readonly string[]).includes(id);
}
