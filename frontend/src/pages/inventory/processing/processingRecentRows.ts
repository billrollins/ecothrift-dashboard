/** Recently opened processing rows - client-only, per order, max 10. */

const STORAGE_PREFIX = 'ecothrift.processingRecentRows.v1';
export const PROCESSING_RECENT_ROWS_MAX = 10;

export interface ProcessingRecentRowEntry {
  processingRowId: number;
  rowNum: number;
  title: string;
  touchedAt: number;
}

function storageKey(orderId: number): string {
  return `${STORAGE_PREFIX}.${orderId}`;
}

function normalizeEntry(raw: unknown): ProcessingRecentRowEntry | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const processingRowId = o.processingRowId;
  const rowNum = o.rowNum;
  const title = o.title;
  const touchedAt = o.touchedAt;
  if (
    typeof processingRowId !== 'number'
    || !Number.isFinite(processingRowId)
    || processingRowId <= 0
    || typeof rowNum !== 'number'
    || !Number.isFinite(rowNum)
    || typeof title !== 'string'
    || typeof touchedAt !== 'number'
    || !Number.isFinite(touchedAt)
  ) {
    return null;
  }
  return {
    processingRowId: Math.trunc(processingRowId),
    rowNum: Math.trunc(rowNum),
    title: title.trim() || `Row ${Math.trunc(rowNum)}`,
    touchedAt,
  };
}

export function readProcessingRecentRows(orderId: number): ProcessingRecentRowEntry[] {
  try {
    const raw = sessionStorage.getItem(storageKey(orderId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(normalizeEntry)
      .filter((entry): entry is ProcessingRecentRowEntry => entry != null)
      .slice(0, PROCESSING_RECENT_ROWS_MAX);
  } catch {
    return [];
  }
}

export function pushProcessingRecentRow(
  orderId: number,
  entry: Pick<ProcessingRecentRowEntry, 'processingRowId' | 'rowNum' | 'title'>,
): ProcessingRecentRowEntry[] {
  const nextEntry: ProcessingRecentRowEntry = {
    ...entry,
    title: entry.title.trim() || `Row ${entry.rowNum}`,
    touchedAt: Date.now(),
  };
  const prev = readProcessingRecentRows(orderId).filter(
    (row) => row.processingRowId !== nextEntry.processingRowId,
  );
  const next = [nextEntry, ...prev].slice(0, PROCESSING_RECENT_ROWS_MAX);
  try {
    sessionStorage.setItem(storageKey(orderId), JSON.stringify(next));
  } catch {
    /* ignore */
  }
  return next;
}

export function processingSearchHistoryKey(orderId: number): string {
  return `inventory.processing.searchHistory.v1.${orderId}`;
}
