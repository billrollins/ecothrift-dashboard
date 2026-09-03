export const FLOOR_NAV_IDS = ['dashboard', 'today', 'pay', 'routines'] as const;

export type FloorNavId = (typeof FLOOR_NAV_IDS)[number];

export const FLOOR_NAV_LABEL_KEYS: Record<FloorNavId, string> = {
  dashboard: 'home',
  today: 'today',
  pay: 'pay',
  routines: 'routines',
};

export const FLOOR_NAV_EXTRA_IDS = ['settings'] as const;

export function isFloorNavId(id: string): id is FloorNavId {
  return (FLOOR_NAV_IDS as readonly string[]).includes(id);
}
