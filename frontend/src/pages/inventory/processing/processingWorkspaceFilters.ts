/**
 * Pure helpers for Item Processor workspace search and row filtering.
 * Validation matrix: V-07, V-08, V-12 — see PROCESSING_VALIDATION_MATRIX.md
 */

/** Row shape exposing server-built ``searchString`` (see ProcessingWorkspaceRowDTO). */
export interface ProcessingSearchBlobRow {
  searchString?: string;
}

export interface ProcessingSearchRowParts {
  rowNum: number;
  title: string;
  brand: string;
  model: string;
  sku?: string;
  identifiers?: { upc?: string };
}

export type ProcessingStatusSegment = 'all' | 'pending' | 'partial' | 'checked_in' | 'disputed';

/**
 * Canonical workspace row search blob — supplied by GET processing-workspace (`search_string` → `searchString`).
 * Server lowers and normalizes whitespace; do not reconstruct from listing columns on the client.
 */
export function processingWorkspaceSearchBlob(row: Pick<ProcessingSearchBlobRow, 'searchString'>): string {
  const s = (row.searchString ?? '').trim().toLowerCase();
  return s.replace(/\s+/g, ' ');
}

/**
 * Legacy local blob for tests comparing token rules to documented §8.2 layout.
 * Production rows should use `processingWorkspaceSearchBlob` + API `searchString`.
 */
export function buildProcessingSearchBlob(parts: ProcessingSearchRowParts): string {
  const upc = parts.identifiers?.upc ?? '';
  const sku = parts.sku ?? '';
  return `${parts.title} ${parts.brand} ${parts.model} ${sku} row${parts.rowNum} ${upc}`
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

/** Django Item.status values used on the processing floor before full disposition enums ship. */
export type ProcessingItemStatus =
  | 'intake'
  | 'processing'
  | 'on_shelf'
  | 'sold'
  | 'returned'
  | 'scrapped'
  | 'lost';

export type ProcessingDispositionLike = 'pending' | 'checked_in' | 'broken' | 'undelivered';

/**
 * Map persisted Item.status to design-shaped disposition for filtering.
 * Refine when dedicated disposition fields land on Item.
 */
export function mapItemStatusToDisposition(status: string): ProcessingDispositionLike {
  if (status === 'intake' || status === 'processing') return 'pending';
  if (status === 'on_shelf') return 'checked_in';
  if (status === 'scrapped') return 'broken';
  if (status === 'lost') return 'undelivered';
  return 'pending';
}

/** Design §8.2: every whitespace-separated token must appear (order-independent). */
export function matchesProcessingSearch(blobLowercase: string, query: string): boolean {
  const words = query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return true;
  return words.every((w) => blobLowercase.includes(w));
}

/** Strip for UPC / scan token comparison (matrix V-09 / V-10). */
export function normalizeUpcToken(raw: string): string {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '');
}

export interface RowUpcSource {
  identifiers?: Record<string, unknown>;
  product?: { upc?: string } | null;
}

/** Primary manifest UPC string for exact matching. */
export function rowPrimaryUpc(row: RowUpcSource): string {
  const id = row.identifiers?.upc;
  const fromId = typeof id === 'string' ? id : '';
  const fromProduct = row.product?.upc?.trim() ?? '';
  return (fromId || fromProduct).trim();
}

/**
 * Rows whose primary UPC equals the scan token (normalized).
 * Full-PO / scoped rows only — caller supplies already segment/product-filtered rows.
 */
export function rowsMatchingExactUpc<T extends RowUpcSource>(rows: T[], scanToken: string): T[] {
  const q = normalizeUpcToken(scanToken);
  if (!q) return [];
  return rows.filter((r) => {
    const u = normalizeUpcToken(rowPrimaryUpc(r));
    return u.length > 0 && u === q;
  });
}

/** True when the query is a single token (scanner / paste) suitable for UPC auto-open. */
export function isSingleScanToken(query: string): boolean {
  const t = query.trim();
  if (!t) return false;
  return !/\s/.test(t);
}

/**
 * Derive queue row status for segmented filters (design §5.2 row visualization).
 */
export function deriveProcessingRowStatus(
  items: Array<{ status: string }>,
): 'pending' | 'partial' | 'checked_in' | 'disputed' {
  if (!items.length) return 'pending';

  const disp = items.map((i) => mapItemStatusToDisposition(i.status));
  const anyDisputed = disp.some((d) => d === 'broken' || d === 'undelivered');
  if (anyDisputed) return 'disputed';

  const anyPending = disp.some((d) => d === 'pending');
  const allPending = disp.every((d) => d === 'pending');
  const allChecked = disp.every((d) => d === 'checked_in');

  if (allPending) return 'pending';
  if (allChecked) return 'checked_in';
  return 'partial';
}

export function rowMatchesStatusSegment(
  row: { items?: Array<{ status: string }>; status?: string },
  segment: ProcessingStatusSegment,
): boolean {
  if (segment === 'all') return true;

  const derived: 'pending' | 'partial' | 'checked_in' | 'disputed' =
    row.items && row.items.length > 0 ?
      deriveProcessingRowStatus(row.items)
    : ((row.status || 'pending') as 'pending' | 'partial' | 'checked_in' | 'disputed');

  if (segment === 'disputed') {
    return derived === 'disputed';
  }
  return derived === segment;
}
