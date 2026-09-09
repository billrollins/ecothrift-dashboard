/** Canvas helpers for crop/rotate export used by ImageViewerDialog. */

export type PixelCrop = {
  x: number;
  y: number;
  width: number;
  height: number;
};

/** Crop rectangle as percent of the current image (0–100). */
export type PctRect = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export const WHOLE_PCT: PctRect = { x: 0, y: 0, w: 100, h: 100 };

const PCT_EPS = 1e-6;

const JPEG_QUALITY = 0.85;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.addEventListener('load', () => resolve(img));
    img.addEventListener('error', () => reject(new Error('image_load_failed')));
    if (!src.startsWith('blob:') && !src.startsWith('data:')) {
      img.crossOrigin = 'anonymous';
    }
    img.src = src;
  });
}

function normalizeRotation(rotation: number): number {
  return ((rotation % 360) + 360) % 360;
}

/**
 * Draw `image` onto a canvas after rotating about center by `rotation` degrees.
 */
function rotateImageToCanvas(image: HTMLImageElement, rotation: number): HTMLCanvasElement {
  const rot = normalizeRotation(rotation);
  const radians = (rot * Math.PI) / 180;
  const sin = Math.abs(Math.sin(radians));
  const cos = Math.abs(Math.cos(radians));
  const w = image.naturalWidth;
  const h = image.naturalHeight;
  const rw = Math.round(w * cos + h * sin);
  const rh = Math.round(w * sin + h * cos);
  const canvas = document.createElement('canvas');
  canvas.width = rw;
  canvas.height = rh;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no_canvas');
  ctx.translate(rw / 2, rh / 2);
  ctx.rotate(radians);
  ctx.drawImage(image, -w / 2, -h / 2);
  return canvas;
}

function canvasToJpegBlob(canvas: HTMLCanvasElement, quality = JPEG_QUALITY): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('jpeg_export_failed'));
          return;
        }
        resolve(blob);
      },
      'image/jpeg',
      quality,
    );
  });
}

/**
 * Largest pixel-aspect `cropAspect` (width/height) centered inside `within`.
 * `imageAspect` is naturalWidth / naturalHeight so percent space maps to pixels.
 */
export function centerAspectPct(
  within: PctRect,
  cropAspect: number,
  imageAspect: number,
): PctRect {
  const imgAspect = imageAspect > 0 ? imageAspect : 1;
  const aspect = cropAspect > 0 ? cropAspect : 1;
  const px = (within.x / 100) * imgAspect;
  const py = within.y / 100;
  const pw = (within.w / 100) * imgAspect;
  const ph = within.h / 100;
  if (pw < PCT_EPS || ph < PCT_EPS) return { ...within };
  let cw: number;
  let ch: number;
  if (pw / ph > aspect) {
    ch = ph;
    cw = ph * aspect;
  } else {
    cw = pw;
    ch = pw / aspect;
  }
  const cx = px + (pw - cw) / 2;
  const cy = py + (ph - ch) / 2;
  return {
    x: (cx / imgAspect) * 100,
    y: cy * 100,
    w: (cw / imgAspect) * 100,
    h: ch * 100,
  };
}

export function centerSquarePct(within: PctRect, imageAspect: number): PctRect {
  return centerAspectPct(within, 1, imageAspect);
}

export function rectFits(inner: PctRect, outer: PctRect, epsilon = 0.05): boolean {
  return (
    inner.x >= outer.x - epsilon &&
    inner.y >= outer.y - epsilon &&
    inner.x + inner.w <= outer.x + outer.w + epsilon &&
    inner.y + inner.h <= outer.y + outer.h + epsilon
  );
}

export function pctToNatural(rect: PctRect, width: number, height: number): PixelCrop {
  return {
    x: (rect.x / 100) * width,
    y: (rect.y / 100) * height,
    width: (rect.w / 100) * width,
    height: (rect.h / 100) * height,
  };
}

/** Express `rect` (percent of the original) as percent of the Full trim. */
export function rebaseToTrim(rect: PctRect, full: PctRect): PctRect {
  if (full.w < PCT_EPS || full.h < PCT_EPS) return { ...WHOLE_PCT };
  return {
    x: ((rect.x - full.x) / full.w) * 100,
    y: ((rect.y - full.y) / full.h) * 100,
    w: (rect.w / full.w) * 100,
    h: (rect.h / full.h) * 100,
  };
}

export function storedCropToPct(
  stored: { x: number; y: number; w: number; h: number },
  naturalWidth: number,
  naturalHeight: number,
): PctRect {
  if (naturalWidth < 1 || naturalHeight < 1) return { ...WHOLE_PCT };
  return {
    x: (stored.x / naturalWidth) * 100,
    y: (stored.y / naturalHeight) * 100,
    w: (stored.w / naturalWidth) * 100,
    h: (stored.h / naturalHeight) * 100,
  };
}

export function pctToApiCrop(
  rect: PctRect,
  width: number,
  height: number,
): { x: number; y: number; w: number; h: number } {
  const n = pctToNatural(rect, width, height);
  return {
    x: Math.round(n.x),
    y: Math.round(n.y),
    w: Math.max(1, Math.round(n.width)),
    h: Math.max(1, Math.round(n.height)),
  };
}

/**
 * Scale a crop measured against the *displayed* image box to natural image pixels
 * (react-image-crop `PixelCrop` is in rendered CSS pixels).
 */
export function scaleDisplayCropToNatural(
  image: HTMLImageElement,
  crop: PixelCrop,
): PixelCrop {
  const scaleX = image.naturalWidth / image.width;
  const scaleY = image.naturalHeight / image.height;
  return {
    x: crop.x * scaleX,
    y: crop.y * scaleY,
    width: crop.width * scaleX,
    height: crop.height * scaleY,
  };
}

/** Crop `imageSrc` using a natural-pixel crop rectangle. */
export async function getCroppedJpeg(
  imageSrc: string,
  crop: PixelCrop,
  quality = JPEG_QUALITY,
): Promise<Blob> {
  const image = await loadImage(imageSrc);
  const canvas = document.createElement('canvas');
  const width = Math.max(1, Math.round(crop.width));
  const height = Math.max(1, Math.round(crop.height));
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no_canvas');
  ctx.drawImage(
    image,
    Math.round(crop.x),
    Math.round(crop.y),
    width,
    height,
    0,
    0,
    width,
    height,
  );
  return canvasToJpegBlob(canvas, quality);
}

/**
 * Crop using a display-pixel crop from react-image-crop + the rendered `<img>` element.
 */
export async function getCroppedJpegFromDisplay(
  image: HTMLImageElement,
  displayCrop: PixelCrop,
  quality = JPEG_QUALITY,
): Promise<Blob> {
  const natural = scaleDisplayCropToNatural(image, displayCrop);
  const canvas = document.createElement('canvas');
  const width = Math.max(1, Math.round(natural.width));
  const height = Math.max(1, Math.round(natural.height));
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no_canvas');
  ctx.drawImage(
    image,
    Math.round(natural.x),
    Math.round(natural.y),
    width,
    height,
    0,
    0,
    width,
    height,
  );
  return canvasToJpegBlob(canvas, quality);
}

/** Rotate-only export (full frame). */
export async function getRotatedJpeg(
  imageSrc: string,
  rotation = 0,
  quality = JPEG_QUALITY,
): Promise<Blob> {
  const image = await loadImage(imageSrc);
  const rotated = rotateImageToCanvas(image, rotation);
  return canvasToJpegBlob(rotated, quality);
}

export type ImageAdjustments = {
  /** 100 = unchanged. */
  brightness: number;
  /** 100 = unchanged. */
  contrast: number;
};

function clampByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function applyPixelAdjustments(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  brightness: number,
  contrast: number,
): void {
  const data = ctx.getImageData(0, 0, width, height);
  const px = data.data;
  const intercept = 128 * (1 - contrast);
  for (let i = 0; i < px.length; i += 4) {
    px[i] = clampByte(px[i] * brightness * contrast + intercept);
    px[i + 1] = clampByte(px[i + 1] * brightness * contrast + intercept);
    px[i + 2] = clampByte(px[i + 2] * brightness * contrast + intercept);
  }
  ctx.putImageData(data, 0, 0);
}

function drawWithAdjustments(
  ctx: CanvasRenderingContext2D,
  image: CanvasImageSource,
  width: number,
  height: number,
  adjustments: ImageAdjustments,
): void {
  const brightness = adjustments.brightness / 100;
  const contrast = adjustments.contrast / 100;
  const supportsFilter = typeof ctx.filter === 'string';
  if (supportsFilter && (brightness !== 1 || contrast !== 1)) {
    ctx.filter = `brightness(${brightness}) contrast(${contrast})`;
    ctx.drawImage(image, 0, 0, width, height);
    ctx.filter = 'none';
    return;
  }
  ctx.drawImage(image, 0, 0, width, height);
  if (brightness !== 1 || contrast !== 1) {
    applyPixelAdjustments(ctx, width, height, brightness, contrast);
  }
}

/** Full-frame JPEG with brightness / contrast applied. */
export async function getAdjustedJpeg(
  imageSrc: string,
  adjustments: ImageAdjustments,
  quality = JPEG_QUALITY,
): Promise<Blob> {
  return getEditedJpeg(imageSrc, { adjustments, quality });
}

/** Adjust, then optional natural-pixel crop, then JPEG. */
export async function getEditedJpeg(
  imageSrc: string,
  options?: {
    crop?: PixelCrop;
    adjustments?: ImageAdjustments;
    quality?: number;
  },
): Promise<Blob> {
  const image = await loadImage(imageSrc);
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no_canvas');
  const adjustments = options?.adjustments ?? { brightness: 100, contrast: 100 };
  drawWithAdjustments(ctx, image, canvas.width, canvas.height, adjustments);
  const crop = options?.crop;
  if (!crop || crop.width < 1 || crop.height < 1) {
    return canvasToJpegBlob(canvas, options?.quality ?? JPEG_QUALITY);
  }
  const out = document.createElement('canvas');
  const width = Math.max(1, Math.round(crop.width));
  const height = Math.max(1, Math.round(crop.height));
  out.width = width;
  out.height = height;
  const octx = out.getContext('2d');
  if (!octx) throw new Error('no_canvas');
  octx.drawImage(
    canvas,
    Math.round(crop.x),
    Math.round(crop.y),
    width,
    height,
    0,
    0,
    width,
    height,
  );
  return canvasToJpegBlob(out, options?.quality ?? JPEG_QUALITY);
}
