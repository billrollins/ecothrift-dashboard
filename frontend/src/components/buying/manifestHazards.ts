/**
 * Manifest hazards (Buying Phase 4, `apps/buying/services/manifest_analysis.py`): the same
 * codes as the server, with a short label for chips and a full one for tooltips.
 */
export const HAZARD_ORDER = [
  'incomplete',
  'part',
  'fragile',
  'high_value',
  'zero_retail',
  'bulk_line',
  'high_volume',
  'slow',
  'stocked',
] as const;

export type HazardCode = (typeof HAZARD_ORDER)[number];

export const HAZARD_SHORT: Record<string, string> = {
  incomplete: 'Missing parts',
  part: 'Box 1 of N',
  fragile: 'Fragile',
  high_value: 'High value',
  zero_retail: '$0 retail',
  bulk_line: 'Big line',
  high_volume: 'Bulk item',
  slow: 'Slow seller',
  stocked: 'Well stocked',
};

export const HAZARD_LONG: Record<string, string> = {
  incomplete: 'Missing pieces, parts only or not working (valued at half)',
  part: 'A box or part of a set, such as box 1 of 4 (valued at half)',
  fragile: 'Likely breakage: glass, ceramic, screens (valued at 90%)',
  high_value: 'High value per unit: theft, damage or a wrong retail price',
  zero_retail: 'No retail price on the manifest (valued at $0)',
  bulk_line: 'Too many on one line for processing',
  high_volume: 'The same item in bulk across the truck: can we sell that many?',
  slow: 'This product sells slowly for us (over 90 days on average)',
  stocked: 'We already have plenty of this product on the shelf',
};

/** Red for what loses value, amber for what needs a look. */
export function hazardTone(code: string): 'error' | 'warning' {
  return code === 'incomplete' || code === 'part' || code === 'zero_retail' ? 'error' : 'warning';
}

export function sortHazards(codes: string[]): string[] {
  const rank = (code: string) => {
    const i = (HAZARD_ORDER as readonly string[]).indexOf(code);
    return i === -1 ? 99 : i;
  };
  return [...codes].sort((a, b) => rank(a) - rank(b));
}
