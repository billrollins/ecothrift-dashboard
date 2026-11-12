/**
 * Move and zoom a picture inside its frame (Dash Update #108, Bill 11-12): "click a picture to select it, then drag to
 * move the picture inside its frame and zoom in and out; the frame and layout never move, only the crop."
 *
 * The frame comes from the sheet plan (sheetPlan.ts) and never reads the crop. The crop is three numbers on the photo:
 * `zoom` (1 = as Fit or Fill shows it), and `x`, `y`, how far the picture's centre moves, as a share of the frame. They
 * are shares, not inches, so the preview (drawn at true size and scaled down) and the printed sheet place the picture
 * exactly alike. All sizes here are in inches.
 */
import type { SheetPhoto } from './sheetLayouts';

export const ZOOM_MIN = 0.5;
export const ZOOM_MAX = 5;

export interface Crop { zoom: number; x: number; y: number }
export const NO_CROP: Crop = { zoom: 1, x: 0, y: 0 };

export function cropOf(photo: Pick<SheetPhoto, 'zoom' | 'x' | 'y'>): Crop {
  const num = (value: unknown, fallback: number) => (typeof value === 'number' && Number.isFinite(value) ? value : fallback);
  return { zoom: clamp(num(photo.zoom, 1), ZOOM_MIN, ZOOM_MAX), x: num(photo.x, 0), y: num(photo.y, 0) };
}

export function isCropped(photo: Pick<SheetPhoto, 'zoom' | 'x' | 'y'>): boolean {
  const crop = cropOf(photo);
  return Math.abs(crop.zoom - 1) > 0.005 || Math.abs(crop.x) > 0.002 || Math.abs(crop.y) > 0.002;
}

/** Where the picture sits in its frame: its size (as it stands, after its turn) and its centre's shift, in inches. */
export interface Placed {
  w: number;
  h: number;
  dx: number;
  dy: number;
  /** The crop as it was drawn: the shift held so the picture never leaves its frame. */
  crop: Crop;
}

/**
 * Place a picture in a frame. `cover`: the picture fills the frame (Fill, or a frame stretched a little past the
 * picture's shape); else the whole picture shows (Fit). Then the zoom, then the shift, held so that a picture bigger
 * than its frame always covers it (no white gap at an edge) and one smaller stays wholly inside.
 */
export function placePicture(
  photo: Pick<SheetPhoto, 'width' | 'height' | 'turn' | 'zoom' | 'x' | 'y'>,
  frame: { w: number; h: number },
  cover: boolean,
): Placed {
  const crop = cropOf(photo);
  const quarter = ((photo.turn % 180) + 180) % 180 === 90;
  const frameAspect = frame.h > 0 ? frame.w / frame.h : 1;
  let aspect = frameAspect;
  if (photo.width > 0 && photo.height > 0) aspect = quarter ? photo.height / photo.width : photo.width / photo.height;
  const wider = aspect > frameAspect;
  let w: number;
  let h: number;
  if (wider === cover) {
    h = frame.h;
    w = frame.h * aspect;
  } else {
    w = frame.w;
    h = frame.w / aspect;
  }
  w *= crop.zoom;
  h *= crop.zoom;
  const mx = Math.abs(w - frame.w) / 2;
  const my = Math.abs(h - frame.h) / 2;
  const dx = clamp(crop.x * frame.w, -mx, mx);
  const dy = clamp(crop.y * frame.h, -my, my);
  return {
    w, h, dx, dy,
    crop: { zoom: crop.zoom, x: frame.w ? round(dx / frame.w) : 0, y: frame.h ? round(dy / frame.h) : 0 },
  };
}

/** A new crop after a drag of (`dxShare`, `dyShare`) of the frame from where the drag began, held inside the frame. */
export function dragCrop(
  photo: Pick<SheetPhoto, 'width' | 'height' | 'turn'>,
  start: Crop,
  dxShare: number,
  dyShare: number,
  frame: { w: number; h: number },
  cover: boolean,
): Crop {
  return placePicture({ ...photo, ...start, x: start.x + dxShare, y: start.y + dyShare }, frame, cover).crop;
}

/** A new crop at another zoom, the picture's centre held where it was (as far as the frame allows). */
export function zoomCrop(
  photo: Pick<SheetPhoto, 'width' | 'height' | 'turn'>,
  start: Crop,
  zoom: number,
  frame: { w: number; h: number },
  cover: boolean,
): Crop {
  const next = clamp(zoom, ZOOM_MIN, ZOOM_MAX);
  // The shift grows with the zoom, so the part of the picture in the middle of the frame stays in the middle.
  const k = start.zoom ? next / start.zoom : 1;
  return placePicture({ ...photo, zoom: next, x: start.x * k, y: start.y * k }, frame, cover).crop;
}

/** Each photo's own crop, set or reset; the frames and the other photos stay as they are. */
export function setCrop(photos: SheetPhoto[], index: number, crop: Crop | null): SheetPhoto[] {
  return photos.map((photo, n) => {
    if (n !== index) return photo;
    const c = crop ?? NO_CROP;
    return { ...photo, zoom: c.zoom, x: c.x, y: c.y };
  });
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

function round(value: number): number {
  return Math.round(value * 10000) / 10000;
}
