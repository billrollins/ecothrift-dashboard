/**
 * Canonical category order matches apps/buying/taxonomy_v1.py TAXONOMY_V1_CATEGORY_NAMES.
 * Colors: hand-picked distinct palette for charts/legends (Phase 4.1A).
 */
export const TAXONOMY_V1_CATEGORY_NAMES: readonly string[] = [
  'Kitchen & dining',
  'Furniture',
  'Outdoor & patio furniture',
  'Home décor & lighting',
  'Household & cleaning',
  'Bedding & bath',
  'Storage & organization',
  'Toys & games',
  'Sports & outdoors',
  'Tools & hardware',
  'Office & school supplies',
  'Electronics',
  'Baby & kids',
  'Health, beauty & personal care',
  'Apparel & accessories',
  'Books & media',
  'Pet supplies',
  'Party, seasonal & novelty',
  'Mixed lots & uncategorized',
];

/** Same order as TAXONOMY_V1_CATEGORY_NAMES */
export const TAXONOMY_V1_CATEGORY_COLORS: readonly string[] = [
  '#E53935',
  '#8E24AA',
  '#43A047',
  '#FB8C00',
  '#00ACC1',
  '#5C6BC0',
  '#78909C',
  '#FFB300',
  '#2E7D32',
  '#6D4C41',
  '#1E88E5',
  '#00897B',
  '#EC407A',
  '#AB47BC',
  '#F06292',
  '#7E57C2',
  '#26A69A',
  '#FFA726',
  '#BDBDBD',
];

export function colorForTaxonomyCategory(canonicalCategory: string): string {
  const idx = TAXONOMY_V1_CATEGORY_NAMES.indexOf(canonicalCategory);
  if (idx >= 0) return TAXONOMY_V1_CATEGORY_COLORS[idx]!;
  return '#9E9E9E';
}

/** Visual for rows not yet mapped to a canonical category (distinct from "Mixed lots & uncategorized"). */
export const NOT_YET_CATEGORIZED_BAR_BG = '#E0E0E0';
export const NOT_YET_CATEGORIZED_HATCH =
  'repeating-linear-gradient(-45deg, #E0E0E0, #E0E0E0 5px, #eceff1 5px, #eceff1 10px)';
