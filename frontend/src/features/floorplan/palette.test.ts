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
    is_wall: false,
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

describe('wall composites', () => {
  it('a room composite places four grouped 8-foot wall segments', async () => {
    const { WALL_COMPOSITES, compositeToElements } = await import('./palette');
    const room = WALL_COMPOSITES.find((e) => e.kind === 'wallsRoom')!;
    let n = 0;
    const els = compositeToElements(room, { x: 100, y: 200 }, () => `el_${++n}`, 'gr_1');
    expect(els).toHaveLength(4);
    // Every segment is a plain wall, 96" long and 6" thick in raw dims
    for (const el of els) {
      expect(el.kind).toBe('wall');
      expect(el.w).toBe(96);
      expect(el.h).toBe(6);
      expect(el.group).toBe('gr_1');
    }
    // Two horizontal (rot 0), two vertical (rot 90)
    expect(els.filter((e) => e.rotation === 0)).toHaveLength(2);
    expect(els.filter((e) => e.rotation === 90)).toHaveLength(2);
    // Top wall sits at the origin
    expect(els[0]).toMatchObject({ x: 100, y: 200, rotation: 0 });
  });

  it('L composite has two walls, U has three', async () => {
    const { WALL_COMPOSITES } = await import('./palette');
    expect(WALL_COMPOSITES.find((e) => e.kind === 'wallsL')!.composite!.parts).toHaveLength(2);
    expect(WALL_COMPOSITES.find((e) => e.kind === 'wallsU')!.composite!.parts).toHaveLength(3);
  });
});
