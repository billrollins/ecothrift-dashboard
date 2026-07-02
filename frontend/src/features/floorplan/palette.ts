/**
 * v1 element palette.
 *
 * To add a new element: append an entry here. `kind` must be unique and
 * stable (it is persisted in plan documents). Sizes are in inches.
 * Unknown kinds in old documents still render as generic rectangles.
 */

export interface PaletteEntry {
  kind: string;
  label: string;
  category: string;
  /** Default footprint in inches */
  w: number;
  h: number;
  color: string;
  resizable: boolean;
  /** Asset id preset for custom image entries (not part of the static palette) */
  image?: number;
}

export const PALETTE: PaletteEntry[] = [
  // Structural
  { kind: 'wall', label: 'Wall segment', category: 'Structural', w: 96, h: 6, color: '#455a64', resizable: true },
  { kind: 'door', label: 'Door', category: 'Structural', w: 36, h: 6, color: '#8d6e63', resizable: true },
  { kind: 'window', label: 'Window', category: 'Structural', w: 48, h: 6, color: '#90caf9', resizable: true },
  { kind: 'column', label: 'Column', category: 'Structural', w: 12, h: 12, color: '#78909c', resizable: true },

  // Fixtures
  { kind: 'gondola', label: 'Gondola shelf', category: 'Fixtures', w: 48, h: 144, color: '#7986cb', resizable: true },
  { kind: 'wallShelf', label: 'Wall shelf', category: 'Fixtures', w: 24, h: 96, color: '#9575cd', resizable: true },
  { kind: 'displayTable', label: 'Display table', category: 'Fixtures', w: 48, h: 72, color: '#4db6ac', resizable: true },
  { kind: 'rackRound', label: 'Clothing rack (round)', category: 'Fixtures', w: 42, h: 42, color: '#f06292', resizable: true },
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

export const PALETTE_BY_KIND: Record<string, PaletteEntry> = Object.fromEntries(
  PALETTE.map((entry) => [entry.kind, entry]),
);

export const PALETTE_CATEGORIES: string[] = [...new Set(PALETTE.map((e) => e.category))];

export const FALLBACK_ENTRY: PaletteEntry = {
  kind: 'genericRect',
  label: 'Unknown',
  category: 'Misc',
  w: 48,
  h: 48,
  color: '#9e9e9e',
  resizable: true,
};

export function paletteEntryFor(kind: string): PaletteEntry {
  return PALETTE_BY_KIND[kind] ?? FALLBACK_ENTRY;
}
