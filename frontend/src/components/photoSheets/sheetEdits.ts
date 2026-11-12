import type { PhotoSheetFields, SheetAiDraft } from '../../api/photoSheets.api';
import { NO_CROP } from './sheetCrop';
import { FACT_KEYS, FACT_LABEL, LABEL_MAX, MAX_PHOTOS, type FactKey, type SheetPhoto } from './sheetLayouts';
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
    contrast: 0,
    labels: {},
    typed: [],
  };
}

/** The boxes a person can type, by the name the sheet keeps in `typed` (#108). */
export const TYPED_KEYS = [
  'title', 'name', 'brand', ...FACT_KEYS, ...FACT_KEYS.map((key) => `label.${key}`), 'caption', 'not_assembled',
] as const;

/** The boxes a person typed: a sheet saved before #108 has no list, and every word there counts as typed. */
export function typedOf(fields: Pick<PhotoSheetFields, 'typed'>): Set<string> {
  return new Set(Array.isArray(fields.typed) ? fields.typed : TYPED_KEYS);
}

/** A person typed in this box: Clean up with AI leaves it alone from now on. */
export function markTyped(fields: PhotoSheetFields, ...keys: string[]): PhotoSheetFields {
  const typed = typedOf(fields);
  keys.forEach((key) => typed.add(key));
  return { ...fields, typed: TYPED_KEYS.filter((key) => typed.has(key)) };
}

/** Swap two photos on the sheet (each keeps its own Fit or Fill and its turn). */
export function swapPhotos(photos: SheetPhoto[], a: number, b: number): SheetPhoto[] {
  if (a === b || a < 0 || b < 0 || a >= photos.length || b >= photos.length) return photos;
  const next = photos.slice();
  [next[a], next[b]] = [next[b], next[a]];
  return next;
}

/** A turn or a new Fit/Fill starts the picture's crop over: the old one was made for another shape (#108). */
export function turnPhoto(photos: SheetPhoto[], index: number): SheetPhoto[] {
  return photos.map((photo, n) => (n === index ? { ...photo, ...NO_CROP, turn: (photo.turn + 90) % 360 } : photo));
}

export function setFit(photos: SheetPhoto[], index: number, fit: SheetPhoto['fit']): SheetPhoto[] {
  return photos.map((photo, n) => (n === index && photo.fit !== fit ? { ...photo, ...NO_CROP, fit } : photo));
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
  return [...photos, ...added.slice(0, room).map((photo) => ({ ...photo, fit: 'fit' as const, turn: 0, ...NO_CROP }))];
}

/** After the photos change: Dash picks the template until the processor picks one (D24). */
export function withPhotos(fields: PhotoSheetFields, photos: SheetPhoto[], layoutChosen: boolean): PhotoSheetFields {
  if (layoutChosen) return { ...fields, photos };
  return { ...fields, photos, ...pickLayout(photos) };
}

/** The fields to send: facts trimmed, every key present; a label only where it differs from the standard one. */
export function sheetBody(fields: PhotoSheetFields): PhotoSheetFields {
  const facts = Object.fromEntries(FACT_KEYS.map((key) => [key, (fields.facts[key] ?? '').trim()])) as PhotoSheetFields['facts'];
  const labels: PhotoSheetFields['labels'] = {};
  for (const key of FACT_KEYS) {
    const label = (fields.labels?.[key] ?? '').trim().slice(0, LABEL_MAX);
    if (label && label !== FACT_LABEL[key]) labels[key] = label;
  }
  return { ...fields, title: fields.title.trim(), name: fields.name.trim(), brand: fields.brand.trim(), facts, labels };
}

/**
 * Clean up with AI (#108): the AI answers every word; each box a person typed keeps its words, every other box takes
 * the AI's (D27: what a person typed always wins). An empty answer never wipes words that are there. Returns the new
 * fields and the boxes the AI changed (marked "From AI: check it").
 */
export function mergeAiDraft(fields: PhotoSheetFields, draft: SheetAiDraft): { fields: PhotoSheetFields; filled: string[] } {
  const typed = typedOf(fields);
  const filled: string[] = [];
  // A box a person typed and left saying something is theirs; one they emptied may be filled.
  const mine = (key: string, now: string) => typed.has(key) && now.trim() !== '';
  const take = (key: string, now: string, next: string | undefined): string => {
    const value = (next ?? '').trim();
    if (mine(key, now) || !value || value === now.trim()) return now;
    filled.push(key);
    return value;
  };
  const title = take('title', fields.title, draft.title);
  const brand = take('brand', fields.brand, draft.brand);
  // A short plain name only for a long title (round 1: it reads better big); a short title needs none.
  const name = title.trim().length > 40 ? take('name', fields.name, draft.name) : fields.name;
  const facts = { ...fields.facts };
  const labels: PhotoSheetFields['labels'] = { ...fields.labels };
  for (const key of FACT_KEYS) {
    facts[key] = take(key, facts[key] ?? '', draft.facts?.[key]);
    const now = (labels[key] ?? '').trim() || FACT_LABEL[key];
    const next = (draft.labels?.[key as FactKey] ?? '').trim();
    if (!typed.has(`label.${key}`) && next && next !== now) {
      labels[key] = next;
      filled.push(`label.${key}`);
    }
  }
  let caption = fields.caption;
  if (!typed.has('caption') && draft.caption && draft.caption !== caption) {
    caption = draft.caption;
    filled.push('caption');
  }
  let notAssembled = fields.not_assembled;
  // The AI only ever ticks "not assembled": it never takes away a warning someone may have meant.
  if (!typed.has('not_assembled') && draft.not_assembled && !notAssembled) {
    notAssembled = true;
    filled.push('not_assembled');
  }
  return { fields: { ...fields, title, name, brand, facts, labels, caption, not_assembled: notAssembled }, filled };
}
