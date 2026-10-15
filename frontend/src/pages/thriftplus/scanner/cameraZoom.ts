/**
 * Zoom in the scanner's camera window (owner 2026-10-15, APP D13): pure helpers for the levels, their labels, pinch and
 * remembering the last level on the phone. The camera side is in useQrCamera.ts.
 */

export interface ZoomRange {
  min: number;
  max: number;
}

/** A phone with no zoom setting zooms digitally (or with its telephoto, see TELE_AT), from 1× to 3×. */
export const DIGITAL_RANGE: ZoomRange = { min: 1, max: 3 };

/** With no zoom setting, the 3× level opens the phone's telephoto camera when it has one (iPhone Pro models). */
export const TELE_AT = 3;

const ZOOM_KEY = 'tp-scan-zoom';
const TELE_KEY = 'tp-scan-tele';
const EPS = 0.05;

/**
 * The chips: the phone's own levels. 1× plus every whole step the range reaches up to 3× (2×, 3×), and .5× only when
 * the range goes below 1 (an ultra-wide camera; it applies the range's minimum when that is above 0.5).
 */
export function zoomLevels(range: ZoomRange): number[] {
  const out: number[] = [];
  if (range.min < 1 - 1e-3) out.push(Math.max(range.min, 0.5));
  out.push(1);
  for (const z of [2, 3]) if (range.max >= z - 1e-3) out.push(z);
  return out;
}

export function clampZoom(z: number, range: ZoomRange): number {
  if (!Number.isFinite(z)) return Math.min(Math.max(1, range.min), range.max);
  return Math.min(range.max, Math.max(range.min, z));
}

/** "1.4×" for a level between the chips (while pinching), ".7×" below 1. */
export function zoomText(z: number): string {
  const r = Math.round(z * 10) / 10;
  const s = Number.isInteger(r) ? String(r) : r.toFixed(1).replace(/^0/, '');
  return `${s}×`;
}

/** A chip's own label: ".5×" for the ultra-wide one, else "1×", "2×", "3×". */
export function chipText(level: number): string {
  return level < 1 ? '.5×' : zoomText(level);
}

/** The chip that is lit for a zoom: the highest level at or under it (the lowest when it is under them all). */
export function activeLevel(levels: number[], z: number): number {
  let lit = levels[0] ?? 1;
  for (const level of levels) if (z >= level - EPS) lit = level;
  return lit;
}

/** Whether a zoom sits on a chip (else the lit chip shows the zoom itself, like a phone's camera app). */
export function onLevel(level: number, z: number): boolean {
  return Math.abs(level - z) <= EPS;
}

/** Pinch: the zoom at the gesture's start, scaled by how far the fingers moved apart, kept in range. */
export function pinchZoom(start: number, startDistance: number, distance: number, range: ZoomRange): number {
  if (startDistance <= 0) return clampZoom(start, range);
  return clampZoom(start * (distance / startDistance), range);
}

/** Whether a level asks for the telephoto (no zoom setting, and the phone has one). */
export function wantsTele(z: number): boolean {
  return z >= TELE_AT - EPS;
}

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null): void {
  try {
    if (value == null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // Private mode: the level just isn't remembered.
  }
}

/** The last level chosen on this phone, or null. */
export function savedZoom(): number | null {
  const n = Number.parseFloat(read(ZOOM_KEY) ?? '');
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function saveZoom(z: number): void {
  write(ZOOM_KEY, String(Math.round(z * 100) / 100));
}

/** The telephoto camera found on this phone (its device id), so 3× can open it straight away next time. */
export function savedTele(): string | null {
  return read(TELE_KEY) || null;
}

export function saveTele(deviceId: string | null): void {
  write(TELE_KEY, deviceId);
}

/** The back telephoto among the phone's cameras: iPhone Pro models name it "Back Telephoto Camera". */
export function pickTele(devices: Array<Pick<MediaDeviceInfo, 'kind' | 'label' | 'deviceId'>>): string | null {
  const tele = devices.find((d) => d.kind === 'videoinput' && /tele/i.test(d.label) && !/front|user/i.test(d.label) && d.deviceId);
  return tele?.deviceId ?? null;
}
