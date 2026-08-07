/**
 * Pure geometry helpers for the floorplan editor.
 *
 * World units are INCHES. The viewport maps world → screen with a single
 * uniform scale (screen px per inch) plus a translation, so coordinates
 * survive any zoom level without drift.
 */

export interface Viewport {
  /** World x (inches) at the left edge of the screen */
  x: number;
  /** World y (inches) at the top edge of the screen */
  y: number;
  /** Screen pixels per inch */
  scale: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const MIN_SCALE = 0.05; // very zoomed out
export const MAX_SCALE = 40; // very zoomed in

export function worldToScreen(p: Point, vp: Viewport): Point {
  return { x: (p.x - vp.x) * vp.scale, y: (p.y - vp.y) * vp.scale };
}

export function screenToWorld(p: Point, vp: Viewport): Point {
  return { x: p.x / vp.scale + vp.x, y: p.y / vp.scale + vp.y };
}

/** Zoom keeping the given screen point fixed (e.g. cursor-centered wheel zoom). */
export function zoomAt(vp: Viewport, screenPoint: Point, factor: number): Viewport {
  const scale = clamp(vp.scale * factor, MIN_SCALE, MAX_SCALE);
  if (scale === vp.scale) return vp;
  const world = screenToWorld(screenPoint, vp);
  return {
    scale,
    x: world.x - screenPoint.x / scale,
    y: world.y - screenPoint.y / scale,
  };
}

export function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

/** Axis-aligned bounding box of a rect rotated by 0/90/180/270 about its center. */
export function rotatedBounds(rect: Rect, rotation: number): Rect {
  const rot = ((rotation % 360) + 360) % 360;
  if (rot === 90 || rot === 270) {
    const cx = rect.x + rect.w / 2;
    const cy = rect.y + rect.h / 2;
    return { x: cx - rect.h / 2, y: cy - rect.w / 2, w: rect.h, h: rect.w };
  }
  return { ...rect };
}

/**
 * Inverse of `rotatedBounds`: given the desired on-floor (visual) footprint of
 * an element rotated by 0/90/180/270, return the raw unrotated rect to store.
 * The visual rect's center is preserved; at 90/270 w/h swap back.
 */
export function rawRectFromVisual(visual: Rect, rotation: number): Rect {
  const rot = ((rotation % 360) + 360) % 360;
  if (rot === 90 || rot === 270) {
    const cx = visual.x + visual.w / 2;
    const cy = visual.y + visual.h / 2;
    return { x: cx - visual.h / 2, y: cy - visual.w / 2, w: visual.h, h: visual.w };
  }
  return { ...visual };
}

export function rectsIntersect(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export function rectContainsPoint(r: Rect, p: Point): boolean {
  return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
}

/** Normalize a rect that may have negative w/h (from dragging up/left). */
export function normalizeRect(r: Rect): Rect {
  return {
    x: r.w < 0 ? r.x + r.w : r.x,
    y: r.h < 0 ? r.y + r.h : r.y,
    w: Math.abs(r.w),
    h: Math.abs(r.h),
  };
}

export function pathBounds(points: [number, number][]): Rect {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of points) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

// ── Unit formatting ──────────────────────────────────────────────────────────

/** Format inches as feet + inches, e.g. 54 → 4' 6". */
export function formatInches(inches: number): string {
  const sign = inches < 0 ? '-' : '';
  const abs = Math.abs(inches);
  const feet = Math.floor(abs / 12);
  const rem = Math.round((abs - feet * 12) * 100) / 100;
  if (feet === 0) return `${sign}${rem}"`;
  if (rem === 0) return `${sign}${feet}'`;
  return `${sign}${feet}' ${rem}"`;
}

/** Parse user input like `4' 6"`, `4.5'`, `54`, `54"` into inches. Returns null if invalid. */
export function parseInches(input: string): number | null {
  const s = input.trim();
  if (!s) return null;
  const feetInch = s.match(/^(-?\d+(?:\.\d+)?)\s*'\s*(?:(\d+(?:\.\d+)?)\s*"?)?$/);
  if (feetInch) {
    const feet = parseFloat(feetInch[1]);
    const inch = feetInch[2] ? parseFloat(feetInch[2]) : 0;
    return feet * 12 + Math.sign(feet || 1) * inch;
  }
  const inchOnly = s.match(/^(-?\d+(?:\.\d+)?)\s*"?$/);
  if (inchOnly) return parseFloat(inchOnly[1]);
  return null;
}

/**
 * Pick a "nice" scale-bar length in inches for the current zoom.
 * Targets ~15-40% of the given available screen width.
 */
export function pickScaleBarLength(scale: number, availablePx: number): number {
  const candidates = [1, 3, 6, 12, 24, 60, 120, 240, 600, 1200, 2400, 6000];
  const target = availablePx * 0.28;
  let best = candidates[0];
  for (const c of candidates) {
    if (Math.abs(c * scale - target) < Math.abs(best * scale - target)) best = c;
  }
  return best;
}
