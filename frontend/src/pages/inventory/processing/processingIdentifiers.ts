export const IDENTIFIER_PRESET_KEYS = [
  'upc',
  'gtin',
  'ean',
  'asin',
  'sku',
  'item_number',
  'vendor_item_number',
  'tcin',
  'mpn',
] as const;

export type IdentifierPresetKey = (typeof IDENTIFIER_PRESET_KEYS)[number];

export const IDENTIFIER_KEY_LABELS: Record<string, string> = {
  upc: 'UPC',
  gtin: 'GTIN',
  ean: 'EAN',
  asin: 'ASIN',
  sku: 'SKU',
  item_number: 'Item #',
  vendor_item_number: 'Vendor item #',
  tcin: 'TCIN',
  mpn: 'MPN',
};

const IDENTIFIER_DISPLAY_PRIORITY = ['upc', 'asin', 'gtin', 'ean', 'sku', 'item_number', 'vendor_item_number', 'tcin', 'mpn'];

export interface IdentifierDraftRow {
  id: string;
  key: string;
  value: string;
}

export function normalizeIdentifierKey(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
    .replace(/[^a-z0-9_]+/g, '')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 64);
}

export function normalizeIdentifiersObject(raw: Record<string, unknown> | null | undefined): Record<string, string> {
  if (!raw || typeof raw !== 'object') return {};
  const out: Record<string, string> = {};
  for (const [key, val] of Object.entries(raw)) {
    const normKey = normalizeIdentifierKey(key);
    const normVal = String(val ?? '').trim();
    if (!normKey || !normVal) continue;
    out[normKey] = normVal;
  }
  return out;
}

export function identifierLabel(key: string): string {
  const norm = normalizeIdentifierKey(key);
  if (!norm) return '';
  if (IDENTIFIER_KEY_LABELS[norm]) return IDENTIFIER_KEY_LABELS[norm];
  return norm
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function identifiersDisplayOrder(keys: string[]): string[] {
  const unique = [...new Set(keys.map(normalizeIdentifierKey).filter(Boolean))];
  const priority = new Map(IDENTIFIER_DISPLAY_PRIORITY.map((k, i) => [k, i]));
  return unique.sort((a, b) => {
    const pa = priority.get(a) ?? 999;
    const pb = priority.get(b) ?? 999;
    if (pa !== pb) return pa - pb;
    return a.localeCompare(b);
  });
}

export function identifiersToDraftRows(raw: Record<string, unknown> | null | undefined): IdentifierDraftRow[] {
  const normalized = normalizeIdentifiersObject(raw);
  return identifiersDisplayOrder(Object.keys(normalized)).map((key, idx) => ({
    id: `row-${idx}-${key}`,
    key,
    value: normalized[key] ?? '',
  }));
}

export function draftRowsToIdentifiers(rows: IdentifierDraftRow[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const row of rows) {
    const key = normalizeIdentifierKey(row.key);
    const value = row.value.trim();
    if (!key || !value) continue;
    out[key] = value;
  }
  return out;
}

export function findDuplicateIdentifierKeys(rows: IdentifierDraftRow[]): string[] {
  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const row of rows) {
    const key = normalizeIdentifierKey(row.key);
    if (!key) continue;
    if (seen.has(key)) dupes.add(key);
    seen.add(key);
  }
  return [...dupes];
}

export function validateIdentifierDraftRows(rows: IdentifierDraftRow[]): string | null {
  for (const row of rows) {
    const key = normalizeIdentifierKey(row.key);
    const value = row.value.trim();
    if (!key && !value) continue;
    if (!key) return 'Each identifier needs a key.';
    if (!value) return `${identifierLabel(key)} needs a value.`;
  }
  const dupes = findDuplicateIdentifierKeys(rows);
  if (dupes.length) {
    return `Duplicate keys: ${dupes.map(identifierLabel).join(', ')}`;
  }
  return null;
}

export function newIdentifierDraftRow(partial?: Partial<IdentifierDraftRow>): IdentifierDraftRow {
  return {
    id: `row-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    key: partial?.key ?? '',
    value: partial?.value ?? '',
  };
}
