/**
 * The restoration tag (owner, 2026-10-28; layout A, picked from two mockups). It goes on blue painter's tape, on the
 * same green 3x2 stock and printer as the price tag, and must not read as one: a black RESTORATION band, no price.
 * It says what anyone who walks past wants to know: the scannable SKU (the same QR of the plain SKU the price tag
 * has), the SKU in big type, a short title, the work in big words (or HOLDOUT), and when it was sent and by whom.
 *
 * Drawn in the browser and printed through the print server's `/print/image-copies` (there since 1.4.1), so no new
 * print server is needed. `layoutRestorationTag` is pure (tested); `paintRestorationTag` draws it on a canvas.
 */
import QRCode from 'qrcode';
import type { RestorationTagFacts } from '../../../types/inventory.types';

export type { RestorationTagFacts };

export const TAG_W = 609; // 3 in at 203 dpi
export const TAG_H = 406; // 2 in
export const TAG_DPI = 203;

export interface RestorationTagInput extends RestorationTagFacts {
  sku: string;
  title: string;
}

export type TagFont = 'black' | 'bold' | 'regular';

export type TagOp =
  | { kind: 'rect'; x: number; y: number; w: number; h: number; fill: 'ink' | 'paper' }
  | { kind: 'line'; x1: number; y1: number; x2: number; y2: number; width: number }
  | { kind: 'text'; text: string; x: number; y: number; size: number; font: TagFont; fill: 'ink' | 'paper';
      align?: 'left' | 'center' }
  | { kind: 'qr'; data: string; x: number; y: number; size: number };

/** Width of a line of text at a size; the canvas in the browser, an estimate in tests. */
export type Measure = (text: string, size: number, font: TagFont) => number;

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

function fit(measure: Measure, text: string, maxW: number, start: number, min: number, font: TagFont): number {
  let size = start;
  while (size > min && measure(text, size, font) > maxW) size -= 1;
  return size;
}

/** Words into at most `maxLines` lines; the last one ends in an ellipsis when it had to stop. */
export function wrapWords(measure: Measure, text: string, size: number, font: TagFont, maxW: number, maxLines: number): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (measure(next, size, font) <= maxW || !cur) cur = next;
    else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  if (lines.length <= maxLines) return lines;
  const kept = lines.slice(0, maxLines);
  let last = kept[maxLines - 1];
  while (last.includes(' ') && measure(`${last}…`, size, font) > maxW) last = last.slice(0, last.lastIndexOf(' '));
  kept[maxLines - 1] = `${last}…`;
  return kept;
}

export function layoutRestorationTag(input: RestorationTagInput, measure: Measure): TagOp[] {
  const ops: TagOp[] = [{ kind: 'rect', x: 0, y: 0, w: TAG_W, h: TAG_H, fill: 'paper' }];
  // The band: what it is, from across the room. Light letters are bare stock.
  const band = 78;
  ops.push({ kind: 'rect', x: 0, y: 0, w: TAG_W, h: band, fill: 'ink' });
  ops.push({ kind: 'text', text: 'RESTORATION', x: TAG_W / 2, y: band / 2, align: 'center', fill: 'paper',
    font: 'black', size: fit(measure, 'RESTORATION', TAG_W - 40, 64, 30, 'black') });

  // QR (the plain SKU, as on the price tag) and the facts beside it.
  const qr = 190;
  ops.push({ kind: 'qr', data: input.sku, x: 12, y: band + 12, size: qr });
  const x = 12 + qr + 16;
  const maxW = TAG_W - x - 12;
  const skuSize = fit(measure, input.sku, maxW, 54, 24, 'bold');
  ops.push({ kind: 'text', text: input.sku, x, y: band + 10 + skuSize / 2, size: skuSize, font: 'bold', fill: 'ink' });
  let y = band + 10 + skuSize + 12;
  const titleSize = 24;
  for (const line of wrapWords(measure, input.title || input.sku, titleSize, 'bold', maxW, 2)) {
    ops.push({ kind: 'text', text: line, x, y: y + titleSize / 2, size: titleSize, font: 'bold', fill: 'ink' });
    y += titleSize + 6;
  }

  // The work in big words, filling the room left above the strip.
  const words = workWords(input);
  const top = TAG_H - 92;
  if (words) {
    const room = top - y - 8;
    const one = fit(measure, words, maxW, Math.min(44, room), 20, 'black');
    if (measure(words, one, 'black') <= maxW || !words.includes(' · ')) {
      ops.push({ kind: 'text', text: words, x, y: y + 4 + (room - 4) / 2, size: one, font: 'black', fill: 'ink' });
    } else {
      // Too many for one line: two lines, split at a dot.
      const parts = words.split(' · ');
      const half = Math.ceil(parts.length / 2);
      const lines = [parts.slice(0, half).join(' · '), parts.slice(half).join(' · ')];
      const size = Math.min(...lines.map((l) => fit(measure, l, maxW, Math.min(34, room / 2 - 2), 16, 'black')));
      lines.forEach((l, i) => ops.push({ kind: 'text', text: l, x, y: y + 4 + size / 2 + i * (size + 4), size,
        font: 'black', fill: 'ink' }));
    }
  }

  // Strip: when it was sent (its days in Restoration count from here) and who sent it.
  ops.push({ kind: 'line', x1: 0, y1: top, x2: TAG_W, y2: top, width: 3 });
  ops.push({ kind: 'line', x1: TAG_W / 2, y1: top, x2: TAG_W / 2, y2: TAG_H, width: 3 });
  const sent = sentLabel(input.sent_on);
  const by = input.sent_by || '-';
  const cellW = TAG_W / 2 - 28;
  ops.push({ kind: 'text', text: 'SENT', x: 14, y: top + 18, size: 18, font: 'regular', fill: 'ink' });
  ops.push({ kind: 'text', text: sent, x: 14, y: top + 58, size: fit(measure, sent, cellW, 36, 18, 'black'),
    font: 'black', fill: 'ink' });
  ops.push({ kind: 'text', text: 'SENT BY', x: TAG_W / 2 + 14, y: top + 18, size: 18, font: 'regular', fill: 'ink' });
  ops.push({ kind: 'text', text: by, x: TAG_W / 2 + 14, y: top + 58, size: fit(measure, by, cellW, 36, 18, 'black'),
    font: 'black', fill: 'ink' });
  ops.push({ kind: 'rect', x: 0, y: 0, w: TAG_W, h: 2, fill: 'ink' });
  ops.push({ kind: 'rect', x: 0, y: TAG_H - 2, w: TAG_W, h: 2, fill: 'ink' });
  ops.push({ kind: 'rect', x: 0, y: 0, w: 2, h: TAG_H, fill: 'ink' });
  ops.push({ kind: 'rect', x: TAG_W - 2, y: 0, w: 2, h: TAG_H, fill: 'ink' });
  return ops;
}

const CSS_FONT: Record<TagFont, string> = {
  black: '"Arial Black", "Arial Bold", Arial, sans-serif',
  bold: 'Arial, Helvetica, sans-serif',
  regular: 'Arial, Helvetica, sans-serif',
};

function cssFont(font: TagFont, size: number): string {
  return `${font === 'regular' ? '' : font === 'black' ? '900 ' : '700 '}${size}px ${CSS_FONT[font]}`;
}

export function canvasMeasure(ctx: CanvasRenderingContext2D): Measure {
  return (text, size, font) => {
    ctx.font = cssFont(font, size);
    return ctx.measureText(text).width;
  };
}

/** Black and white only: the thermal printer prints black; white is the bare green stock. */
export function paintRestorationTag(ctx: CanvasRenderingContext2D, ops: TagOp[]): void {
  for (const op of ops) {
    if (op.kind === 'rect') {
      ctx.fillStyle = op.fill === 'ink' ? '#000' : '#fff';
      ctx.fillRect(op.x, op.y, op.w, op.h);
    } else if (op.kind === 'line') {
      ctx.fillStyle = '#000';
      if (op.y1 === op.y2) ctx.fillRect(op.x1, op.y1 - op.width / 2, op.x2 - op.x1, op.width);
      else ctx.fillRect(op.x1 - op.width / 2, op.y1, op.width, op.y2 - op.y1);
    } else if (op.kind === 'text') {
      ctx.fillStyle = op.fill === 'ink' ? '#000' : '#fff';
      ctx.font = cssFont(op.font, op.size);
      ctx.textBaseline = 'middle';
      ctx.textAlign = op.align === 'center' ? 'center' : 'left';
      ctx.fillText(op.text, op.x, op.y);
    } else {
      // Whole modules on whole pixels, quiet zone of one module, like the price tag's QR.
      const qr = QRCode.create(op.data, { errorCorrectionLevel: 'H' });
      const n = qr.modules.size;
      const cell = Math.floor(op.size / (n + 2));
      const side = cell * (n + 2);
      const ox = op.x + Math.floor((op.size - side) / 2);
      const oy = op.y + Math.floor((op.size - side) / 2);
      ctx.fillStyle = '#fff';
      ctx.fillRect(op.x, op.y, op.size, op.size);
      ctx.fillStyle = '#000';
      for (let r = 0; r < n; r += 1) {
        for (let c = 0; c < n; c += 1) {
          if (qr.modules.get(r, c)) ctx.fillRect(ox + (c + 1) * cell, oy + (r + 1) * cell, cell, cell);
        }
      }
    }
  }
}

/** The tag as a base64 PNG (no data: prefix), 609 x 406. */
export function renderRestorationTagPng(input: RestorationTagInput): string {
  const canvas = document.createElement('canvas');
  canvas.width = TAG_W;
  canvas.height = TAG_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser cannot draw the restoration tag.');
  paintRestorationTag(ctx, layoutRestorationTag(input, canvasMeasure(ctx)));
  return canvas.toDataURL('image/png').split(',')[1] ?? '';
}

/**
 * The tag is drawn for 3x2 stock. A station on 1.5x1 (or 1.25 square) gets the same picture at a higher source dpi,
 * so it prints the width of its stock.
 */
export function tagDpiForStock(preset: string | null | undefined): number {
  if (preset === '1.5x1') return TAG_DPI * 2;
  if (preset === '1.25x1.25') return Math.round((TAG_DPI * 3) / 1.25);
  return TAG_DPI;
}
