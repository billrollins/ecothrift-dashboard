/**
 * Where each photo goes on a sheet (Dash Update #95, round 2: "the photos float in white space").
 *
 * Every space takes the shape of its photo (Fit), or the even shape of the template's grid (Fill, cropped), and the
 * spaces are justified: a row shares one height and runs the full width, a column shares one width. So no photo sits in
 * a white band, the edges line up, and the block of photos is as big as the space allows. Each template has two ways to
 * stand (a big photo on top of a row, or on the left of a column; rows or columns); the one with the most photo wins.
 * All sizes are in inches.
 */
import { LAYOUT_SLOTS, isWide, type SheetLayout, type SheetOrientation, type SheetPhoto } from './sheetLayouts';

export interface Rect { x: number; y: number; w: number; h: number; /** Stretched a little past the photo's shape: shown cropped. */ crop?: boolean }
export interface PhotoPlan {
  rects: Rect[];
  /** The block the photos take, from the top left of the photo area. */
  width: number;
  height: number;
  area: number;
  arrangement: string;
}

export const PHOTO_GAP = 0.12;
const MIN_SPACE = 0.9;
const SMALL_SIDE = 1.0;

/** The photo's shape as it sits on the sheet, width over height. */
export function photoAspect(photo: Pick<SheetPhoto, 'width' | 'height' | 'turn'>): number {
  if (!photo.width || !photo.height) return 4 / 3;
  const quarter = ((photo.turn % 180) + 180) % 180 === 90;
  const a = quarter ? photo.height / photo.width : photo.width / photo.height;
  return Math.min(3, Math.max(1 / 3, a));
}

const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);

function planOf(rects: Rect[], arrangement: string): PhotoPlan {
  const width = Math.max(0, ...rects.map((r) => r.x + r.w));
  const height = Math.max(0, ...rects.map((r) => r.y + r.h));
  const ok = rects.every((r) => r.w >= MIN_SPACE * 0.6 && r.h >= MIN_SPACE * 0.6);
  // A photo shorter than SMALL_SIDE on its short side is a stamp from six feet: a plan with stamps counts for less.
  const stamps = rects.filter((r) => Math.min(r.w, r.h) < SMALL_SIDE).length;
  const area = ok ? sum(rects.map((r) => r.w * r.h)) * 0.9 ** stamps : 0;
  return { rects, width, height, area, arrangement };
}

/** One row of photos sharing a height, as wide as `W` allows and no taller than `H`. */
function row(aspects: number[], W: number, H: number, x0 = 0, y0 = 0): Rect[] {
  const gaps = (aspects.length - 1) * PHOTO_GAP;
  const h = Math.min(H, (W - gaps) / sum(aspects));
  let x = x0;
  return aspects.map((a) => {
    const rect = { x, y: y0, w: h * a, h };
    x += rect.w + PHOTO_GAP;
    return rect;
  });
}

/** One column of photos sharing a width, as tall as `H` allows and no wider than `W`. */
function column(aspects: number[], W: number, H: number, x0 = 0, y0 = 0): Rect[] {
  const gaps = (aspects.length - 1) * PHOTO_GAP;
  const w = Math.min(W, (H - gaps) / sum(aspects.map((a) => 1 / a)));
  let y = y0;
  return aspects.map((a) => {
    const rect = { x: x0, y, w, h: w / a };
    y += rect.h + PHOTO_GAP;
    return rect;
  });
}

/** The big photo over a row of small ones, all one width. */
function bigOnTop(aspects: number[], W: number, H: number): Rect[] {
  const [a0, ...small] = aspects;
  const S = sum(small);
  const k = small.length;
  const gapsRow = (k - 1) * PHOTO_GAP;
  // Height of the whole block for a block width M: M / a0 + gap + (M - gapsRow) / S.
  const fitH = (H - PHOTO_GAP + gapsRow / S) / (1 / a0 + 1 / S);
  const M = Math.min(W, fitH);
  const main = { x: 0, y: 0, w: M, h: M / a0 };
  return [main, ...row(small, M, Infinity, 0, main.h + PHOTO_GAP)];
}

/** The big photo on the left of a column of small ones, all one height. */
function bigOnLeft(aspects: number[], W: number, H: number): Rect[] {
  const [a0, ...small] = aspects;
  const T = sum(small.map((a) => 1 / a));
  const k = small.length;
  const gapsCol = (k - 1) * PHOTO_GAP;
  // Width of the whole block for a block height h: h * a0 + gap + (h - gapsCol) / T.
  const fitW = (W - PHOTO_GAP + gapsCol / T) / (a0 + 1 / T);
  const h = Math.min(H, fitW);
  const main = { x: 0, y: 0, w: h * a0, h };
  return [main, ...column(small, Infinity, h, main.w + PHOTO_GAP, 0)];
}

/** Two rows that each run the full width (the four grid, read across). */
function twoRows(aspects: number[], W: number, H: number): Rect[] {
  const split = Math.ceil(aspects.length / 2);
  const top = aspects.slice(0, split);
  const bottom = aspects.slice(split);
  const inv = 1 / sum(top) + 1 / sum(bottom);
  const gapsTop = (top.length - 1) * PHOTO_GAP;
  const gapsBottom = (bottom.length - 1) * PHOTO_GAP;
  // Block height for width M: (M - gapsTop) / sum(top) + gap + (M - gapsBottom) / sum(bottom).
  const fitM = (H - PHOTO_GAP + gapsTop / sum(top) + gapsBottom / sum(bottom)) / inv;
  const M = Math.min(W, fitM);
  const first = row(top, M, Infinity);
  return [...first, ...row(bottom, M, Infinity, 0, first[0].h + PHOTO_GAP)];
}

/** Two columns that each run the full height (the four grid, read down). */
function twoColumns(aspects: number[], W: number, H: number): Rect[] {
  // Photos 1 and 3 on the left, 2 and 4 on the right, so the order still reads across.
  const left = aspects.filter((_, n) => n % 2 === 0);
  const right = aspects.filter((_, n) => n % 2 === 1);
  const L = sum(left.map((a) => 1 / a));
  const R = sum(right.map((a) => 1 / a));
  const gapsL = (left.length - 1) * PHOTO_GAP;
  const gapsR = (right.length - 1) * PHOTO_GAP;
  const fitN = (W - PHOTO_GAP + gapsL / L + gapsR / R) / (1 / L + 1 / R);
  const N = Math.min(H, fitN);
  const a = column(left, Infinity, N);
  const b = column(right, Infinity, N, a[0].w + PHOTO_GAP, 0);
  const out: Rect[] = [];
  aspects.forEach((_, n) => out.push(n % 2 === 0 ? a[n / 2] : b[(n - 1) / 2]));
  return out;
}

/** The even shape each space would have on a plain grid of the box (what Fill crops a photo to). */
function evenShapes(arrangement: string, count: number, W: number, H: number): number[] {
  const g = PHOTO_GAP;
  const k = Math.max(1, count - 1);
  switch (arrangement) {
    case 'row': return Array(count).fill(((W - (count - 1) * g) / count) / H);
    case 'column': return Array(count).fill(W / ((H - (count - 1) * g) / count));
    case 'top': return [W / (H * 0.66), ...Array(k).fill(((W - (k - 1) * g) / k) / (H * 0.34 - g))];
    case 'left': return [(W * 0.66) / H, ...Array(k).fill((W * 0.34 - g) / ((H - (k - 1) * g) / k))];
    case 'rows':
    case 'columns': return Array(count).fill(((W - g) / 2) / ((H - g) / 2));
    default: return [W / H];
  }
}

const ARRANGEMENTS: Record<SheetLayout, string[]> = {
  one: ['single'],
  two: ['row', 'column'],
  big2: ['top', 'left'],
  big3: ['top', 'left'],
  grid4: ['rows', 'columns'],
};

/**
 * The photos of a template in a box W x H. Only the photos there are placed (a template with fewer photos than spaces
 * closes up, so nothing prints as an empty hole). Returns the plan with the most photo on the paper.
 */
export function planPhotos(layout: SheetLayout, photos: Pick<SheetPhoto, 'width' | 'height' | 'turn' | 'fit'>[], W: number, H: number): PhotoPlan {
  const shown = photos.slice(0, LAYOUT_SLOTS[layout] ?? 1);
  if (!shown.length || W <= 0 || H <= 0) return { rects: [], width: 0, height: 0, area: 0, arrangement: 'none' };
  const kinds = shown.length === 1 ? ['single'] : ARRANGEMENTS[layout];
  let best: PhotoPlan | null = null;
  for (const arrangement of kinds) {
    const even = evenShapes(arrangement, shown.length, W, H);
    const aspects = shown.map((photo, n) => (photo.fit === 'fill' ? Math.min(3, Math.max(1 / 3, even[n])) : photoAspect(photo)));
    let rects: Rect[];
    switch (arrangement) {
      case 'single': rects = row(aspects, W, H); break;
      case 'row': rects = row(aspects, W, H); break;
      case 'column': rects = column(aspects, W, H); break;
      case 'top': rects = bigOnTop(aspects, W, H); break;
      case 'left': rects = bigOnLeft(aspects, W, H); break;
      case 'rows': rects = twoRows(aspects, W, H); break;
      default: rects = twoColumns(aspects, W, H);
    }
    const plan = planOf(rects, arrangement);
    if (plan.width > W + 0.01 || plan.height > H + 0.01) plan.area = 0;
    if (!best || plan.area > best.area + 0.01) best = plan;
  }
  return best!;
}

/** Where the words under the title go: under the photos, or in a column beside them. */
export type FactsPlace = 'below' | 'beside' | 'none';

export interface SheetPlan {
  photos: PhotoPlan;
  facts: FactsPlace;
  /** The photo area: the box the photos were fitted in. */
  box: { w: number; h: number };
}

export const FACTS_GAP = 0.2;
/** The widths a column of facts beside the photos may take (inches); the photos get whatever is left. */
export const SIDE_WIDTHS = [2.9, 3.3, 3.7];

/**
 * The whole body of the sheet: the photos and, when there are any, the facts under them or in a column beside them,
 * whichever gives the photos the most paper. `factsBelow` is the facts' height at the full width; `factsBeside` their
 * height at each of SIDE_WIDTHS.
 */
export function planSheet(args: {
  layout: SheetLayout;
  orientation: SheetOrientation;
  photos: Pick<SheetPhoto, 'width' | 'height' | 'turn' | 'fit' | 'plain'>[];
  body: { w: number; h: number };
  factsBelow: number;
  factsBeside: number[];
  hasFacts: boolean;
}): SheetPlan {
  const { body } = args;
  if (!args.hasFacts) {
    return { photos: stretchPlan(planPhotos(args.layout, args.photos, body.w, body.h), body.w, body.h, args.photos), facts: 'none', box: body };
  }
  // The score: photo on the paper, less a share of the paper left blank (round 2: a white band beside the photos
  // reads as unfinished even when the photos are a little bigger). Words under the photos get a small head start,
  // because they read first there.
  // A band of white beside the photos (words under them, photos short of the width) counts double: it is what made the
  // round 1 sheets look unfinished. White at the foot of the page reads as a margin.
  const blank = (photos: PhotoPlan, wordsArea: number) => Math.max(0, body.w * body.h - photos.width * photos.height - wordsArea);
  const score = (photos: PhotoPlan, wordsArea: number, sideBand = 0) => (
    photos.area ? photos.area - BLANK_WEIGHT * blank(photos, wordsArea) - BLANK_WEIGHT * sideBand : 0
  );

  const belowBox = { w: body.w, h: Math.max(0, body.h - args.factsBelow - FACTS_GAP) };
  const belowPhotos = stretchPlan(planPhotos(args.layout, args.photos, belowBox.w, belowBox.h), belowBox.w, belowBox.h, args.photos);
  let best: SheetPlan = { photos: belowPhotos, facts: 'below', box: belowBox };
  const band = (body.w - belowPhotos.width) * belowPhotos.height;
  let bestScore = score(belowPhotos, body.w * args.factsBelow, band) * 1.04;
  SIDE_WIDTHS.forEach((side, n) => {
    const tall = args.factsBeside[n] ?? Infinity;
    if (tall > body.h) return;
    const box = { w: Math.max(0, body.w - side - FACTS_GAP), h: body.h };
    const photos = stretchPlan(planPhotos(args.layout, args.photos, box.w, box.h), box.w, box.h, args.photos);
    const s = score(photos, (body.w - photos.width) * tall);
    if (s > bestScore) {
      best = { photos, facts: 'beside', box };
      bestScore = s;
    }
  });
  return best;
}

/**
 * Close a gap the photos leave in their box by widening their spaces. A picture on plain white (most web product
 * pictures, D24 as Bill corrected it 11-11) sits whole in a wider space: the extra is white on white, so the space may
 * grow to the full box. Any other picture (a staged room, mostly) crops a little to fill a space up to STRETCH past its shape (about 9% a side, background first).
 */
export function stretchPlan(plan: PhotoPlan, W: number, H: number, photos: Pick<SheetPhoto, 'plain'>[] = []): PhotoPlan {
  if (!plan.rects.length) return plan;
  const allPlain = plan.rects.every((_, n) => Boolean(photos[n]?.plain));
  const limit = allPlain ? Infinity : STRETCH;
  const sx = plan.width > 0 && plan.width < W - 0.04 ? Math.min(limit, W / plan.width) : 1;
  const sy = plan.height > 0 && plan.height < H - 0.04 ? Math.min(limit, H / plan.height) : 1;
  if (sx === 1 && sy === 1) return plan;
  const rects = plan.rects.map((r, n) => ({
    // Everything grows together (the gaps too, a little).
    x: r.x * sx, y: r.y * sy, w: r.w * sx, h: r.h * sy,
    // A plain picture shows whole (white on white); any other fills its space, cropped a little.
    crop: !photos[n]?.plain,
  }));
  return { ...plan, rects, width: plan.width * sx, height: plan.height * sy, area: plan.area };
}

const STRETCH = 1.22;

/** How much a square inch of blank paper counts against a plan, next to a square inch of photo. */
const BLANK_WEIGHT = 0.35;

/** Rough sizes for picking a template before anything is measured (inches). */
const GUESS = {
  portrait: { body: { w: 7.7, h: 10.2 - 1.9 }, below: 1.5, beside: [4.2, 3.6, 3.2] },
  landscape: { body: { w: 10.2, h: 7.7 - 1.9 }, below: 1.5, beside: [4.2, 3.6, 3.2] },
};

/**
 * The template Dash starts with (D24): the layout from how many photos there are, and the way the paper turns from
 * which one gives those photos more paper.
 */
export function pickLayout(photos: Pick<SheetPhoto, 'width' | 'height' | 'turn'>[]): { layout: SheetLayout; orientation: SheetOrientation } {
  const count = photos.length;
  const layout: SheetLayout = count <= 1 ? 'one' : count === 2 ? 'two' : count === 3 ? 'big2' : 'big3';
  if (!count) return { layout, orientation: 'portrait' };
  const fitted = photos.map((photo) => ({ ...photo, fit: 'fit' as const }));
  const area = (orientation: SheetOrientation) => {
    const g = GUESS[orientation];
    return planSheet({ layout, orientation, photos: fitted, body: g.body, factsBelow: g.below, factsBeside: g.beside, hasFacts: true }).photos.area;
  };
  const up = area('portrait');
  const side = area('landscape');
  // A wide first photo leans sideways when it is close: a wide item is what sideways is for.
  const lean = isWide(photos[0]) ? 1.06 : 1;
  return { layout, orientation: side * lean > up ? 'landscape' : 'portrait' };
}
