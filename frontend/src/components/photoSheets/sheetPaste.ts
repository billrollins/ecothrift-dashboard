/**
 * Pasting is the main way a picture gets onto a photo sheet (Bill, 2026-11-11): a processor searches the web for the
 * item, copies a picture and pastes it. These small rules read what was pasted or dragged in.
 */
import type { SheetPhoto } from './sheetLayouts';
import { placePicture } from './sheetCrop';
import type { Rect } from './sheetPlan';

/** Pixels per inch below which a picture may print fuzzy. */
export const FUZZY_PPI = 110;

/**
 * The picture in what was pasted or dropped: the first <img> of copied web content, else a plain link or a data:
 * picture. '' when there is none (plain words are left to the box they were pasted in).
 */
export function pictureLinkFrom(html: string | null | undefined, text: string | null | undefined): string {
  const img = /<img[^>]+src\s*=\s*["']([^"']+)["']/i.exec(html ?? '');
  const fromHtml = img ? img[1].replace(/&amp;/g, '&').trim() : '';
  if (/^(https?:\/\/|data:image\/)/i.test(fromHtml)) return fromHtml;
  const plain = (text ?? '').trim().split(/\s+/)[0] ?? '';
  if (/^data:image\//i.test(plain)) return plain;
  if (/^https?:\/\/\S+$/i.test(plain) && !/\s/.test((text ?? '').trim())) return plain;
  return '';
}

/** An image search for the title, in a new tab (like Google it on the product window). */
export function findPicturesUrl(brand: string, title: string): string {
  const words = [brand.trim(), title.trim()].filter(Boolean);
  // The brand only once when the title already starts with it.
  const query = words.length === 2 && words[1].toLowerCase().startsWith(words[0].toLowerCase()) ? words[1] : words.join(' ');
  return `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(query)}`;
}

/** 'fuzzy' when the picture has too few pixels for the space it prints in; flagged, never refused. Zooming in (#108)
 * spreads the same pixels wider, so it counts. */
export function printQuality(photo: Pick<SheetPhoto, 'width' | 'height' | 'turn' | 'fit' | 'zoom' | 'x' | 'y'>, rect: Rect): 'ok' | 'fuzzy' {
  if (!photo.width || !photo.height || !rect.w || !rect.h) return 'ok';
  const quarter = ((photo.turn % 180) + 180) % 180 === 90;
  const w = quarter ? photo.height : photo.width;
  // How wide the picture prints, as it stands: Fit shows it whole, Fill covers the space, then the zoom.
  const placed = placePicture(photo, rect, photo.fit === 'fill' || Boolean(rect.crop));
  const ppi = w / placed.w;
  return ppi < FUZZY_PPI ? 'fuzzy' : 'ok';
}
