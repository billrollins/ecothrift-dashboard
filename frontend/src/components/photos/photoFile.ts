/** Small helpers the photo drawer and the Add photo control share. */
import { markPhotoDropUsed } from '../../api/photoDrops.api';

/** Which drawer photo a picked file came from, for screens that mark it used only once they really save. */
const DROP_OF_FILE = new WeakMap<File, number>();

export function rememberDrop(file: File, dropId: number): File {
  DROP_OF_FILE.set(file, dropId);
  return file;
}

/** A turned or cropped copy of a picked photo: still the same drawer photo. */
export function editedPhotoFile(from: File, blob: Blob): File {
  const file = new File([blob], from.name.replace(/\.[a-z0-9]+$/i, '') + '.jpg', { type: 'image/jpeg', lastModified: Date.now() });
  const id = DROP_OF_FILE.get(from);
  if (id != null) DROP_OF_FILE.set(file, id);
  return file;
}

/**
 * A form that holds its photos until Send or Save calls this when the save went through. Files that did not come
 * from the drawer are skipped. The mark is a note for the person, so a failed mark is never an error.
 */
export async function markPhotosUsed(files: Array<File | null | undefined>, where: string): Promise<void> {
  const ids = files.map((file) => (file ? DROP_OF_FILE.get(file) : undefined)).filter((id): id is number => id != null);
  if (!ids.length) return;
  await Promise.allSettled(ids.map((id) => markPhotoDropUsed(id, where)));
}

/** Long side of a photo saved to the drawer; the server keeps the same limit. */
export const DROP_MAX_EDGE = 2048;
const DROP_QUALITY = 0.85;

export function isPhotoFile(file: File): boolean {
  return file.type.startsWith('image/') || /\.(jpe?g|png|webp|gif|heic|heif|bmp)$/i.test(file.name);
}

export function photoFileName(prefix = 'photo'): string {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `${prefix}-${stamp}.jpg`;
}

export function blobToPhotoFile(blob: Blob, name = photoFileName()): File {
  return new File([blob], name, { type: blob.type || 'image/jpeg', lastModified: Date.now() });
}

function canvasToJpeg(canvas: HTMLCanvasElement, quality = DROP_QUALITY): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('jpeg_export_failed'))), 'image/jpeg', quality);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image_load_failed'));
    img.src = src;
  });
}

/**
 * Shrink a phone photo before it goes up, so a drop saves in a second or two on the store Wi-Fi instead of
 * sending 8 MB. Returns the photo as it was when the browser cannot read it (the server then shrinks it).
 */
export async function shrinkPhoto(photo: Blob, maxEdge = DROP_MAX_EDGE): Promise<Blob> {
  if (typeof document === 'undefined' || typeof URL.createObjectURL !== 'function') return photo;
  const src = URL.createObjectURL(photo);
  try {
    const img = await loadImage(src);
    const longest = Math.max(img.naturalWidth, img.naturalHeight);
    if (!longest) return photo;
    const scale = Math.min(1, maxEdge / longest);
    if (scale === 1 && photo.type === 'image/jpeg' && photo.size < 1_500_000) return photo;
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) return photo;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return await canvasToJpeg(canvas);
  } catch {
    return photo;
  } finally {
    URL.revokeObjectURL(src);
  }
}

/** One frame of a playing video as a JPEG (the webcam's Take photo). */
export async function videoFrameToJpeg(video: HTMLVideoElement): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx || !canvas.width || !canvas.height) throw new Error('no_frame');
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvasToJpeg(canvas, 0.9);
}
