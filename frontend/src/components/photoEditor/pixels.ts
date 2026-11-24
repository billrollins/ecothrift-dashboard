/**
 * Photo editor pixel math (Dash #209). Our own code on RGBA bytes, not `ctx.filter` (iPhone Safari ignores it), so
 * every browser shows the same picture. Pure functions: they run in tests without a canvas.
 *
 * Order for one pixel: Look, then the sliders (Light and Color) as one color matrix; then Background: a picture with
 * a plain backdrop has every pixel near the backdrop color keyed out (soft edge), and anything see-through (a keyed
 * pixel, a crop gap, a see-through version) shows the Background choice, or stays see-through.
 */

export type Rgb = [number, number, number];

/** Slider values, -100..100; 0 leaves the picture as it is. */
export interface Adjust {
  brightness: number;
  contrast: number;
  saturation: number;
  warmth: number;
  hue: number;
}

export const NO_ADJUST: Adjust = { brightness: 0, contrast: 0, saturation: 0, warmth: 0, hue: 0 };

export type Look = '' | 'auto' | 'vivid' | 'warm' | 'cool' | 'bw';

/** Background choice: null = as it is, 'clear' = see-through, else a #rrggbb color. */
export type Backdrop = null | 'clear' | string;

export interface PixelEdit {
  adjust: Adjust;
  look: Look;
  backdrop: Backdrop;
}

/** What the picture's backdrop is, read from its edges. */
export interface BackdropInfo {
  /** The picture has see-through pixels (a see-through version). */
  seeThrough: boolean;
  /** One plain color all round the edge (white after Remove background), so it can be swapped. */
  plain: boolean;
  color: Rgb;
}

/** 3 x 4 affine color matrix, row by row: [r', g', b'] = M * [r, g, b, 1]. */
export type ColorMatrix = number[];

export const IDENTITY: ColorMatrix = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0];

/** Keying: a pixel this close to the backdrop color (largest channel difference) is backdrop; this far, item. */
export const KEY_NEAR = 14;
export const KEY_FAR = 42;
/** Edge pixels within this distance of the edge median count as the same plain color. */
const PLAIN_SPREAD = 24;
const PLAIN_SHARE = 0.9;

const LUMA: Rgb = [0.2126, 0.7152, 0.0722];

/** a after b: the matrix that applies b first, then a. */
export function compose(a: ColorMatrix, b: ColorMatrix): ColorMatrix {
  const out = new Array<number>(12);
  for (let row = 0; row < 3; row += 1) {
    const r = row * 4;
    for (let col = 0; col < 4; col += 1) {
      let v = a[r] * b[col] + a[r + 1] * b[4 + col] + a[r + 2] * b[8 + col];
      if (col === 3) v += a[r + 3];
      out[r + col] = v;
    }
  }
  return out;
}

function scale(r: number, g: number, b: number, offset = 0): ColorMatrix {
  return [r, 0, 0, offset, 0, g, 0, offset, 0, 0, b, offset];
}

function saturation(s: number): ColorMatrix {
  const [lr, lg, lb] = LUMA;
  return [
    lr * (1 - s) + s, lg * (1 - s), lb * (1 - s), 0,
    lr * (1 - s), lg * (1 - s) + s, lb * (1 - s), 0,
    lr * (1 - s), lg * (1 - s), lb * (1 - s) + s, 0,
  ];
}

function hueRotate(degrees: number): ColorMatrix {
  const rad = (degrees * Math.PI) / 180;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  // The hue-rotate matrix of the CSS filter spec, so it matches what people know from other editors.
  return [
    0.213 + c * 0.787 - s * 0.213, 0.715 - c * 0.715 - s * 0.715, 0.072 - c * 0.072 + s * 0.928, 0,
    0.213 - c * 0.213 + s * 0.143, 0.715 + c * 0.285 + s * 0.14, 0.072 - c * 0.072 - s * 0.283, 0,
    0.213 - c * 0.213 - s * 0.787, 0.715 - c * 0.715 + s * 0.715, 0.072 + c * 0.928 + s * 0.072, 0,
  ];
}

function warmth(w: number): ColorMatrix {
  return scale(1 + w, 1 + w * 0.15, 1 - w);
}

function contrast(c: number): ColorMatrix {
  return scale(c, c, c, 128 * (1 - c));
}

/** The sliders as one matrix: warmth, brightness, contrast, saturation, hue. */
export function adjustMatrix(adjust: Adjust): ColorMatrix {
  let m = IDENTITY;
  if (adjust.warmth) m = compose(warmth((adjust.warmth / 100) * 0.2), m);
  if (adjust.brightness) {
    const k = 1 + adjust.brightness / 200;
    m = compose(scale(k, k, k), m);
  }
  if (adjust.contrast) m = compose(contrast(1 + (adjust.contrast / 100) * 0.7), m);
  if (adjust.saturation) m = compose(saturation(1 + adjust.saturation / 100), m);
  if (adjust.hue) m = compose(hueRotate(adjust.hue * 1.8), m);
  return m;
}

/** Auto: per-channel levels from the 0.5% and 99.5% points (which also evens out a color cast), gain at most 2.5. */
export function autoLevels(px: Uint8ClampedArray): ColorMatrix {
  const hist = [new Uint32Array(256), new Uint32Array(256), new Uint32Array(256)];
  let n = 0;
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] < 128) continue;
    hist[0][px[i]] += 1;
    hist[1][px[i + 1]] += 1;
    hist[2][px[i + 2]] += 1;
    n += 1;
  }
  if (!n) return IDENTITY;
  const cut = n * 0.005;
  const gains: number[] = [];
  const offsets: number[] = [];
  for (const h of hist) {
    let lo = 0;
    for (let seen = 0; lo < 255 && seen + h[lo] <= cut; lo += 1) seen += h[lo];
    let hi = 255;
    for (let seen = 0; hi > 0 && seen + h[hi] <= cut; hi -= 1) seen += h[hi];
    let range = Math.max(1, hi - lo);
    if (range < 102) {
      const mid = (hi + lo) / 2;
      range = 102;
      lo = Math.max(0, Math.min(255 - range, mid - range / 2));
    }
    gains.push(255 / range);
    offsets.push((-lo * 255) / range);
  }
  return [gains[0], 0, 0, offsets[0], 0, gains[1], 0, offsets[1], 0, 0, gains[2], offsets[2]];
}

export function lookMatrix(look: Look, px?: Uint8ClampedArray): ColorMatrix {
  switch (look) {
    case 'auto':
      return px ? autoLevels(px) : IDENTITY;
    case 'vivid':
      return compose(saturation(1.35), contrast(1.1));
    case 'warm':
      return compose(saturation(1.05), warmth(0.08));
    case 'cool':
      return warmth(-0.08);
    case 'bw':
      return compose(contrast(1.06), saturation(0));
    default:
      return IDENTITY;
  }
}

export function hexToRgb(hex: string): Rgb {
  const v = /^#?([0-9a-f]{6})$/i.exec(hex.trim())?.[1] ?? 'ffffff';
  return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16)];
}

/** How much a pixel is backdrop: 1 = backdrop, 0 = item, a soft ramp between. */
export function keyness(r: number, g: number, b: number, key: Rgb): number {
  const d = Math.max(Math.abs(r - key[0]), Math.abs(g - key[1]), Math.abs(b - key[2]));
  if (d <= KEY_NEAR) return 1;
  if (d >= KEY_FAR) return 0;
  return (KEY_FAR - d) / (KEY_FAR - KEY_NEAR);
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 255;
}

/** Read the backdrop from the picture's edge band (2% of the short side). */
export function readBackdrop(px: Uint8ClampedArray, w: number, h: number): BackdropInfo {
  for (let i = 3; i < px.length; i += 4) {
    if (px[i] < 250) return { seeThrough: true, plain: true, color: [255, 255, 255] };
  }
  const band = Math.max(1, Math.round(Math.min(w, h) * 0.02));
  const rs: number[] = [];
  const gs: number[] = [];
  const bs: number[] = [];
  for (let y = 0; y < h; y += 1) {
    const edgeRow = y < band || y >= h - band;
    for (let x = 0; x < w; x += 1) {
      if (!edgeRow && x >= band && x < w - band) {
        x = w - band - 1; // skip the middle of the row to its right-hand band
        continue;
      }
      const i = (y * w + x) * 4;
      rs.push(px[i]);
      gs.push(px[i + 1]);
      bs.push(px[i + 2]);
    }
  }
  const color: Rgb = [median(rs), median(gs), median(bs)];
  let near = 0;
  for (let k = 0; k < rs.length; k += 1) {
    const d = Math.max(Math.abs(rs[k] - color[0]), Math.abs(gs[k] - color[1]), Math.abs(bs[k] - color[2]));
    if (d <= PLAIN_SPREAD) near += 1;
  }
  return { seeThrough: false, plain: rs.length > 0 && near / rs.length >= PLAIN_SHARE, color };
}

/** True when the edit changes no pixel colors (geometry aside). */
export function isPlainEdit(edit: PixelEdit): boolean {
  const a = edit.adjust;
  return !edit.look && edit.backdrop == null && !a.brightness && !a.contrast && !a.saturation && !a.warmth && !a.hue;
}

/**
 * Apply Look, sliders and Background to `src` into `out` (they may be the same array). Returns whether the result
 * has see-through pixels (then it is kept as a PNG).
 */
export function processPixels(src: Uint8ClampedArray, out: Uint8ClampedArray, edit: PixelEdit, info: BackdropInfo): boolean {
  const m = compose(adjustMatrix(edit.adjust), lookMatrix(edit.look, edit.look === 'auto' ? src : undefined));
  const fill: Rgb | null =
    edit.backdrop === 'clear' ? null : edit.backdrop ? hexToRgb(edit.backdrop) : info.seeThrough ? null : [255, 255, 255];
  const key = edit.backdrop != null && info.plain && !info.seeThrough ? info.color : null;
  const [m0, m1, m2, m3, m4, m5, m6, m7, m8, m9, m10, m11] = m;
  let clear = false;
  for (let i = 0; i < src.length; i += 4) {
    const a = src[i + 3];
    if (a === 0 && fill === null) {
      out[i] = 0;
      out[i + 1] = 0;
      out[i + 2] = 0;
      out[i + 3] = 0;
      clear = true;
      continue;
    }
    const r = src[i];
    const g = src[i + 1];
    const b = src[i + 2];
    const alpha = (a / 255) * (key ? 1 - keyness(r, g, b, key) : 1);
    let nr = m0 * r + m1 * g + m2 * b + m3;
    let ng = m4 * r + m5 * g + m6 * b + m7;
    let nb = m8 * r + m9 * g + m10 * b + m11;
    if (fill) {
      nr = nr * alpha + fill[0] * (1 - alpha);
      ng = ng * alpha + fill[1] * (1 - alpha);
      nb = nb * alpha + fill[2] * (1 - alpha);
      out[i + 3] = 255;
    } else {
      out[i + 3] = alpha * 255;
      if (alpha < 0.999) clear = true;
    }
    out[i] = nr;
    out[i + 1] = ng;
    out[i + 2] = nb;
  }
  return clear;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The item's box: the pixels that are not backdrop (or not see-through). Null when nothing stands out. */
export function contentBox(px: Uint8ClampedArray, w: number, h: number, info: BackdropInfo): Rect | null {
  const rows = new Uint32Array(h);
  const cols = new Uint32Array(w);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = (y * w + x) * 4;
      const item = info.seeThrough ? px[i + 3] > 40 : keyness(px[i], px[i + 1], px[i + 2], info.color) < 0.5;
      if (item) {
        rows[y] += 1;
        cols[x] += 1;
      }
    }
  }
  // A stray speck is not the item: a row or column counts when 0.4% of it is item.
  const rowMin = Math.max(1, Math.round(w * 0.004));
  const colMin = Math.max(1, Math.round(h * 0.004));
  let top = 0;
  while (top < h && rows[top] < rowMin) top += 1;
  let bottom = h - 1;
  while (bottom > top && rows[bottom] < rowMin) bottom -= 1;
  let left = 0;
  while (left < w && cols[left] < colMin) left += 1;
  let right = w - 1;
  while (right > left && cols[right] < colMin) right -= 1;
  if (top >= h || left >= w) return null;
  return { x: left, y: top, w: right - left + 1, h: bottom - top + 1 };
}
