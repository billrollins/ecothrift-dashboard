/** Smallest allowed column width in px (columns cannot be fully hidden). */
export const CATALOG_COLUMN_FLOOR = 1;

export function readStoredColumnWidths<K extends string>(
  storageKey: string,
  columnOrder: readonly K[],
): Record<K, number> | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Record<K, number>>;
    if (!parsed || typeof parsed !== 'object') return null;
    const next = {} as Record<K, number>;
    for (const key of columnOrder) {
      const val = parsed[key];
      if (typeof val !== 'number' || !Number.isFinite(val) || val < CATALOG_COLUMN_FLOOR) return null;
      next[key] = val;
    }
    return next;
  } catch {
    return null;
  }
}

export function storeColumnWidths<K extends string>(storageKey: string, widths: Record<K, number>) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(widths));
  } catch {
    // Non-critical: column resize should still work for the current session.
  }
}

export function clearStoredColumnWidths(storageKey: string) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(storageKey);
  } catch {
    // Non-critical.
  }
}

/** Scale column widths proportionally so they sum to totalWidth. */
export function scaleColumnWidthsToTotal<K extends string>(
  widths: Record<K, number>,
  columnOrder: readonly K[],
  totalWidth: number,
): Record<K, number> {
  const total = Math.max(columnOrder.length * CATALOG_COLUMN_FLOOR, Math.round(totalWidth));
  const values = columnOrder.map((key) =>
    Math.max(CATALOG_COLUMN_FLOOR, Math.round(widths[key] || CATALOG_COLUMN_FLOOR)),
  );
  const sum = values.reduce((a, b) => a + b, 0);

  if (sum === total) {
    return Object.fromEntries(columnOrder.map((key, i) => [key, values[i]])) as Record<K, number>;
  }

  const scaled = values.map((v) => Math.max(CATALOG_COLUMN_FLOOR, Math.round((v / sum) * total)));
  let diff = total - scaled.reduce((a, b) => a + b, 0);
  const indices = scaled.map((_, i) => i).sort((a, b) => scaled[b] - scaled[a]);
  for (const i of indices) {
    if (diff === 0) break;
    if (diff > 0) {
      scaled[i] += 1;
      diff -= 1;
    } else if (scaled[i] > CATALOG_COLUMN_FLOOR) {
      scaled[i] -= 1;
      diff += 1;
    }
  }

  return Object.fromEntries(columnOrder.map((key, i) => [key, scaled[i]])) as Record<K, number>;
}

export function resizeColumnPair<K extends string>(
  widths: Record<K, number>,
  leftKey: K,
  rightKey: K,
  rawDelta: number,
  totalWidth: number,
  columnOrder: readonly K[],
): Record<K, number> {
  const left = widths[leftKey];
  const right = widths[rightKey];
  const minDelta = CATALOG_COLUMN_FLOOR - left;
  const maxDelta = right - CATALOG_COLUMN_FLOOR;
  const delta = Math.max(minDelta, Math.min(maxDelta, rawDelta));
  return scaleColumnWidthsToTotal(
    {
      ...widths,
      [leftKey]: left + delta,
      [rightKey]: right - delta,
    },
    columnOrder,
    totalWidth,
  );
}
