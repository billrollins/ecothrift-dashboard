import { describe, expect, it } from 'vitest';
import {
  formatInches,
  normalizeRect,
  parseInches,
  pathBounds,
  pickScaleBarLength,
  rectsIntersect,
  rotatedBounds,
  screenToWorld,
  worldToScreen,
  zoomAt,
  type Viewport,
} from './geometry';

describe('world/screen transform', () => {
  const viewports: Viewport[] = [
    { x: 0, y: 0, scale: 1 },
    { x: -40, y: -40, scale: 0.8 },
    { x: 123.5, y: -77.25, scale: 0.05 },
    { x: 1000, y: 2000, scale: 40 },
  ];

  it('round-trips coordinates exactly-enough at any zoom (no drift)', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 120, y: 48 },
      { x: 0.125, y: 1199.875 },
      { x: -50.5, y: 33.333 },
    ];
    for (const vp of viewports) {
      for (const p of points) {
        const back = screenToWorld(worldToScreen(p, vp), vp);
        expect(back.x).toBeCloseTo(p.x, 9);
        expect(back.y).toBeCloseTo(p.y, 9);
      }
    }
  });

  it('repeated zoom in/out returns to the same world point under the cursor', () => {
    let vp: Viewport = { x: -40, y: -40, scale: 0.8 };
    const cursor = { x: 400, y: 300 };
    const anchor = screenToWorld(cursor, vp);
    for (let i = 0; i < 25; i++) vp = zoomAt(vp, cursor, 1.25);
    for (let i = 0; i < 25; i++) vp = zoomAt(vp, cursor, 1 / 1.25);
    const after = screenToWorld(cursor, vp);
    expect(after.x).toBeCloseTo(anchor.x, 6);
    expect(after.y).toBeCloseTo(anchor.y, 6);
  });

  it('zoomAt keeps the world point under the cursor fixed', () => {
    const vp: Viewport = { x: 10, y: 20, scale: 2 };
    const cursor = { x: 150, y: 90 };
    const before = screenToWorld(cursor, vp);
    const zoomed = zoomAt(vp, cursor, 3);
    const after = screenToWorld(cursor, zoomed);
    expect(after.x).toBeCloseTo(before.x, 9);
    expect(after.y).toBeCloseTo(before.y, 9);
  });

  it('zoomAt clamps scale', () => {
    const vp: Viewport = { x: 0, y: 0, scale: 1 };
    expect(zoomAt(vp, { x: 0, y: 0 }, 1e9).scale).toBe(40);
    expect(zoomAt(vp, { x: 0, y: 0 }, 1e-9).scale).toBe(0.05);
  });
});

describe('rotatedBounds', () => {
  it('swaps w/h for 90 and 270 about the center', () => {
    const rect = { x: 10, y: 20, w: 40, h: 100 };
    for (const rot of [90, 270, -90, 450]) {
      const b = rotatedBounds(rect, rot);
      expect(b.w).toBe(100);
      expect(b.h).toBe(40);
      // center preserved
      expect(b.x + b.w / 2).toBeCloseTo(rect.x + rect.w / 2);
      expect(b.y + b.h / 2).toBeCloseTo(rect.y + rect.h / 2);
    }
  });

  it('is identity for 0 and 180', () => {
    const rect = { x: 1, y: 2, w: 3, h: 4 };
    expect(rotatedBounds(rect, 0)).toEqual(rect);
    expect(rotatedBounds(rect, 180)).toEqual(rect);
  });
});

describe('rect helpers', () => {
  it('normalizeRect handles negative sizes', () => {
    expect(normalizeRect({ x: 10, y: 10, w: -4, h: -6 })).toEqual({ x: 6, y: 4, w: 4, h: 6 });
  });

  it('rectsIntersect', () => {
    const a = { x: 0, y: 0, w: 10, h: 10 };
    expect(rectsIntersect(a, { x: 5, y: 5, w: 10, h: 10 })).toBe(true);
    expect(rectsIntersect(a, { x: 11, y: 0, w: 5, h: 5 })).toBe(false);
  });

  it('pathBounds', () => {
    expect(pathBounds([[1, 2], [5, -3], [0, 10]])).toEqual({ x: 0, y: -3, w: 5, h: 13 });
  });
});

describe('unit formatting', () => {
  it('formats inches as feet + inches', () => {
    expect(formatInches(54)).toBe(`4' 6"`);
    expect(formatInches(48)).toBe(`4'`);
    expect(formatInches(11)).toBe('11"');
    expect(formatInches(0)).toBe('0"');
  });

  it('parses feet/inch strings', () => {
    expect(parseInches(`4' 6"`)).toBe(54);
    expect(parseInches(`4'`)).toBe(48);
    expect(parseInches('54')).toBe(54);
    expect(parseInches('54"')).toBe(54);
    expect(parseInches('4.5\'')).toBe(54);
    expect(parseInches('abc')).toBeNull();
    expect(parseInches('')).toBeNull();
  });

  it('format/parse round-trips', () => {
    for (const v of [0, 1, 11.5, 12, 54, 144, 1199]) {
      expect(parseInches(formatInches(v))).toBeCloseTo(v, 6);
    }
  });
});

describe('pickScaleBarLength', () => {
  it('returns a nice length near the target width', () => {
    const len = pickScaleBarLength(1, 320); // target ~90px at 1 px/inch
    expect([60, 120]).toContain(len);
  });
});

describe('rawRectFromVisual', () => {
  it('round-trips with rotatedBounds at every 90° step', async () => {
    const { rotatedBounds, rawRectFromVisual } = await import('./geometry');
    const raw = { x: 10, y: 20, w: 48, h: 144 };
    for (const rot of [0, 90, 180, 270]) {
      const visual = rotatedBounds(raw, rot);
      expect(rawRectFromVisual(visual, rot)).toEqual(raw);
    }
  });

  it('maps a resized visual footprint back to swapped raw w/h at 90°', async () => {
    const { rawRectFromVisual } = await import('./geometry');
    // Want a 144-wide × 22-deep visual footprint at rotation 90
    const raw = rawRectFromVisual({ x: 0, y: 0, w: 144, h: 22 }, 90);
    expect(raw.w).toBe(22);
    expect(raw.h).toBe(144);
    // Center preserved: visual center (72, 11) == raw center
    expect(raw.x + raw.w / 2).toBe(72);
    expect(raw.y + raw.h / 2).toBe(11);
  });
});
