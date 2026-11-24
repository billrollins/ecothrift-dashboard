import { describe, expect, it } from 'vitest';
import { editCaption, START, turn } from './editState';
import { adjustMatrix, autoLevels, contentBox, NO_ADJUST, processPixels, readBackdrop, type BackdropInfo, type PixelEdit } from './pixels';

const WHITE_BACKDROP: BackdropInfo = { seeThrough: false, plain: true, color: [255, 255, 255] };
const NO_EDIT: PixelEdit = { adjust: NO_ADJUST, look: '', backdrop: null };

function px(...pixels: number[][]): Uint8ClampedArray {
  return new Uint8ClampedArray(pixels.flat());
}

/** A w x h picture of `bg` with a `fg` square from (x0, y0) to (x1, y1), exclusive. */
function picture(w: number, h: number, bg: number[], fg: number[], x0: number, y0: number, x1: number, y1: number) {
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      out.set(x >= x0 && x < x1 && y >= y0 && y < y1 ? fg : bg, (y * w + x) * 4);
    }
  }
  return out;
}

describe('photo editor pixels', () => {
  it('leaves the picture as it is when nothing is set', () => {
    const src = px([200, 30, 30, 255], [12, 34, 56, 255]);
    const out = new Uint8ClampedArray(src.length);
    expect(processPixels(src, out, NO_EDIT, WHITE_BACKDROP)).toBe(false);
    expect([...out]).toEqual([...src]);
  });

  it('fills a crop gap with white by default, and with the Background choice', () => {
    const src = px([0, 0, 0, 0]);
    const out = new Uint8ClampedArray(4);
    processPixels(src, out, NO_EDIT, WHITE_BACKDROP);
    expect([...out]).toEqual([255, 255, 255, 255]);
    processPixels(src, out, { ...NO_EDIT, backdrop: '#bee146' }, WHITE_BACKDROP);
    expect([...out]).toEqual([190, 225, 70, 255]);
  });

  it('keys out a plain backdrop: see-through, or a new color, the item untouched', () => {
    const src = px([255, 255, 255, 255], [250, 252, 251, 255], [200, 30, 30, 255]);
    const out = new Uint8ClampedArray(src.length);
    expect(processPixels(src, out, { ...NO_EDIT, backdrop: 'clear' }, WHITE_BACKDROP)).toBe(true);
    expect([out[3], out[7], out[11]]).toEqual([0, 0, 255]);
    expect(processPixels(src, out, { ...NO_EDIT, backdrop: '#000000' }, WHITE_BACKDROP)).toBe(false);
    expect([...out]).toEqual([0, 0, 0, 255, 0, 0, 0, 255, 200, 30, 30, 255]);
  });

  it('keeps a see-through version see-through, or lays it on the color picked', () => {
    const info: BackdropInfo = { seeThrough: true, plain: true, color: [255, 255, 255] };
    const src = px([10, 200, 10, 0], [10, 200, 10, 255]);
    const out = new Uint8ClampedArray(src.length);
    expect(processPixels(src, out, NO_EDIT, info)).toBe(true);
    expect([out[3], out[7]]).toEqual([0, 255]);
    expect(processPixels(src, out, { ...NO_EDIT, backdrop: '#ffffff' }, info)).toBe(false);
    expect([...out]).toEqual([255, 255, 255, 255, 10, 200, 10, 255]);
  });

  it('turns the sliders into one color matrix', () => {
    const m = adjustMatrix({ ...NO_ADJUST, brightness: 100 });
    expect(m[0] * 100).toBeCloseTo(150);
    const gray = adjustMatrix({ ...NO_ADJUST, saturation: -100 });
    const r = gray[0] * 200 + gray[1] * 30 + gray[2] * 30;
    const g = gray[4] * 200 + gray[5] * 30 + gray[6] * 30;
    expect(r).toBeCloseTo(g);
  });

  it('Auto stretches a dull picture to full range, at most 2.5x', () => {
    const src = new Uint8ClampedArray(1410 * 4);
    for (let i = 0; i < 1410; i += 1) src.set([60 + (i % 141), 60 + (i % 141), 60 + (i % 141), 255], i * 4);
    const m = autoLevels(src);
    expect(m[0] * 60 + m[3]).toBeLessThan(5);
    expect(m[0] * 200 + m[3]).toBeGreaterThan(250);
    const flat = new Uint8ClampedArray(400 * 4);
    for (let i = 0; i < 400; i += 1) flat.set([100 + (i % 51), 100 + (i % 51), 100 + (i % 51), 255], i * 4);
    expect(autoLevels(flat)[0]).toBeCloseTo(2.5);
  });

  it('reads the backdrop: plain white, busy, or see-through', () => {
    expect(readBackdrop(picture(20, 20, [255, 255, 255, 255], [200, 30, 30, 255], 5, 5, 15, 15), 20, 20))
      .toEqual({ seeThrough: false, plain: true, color: [255, 255, 255] });
    const busy = new Uint8ClampedArray(20 * 20 * 4);
    for (let i = 0; i < 400; i += 1) busy.set([(i * 37) % 256, (i * 91) % 256, (i * 13) % 256, 255], i * 4);
    expect(readBackdrop(busy, 20, 20).plain).toBe(false);
    expect(readBackdrop(picture(4, 4, [0, 0, 0, 0], [9, 9, 9, 255], 1, 1, 3, 3), 4, 4).seeThrough).toBe(true);
  });

  it('finds the item for Crop to content', () => {
    const src = picture(40, 30, [255, 255, 255, 255], [200, 30, 30, 255], 10, 5, 25, 20);
    expect(contentBox(src, 40, 30, WHITE_BACKDROP)).toEqual({ x: 10, y: 5, w: 15, h: 15 });
    expect(contentBox(picture(10, 10, [255, 255, 255, 255], [0, 0, 0, 255], 0, 0, 0, 0), 10, 10, WHITE_BACKDROP)).toBeNull();
  });
});

describe('photo editor state', () => {
  it('turning carries the applied crop with the picture, and back again', () => {
    const s = { ...START, crop: { x: 10, y: 5, w: 20, h: 10 }, ratio: '2:3' as const };
    const right = turn(s, 1, 100, 50);
    expect(right.turns).toBe(1);
    expect(right.crop).toEqual({ x: 35, y: 10, w: 10, h: 20 });
    expect(right.ratio).toBe('3:2');
    expect(turn(right, -1, 100, 50).crop).toEqual(s.crop);
  });

  it('captions a kept edit by its two main changes', () => {
    expect(editCaption(START)).toBe('Edit');
    expect(editCaption({ ...START, crop: { x: 0, y: 0, w: 1, h: 1 }, ratio: '1:1', look: 'auto' })).toBe('Crop 1:1 · Auto');
    expect(editCaption({ ...START, backdrop: 'clear', adjust: { ...NO_ADJUST, brightness: 10 } })).toBe('See-through · Light');
    expect(editCaption({ ...START, backdrop: '#123456' })).toBe('Color background');
  });
});
