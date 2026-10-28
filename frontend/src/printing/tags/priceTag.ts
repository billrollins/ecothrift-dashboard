/**
 * The price tag ("Concept C" side stripe), drawn in Dash since 2026-10-28 so it follows the one label-size setting
 * (it was drawn by the print server, which knows only 3x2 / 1.5x1 / 1.25 square and fits to the driver's page).
 * Same layout as `printserver/services/label_printer.py` `generate_label`: the left third is the price band on top
 * and the QR (the plain SKU) below; the right two thirds hold the title, brand, the optional retail line and the logo.
 * Everything scales from the 1.5 x 1 in reference at 203 dpi (305 x 203 dots), so any size keeps the proportions.
 */
import type { LocalPrintRequest } from '../../services/localPrintService';
import { LOGO_ASPECT, type Measure, type TagBox, type TagDesign, type TagOp } from '../tagCanvas';

const REF_W = 305;
const REF_H = 203;
const TITLE_MAIN = 28;
const TITLE_SUB = 22;
const META = 20;
const TITLE_MAX_WORDS = 15;
const BRAND_MAX_WORDS = 6;
/** Arial digits stand about 0.72 of the font size above the baseline; the `$` about 0.8. */
const CAP = 0.72;
const DOLLAR = 0.8;
/** A line of Arial, top of the tallest letter to the bottom of a descender. */
const LINE = 0.95;
const SCALES = Array.from({ length: 51 }, (_, i) => Math.round((1 - i * 0.01) * 100) / 100);

export type PriceTagData = Pick<
  LocalPrintRequest,
  'text' | 'qr_data' | 'product_title' | 'product_brand' | 'include_text' | 'retail_text'
>;

/** "$1,234.5" into ("1,234", ".50"); null for N/A or junk. */
export function parsePrice(raw: string | undefined): { dollars: string; cents: string } | null {
  const s = (raw ?? '').trim().replace(/^\$/, '').trim();
  if (!s || s.toUpperCase() === 'N/A') return null;
  const [a, b = ''] = s.split('.', 2);
  const whole = a.replace(/\D/g, '') || (s.includes('.') ? '0' : '');
  if (!whole) return null;
  const frac = b.replace(/\D/g, '').slice(0, 2).padEnd(2, '0');
  return { dollars: Number.parseInt(whole, 10).toLocaleString('en-US'), cents: `.${frac}` };
}

function firstWords(text: string | undefined, max: number): string {
  const words = (text ?? '').trim().split(/\s+/).filter(Boolean);
  return words.length <= max ? words.join(' ') : `${words.slice(0, max).join(' ')}…`;
}

/** Words into lines that fit; returns the lines and the words left over. */
function takeLines(measure: Measure, words: string[], size: number, font: 'bold' | 'regular', maxW: number, maxLines: number) {
  const lines: string[] = [];
  let cur = '';
  let i = 0;
  while (i < words.length && lines.length < maxLines) {
    const test = cur ? `${cur} ${words[i]}` : words[i];
    if (measure(test, size, font) <= maxW) {
      cur = test;
      i += 1;
    } else if (cur) {
      lines.push(cur);
      cur = '';
    } else {
      lines.push(words[i]);
      i += 1;
    }
  }
  if (cur && lines.length < maxLines) lines.push(cur);
  return { lines, rest: words.slice(i) };
}

function bigBase(digits: number): number {
  if (digits <= 2) return 48;
  if (digits <= 3) return 42;
  if (digits <= 4) return 37;
  if (digits <= 5) return 35;
  if (digits <= 6) return 26;
  if (digits <= 7) return 20;
  return 18;
}

/** The black price band: small `$` top left, big dollars in the middle, cents bottom right, all in bare stock. */
export function priceBandOps(text: string | undefined, include: boolean, bandW: number, bandH: number, fs: number,
  measure: Measure): TagOp[] {
  const ops: TagOp[] = [{ kind: 'rect', x: 0, y: 0, w: bandW, h: bandH, fill: 'ink' }];
  const padX = Math.max(2, Math.floor(bandW / 36));
  const padY = Math.max(1, Math.floor(bandW / 48));
  const gap = Math.max(1, Math.floor(fs));
  const price = include ? parsePrice(text) : null;
  if (!price) {
    const size = Math.max(10, Math.floor(TITLE_MAIN * fs));
    ops.push({ kind: 'text', text: 'N/A', x: bandW / 2, y: bandH / 2, size, font: 'bold', fill: 'paper', align: 'center' });
    return ops;
  }
  const cx = bandW - padX;
  const cy = bandH - padY;
  const zero = Number.parseInt(price.dollars.replace(/\D/g, ''), 10) === 0;
  const dollarsX = padX + Math.max(3, Math.floor(bandW / 22));
  const big = bigBase(price.dollars.replace(/\D/g, '').length);

  let d = 0;
  let b = 0;
  let c = 0;
  let fitted = false;
  for (const scale of SCALES) {
    d = Math.max(12, Math.floor(28 * fs * scale));
    c = Math.max(9, Math.floor((zero ? 48 : 28) * fs * scale));
    b = Math.max(9, Math.floor(big * fs * scale));
    const symBottom = padY + d * DOLLAR;
    const centsTop = cy - c * CAP;
    if (zero) {
      if (padX + measure('$', d, 'bold') + gap <= cx - measure(price.cents, c, 'bold') && symBottom + gap <= centsTop) {
        fitted = true;
        break;
      }
    } else {
      const midH = centsTop - gap - (symBottom + gap);
      if (dollarsX + measure(price.dollars, b, 'bold') <= bandW - padX && midH >= b * CAP) {
        fitted = true;
        break;
      }
    }
  }
  if (!fitted) {
    d = Math.max(10, Math.floor(22 * fs));
    b = Math.max(9, Math.floor(24 * fs));
    c = Math.max(9, Math.floor(24 * fs));
  }
  ops.push({ kind: 'text', text: '$', x: padX, y: padY + d * DOLLAR, size: d, font: 'bold', fill: 'paper',
    baseline: 'alphabetic' });
  ops.push({ kind: 'text', text: price.cents, x: cx, y: cy, size: c, font: 'bold', fill: 'paper', align: 'right',
    baseline: 'bottom' });
  if (!zero) {
    const midTop = padY + d * DOLLAR + gap;
    const midBottom = cy - c * CAP - gap;
    const baseline = midTop + Math.max(0, (midBottom - midTop - b * CAP) / 2) + b * CAP;
    ops.push({ kind: 'text', text: price.dollars, x: dollarsX, y: baseline, size: b, font: 'bold', fill: 'paper',
      baseline: 'bottom' });
  }
  return ops;
}

export function layoutPriceTag(data: PriceTagData, box: TagBox, measure: Measure): TagOp[] {
  const { w, h } = box;
  const fs = Math.min(w / REF_W, h / REF_H);
  const sy = (y: number) => Math.max(1, Math.round((y * h) / REF_H));
  const ops: TagOp[] = [{ kind: 'rect', x: 0, y: 0, w, h, fill: 'paper' }];

  // Left third: price band on top, QR below (equal halves).
  const col1 = Math.max(1, Math.floor(w / 3));
  const bandH = Math.floor(h / 2);
  ops.push(...priceBandOps(data.text, data.include_text !== false, col1, bandH, fs, measure));
  const qrAreaH = h - bandH;
  const innerM = Math.max(2, Math.floor(4 * Math.min(fs, 1.35)));
  const qr = Math.max(24, Math.min(Math.round(col1 * 0.98), col1 - 2 * innerM, qrAreaH - 2 * innerM));
  ops.push({ kind: 'qr', data: data.qr_data, x: Math.floor((col1 - qr) / 2), y: bandH + Math.floor((qrAreaH - qr) / 2),
    size: qr });
  ops.push({ kind: 'line', x1: col1, y1: 0, x2: col1, y2: h, width: Math.max(1, Math.round(fs)) });

  // Right two thirds: words up top, the logo in a band at the bottom.
  const rightX = col1 + Math.max(1, Math.floor((3 * w) / REF_W));
  const rightW = w - rightX - Math.max(1, Math.floor((4 * w) / REF_W));
  const margin = Math.max(1, Math.floor(3 * Math.min(fs, 1.35)));
  const logoH = Math.max(sy(28), Math.floor(h * 0.26));
  let textBottom = h - logoH;
  const x = rightX + margin;
  const maxW = rightW - 2 * margin;
  const main = Math.max(10, Math.floor(TITLE_MAIN * fs));
  const sub = Math.max(8, Math.floor(TITLE_SUB * fs));
  const meta = Math.max(8, Math.floor(META * fs));

  const retail = (data.retail_text ?? '').trim().slice(0, 24);
  if (retail && maxW > 10) {
    const y = textBottom - sy(2);
    ops.push({ kind: 'text', text: retail, x, y, size: meta, font: 'regular', fill: 'ink', baseline: 'bottom' });
    textBottom = y - meta * LINE - sy(1);
  }

  let y = sy(1);
  const put = (lines: string[], size: number, font: 'bold' | 'regular', after: number) => {
    for (const line of lines) {
      if (y + size * LINE > textBottom) return;
      ops.push({ kind: 'text', text: line, x, y, size, font, fill: 'ink', baseline: 'top' });
      y += size * LINE + after;
    }
  };
  if (maxW > 10) {
    const title = firstWords(data.product_title, TITLE_MAX_WORDS);
    if (title) {
      const first = takeLines(measure, title.split(' '), main, 'bold', maxW, 2);
      put(first.lines, main, 'bold', sy(2));
      if (first.rest.length) put(takeLines(measure, first.rest, sub, 'regular', maxW, 2).lines, sub, 'regular', sy(2));
    }
    const brand = firstWords(data.product_brand, BRAND_MAX_WORDS);
    if (brand) put(takeLines(measure, brand.split(' '), meta, 'regular', maxW, 1).lines, meta, 'regular', sy(1));
  }

  // The logo, as big as fits its band, centered.
  const lw = Math.min(rightW, Math.floor(logoH * LOGO_ASPECT));
  const lh = Math.floor(lw / LOGO_ASPECT);
  ops.push({ kind: 'logo', x: rightX + Math.floor((rightW - lw) / 2),
    y: Math.min(h - logoH + Math.floor((logoH - lh) / 2), h - 2 - lh), w: lw, h: lh });

  ops.push({ kind: 'rect', x: 0, y: 0, w, h: 1, fill: 'ink' }, { kind: 'rect', x: 0, y: h - 1, w, h: 1, fill: 'ink' },
    { kind: 'rect', x: 0, y: 0, w: 1, h, fill: 'ink' }, { kind: 'rect', x: w - 1, y: 0, w: 1, h, fill: 'ink' });
  return ops;
}

export const priceTag: TagDesign<PriceTagData> = { name: 'Price tag', layout: layoutPriceTag };
