let canvasEl: HTMLCanvasElement | null = null;

/** Memoized widths keyed by `font + ' ' + text` — called ~10x per row per layout pass. */
const widthCache = new Map<string, number>();
const WIDTH_CACHE_MAX_ENTRIES = 20_000;

/**
 * Measures text width in pixels for the given CSS font string (canvas 2D API).
 * Results are cached; the cache is cleared when it exceeds a size cap so long
 * sessions stay bounded.
 */
export function measureTextWidth(text: string, font: string): number {
  const cacheKey = font + ' ' + text;
  const cached = widthCache.get(cacheKey);
  if (cached !== undefined) return cached;
  if (typeof document === 'undefined') return text.length * 8;
  if (!canvasEl) canvasEl = document.createElement('canvas');
  const ctx = canvasEl.getContext('2d');
  if (!ctx) return text.length * 8;
  ctx.font = font;
  const width = ctx.measureText(text).width;
  if (widthCache.size > WIDTH_CACHE_MAX_ENTRIES) widthCache.clear();
  widthCache.set(cacheKey, width);
  return width;
}
