import type { PhotoSheetFields } from '../../api/photoSheets.api';
import { FACT_KEYS, MAX_PHOTOS, type SheetPhoto } from './sheetLayouts';
import { pickLayout } from './sheetPlan';

/** Small, pure steps the photo sheet editor takes (kept here so they are easy to test). */

export function emptySheet(): PhotoSheetFields {
  return {
    title: '',
    name: '',
    brand: '',
    facts: { size: '', in_box: '', condition: '', good_to_know: '' },
    layout: 'one',
    orientation: 'portrait',
    photos: [],
    show_price: false,
    show_item_number: false,
    caption: 'product',
    not_assembled: false,
  };
}

/** Swap two photos on the sheet (each keeps its own Fit or Fill and its turn). */
export function swapPhotos(photos: SheetPhoto[], a: number, b: number): SheetPhoto[] {
  if (a === b || a < 0 || b < 0 || a >= photos.length || b >= photos.length) return photos;
  const next = photos.slice();
  [next[a], next[b]] = [next[b], next[a]];
  return next;
}

export function turnPhoto(photos: SheetPhoto[], index: number): SheetPhoto[] {
  return photos.map((photo, n) => (n === index ? { ...photo, turn: (photo.turn + 90) % 360 } : photo));
}

export function setFit(photos: SheetPhoto[], index: number, fit: SheetPhoto['fit']): SheetPhoto[] {
  return photos.map((photo, n) => (n === index ? { ...photo, fit } : photo));
}

export function removePhoto(photos: SheetPhoto[], index: number): SheetPhoto[] {
  return photos.filter((_, n) => n !== index);
}

/**
 * New photos go after the ones there, on Fit, so the item is never cut (D24): a small photo on Fill cut the top off
 * a coffee maker in the first try. Fill stays one tap away for a photo of a room or a close-up.
 */
export function addPhotos(photos: SheetPhoto[], added: Omit<SheetPhoto, 'fit' | 'turn'>[]): SheetPhoto[] {
  const room = Math.max(0, MAX_PHOTOS - photos.length);
  return [...photos, ...added.slice(0, room).map((photo) => ({ ...photo, fit: 'fit' as const, turn: 0 }))];
}

/** After the photos change: Dash picks the template until the processor picks one (D24). */
export function withPhotos(fields: PhotoSheetFields, photos: SheetPhoto[], layoutChosen: boolean): PhotoSheetFields {
  if (layoutChosen) return { ...fields, photos };
  return { ...fields, photos, ...pickLayout(photos) };
}

/** The fields to send: facts trimmed, every key present. */
export function sheetBody(fields: PhotoSheetFields): PhotoSheetFields {
  const facts = Object.fromEntries(FACT_KEYS.map((key) => [key, (fields.facts[key] ?? '').trim()])) as PhotoSheetFields['facts'];
  return { ...fields, title: fields.title.trim(), name: fields.name.trim(), brand: fields.brand.trim(), facts };
}

/** The AI's draft goes into the boxes a person left empty; what someone typed stays. */
export function mergeAiDraft(
  fields: PhotoSheetFields,
  draft: { title: string; name?: string; facts: PhotoSheetFields['facts'] },
  { keepTitle }: { keepTitle: boolean },
): { fields: PhotoSheetFields; filled: string[] } {
  const filled: string[] = [];
  let name = fields.name;
  if (!name.trim() && draft.name?.trim() && fields.title.trim().length > 40) {
    name = draft.name.trim();
    filled.push('name');
  }
  const facts = { ...fields.facts };
  for (const key of FACT_KEYS) {
    if (!facts[key]?.trim() && draft.facts[key]?.trim()) {
      facts[key] = draft.facts[key].trim();
      filled.push(key);
    }
  }
  let title = fields.title;
  if (!keepTitle && draft.title.trim() && draft.title.trim() !== fields.title.trim()) {
    title = draft.title.trim();
    filled.push('title');
  }
  return { fields: { ...fields, title, name, facts }, filled };
}
