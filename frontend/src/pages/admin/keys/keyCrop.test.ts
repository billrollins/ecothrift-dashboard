import { describe, expect, it } from 'vitest';
import { KEY_ASPECT, clampBox, keyBox, photoBox, toSourceRect } from './keyCrop';

describe('keyBox', () => {
  it('runs along the long side, centred', () => {
    const wide = keyBox(1000, 600);
    expect(wide.w / wide.h).toBeCloseTo(KEY_ASPECT);
    expect(wide.w).toBeGreaterThan(wide.h);
    expect(wide.x + wide.w / 2).toBeCloseTo(500);
    const tall = keyBox(400, 800);
    expect(tall.h).toBeGreaterThan(tall.w);
    expect(tall.y + tall.h / 2).toBeCloseTo(400);
  });

  it('never gets wider than 80% of the short side', () => {
    const square = keyBox(500, 500);
    expect(square.h).toBeLessThanOrEqual(400.0001);
  });
});

describe('toSourceRect', () => {
  it('maps a cover-fit box into video pixels', () => {
    // A 1920x1080 video shown cover in a 400x800 frame: scale 800/1080, the sides are cut off.
    const r = toSourceRect({ x: 100, y: 100, w: 200, h: 600 }, 1920, 1080, 400, 800, 'cover');
    const scale = 800 / 1080;
    const ox = (400 - 1920 * scale) / 2;
    expect(r.x).toBe(Math.round((100 - ox) / scale));
    expect(r.y).toBe(Math.round(100 / scale));
    expect(r.h).toBe(Math.round(600 / scale));
  });

  it('maps a contain-fit box and keeps it inside the photo', () => {
    // A 4000x3000 photo shown contain in 800x800: 600 tall, 100 px bars top and bottom.
    const r = toSourceRect({ x: 0, y: 0, w: 800, h: 800 }, 4000, 3000, 800, 800, 'contain');
    expect(r).toEqual({ x: 0, y: 0, w: 4000, h: 3000 });
  });
});

describe('clampBox', () => {
  it('keeps a dragged box in the frame', () => {
    expect(clampBox({ x: -20, y: 700, w: 100, h: 200 }, 400, 800)).toEqual({ x: 0, y: 600, w: 100, h: 200 });
  });
});

describe('photoBox', () => {
  it('follows a sideways photo in a tall frame', () => {
    // A 1600x1200 photo in a 375x600 frame: shown 375x281, centred.
    const box = photoBox(1600, 1200, 375, 600);
    expect(box.w).toBeGreaterThan(box.h);
    expect(box.y + box.h / 2).toBeCloseTo(300);
  });
});
