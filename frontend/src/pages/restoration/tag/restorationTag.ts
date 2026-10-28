/**
 * The restoration tag (owner, 2026-10-28; layout A). It goes on blue painter's tape, on the same stock and printer as
 * the price tag, and must not read as one: a black RESTORATION band, no price. It says what anyone who walks past
 * wants to know: the scannable SKU (the same QR of the plain SKU the price tag has), the SKU in big type, a short
 * title, the work in big words (or HOLDOUT), and when it was sent and by whom.
 *
 * Laid out in proportion to the label (redone 10-28 for 1.5 x 1 stock, where the 3 x 2 drawing printed tiny): band,
 * QR, SKU and work first; the title gets one line on small stock, two on large, and goes when there is no room.
 * Printed like every tag through `printing/printTags.ts`.
 */
import type { RestorationTagFacts } from '../../../types/inventory.types';
import {
  fitSize,
  frame,
  wrapWords,
  type Measure,
  type TagBox,
  type TagDesign,
  type TagOp,
} from '../../../printing/tagCanvas';

export type { RestorationTagFacts };

export interface RestorationTagInput extends RestorationTagFacts {
  sku: string;
  title: string;
}

const DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

/** "WED OCT 28" from an ISO date, read as a calendar day (no time zone shift). */
export function sentLabel(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '');
  if (!m) return '';
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return `${DAYS[d.getUTCDay()]} ${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

/** The work in big words: TEST · ASSEMBLE, or HOLDOUT for an assembly holdout. */
export function workWords(facts: Pick<RestorationTagFacts, 'needs' | 'holdout'>): string {
  if (facts.holdout) return 'HOLDOUT · SELL AS IS';
  return facts.needs.map((n) => n.toUpperCase()).join(' · ');
}

export function layoutRestorationTag(input: RestorationTagInput, box: TagBox, measure: Measure): TagOp[] {
  const { w, h } = box;
  const m = Math.max(3, Math.round(h * 0.03));
  const ops: TagOp[] = [{ kind: 'rect', x: 0, y: 0, w, h, fill: 'paper' }];

  // The band: what it is, from across the room. Light letters are bare stock.
  const band = Math.round(h * 0.19);
  ops.push({ kind: 'rect', x: 0, y: 0, w, h: band, fill: 'ink' });
  ops.push({ kind: 'text', text: 'RESTORATION', x: w / 2, y: band / 2, align: 'center', fill: 'paper', font: 'black',
    size: fitSize(measure, 'RESTORATION', w - 4 * m, band * 0.8, 6, 'black') });

  // The strip at the bottom: when it was sent (its days in Restoration count from here) and who sent it.
  const strip = Math.round(h * 0.2);
  const top = h - strip;
  const rule = Math.max(2, Math.round(h * 0.008));

  // QR (the plain SKU, as on the price tag), as tall as the middle allows, and the facts beside it.
  const qr = Math.min(top - band - 2 * m, Math.round(w * 0.42));
  ops.push({ kind: 'qr', data: input.sku, x: m, y: band + Math.floor((top - band - qr) / 2), size: qr });
  const x = m + qr + m;
  const maxW = w - x - m;
  let y = band + m;
  const skuSize = fitSize(measure, input.sku, maxW, h * 0.17, 6, 'bold');
  ops.push({ kind: 'text', text: input.sku, x, y, size: skuSize, font: 'bold', fill: 'ink', baseline: 'top' });
  y += skuSize * 1.05 + m / 2;

  const words = workWords(input);
  const workMin = h * 0.11;
  const bottom = top - m;
  // The title: one line on small stock, two on large; dropped when the work would not keep its room.
  const titleSize = Math.max(6, Math.round(h * 0.075));
  const titleLines = box.h / box.dpi >= 1.5 ? 2 : 1;
  const title = wrapWords(measure, input.title || input.sku, titleSize, 'bold', maxW, titleLines);
  for (const line of title) {
    if (y + titleSize * 1.1 + (words ? workMin : 0) > bottom) break;
    ops.push({ kind: 'text', text: line, x, y, size: titleSize, font: 'bold', fill: 'ink', baseline: 'top' });
    y += titleSize * 1.1;
  }

  // The work in big words, filling the room left above the strip.
  if (words) {
    const room = bottom - y;
    const one = fitSize(measure, words, maxW, Math.min(h * 0.13, room * 0.9), 5, 'black');
    // Two lines, split at a dot, when that prints bigger: the work is the point of the tag.
    const parts = words.split(' · ');
    const half = Math.ceil(parts.length / 2);
    const lines = [parts.slice(0, half).join(' · '), parts.slice(half).join(' · ')];
    const two = parts.length > 1
      ? Math.min(...lines.map((l) => fitSize(measure, l, maxW, Math.min(h * 0.13, room / 2.2), 5, 'black')))
      : 0;
    if (one >= two) {
      ops.push({ kind: 'text', text: words, x, y: y + room / 2, size: one, font: 'black', fill: 'ink' });
    } else {
      const size = two;
      const gap = (room - 2 * size) / 3;
      lines.forEach((l, i) => ops.push({ kind: 'text', text: l, x, y: y + gap + size / 2 + i * (size + gap), size,
        font: 'black', fill: 'ink' }));
    }
  }

  ops.push({ kind: 'line', x1: 0, y1: top, x2: w, y2: top, width: rule });
  ops.push({ kind: 'line', x1: w / 2, y1: top, x2: w / 2, y2: h, width: rule });
  const mid = top + strip / 2;
  const capSize = Math.max(5, Math.round(strip * 0.3));
  const cell = (caption: string, value: string, left: number) => {
    const capW = measure(caption, capSize, 'regular');
    ops.push({ kind: 'text', text: caption, x: left + m, y: mid, size: capSize, font: 'regular', fill: 'ink' });
    const vx = left + m + capW + m;
    ops.push({ kind: 'text', text: value, x: vx, y: mid, font: 'black', fill: 'ink',
      size: fitSize(measure, value, left + w / 2 - m - vx, strip * 0.55, 5, 'black') });
  };
  cell('SENT', sentLabel(input.sent_on) || '-', 0);
  cell('BY', input.sent_by || '-', w / 2);
  ops.push(...frame(box, rule));
  return ops;
}

export const restorationTag: TagDesign<RestorationTagInput> = { name: 'Restoration tag', layout: layoutRestorationTag };
