/**
 * The key box and the crop math for key photos. A key lies long, so the box is 2.4 times as long as it is wide and
 * runs along the longer side of the picture (portrait phone: up and down).
 */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const KEY_ASPECT = 2.4;
/** The saved crop's long side, in pixels. */
export const CROP_MAX_SIDE = 1600;

/** The key box centred in a `cw` x `ch` frame: `fraction` of the long side, never wider than `maxShort` of the short side. */
export function keyBox(cw: number, ch: number, fraction = 0.86, maxShort = 0.8): Rect {
  const tall = ch > cw;
  const long = tall ? ch : cw;
  const short = tall ? cw : ch;
  let boxLong = long * fraction;
  let boxShort = boxLong / KEY_ASPECT;
  if (boxShort > short * maxShort) {
    boxShort = short * maxShort;
    boxLong = boxShort * KEY_ASPECT;
  }
  const w = tall ? boxShort : boxLong;
  const h = tall ? boxLong : boxShort;
  return { x: (cw - w) / 2, y: (ch - h) / 2, w, h };
}

/**
 * A box drawn over a picture shown at `cw` x `ch` with CSS object-fit (`cover` for the live camera, `contain` for a
 * photo), as a rectangle in the picture's own pixels (`iw` x `ih`), kept inside the picture.
 */
export function toSourceRect(box: Rect, iw: number, ih: number, cw: number, ch: number, fit: 'cover' | 'contain'): Rect {
  const scale = fit === 'cover' ? Math.max(cw / iw, ch / ih) : Math.min(cw / iw, ch / ih);
  const ox = (cw - iw * scale) / 2;
  const oy = (ch - ih * scale) / 2;
  const x0 = Math.max(0, (box.x - ox) / scale);
  const y0 = Math.max(0, (box.y - oy) / scale);
  const x1 = Math.min(iw, (box.x + box.w - ox) / scale);
  const y1 = Math.min(ih, (box.y + box.h - oy) / scale);
  return { x: Math.round(x0), y: Math.round(y0), w: Math.max(1, Math.round(x1 - x0)), h: Math.max(1, Math.round(y1 - y0)) };
}

/**
 * The key box over a photo shown with object-fit contain: it runs along the photo's long side (not the frame's), so a
 * sideways photo of a key gets a sideways box, centred on the photo.
 */
export function photoBox(iw: number, ih: number, cw: number, ch: number, fraction = 0.86): Rect {
  const scale = Math.min(cw / iw, ch / ih);
  const w = iw * scale;
  const h = ih * scale;
  const box = keyBox(w, h, fraction, 1);
  return { ...box, x: box.x + (cw - w) / 2, y: box.y + (ch - h) / 2 };
}

/** Keep a dragged box inside the frame. */
export function clampBox(box: Rect, cw: number, ch: number): Rect {
  const w = Math.min(box.w, cw);
  const h = Math.min(box.h, ch);
  return { w, h, x: Math.min(Math.max(0, box.x), cw - w), y: Math.min(Math.max(0, box.y), ch - h) };
}

/** Draw `src` of an image or video frame onto a canvas (long side at most CROP_MAX_SIDE) and return a JPEG. */
export function cropToJpeg(source: CanvasImageSource, src: Rect, quality = 0.9): Promise<Blob> {
  const scale = Math.min(1, CROP_MAX_SIDE / Math.max(src.w, src.h));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(src.w * scale));
  canvas.height = Math.max(1, Math.round(src.h * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) return Promise.reject(new Error('no canvas'));
  ctx.drawImage(source, src.x, src.y, src.w, src.h, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('no photo'))), 'image/jpeg', quality),
  );
}
