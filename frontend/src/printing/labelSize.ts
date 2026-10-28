/**
 * The one label-size setting (owner, 2026-10-28: "We have a bad label supplier and often need to change tag sizes...
 * We need it SUPER easy to adjust"). Every tag Dash prints (price tag, restoration tag, test label) is drawn at the
 * size this gives, at the printer's exact dpi, and printed at that physical size.
 *
 * Store-wide in Dash (`printing.label_size`), with an optional override for one computer (this browser), for a
 * station whose printer has different stock loaded. The override wins.
 */

export type LabelDpi = 203 | 300;

export interface LabelSize {
  w_in: number;
  h_in: number;
  dpi: LabelDpi;
}

export const LABEL_DPIS: LabelDpi[] = [203, 300];

/** The stock we buy (1.5x1 standard; 2.25x1.25 bought 10-28; 3x2 the old test stock). */
export const LABEL_PRESETS: Array<{ key: string; w_in: number; h_in: number; note: string }> = [
  { key: '1.5x1', w_in: 1.5, h_in: 1, note: 'standard' },
  { key: '2.25x1.25', w_in: 2.25, h_in: 1.25, note: '' },
  { key: '3x2', w_in: 3, h_in: 2, note: 'large' },
];

export const DEFAULT_LABEL_SIZE: LabelSize = { w_in: 1.5, h_in: 1, dpi: 203 };

/** Smallest and largest side we accept, in inches (anything outside is a typo). */
export const MIN_SIDE_IN = 0.75;
export const MAX_SIDE_IN = 4;

const round2 = (n: number) => Math.round(n * 100) / 100;

/** A size from anything (a saved row, a typed box), or null when it is not a size we can print. */
export function parseLabelSize(raw: unknown): LabelSize | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const w = Number(r.w_in);
  const h = Number(r.h_in);
  const dpi = Number(r.dpi ?? 203);
  if (!Number.isFinite(w) || !Number.isFinite(h)) return null;
  if (w < MIN_SIDE_IN || w > MAX_SIDE_IN || h < MIN_SIDE_IN || h > MAX_SIDE_IN) return null;
  if (dpi !== 203 && dpi !== 300) return null;
  return { w_in: round2(w), h_in: round2(h), dpi };
}

/** The station override wins; then the store's size; then 1.5 x 1 at 203 dpi. */
export function effectiveLabelSize(store: unknown, station: unknown): LabelSize {
  return parseLabelSize(station) ?? parseLabelSize(store) ?? DEFAULT_LABEL_SIZE;
}

/** Pixels for a size: the canvas is exactly W x H inches at the printer's dpi, so one pixel is one printer dot. */
export function labelPixels(size: LabelSize): { w: number; h: number } {
  return { w: Math.round(size.w_in * size.dpi), h: Math.round(size.h_in * size.dpi) };
}

/** "1.5 x 1" (inches), the preset key when it is one. */
export function sizeKey(size: Pick<LabelSize, 'w_in' | 'h_in'>): string {
  return `${round2(size.w_in)}x${round2(size.h_in)}`;
}

export function presetFor(size: Pick<LabelSize, 'w_in' | 'h_in'>): string | null {
  const key = sizeKey(size);
  return LABEL_PRESETS.find((p) => p.key === key)?.key ?? null;
}

/** "1.5 x 1 in, 203 dpi" for people. */
export function describeLabelSize(size: LabelSize): string {
  return `${round2(size.w_in)} x ${round2(size.h_in)} in, ${size.dpi} dpi`;
}

// ---------------------------------------------------------------------------
// This computer's override (a station whose printer has other stock loaded).
// ---------------------------------------------------------------------------

export const STATION_KEY = 'label_size_station';

export function readStationLabelSize(): LabelSize | null {
  try {
    const raw = localStorage.getItem(STATION_KEY);
    return raw ? parseLabelSize(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export function writeStationLabelSize(size: LabelSize | null): void {
  try {
    if (size) localStorage.setItem(STATION_KEY, JSON.stringify(size));
    else localStorage.removeItem(STATION_KEY);
  } catch {
    // Storage blocked: the store-wide size still applies.
  }
}
