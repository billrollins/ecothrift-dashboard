let canvasEl: HTMLCanvasElement | null = null;

/**
 * Measures text width in pixels for the given CSS font string (canvas 2D API).
 */
export function measureTextWidth(text: string, font: string): number {
  if (typeof document === 'undefined') return text.length * 8;
  if (!canvasEl) canvasEl = document.createElement('canvas');
  const ctx = canvasEl.getContext('2d');
  if (!ctx) return text.length * 8;
  ctx.font = font;
  return ctx.measureText(text).width;
}
