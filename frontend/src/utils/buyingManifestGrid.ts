import type { GridSortModel } from '@mui/x-data-grid';

/** Default manifest grid sort — matches backend default (`row_number` ascending). */
export const MANIFEST_ROWS_DEFAULT_ORDERING = 'row_number';

const MANIFEST_ORDERING_FIELDS = [
  'row_number',
  'canonical_category',
  'brand',
  'title',
  'quantity',
  'retail_value',
  'ext_retail',
  'pct_manifest',
  'condition',
  'upc',
  'sku',
] as const;

export function manifestOrderingFromSortModel(model: GridSortModel): string {
  if (!model.length) return MANIFEST_ROWS_DEFAULT_ORDERING;
  const { field, sort } = model[0];
  const allowed = MANIFEST_ORDERING_FIELDS as unknown as string[];
  if (!allowed.includes(field)) return MANIFEST_ROWS_DEFAULT_ORDERING;
  const prefix = sort === 'desc' ? '-' : '';
  return `${prefix}${field}`;
}
