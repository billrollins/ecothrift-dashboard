/**
 * Photo editor state and drawing (Dash #209): turn and crop (geometry), then Look, sliders and Background (pixels).
 * Nothing is kept until Save as new version; a crop is in the turned picture's full-size pixels and may reach past
 * the picture (zoomed out in a ratio frame): the gap shows the Background choice.
 */
import { NO_ADJUST, processPixels, readBackdrop, type Adjust, type Backdrop, type BackdropInfo, type Look, type Rect } from './pixels';

export type Ratio = 'free' | '1:1' | '4:5' | '2:3' | '3:2' | '4:3' | '16:9' | '9:16';
export const RATIOS: Ratio[] = ['free', '1:1', '4:5', '2:3', '3:2', '4:3', '16:9', '9:16'];
export const RATIO_LABEL: Record<Ratio, string> = {
  free: 'Free', '1:1': '1:1', '4:5': '4:5', '2:3': '2:3', '3:2': '3:2', '4:3': '4:3', '16:9': '16:9', '9:16': '9:16',
};
const FLIPPED: Partial<Record<Ratio, Ratio>> = { free: 'free', '1:1': '1:1', '2:3': '3:2', '3:2': '2:3', '16:9': '9:16', '9:16': '16:9' };

export function ratioValue(ratio: Ratio): number | null {
  if (ratio === 'free') return null;
  const [w, h] = ratio.split(':').map(Number);
  return w / h;
}

export type Turns = 0 | 1 | 2 | 3;

export interface EditState {
  /** Quarter turns clockwise. */
  turns: Turns;
  /** The applied crop, in the turned picture's full-size pixels; null = the whole picture. */
  crop: Rect | null;
  /** The ratio the applied crop was made with. */
  ratio: Ratio | null;
  adjust: Adjust;
  look: Look;
  backdrop: Backdrop;
}

export const START: EditState = { turns: 0, crop: null, ratio: null, adjust: NO_ADJUST, look: '', backdrop: null };

export const LOOKS: { key: Exclude<Look, ''>; label: string }[] = [
  { key: 'auto', label: 'Auto' },
  { key: 'vivid', label: 'Vivid' },
  { key: 'warm', label: 'Warm' },
  { key: 'cool', label: 'Cool' },
  { key: 'bw', label: 'B&W' },
];

export const BACKDROPS: { color: string; label: string }[] = [
  { color: '#ffffff', label: 'White' },
  { color: '#000000', label: 'Black' },
  { color: '#bee146', label: 'Lime' },
];

/** Biggest side of a kept edit, as the server keeps it. */
export const MAX_EDGE = 2048;

export function isDirty(s: EditState): boolean {
  const a = s.adjust;
  return Boolean(s.turns || s.crop || s.look || s.backdrop != null || a.brightness || a.contrast || a.saturation || a.warmth || a.hue);
}

export function turnedSize(w: number, h: number, turns: Turns): [number, number] {
  return turns % 2 ? [h, w] : [w, h];
}

/** Turn a quarter (1 = clockwise, -1 = back) and carry the applied crop with the picture. */
export function turn(s: EditState, dir: 1 | -1, w: number, h: number): EditState {
  const [tw, th] = turnedSize(w, h, s.turns);
  const turns = ((s.turns + dir + 4) % 4) as Turns;
  const c = s.crop;
  const crop = c
    ? dir === 1
      ? { x: th - c.y - c.h, y: c.x, w: c.h, h: c.w }
      : { x: c.y, y: tw - c.x - c.w, w: c.h, h: c.w }
    : null;
  return { ...s, turns, crop, ratio: s.ratio ? FLIPPED[s.ratio] ?? null : null };
}

const BACKDROP_NAME: Record<string, string> = {
  '#ffffff': 'White background',
  '#000000': 'Black background',
  '#bee146': 'Lime background',
};

/** A short caption for a kept edit: its two main changes ("Crop 1:1 · Auto"). */
export function editCaption(s: EditState): string {
  const parts: string[] = [];
  if (s.backdrop === 'clear') parts.push('See-through');
  else if (s.backdrop) parts.push(BACKDROP_NAME[s.backdrop.toLowerCase()] ?? 'Color background');
  if (s.crop) parts.push(s.ratio && s.ratio !== 'free' ? `Crop ${s.ratio}` : 'Crop');
  else if (s.turns) parts.push('Turned');
  if (s.look) parts.push(LOOKS.find((l) => l.key === s.look)?.label ?? 'Look');
  const a = s.adjust;
  if (a.brightness || a.contrast) parts.push('Light');
  if (a.saturation || a.warmth || a.hue) parts.push('Color');
  return parts.slice(0, 2).join(' · ') || 'Edit';
}

/** Draw `img` turned and cropped (`crop` null = whole), at `scale`. A crop past the picture leaves see-through gap. */
export function drawGeometry(img: CanvasImageSource, w: number, h: number, turns: Turns, crop: Rect | null, scale: number): HTMLCanvasElement {
  const [tw, th] = turnedSize(w, h, turns);
  const area = crop ?? { x: 0, y: 0, w: tw, h: th };
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(area.w * scale));
  canvas.height = Math.max(1, Math.round(area.h * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no_canvas');
  ctx.imageSmoothingQuality = 'high';
  ctx.setTransform(scale, 0, 0, scale, -area.x * scale, -area.y * scale);
  if (turns === 1) {
    ctx.translate(h, 0);
    ctx.rotate(Math.PI / 2);
  } else if (turns === 2) {
    ctx.translate(w, h);
    ctx.rotate(Math.PI);
  } else if (turns === 3) {
    ctx.translate(0, w);
    ctx.rotate(-Math.PI / 2);
  }
  ctx.drawImage(img, 0, 0, w, h);
  return canvas;
}

/** Read the backdrop of a picture from a small copy. */
export function backdropOf(img: CanvasImageSource, w: number, h: number): BackdropInfo {
  const scale = Math.min(1, 256 / Math.max(w, h));
  const canvas = drawGeometry(img, w, h, 0, null, scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no_canvas');
  return readBackdrop(ctx.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height);
}

function canvasBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('export_failed'))), type, quality);
  });
}

/** The full-size picture for Save as new version: a PNG when see-through, else a JPEG. */
export async function renderFull(img: CanvasImageSource, w: number, h: number, s: EditState, info: BackdropInfo): Promise<Blob> {
  const [tw, th] = turnedSize(w, h, s.turns);
  const area = s.crop ?? { x: 0, y: 0, w: tw, h: th };
  const scale = Math.min(1, MAX_EDGE / Math.max(area.w, area.h));
  const canvas = drawGeometry(img, w, h, s.turns, s.crop, scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no_canvas');
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const clear = processPixels(data.data, data.data, s, info);
  ctx.putImageData(data, 0, 0);
  return clear ? canvasBlob(canvas, 'image/png') : canvasBlob(canvas, 'image/jpeg', 0.92);
}
