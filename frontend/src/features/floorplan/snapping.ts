import type { Point } from './geometry';

/** Snap increments offered in the UI, in inches (0 = off). */
export const SNAP_OPTIONS: { value: number; label: string }[] = [
  { value: 0, label: 'Off' },
  { value: 1, label: '1"' },
  { value: 3, label: '3"' },
  { value: 6, label: '6"' },
  { value: 12, label: '1\'' },
];

/** Snap a scalar to the nearest multiple of `snap` (no-op when snap <= 0). */
export function snapValue(value: number, snap: number): number {
  if (snap <= 0) return value;
  return Math.round(value / snap) * snap;
}

export function snapPoint(p: Point, snap: number): Point {
  return { x: snapValue(p.x, snap), y: snapValue(p.y, snap) };
}

/** Snap a size, enforcing a minimum so objects can't collapse to zero. */
export function snapSize(value: number, snap: number, min: number): number {
  const snapped = snapValue(value, snap);
  return Math.max(min, snapped === 0 && snap > 0 ? snap : snapped);
}
