import { describe, expect, it } from 'vitest';
import {
  coverCrop,
  exportPlan,
  FRAME_HEIGHTS,
  FRAME_WIDTH,
  frameGeometry,
  LAYOUT_ZONES,
  wrapLines,
  zoneAt,
} from './socialFrame';
import { placePhoto } from './SocialPostEditorPage';

const inside = (outer: { x: number; y: number; w: number; h: number }, inner: { x: number; y: number; w: number; h: number }) =>
  inner.x >= outer.x - 0.01 && inner.y >= outer.y - 0.01
  && inner.x + inner.w <= outer.x + outer.w + 0.01 && inner.y + inner.h <= outer.y + outer.h + 0.01;

describe('socialFrame geometry', () => {
  it('draws Facebook sizes at 1080 wide, with room for 9:16 later', () => {
    expect(FRAME_WIDTH).toBe(1080);
    expect(FRAME_HEIGHTS).toEqual({ '1:1': 1080, '4:5': 1350, '9:16': 1920 });
  });

  it('gives each layout its zones, all inside the photo area and above the brand bar', () => {
    for (const layout of ['hero', 'hero3', 'grid4'] as const) {
      for (const size of ['1:1', '4:5', '9:16'] as const) {
        const g = frameGeometry(layout, size);
        expect(g.zones).toHaveLength(LAYOUT_ZONES[layout]);
        g.zones.forEach((z) => {
          expect(inside(g.photos, z)).toBe(true);
          expect(z.y + z.h).toBeLessThanOrEqual(g.bar.y);
        });
        expect(g.hook!.y + g.hook!.h).toBeLessThanOrEqual(g.photos.y);
      }
    }
  });

  it('keeps 9:16 words out of the top and bottom 250 px', () => {
    const g = frameGeometry('hero', '9:16');
    expect(g.hook!.y).toBeGreaterThanOrEqual(250);
    expect(g.bar.y).toBeLessThanOrEqual(1920 - 250);
  });

  it('finds the zone under a tap', () => {
    const g = frameGeometry('hero3', '4:5');
    const small = g.zones[2];
    expect(zoneAt(g, small.x + 5, small.y + 5)).toBe(2);
    expect(zoneAt(g, 2, 2)).toBe(-1);
  });

  it('crops a photo to fill a zone without stretching', () => {
    const crop = coverCrop(4000, 3000, { x: 0, y: 0, w: 500, h: 500 });
    expect(crop.sw).toBeCloseTo(3000);
    expect(crop.sh).toBeCloseTo(3000);
    expect(crop.sx).toBeCloseTo(500);
  });
});

describe('wrapLines', () => {
  const measure = (t: string) => t.length * 10;
  it('wraps to the width and marks words that do not fit', () => {
    expect(wrapLines('one two three four', 100, 2, measure)).toEqual(['one two', 'three four']);
    expect(wrapLines('one two three four five six', 100, 2, measure)).toEqual(['one two', 'three four…']);
  });
});

describe('export plan', () => {
  it('saves the frame, then each extra photo in its own framed image', () => {
    expect(exportPlan('hero3', 4)).toHaveLength(1);
    const plan = exportPlan('hero', 3);
    expect(plan.map((p) => [p.from, p.count, p.withHook])).toEqual([[0, 1, true], [1, 1, false], [2, 1, false]]);
  });
});

describe('placePhoto', () => {
  it('fills, replaces and moves photos between zones', () => {
    expect(placePhoto([], 0, 7)).toEqual([7]);
    expect(placePhoto([1, 2], 2, 3)).toEqual([1, 2, 3]);
    expect(placePhoto([1, 2, 3], 1, 9)).toEqual([1, 9, 3]);
    expect(placePhoto([1, 2, 3], 0, 3)).toEqual([3, 2, 1]);
  });
});
