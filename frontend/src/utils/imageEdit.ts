/** Canvas helpers for crop/rotate export used by ImageViewerDialog. */

export type PixelCrop = {
  x: number;
  y: number;
  width: number;
  height: number;
};

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
