/**
 * Changes to a manifest row's fields that are typed but not yet saved (Dash Update #230, Bill 2026-11-25: "a Tab
 * after a change leaves the field highlighted and a button at front or end of row says Apply changes or Cancel all
 * changes"; "tab goes from left to right. enter ALSO does but confirms the update").
 *
 * - Tab moves to the next field and leaves a changed field highlighted (kept here, not saved).
 * - Enter (or the tick, or "Apply changes") saves every highlighted field in one request.
 * - The X on a field puts that one field back; "Cancel all" puts them all back.
 *
 * Pure functions, so the rules are tested on their own; `ProcessingActiveCard` holds the state.
 */
import { moneyValuesEqual } from '../../../utils/formInputs';

/** The fields typed in place on the row, in the order Tab and Enter walk them (left to right). */
export const ROW_EDIT_FIELDS = ['title', 'brand', 'model', 'category', 'unitRetail', 'price'] as const;
export type RowEditField = (typeof ROW_EDIT_FIELDS)[number];
export type RowEditValues = Record<RowEditField, string>;
export type RowPending = Partial<RowEditValues>;

const MONEY: ReadonlySet<RowEditField> = new Set(['unitRetail', 'price']);

export const ROW_EDIT_LABELS: Record<RowEditField, string> = {
  title: 'Title',
  brand: 'Brand',
  model: 'Model',
  category: 'Category',
  unitRetail: 'Retail',
  price: 'Price',
};

/** Are two values of a field the same? Money is compared as numbers ("30" is "30.00"). */
export function sameFieldValue(field: RowEditField, a: string, b: string): boolean {
  if (MONEY.has(field)) return moneyValuesEqual(a ?? '', b ?? '') || ((a ?? '').trim() === '' && (b ?? '').trim() === '');
  return (a ?? '') === (b ?? '');
}

/**
 * Keep a typed value as pending, or drop it when it is what the row already says (typing a field back to its saved
 * value un-highlights it).
 */
export function stageValue(pending: RowPending, saved: RowEditValues, field: RowEditField, value: string): RowPending {
  const next = { ...pending };
  if (sameFieldValue(field, value, saved[field])) delete next[field];
  else next[field] = value;
  return next;
}

/** Put one field back to what is saved. */
export function revertField(pending: RowPending, field: RowEditField): RowPending {
  if (!(field in pending)) return pending;
  const next = { ...pending };
  delete next[field];
  return next;
}

export function pendingFields(pending: RowPending): RowEditField[] {
  return ROW_EDIT_FIELDS.filter((f) => f in pending);
}

/** What the row shows: the pending value where there is one, else the saved one. */
export function shownValues(saved: RowEditValues, pending: RowPending): RowEditValues {
  return { ...saved, ...pending };
}

/** The server's names for the fields (`processing-row-patch`). */
const PATCH_KEY: Record<RowEditField, string> = {
  title: 'title',
  brand: 'brand',
  model: 'model',
  category: 'category',
  unitRetail: 'unit_retail',
  price: 'shelf_price',
};

/** One request that saves the given values. A title is trimmed; an empty price or retail is not sent. */
export function patchFor(values: RowPending): Record<string, string> {
  const out: Record<string, string> = {};
  for (const field of ROW_EDIT_FIELDS) {
    const raw = values[field];
    if (raw == null) continue;
    const value = field === 'title' ? raw.trim() : raw;
    if (MONEY.has(field) && !value.trim()) continue;
    out[PATCH_KEY[field]] = value;
  }
  return out;
}

/** The saved values of the fields that are pending: what Undo puts back after an Apply. */
export function savedValuesOf(pending: RowPending, saved: RowEditValues): RowPending {
  const out: RowPending = {};
  for (const field of pendingFields(pending)) out[field] = saved[field];
  return out;
}

/** "Title", "Title and Brand", "Title, Brand and Price": what a save or an undo names. */
export function fieldsPhrase(fields: RowEditField[]): string {
  const names = fields.map((f) => ROW_EDIT_LABELS[f]);
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}
