/**
 * Lining the pins of the old Current plan up on a new plan of another size (#130): one uniform scale, then a move,
 * in plan inches. The server applies the same formula when it copies the pins (apps/floorplan/versions.py).
 */
import type { PinTransform } from '../../types/floorplan.types';

/** How far outside the plan a pin may sit (inches), as on the server. */
export const PIN_MARGIN = 240;

export const IDENTITY: PinTransform = { scale: 1, dx: 0, dy: 0 };

export interface Size {
  width: number;
  height: number;
}

export function applyTransform(point: { x: number; y: number }, t: PinTransform): { x: number; y: number } {
  return { x: point.x * t.scale + t.dx, y: point.y * t.scale + t.dy };
}

/**
 * A first guess: the same shape at another size → scale to fit the width; another shape → no scale, centred.
 * The owner adjusts from there.
 */
export function suggestTransform(from: Size, to: Size): PinTransform {
  if (from.width <= 0 || from.height <= 0) return IDENTITY;
  const sameShape = Math.abs(from.width / from.height - to.width / to.height) / (to.width / to.height) < 0.02;
  if (sameShape) return { scale: round(to.width / from.width, 4), dx: 0, dy: 0 };
  return { scale: 1, dx: round((to.width - from.width) / 2, 1), dy: round((to.height - from.height) / 2, 1) };
}

/** True when the point lands further outside the plan than a pin may sit (the server sets those at the edge). */
export function isOffPlan(point: { x: number; y: number }, size: Size, margin = PIN_MARGIN): boolean {
  return point.x < -margin || point.y < -margin || point.x > size.width + margin || point.y > size.height + margin;
}

export function round(value: number, places: number): number {
  const f = 10 ** places;
  return Math.round(value * f) / f;
}
