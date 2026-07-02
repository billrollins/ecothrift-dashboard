/**
 * Element palette resolution.
 *
 * Element kinds live in the database (`/api/floorplan/element-kinds/`,
 * Super Admin managed) and are converted to `PaletteEntry` objects for the
 * editor. `STATIC_PALETTE` mirrors the seeded built-ins (migration
 * `floorplan.0004`) and is only used as a placeholder while the catalog
 * query loads, so saved plans render with the right colors on first paint.
 * Unknown kinds in old documents still render as generic rectangles.
 */
import type { FloorPlanElementKind } from '../../types/floorplan.types';

export interface PaletteEntry {
  kind: string;
  label: string;
  category: string;
  /** Default footprint in inches */
  w: number;
  h: number;
  color: string;
  resizable: boolean;
  /** Footprint shape; rect (default) or circle/ellipse filling w×h */
  shape?: 'rect' | 'circle';
  /** Corner radius in inches when shape=rect; 0/undefined = sharp corners */
  cornerRadius?: number;
  /** Asset id preset applied to newly placed elements */
  image?: number;
  /** DB row id (absent for the static placeholder + fallback entries) */
  kindId?: number;
  /** Seeded built-in — editable, not deletable, slug locked */
  isSystem?: boolean;
}

/** Placeholder mirror of the seeded catalog; server data wins once loaded. */
export const STATIC_PALETTE: PaletteEntry[] = [
  // Structural
  { kind: 'wall', label: 'Wall segment', category: 'Structural', w: 96, h: 6, color: '#455a64', resizable: true },
  { kind: 'door', label: 'Door', category: 'Structural', w: 36, h: 6, color: '#8d6e63', resizable: true },
  { kind: 'window', label: 'Window', category: 'Structural', w: 48, h: 6, color: '#90caf9', resizable: true },
  { kind: 'column', label: 'Column', category: 'Structural', w: 12, h: 12, color: '#78909c', resizable: true, shape: 'circle' },

  // Fixtures
  { kind: 'gondola', label: 'Gondola shelf', category: 'Fixtures', w: 48, h: 144, color: '#7986cb', resizable: true },
  { kind: 'wallShelf', label: 'Wall shelf', category: 'Fixtures', w: 24, h: 96, color: '#9575cd', resizable: true },
  { kind: 'displayTable', label: 'Display table', category: 'Fixtures', w: 48, h: 72, color: '#4db6ac', resizable: true },
  { kind: 'rackRound', label: 'Clothing rack (round)', category: 'Fixtures', w: 42, h: 42, color: '#f06292', resizable: true, shape: 'circle' },
  { kind: 'rackStraight', label: 'Clothing rack (straight)', category: 'Fixtures', w: 24, h: 60, color: '#ba68c8', resizable: true },
  { kind: 'bookcase', label: 'Bookcase', category: 'Fixtures', w: 12, h: 36, color: '#a1887f', resizable: true },
  { kind: 'glassCase', label: 'Glass case', category: 'Fixtures', w: 24, h: 48, color: '#4fc3f7', resizable: true },
  { kind: 'binTable', label: 'Bin / dump table', category: 'Fixtures', w: 48, h: 48, color: '#ffb74d', resizable: true },

  // Service
  { kind: 'checkoutCounter', label: 'Checkout counter', category: 'Service', w: 96, h: 30, color: '#81c784', resizable: true },
  { kind: 'register', label: 'Register', category: 'Service', w: 18, h: 18, color: '#66bb6a', resizable: false },
  { kind: 'fittingRoom', label: 'Fitting room', category: 'Service', w: 48, h: 48, color: '#ce93d8', resizable: true },
  { kind: 'cartCorral', label: 'Cart corral', category: 'Service', w: 48, h: 120, color: '#b0bec5', resizable: true },

  // Misc
  { kind: 'pallet', label: 'Pallet', category: 'Misc', w: 48, h: 40, color: '#bcaaa4', resizable: false },
  { kind: 'trash', label: 'Trash / recycle', category: 'Misc', w: 24, h: 24, color: '#90a4ae', resizable: false },
  { kind: 'genericRect', label: 'Generic rectangle', category: 'Misc', w: 48, h: 48, color: '#9e9e9e', resizable: true },
];

export const FALLBACK_ENTRY: PaletteEntry = {
  kind: 'genericRect',
  label: 'Unknown',
  category: 'Misc',
  w: 48,
  h: 48,
  color: '#9e9e9e',
  resizable: true,
};

/** Convert a DB element kind into an editor palette entry. */
export function elementKindToPaletteEntry(kind: FloorPlanElementKind): PaletteEntry {
  return {
    kind: kind.kind,
    label: kind.label,
    category: kind.category,
    w: kind.default_w,
    h: kind.default_h,
    color: kind.fill_color,
    resizable: kind.resizable,
    shape: kind.shape,
    cornerRadius: kind.corner_radius,
    ...(kind.default_image != null ? { image: kind.default_image } : {}),
    kindId: kind.id,
    isSystem: kind.is_system,
  };
}

export type PaletteIndex = Record<string, PaletteEntry>;

export function buildPaletteIndex(entries: PaletteEntry[]): PaletteIndex {
  return Object.fromEntries(entries.map((entry) => [entry.kind, entry]));
}

/** Categories in first-seen order (server orders by category + sort_order). */
export function paletteCategories(entries: PaletteEntry[]): string[] {
  return [...new Set(entries.map((e) => e.category))];
}

export const STATIC_PALETTE_INDEX: PaletteIndex = buildPaletteIndex(STATIC_PALETTE);

export function paletteEntryFor(kind: string, index: PaletteIndex = STATIC_PALETTE_INDEX): PaletteEntry {
  return index[kind] ?? FALLBACK_ENTRY;
}
