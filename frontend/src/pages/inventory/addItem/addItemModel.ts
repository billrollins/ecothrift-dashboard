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
  NewProductSpec,
  RestorationWork,
  TaxonomyCategory,
} from '../../../api/addItem.api';
import type { ItemCondition } from '../../../types/inventory.types';
import { estimatePayload, estimateProblems, WORK_OPTIONS } from '../restorationEstimate/restorationEstimate';

export const DESTINATION_OPTIONS: Array<{ value: AddItemDestination; label: string }> = [
  { value: 'floor', label: 'Floor' },
  { value: 'back_stock', label: 'Back stock' },
  { value: 'restoration', label: 'Restoration' },
];

// The Restoration estimate rules are shared with every Processing check-in (owner, 2026-10-26).
export { WORK_OPTIONS };

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
  | { kind: 'new'; spec: NewProductSpec; photo: File | null };

export interface CheckInForm {
  quantity: string;
  condition: ItemCondition;
  destination: AddItemDestination;
  price: string;
  retail: string;
  /** Where the retail came from: the product's own usual retail, an estimate (AI or a similar product), or typed. */
  retailFrom: 'product' | 'estimate' | 'typed' | '';
  notes: string;
  work: RestorationWork[];
  hours: string;
  partsCost: string;
  valueAfter: string;
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
  return {
    quantity: '1',
    condition: 'good',
    destination: 'floor',
    price: '',
    retail: usual ? String(Number(usual).toFixed(2)) : '',
    retailFrom: usual ? (picked.kind === 'existing' ? 'product' : 'estimate') : '',
    notes: '',
    work: [],
    hours: '',
    partsCost: '',
    valueAfter: '',
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
    if (quantityOf(form) !== 1) out.push('Restoration takes one item at a time.');
    out.push(...estimateProblems(form));
  }
  return out;
}

export function buildCheckInPayload(picked: PickedProduct, form: CheckInForm): AddItemCheckInPayload {
  const retail = form.retail.trim();
  const payload: AddItemCheckInPayload = {
    ...(picked.kind === 'existing' ? { product_id: picked.product.product_id } : { new_product: picked.spec }),
    quantity: form.destination === 'restoration' ? 1 : quantityOf(form),
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
    payload.restoration = estimatePayload(form);
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
