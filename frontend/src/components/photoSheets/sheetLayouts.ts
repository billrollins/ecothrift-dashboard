/**
 * Photo sheets (Dash Update #95): the paper, the templates and the small rules the sheet and its editor share.
 * Decisions D21 to D26 in `.ai/extended/processing-enhancements-decisions.md`.
 */

export type SheetLayout = 'one' | 'two' | 'big2' | 'big3' | 'grid4';
export type SheetOrientation = 'portrait' | 'landscape';
export type PhotoFit = 'fit' | 'fill';
export type FactKey = 'size' | 'in_box' | 'condition' | 'good_to_know';

export interface SheetPhoto {
  /** The saved photo (core S3File id). */
  file: number;
  width: number;
  height: number;
  /** Fit shows the whole photo; Fill crops it to the space. */
  fit: PhotoFit;
  /** Clockwise quarter turns, in degrees. */
  turn: number;
  /** Stands on plain white (the server trimmed a white border): its space may widen freely, white on white. */
  plain?: boolean;
  /**
   * The crop inside the photo's frame (#108): 1 shows it as Fit or Fill does; more is closer. The frame never moves.
   * Missing on photos saved before #108 (read as 1, 0, 0).
   */
  zoom?: number;
  /** How far the picture's centre moves in its frame, as a share of the frame's width and height. */
  x?: number;
  y?: number;
}

export const LAYOUTS: SheetLayout[] = ['one', 'two', 'big2', 'big3', 'grid4'];
export const ORIENTATIONS: SheetOrientation[] = ['portrait', 'landscape'];
export const MAX_PHOTOS = 4;

export const LAYOUT_LABEL: Record<SheetLayout, string> = {
  one: '1 photo',
  two: '2 photos',
  big2: '1 big, 2 small',
  big3: '1 big, 3 small',
  grid4: '4 in a grid',
};

export const ORIENTATION_LABEL: Record<SheetOrientation, string> = { portrait: 'Upright', landscape: 'Sideways' };

/** How many photos a template holds. */
export const LAYOUT_SLOTS: Record<SheetLayout, number> = { one: 1, two: 2, big2: 3, big3: 4, grid4: 4 };

export const FACT_KEYS: FactKey[] = ['size', 'in_box', 'condition', 'good_to_know'];
export const FACT_LABEL: Record<FactKey, string> = {
  size: 'Size',
  in_box: 'In the box',
  condition: 'Condition',
  good_to_know: 'Good to know',
};
export const FACT_MAX = 160;

/** US Letter, in inches, and the margin every office printer can print (D22). */
export const PAPER = { short: 8.5, long: 11, margin: 0.4 };

export function paperSize(orientation: SheetOrientation): { width: number; height: number } {
  return orientation === 'landscape' ? { width: PAPER.long, height: PAPER.short } : { width: PAPER.short, height: PAPER.long };
}

/** The photo grid of each template: CSS grid tracks and the area of each photo, in sheet order (a is the main photo). */
export interface LayoutGrid {
  columns: string;
  rows: string;
  areas: string;
}

const GRIDS: Record<SheetOrientation, Record<SheetLayout, LayoutGrid>> = {
  portrait: {
    one: { columns: '1fr', rows: '1fr', areas: '"a"' },
    two: { columns: '1fr', rows: '1fr 1fr', areas: '"a" "b"' },
    big2: { columns: '1fr 1fr', rows: '2fr 1fr', areas: '"a a" "b c"' },
    big3: { columns: '1fr 1fr 1fr', rows: '2.3fr 1fr', areas: '"a a a" "b c d"' },
    grid4: { columns: '1fr 1fr', rows: '1fr 1fr', areas: '"a b" "c d"' },
  },
  landscape: {
    one: { columns: '1fr', rows: '1fr', areas: '"a"' },
    two: { columns: '1fr 1fr', rows: '1fr', areas: '"a b"' },
    big2: { columns: '2fr 1fr', rows: '1fr 1fr', areas: '"a b" "a c"' },
    big3: { columns: '2.3fr 1fr', rows: '1fr 1fr 1fr', areas: '"a b" "a c" "a d"' },
    grid4: { columns: '1fr 1fr', rows: '1fr 1fr', areas: '"a b" "c d"' },
  },
};
export const SLOT_AREAS = ['a', 'b', 'c', 'd'];

export function layoutGrid(layout: SheetLayout, orientation: SheetOrientation): LayoutGrid {
  return GRIDS[orientation][layout] ?? GRIDS.portrait.one;
}

/** A photo's shape as it sits on the sheet (a quarter turn swaps its sides). */
export function isWide(photo: Pick<SheetPhoto, 'width' | 'height' | 'turn'> | undefined): boolean {
  if (!photo || !photo.width || !photo.height) return false;
  const quarter = ((photo.turn % 180) + 180) % 180 === 90;
  const [w, h] = quarter ? [photo.height, photo.width] : [photo.width, photo.height];
  return w > h * 1.05;
}

/** A fact's label: the sheet's own when someone (or the AI) changed it, else the standard one (#108). */
export function factLabel(key: FactKey, labels?: Partial<Record<FactKey, string>> | null): string {
  return (labels?.[key] ?? '').trim() || FACT_LABEL[key];
}
export const LABEL_MAX = 30;

/** The facts that print, in order: an empty one does not print, label included (D23). */
export function printedFacts(
  facts: Partial<Record<FactKey, string>>,
  labels?: Partial<Record<FactKey, string>> | null,
): { key: FactKey; label: string; value: string }[] {
  return FACT_KEYS.map((key) => ({ key, label: factLabel(key, labels), value: (facts[key] ?? '').trim() })).filter((fact) => fact.value);
}

/**
 * Picture contrast for a weak office printer (#108): one setting for the sheet, 0 as taken. Each step darkens the
 * middle tones (a gamma curve, so white paper stays white and black stays black) and deepens the colours a little.
 * Photos only: the words are already solid black.
 */
export const CONTRASTS = [0, 1, 2, 3] as const;
export const CONTRAST_LABEL = ['As taken', 'More', 'Strong', 'Strongest'] as const;
export function contrastCurve(step: number): { exponent: number; saturate: number } | null {
  const n = Math.max(0, Math.min(3, Math.round(step || 0)));
  if (!n) return null;
  return { exponent: [1, 1.3, 1.65, 2.05][n], saturate: [1, 1.12, 1.22, 1.32][n] };
}

/**
 * Title sizes in points (D23): big and bold, shrinks to fit two lines, three at most, never cut. `oneLineFloor`: a title
 * that fits one line at this size or more takes one line (sideways paper is short, and every line is photo height).
 */
export const TITLE_FIT = { max: 60, oneLineFloor: 0, twoLineFloor: 32, threeLineFloor: 22, min: 16, step: 1 };

/** Sideways paper is short: a smaller top size, and one line when it can, leave the photos most of the sheet (D21). */
export function titleFitFor(orientation: SheetOrientation): typeof TITLE_FIT {
  return orientation === 'landscape' ? { ...TITLE_FIT, max: 44, oneLineFloor: 34, twoLineFloor: 30 } : TITLE_FIT;
}

/**
 * The biggest title size that keeps the full title on two lines (no smaller than the two-line floor), else on three,
 * else the smallest size (the title wraps, it is never cut). `linesAt(pt)` says how many lines the title takes at a size.
 */
export function fitTitle(linesAt: (pt: number) => number, fit = TITLE_FIT): { pt: number; lines: number } {
  if (fit.oneLineFloor) {
    for (let pt = fit.max; pt >= fit.oneLineFloor; pt -= fit.step) {
      if (linesAt(pt) <= 1) return { pt, lines: 1 };
    }
  }
  for (let pt = fit.max; pt >= fit.twoLineFloor; pt -= fit.step) {
    const lines = linesAt(pt);
    if (lines <= 2) return { pt, lines };
  }
  for (let pt = fit.twoLineFloor; pt >= fit.threeLineFloor; pt -= fit.step) {
    const lines = linesAt(pt);
    if (lines <= 3) return { pt, lines };
  }
  for (let pt = fit.threeLineFloor; pt > fit.min; pt -= fit.step) {
    const lines = linesAt(pt);
    if (lines <= 3) return { pt, lines };
  }
  return { pt: fit.min, lines: linesAt(fit.min) };
}

/** "$129.99". */
export function sheetMoney(value: string | number | null | undefined): string {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return '';
  return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
