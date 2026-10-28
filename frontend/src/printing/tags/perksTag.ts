/**
 * The Thrift+ Perks price tag (owner 2026-10-28, design G3 / G4; reference drawing `tag_g()` at 2.25 x 1.25 in, 203 dpi
 * = 457 x 254 dots). Settings → Printing → Price tag design → Thrift+ Perks; drawn only while `price_tag_in_dash` is on.
 *
 * - **Left:** the struck "Retail $X" (only when the tag prints retail, the same retail check as the Classic tag),
 *   OUR PRICE, the big price, the title (2 lines at most) and the SKU, small.
 * - **Right:** a black header with THRIFT+ PERKS, the QR centered (`HTTPS://ECOTHRIFT.US/I/<SKU>`: a phone camera opens
 *   the item; every Dash scan box reads it as the SKU), and two promise lines under it: "Lower price" / "+ easy
 *   returns", or "Lower price" / "with Thrift+" on an AS IS item (no returns promise on an AS IS tag).
 * - **Bottom:** a full-width black strip, 3-DAY RETURNS WITH THRIFT+ or AS IS · NO RETURNS (rulebook A1: every new tag
 *   carries one of the two).
 *
 * Everything is placed in proportion to the box, so 1.5 x 1 and 3 x 2 print sensibly too. When room runs short the
 * promise lines shrink, then go; the QR, the price and the strip always stay.
 */
import { tagLink } from '../../utils/scanCode';
import {
  fitSize,
  qrModules,
  wrapWords,
  type Measure,
  type TagBox,
  type TagDesign,
  type TagFont,
  type TagOp,
} from '../tagCanvas';
import { parsePrice, type PriceTagData } from './priceTag';

const REF_W = 457;
const REF_H = 254;
/** A line of Arial, top of the tallest letter to the bottom of a descender. */
const LINE = 0.95;
/** Arial Black digits stand about 0.72 of the size above the baseline; the `$` reaches about 0.8 and dips 0.1 below. */
const CAP = 0.72;
/** Fewer dots per QR module than this is a risk for the store scanners and phones (`qrDotsPerModule`). */
const MIN_QR_DOTS = 3;
/** The smallest text that keeps its thin strokes once snapped to black and white, in inches (13 and 12 dots at 203). */
const MIN_REGULAR_IN = 0.064;
const MIN_BOLD_IN = 0.058;

export const PERKS_HEADER = 'THRIFT+ PERKS';
export const STRIP_RETURNS = '3-DAY RETURNS WITH THRIFT+';
export const STRIP_AS_IS = 'AS IS  ·  NO RETURNS';

export interface PerksTagData extends PriceTagData {
  /** Sold AS IS (Processing / Restoration marks, the scanner's rule): the AS IS strip and no returns promise. */
  as_is?: boolean;
}

/** "$12" for whole dollars, "$12.50" otherwise; null for N/A. */
export function perksPrice(text: string | undefined, include = true): string | null {
  const price = include ? parsePrice(text) : null;
  if (!price) return null;
  return price.cents === '.00' ? `$${price.dollars}` : `$${price.dollars}${price.cents}`;
}

export function promiseLines(asIs: boolean): [string, string] {
  return asIs ? ['Lower price', 'with Thrift+'] : ['Lower price', '+ easy returns'];
}

/** The header's words: one line, or THRIFT+ over PERKS when that prints clearly bigger (a narrow right zone). */
export function headerLines(measure: Measure, maxW: number, maxH: number): { lines: string[]; size: number } {
  const one = fitSize(measure, PERKS_HEADER, maxW, maxH * 0.62, 5, 'black');
  const twoStart = Math.floor((maxH * 0.86) / (2 * LINE));
  const two = Math.min(
    fitSize(measure, 'THRIFT+', maxW, twoStart, 5, 'black'),
    fitSize(measure, 'PERKS', maxW, twoStart, 5, 'black'),
  );
  return two >= one * 1.25 ? { lines: ['THRIFT+', 'PERKS'], size: two } : { lines: [PERKS_HEADER], size: one };
}

export function layoutPerksTag(data: PerksTagData, box: TagBox, measure: Measure): TagOp[] {
  const { w, h } = box;
  const sx = w / REF_W;
  const sy = h / REF_H;
  const fs = Math.min(sx, sy);
  const px = (n: number, min = 1) => Math.max(min, Math.round(n * fs));
  const minRegular = Math.round(MIN_REGULAR_IN * box.dpi);
  const minBold = Math.round(MIN_BOLD_IN * box.dpi);
  const asIs = data.as_is === true;
  const ops: TagOp[] = [{ kind: 'rect', x: 0, y: 0, w, h, fill: 'paper' }];

  // Bottom strip, full width: the return status, white on black.
  const stripH = Math.max(12, Math.round(42 * sy));
  const bodyH = h - stripH;
  ops.push({ kind: 'rect', x: 0, y: bodyH, w, h: stripH, fill: 'ink' });
  const stripText = asIs ? STRIP_AS_IS : STRIP_RETURNS;
  const stripSize = fitSize(measure, stripText, w - px(30, 6), Math.min(24 * fs, stripH * 0.62), 6, 'bold');
  ops.push({ kind: 'text', text: stripText, x: w / 2, y: bodyH + stripH / 2, size: stripSize, font: 'bold', fill: 'paper',
    align: 'center' });

  // Right zone: black header, the QR, the promise lines.
  const split = Math.round((284 / REF_W) * w);
  const rightW = w - split;
  const rcx = split + rightW / 2;
  const headerH = Math.max(10, Math.round((40 / 212) * bodyH));
  ops.push({ kind: 'rect', x: split, y: 0, w: rightW, h: headerH, fill: 'ink' });
  const header = headerLines(measure, rightW - px(16, 4), headerH);
  const headerTop = headerH / 2 - ((header.lines.length - 1) * header.size * LINE) / 2;
  header.lines.forEach((line, i) => {
    ops.push({ kind: 'text', text: line, x: rcx, y: headerTop + i * header.size * LINE, size: header.size, font: 'black',
      fill: 'paper', align: 'center' });
  });
  ops.push({ kind: 'line', x1: split, y1: headerH, x2: split, y2: bodyH, width: px(2) });

  const qrData = tagLink(data.qr_data);
  const qrNeed = (qrModules(qrData) + 2) * MIN_QR_DOTS;
  const m = px(8, 2);
  const areaTop = headerH + m;
  const areaH = bodyH - m - areaTop;
  const qrWide = rightW - 2 * m;
  // The promise lines shrink, then go, before the QR ever drops below whole 3-dot modules.
  const full = px(17, minBold);
  let promise = [...promiseLines(asIs)];
  let pSize = full;
  const block = (size: number, lines: number) => (lines ? lines * size * LINE + px(4) : 0);
  const qrFor = (size: number, lines: number) => Math.min(qrWide, areaH - block(size, lines));
  while (pSize > minBold && qrFor(pSize, 2) < qrNeed) pSize -= 1;
  if (qrFor(pSize, 2) < qrNeed) promise = [];
  // Promise lines that don't fit the zone's width shrink too.
  for (const line of promise) pSize = Math.min(pSize, fitSize(measure, line, qrWide, pSize, minBold, 'bold'));
  const qr = Math.max(1, Math.floor(qrFor(pSize, promise.length)));
  const groupH = qr + block(pSize, promise.length);
  const qrY = Math.round(areaTop + Math.max(0, (areaH - groupH) / 2));
  ops.push({ kind: 'qr', data: qrData, x: Math.round(rcx - qr / 2), y: qrY, size: qr });
  promise.forEach((line, i) => {
    ops.push({ kind: 'text', text: line, x: rcx, y: qrY + qr + px(4) + i * pSize * LINE, size: pSize, font: 'bold',
      fill: 'ink', align: 'center', baseline: 'top' });
  });

  // Left zone: retail struck, OUR PRICE, the price, the title, the SKU.
  const x = px(12, 3);
  const maxW = split - 2 * x;
  let y = Math.max(1, Math.round(6 * sy));
  const retail = (data.retail_text ?? '').trim().slice(0, 24);
  if (retail) {
    const size = fitSize(measure, retail, maxW, px(20, minRegular), minRegular, 'regular');
    ops.push({ kind: 'text', text: retail, x, y, size, font: 'regular', fill: 'ink', baseline: 'top' });
    const tw = Math.min(maxW, measure(retail, size, 'regular'));
    ops.push({ kind: 'line', x1: x - px(2), y1: Math.round(y + size * 0.42), x2: x + tw + px(2), y2: Math.round(y + size * 0.42),
      width: px(2) });
    y += size * LINE + Math.round(2 * sy);
  }
  const ourSize = px(16, minBold);
  ops.push({ kind: 'text', text: 'OUR PRICE', x, y, size: ourSize, font: 'bold', fill: 'ink', baseline: 'top' });
  y += ourSize * LINE + Math.round(2 * sy);

  // From the bottom up: the SKU, then the title's two lines (bold, then regular).
  let bottom = bodyH - Math.max(1, Math.round(6 * sy));
  const skuSize = px(15, minRegular);
  ops.push({ kind: 'text', text: data.qr_data, x, y: bottom, size: skuSize, font: 'regular', fill: 'ink', baseline: 'bottom' });
  bottom -= skuSize * LINE + Math.round(2 * sy);
  const title = (data.product_title ?? '').trim();
  const titleLines: Array<{ text: string; size: number; font: TagFont }> = [];
  if (title) {
    const t1 = px(18, minBold);
    const t2 = px(16, minRegular);
    const words = title.split(/\s+/);
    let n = 1;
    while (n < words.length && measure(words.slice(0, n + 1).join(' '), t1, 'bold') <= maxW) n += 1;
    // One word too long for the line: it shrinks to fit rather than run off the tag.
    const first = words.slice(0, n).join(' ');
    titleLines.push({ text: first, size: Math.min(t1, fitSize(measure, first, maxW, t1, minBold, 'bold')), font: 'bold' });
    if (n < words.length) {
      titleLines.push({ text: wrapWords(measure, words.slice(n).join(' '), t2, 'regular', maxW, 1)[0] ?? '', size: t2,
        font: 'regular' });
    }
  }
  for (let i = titleLines.length - 1; i >= 0; i -= 1) {
    const line = titleLines[i];
    ops.push({ kind: 'text', text: line.text, x, y: bottom, size: line.size, font: line.font, fill: 'ink', baseline: 'bottom' });
    bottom -= line.size * LINE;
  }

  // The price fills what is left between OUR PRICE and the title, as big as fits.
  const gap = Math.round(3 * sy);
  const priceH = bottom - gap - (y + gap);
  const priceText = perksPrice(data.text, data.include_text !== false) ?? 'N/A';
  const byHeight = Math.floor(priceH / 0.92);
  const size = fitSize(measure, priceText, maxW, Math.min(byHeight, Math.round(80 * fs * 1.15)), 8, 'black');
  const baseline = y + gap + (priceH + size * CAP) / 2;
  ops.push({ kind: 'text', text: priceText, x, y: baseline, size, font: 'black', fill: 'ink', baseline: 'alphabetic' });

  ops.push({ kind: 'rect', x: 0, y: 0, w, h: 1, fill: 'ink' }, { kind: 'rect', x: 0, y: h - 1, w, h: 1, fill: 'ink' },
    { kind: 'rect', x: 0, y: 0, w: 1, h, fill: 'ink' }, { kind: 'rect', x: w - 1, y: 0, w: 1, h, fill: 'ink' });
  return ops;
}

export const perksTag: TagDesign<PerksTagData> = { name: 'Price tag', layout: layoutPerksTag };
