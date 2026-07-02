import { describe, expect, it } from 'vitest';
import type { FloorPlanElementKind } from '../../types/floorplan.types';
import {
  buildPaletteIndex,
  elementKindToPaletteEntry,
  FALLBACK_ENTRY,
  paletteCategories,
  paletteEntryFor,
  STATIC_PALETTE,
} from './palette';

function makeKind(overrides: Partial<FloorPlanElementKind> = {}): FloorPlanElementKind {
  return {
    id: 7,
    kind: 'vinyl-crate',
    label: 'Vinyl crate',
    category: 'Fixtures',
    default_w: 30,
    default_h: 24,
    fill_color: '#123abc',
    default_image: null,
    shape: 'rect',
    corner_radius: 2,
    resizable: true,
    is_system: false,
    sort_order: 0,
    is_active: true,
    created_at: '2026-07-02T00:00:00Z',
    updated_at: '2026-07-02T00:00:00Z',
    ...overrides,
  };
}

describe('elementKindToPaletteEntry', () => {
  it('maps DB fields onto the editor entry', () => {
    const entry = elementKindToPaletteEntry(makeKind());
    expect(entry).toMatchObject({
      kind: 'vinyl-crate',
      label: 'Vinyl crate',
      category: 'Fixtures',
      w: 30,
      h: 24,
      color: '#123abc',
      resizable: true,
      shape: 'rect',
      cornerRadius: 2,
      kindId: 7,
      isSystem: false,
    });
    expect(entry.image).toBeUndefined();
  });

  it('carries the default image as a placement preset', () => {
    const entry = elementKindToPaletteEntry(makeKind({ default_image: 42 }));
    expect(entry.image).toBe(42);
  });
});

describe('paletteEntryFor', () => {
  it('falls back to a generic rect for unknown kinds', () => {
    const index = buildPaletteIndex(STATIC_PALETTE);
    expect(paletteEntryFor('not-a-kind', index)).toBe(FALLBACK_ENTRY);
    expect(paletteEntryFor('gondola', index).color).toBe('#7986cb');
  });

  it('renders legacy circle kinds as circles in the static mirror', () => {
    const index = buildPaletteIndex(STATIC_PALETTE);
    expect(paletteEntryFor('rackRound', index).shape).toBe('circle');
    expect(paletteEntryFor('column', index).shape).toBe('circle');
    expect(paletteEntryFor('gondola', index).shape).toBeUndefined();
  });
});

describe('paletteCategories', () => {
  it('preserves first-seen category order', () => {
    expect(paletteCategories(STATIC_PALETTE)).toEqual(['Structural', 'Fixtures', 'Service', 'Misc']);
  });
});
