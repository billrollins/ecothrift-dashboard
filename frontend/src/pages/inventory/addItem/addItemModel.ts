/**
 * Add item (Find item > Add item): the pure rules behind the dialog, kept here so they are tested.
 * Server: `apps/inventory/services/add_item.py`.
 */
import type {
  AddItemCheckInPayload,
  AddItemDestination,
  AddItemMatch,
  AddItemProduct,
  AiDraft,
  CleanUpField,
  CleanUpResponse,
  CleanUpValues,
  NewProductSpec,
  TaxonomyCategory,
} from '../../../api/addItem.api';
import type { ItemCondition } from '../../../types/inventory.types';
import {
  EMPTY_REQUEST,
  requestPayload,
  requestProblems,
  type RestorationRequestForm,
} from '../restorationRequest/restorationRequest';

export const DESTINATION_OPTIONS: Array<{ value: AddItemDestination; label: string }> = [
  { value: 'floor', label: 'Floor' },
  { value: 'back_stock', label: 'Back stock' },
  { value: 'restoration', label: 'Restoration' },
];

/** Matches that are the answer by themselves: Enter picks them. */
export const EXACT_MATCHES: AddItemMatch[] = ['tag', 'barcode', 'product_number', 'model', 'part_number'];

export const MATCH_LABEL: Partial<Record<AddItemMatch, string>> = {
  tag: 'Tag',
  barcode: 'Barcode',
  product_number: 'Product #',
  model: 'Model',
  part_number: 'Part #',
};

/** What the person picked in step 1 or made in step 2. */
export type PickedProduct =
  | { kind: 'existing'; product: AddItemProduct }
  | { kind: 'new'; spec: NewProductSpec; photos: File[]; start?: { condition: ItemCondition | ''; price: string } };

/** The Restoration request rules are shared with every Processing check-in (owner, 2026-10-28). */
export interface CheckInForm extends RestorationRequestForm {
  quantity: string;
  condition: ItemCondition;
  destination: AddItemDestination;
  price: string;
  retail: string;
  /** Where the retail came from: the product's own usual retail, an estimate (AI or a similar product), or typed. */
  retailFrom: 'product' | 'estimate' | 'typed' | '';
  notes: string;
}

export function money(value: string | null | undefined): number | null {
  if (value == null) return null;
  const trimmed = String(value).trim().replace(/[$,\s]/g, '');
  if (!trimmed) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export function formatMoney(value: string | number | null | undefined): string {
  const n = typeof value === 'number' ? value : money(value ?? null);
  return n == null ? '' : `$${n.toFixed(2)}`;
}

/** A whole percent of retail, or null. */
export function pctOfRetail(price: string, retail: string): number | null {
  const p = money(price);
  const r = money(retail);
  return p != null && r ? Math.round((100 * p) / r) : null;
}

export function initialCheckIn(picked: PickedProduct): CheckInForm {
  const usual = picked.kind === 'existing' ? picked.product.typical_retail : picked.spec.retail_estimate ?? null;
  const start = picked.kind === 'new' ? picked.start : undefined;
  return {
    quantity: '1',
    condition: start?.condition || 'good',
    destination: 'floor',
    price: start?.price && money(start.price) != null ? Number(money(start.price)).toFixed(2) : '',
    retail: usual ? String(Number(usual).toFixed(2)) : '',
    retailFrom: usual ? (picked.kind === 'existing' ? 'product' : 'estimate') : '',
    notes: '',
    ...EMPTY_REQUEST,
  };
}

export function quantityOf(form: CheckInForm): number {
  const n = Number.parseInt(form.quantity, 10);
  return Number.isFinite(n) && n >= 1 ? n : 1;
}

/** What still stops the check-in, in the order the form shows it. */
export function checkInProblems(form: CheckInForm): string[] {
  const out: string[] = [];
  if (money(form.price) == null) out.push('Enter the price.');
  if (form.retail.trim() && money(form.retail) == null) out.push('The retail must be a dollar amount.');
  if (form.destination === 'restoration') {
    out.push(...requestProblems(form));
  }
  return out;
}

export function buildCheckInPayload(picked: PickedProduct, form: CheckInForm): AddItemCheckInPayload {
  const retail = form.retail.trim();
  const payload: AddItemCheckInPayload = {
    ...(picked.kind === 'existing' ? { product_id: picked.product.product_id } : { new_product: picked.spec }),
    quantity: quantityOf(form),
    condition: form.condition,
    destination: form.destination,
    price: form.price.trim(),
    notes: form.notes.trim() || undefined,
  };
  if (retail) {
    payload.retail = retail;
    payload.retail_source = form.retailFrom === 'estimate' ? 'estimate' : 'typed';
  }
  if (form.destination === 'restoration') {
    payload.restoration = requestPayload(form);
  }
  return payload;
}

export function emptySpec(how: NewProductSpec['how'], title = ''): NewProductSpec {
  return { title, brand: '', model: '', category: '', subcategory: '', short_name: '', upc: '', how };
}

/** Copy similar: the near match's identity, ready to edit. */
export function specFromProduct(product: AddItemProduct): NewProductSpec {
  return {
    title: product.title,
    brand: product.brand,
    model: product.model,
    category: product.category,
    subcategory: product.subcategory,
    short_name: '',
    upc: '',
    retail_estimate: product.typical_retail,
    how: 'copy',
    copied_from: product.product_id,
  };
}

export function specFromDraft(draft: AiDraft, model: string): NewProductSpec {
  return {
    title: draft.title,
    brand: draft.brand,
    model: draft.model,
    category: draft.category,
    subcategory: draft.subcategory,
    short_name: draft.short_name,
    upc: '',
    retail_estimate: draft.retail_estimate,
    how: 'ai',
    ai: { model, draft },
  };
}

export function subcategoriesFor(taxonomy: TaxonomyCategory[], category: string): string[] {
  return taxonomy.find((c) => c.name === category)?.subcategories ?? [];
}

/** What still stops a new product, in the taxonomy's exact names. */
export function newProductProblems(spec: NewProductSpec, taxonomy: TaxonomyCategory[]): string[] {
  const out: string[] = [];
  if (!spec.title.trim()) out.push('Give it a title.');
  const cat = taxonomy.find((c) => c.name === spec.category);
  if (!cat) out.push('Pick a category.');
  else if (cat.subcategories.length && !cat.subcategories.includes(spec.subcategory)) out.push('Pick a subcategory.');
  if ((spec.short_name ?? '').length > 28) out.push('The tag name is at most 28 characters.');
  return out;
}

/** The name shown for a product in Add item: the tag name when it has one. */
export function productName(product: Pick<AddItemProduct, 'short_name' | 'title'>): string {
  return product.short_name?.trim() || product.title;
}

// ── Make the product: the boxes, and Clean up with AI (Dash Updates #96) ─────────────────────────────────────────

/**
 * The new-product boxes, all as typed text. "Anything you know about it" (`anything`) and the photos go to the AI;
 * the rest are the usual boxes, which the person may fill or leave empty. `specFromForm` turns it into the product.
 */
export interface NewProductForm {
  how: NewProductSpec['how'];
  copied_from?: number;
  anything: string;
  title: string;
  brand: string;
  model: string;
  category: string;
  subcategory: string;
  short_name: string;
  upc: string;
  condition: ItemCondition | '';
  price: string;
  retail: string;
  /** Comma separated. */
  tags: string;
  /** One "name: value" a line. */
  identifiers: string;
  specifications: string;
  ai?: { model: string; draft: Record<string, unknown> };
}

export type BoxName = Exclude<keyof NewProductForm, 'how' | 'copied_from' | 'anything' | 'ai'>;

/** A box the AI filled: what it put there, what was there before, and which one shows. */
export interface AiMark {
  ai: string;
  before: string;
  viewing: 'ai' | 'before';
}

export type AiMarks = Partial<Record<BoxName, AiMark>>;

/** The server's field for each box. */
export const BOX_FIELD: Record<BoxName, CleanUpField> = {
  title: 'title', brand: 'brand', model: 'model', category: 'category', subcategory: 'subcategory',
  short_name: 'short_name', upc: 'upc', condition: 'condition', price: 'price', retail: 'retail_estimate',
  tags: 'tags', identifiers: 'identifiers', specifications: 'specifications',
};
const BOXES = Object.keys(BOX_FIELD) as BoxName[];

export function pairsToText(pairs: Record<string, string> | null | undefined): string {
  return Object.entries(pairs ?? {}).map(([k, v]) => `${k}: ${v}`).join('\n');
}

/** "name: value" lines (or "name = value"); a line with no name or no value is dropped. */
export function textToPairs(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split('\n')) {
    const m = line.match(/^\s*([^:=]+?)\s*[:=]\s*(.+?)\s*$/);
    if (m && m[1] && m[2]) out[m[1]] = m[2];
  }
  return out;
}

export function textToTags(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.split(',')) {
    const tag = raw.trim().toLowerCase();
    if (tag && !out.includes(tag)) out.push(tag);
  }
  return out;
}

function money2(value: string | null | undefined): string {
  const n = money(value ?? null);
  return n == null ? '' : n.toFixed(2);
}

export function formFromSpec(spec: NewProductSpec): NewProductForm {
  return {
    how: spec.how,
    copied_from: spec.copied_from,
    anything: '',
    title: spec.title,
    brand: spec.brand,
    model: spec.model,
    category: spec.category,
    subcategory: spec.subcategory,
    short_name: spec.short_name ?? '',
    upc: spec.upc ?? '',
    condition: '',
    price: '',
    retail: money2(spec.retail_estimate),
    tags: (spec.tags ?? []).join(', '),
    identifiers: pairsToText(spec.identifiers),
    specifications: pairsToText(spec.specifications),
  };
}

export function emptyForm(how: NewProductSpec['how'], anything = ''): NewProductForm {
  return { ...formFromSpec(emptySpec(how)), anything };
}

/** The boxes as the product the server makes. */
export function specFromForm(form: NewProductForm): NewProductSpec {
  const retail = money(form.retail);
  const spec: NewProductSpec = {
    title: form.title.trim(),
    brand: form.brand.trim(),
    model: form.model.trim(),
    category: form.category,
    subcategory: form.subcategory,
    short_name: form.short_name.trim(),
    upc: form.upc.trim(),
    retail_estimate: retail == null ? null : retail.toFixed(2),
    how: form.how,
    tags: textToTags(form.tags),
    identifiers: textToPairs(form.identifiers),
    specifications: textToPairs(form.specifications),
  };
  if (form.copied_from) spec.copied_from = form.copied_from;
  if (form.ai) spec.ai = form.ai;
  if (form.anything.trim()) spec.source_text = form.anything.trim();
  return spec;
}

/** Is there anything for the AI to go on: some words, a photo, or a filled box? */
export function hasSomethingToGoOn(form: NewProductForm, photos: File[]): boolean {
  return Boolean(form.anything.trim()) || photos.length > 0 || BOXES.some((b) => form[b].trim());
}

/**
 * The boxes the person filled, for the server (which never changes them). A box still showing the AI's own value
 * is not the person's, so a second Clean up may change it.
 */
export function typedBoxes(form: NewProductForm, marks: AiMarks): Partial<Record<CleanUpField, unknown>> {
  const out: Partial<Record<CleanUpField, unknown>> = {};
  for (const box of BOXES) {
    const value = form[box].trim();
    const mark = marks[box];
    if (!value || (mark && mark.viewing === 'ai' && mark.ai === form[box])) continue;
    if (box === 'tags') out.tags = textToTags(value);
    else if (box === 'identifiers' || box === 'specifications') out[box] = textToPairs(value);
    else out[BOX_FIELD[box]] = value;
  }
  return out;
}

function boxText(box: BoxName, values: CleanUpValues): string {
  const v = values[BOX_FIELD[box]];
  if (box === 'tags') return (v as string[]).join(', ');
  if (box === 'identifiers' || box === 'specifications') return pairsToText(v as Record<string, string>);
  if (box === 'price' || box === 'retail') return money2(v as string | null);
  return String(v ?? '');
}

/**
 * Put the AI's answer in the boxes it filled, each with a mark that remembers what was there. Boxes it did not fill
 * stay exactly as they were (a box is never emptied).
 */
export function applyCleanUp(form: NewProductForm, marks: AiMarks, res: CleanUpResponse): { form: NewProductForm; marks: AiMarks } {
  const next: NewProductForm = { ...form, how: form.how === 'copy' ? 'copy' : 'ai' };
  const nextMarks: AiMarks = { ...marks };
  for (const box of BOXES) {
    if (!res.filled.includes(BOX_FIELD[box])) continue;
    const prior = marks[box];
    const showingAi = Boolean(prior && prior.viewing === 'ai' && prior.ai === form[box]);
    let value = boxText(box, res.values);
    if (box === 'identifiers' || box === 'specifications') {
      // Only the names the person left out are added, to what is in the box now.
      const mine = showingAi ? textToPairs(prior!.before) : textToPairs(form[box]);
      const have = new Set(Object.keys(mine).map((k) => k.toLowerCase()));
      const extra = Object.entries(res.values[box]).filter(([k]) => !have.has(k.toLowerCase()));
      value = extra.length ? pairsToText({ ...mine, ...Object.fromEntries(extra) }) : '';
    } else if (form[box].trim() && !showingAi) {
      continue;     // typed while the AI worked (or typed before): the person's box wins
    }
    if (!value) continue;
    const before = showingAi ? prior!.before : form[box];
    (next as unknown as Record<BoxName, string>)[box] = value;
    nextMarks[box] = { ai: value, before, viewing: 'ai' };
  }
  const draft: Record<string, unknown> = { confidence: res.confidence };
  for (const box of BOXES) {
    const mark = nextMarks[box];
    if (mark?.viewing === 'ai') draft[BOX_FIELD[box]] = mark.ai;
  }
  next.ai = { model: res.model, draft };
  return { form: next, marks: nextMarks };
}

/** Tap a mark: show what was there before, or the AI's value again. */
export function flipMark(form: NewProductForm, marks: AiMarks, box: BoxName): { form: NewProductForm; marks: AiMarks } {
  const mark = marks[box];
  if (!mark) return { form, marks };
  const viewing = mark.viewing === 'ai' ? 'before' : 'ai';
  return { form: { ...form, [box]: viewing === 'ai' ? mark.ai : mark.before }, marks: { ...marks, [box]: { ...mark, viewing } } };
}

/** "Original" or "AI values" for every marked box at once. */
export function viewAll(form: NewProductForm, marks: AiMarks, viewing: AiMark['viewing']): { form: NewProductForm; marks: AiMarks } {
  let out = { form, marks };
  for (const box of Object.keys(marks) as BoxName[]) {
    if (marks[box]?.viewing !== viewing) out = flipMark(out.form, out.marks, box);
  }
  return out;
}

/** The person typed in a box: it is theirs now, so its mark goes. */
export function editBox(form: NewProductForm, marks: AiMarks, box: BoxName, value: string): { form: NewProductForm; marks: AiMarks } {
  const nextMarks = { ...marks };
  delete nextMarks[box];
  return { form: { ...form, [box]: value }, marks: nextMarks };
}
