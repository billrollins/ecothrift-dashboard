const DEFAULT_MAX = 25;

export const SEARCH_HISTORY_KEYS = {
  workbench: 'inventory.workbench.searchHistory.v1',
  manageProducts: 'inventory.manageProducts.searchHistory.v1',
  manageItems: 'inventory.manageItems.searchHistory.v1',
} as const;

export function readSearchHistory(key: string, max = DEFAULT_MAX): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
      .slice(0, max);
  } catch {
    return [];
  }
}

export function pushSearchHistory(key: string, query: string, max = DEFAULT_MAX): string[] {
  const q = query.trim();
  if (!q || typeof window === 'undefined') return readSearchHistory(key, max);
  const prev = readSearchHistory(key, max).filter((entry) => entry !== q);
  const next = [q, ...prev].slice(0, max);
  try {
    window.localStorage.setItem(key, JSON.stringify(next));
  } catch {
    // Non-critical: history is a convenience feature.
  }
  return next;
}
