/**
 * The tag drawing kit: every label Dash prints is a pure layout (a list of ops in printer dots, tested) painted on a
 * canvas of exactly W x H inches at the printer's dpi, then sent through the print server's `/print/image-copies`
 * (there since 1.4.1), which prints pre-sized pictures at their physical size. A new tag design is one small file:
 * a `TagDesign` whose `layout` places text, QR, boxes and the logo in proportion to the box it gets.
 *
 * Print rule: text and QR are drawn crisp (whole-dot QR modules, and the finished picture is snapped to pure black
 * and white, the only two things a thermal printer makes). No AI art.
 */
import QRCode from 'qrcode';
import logoUrl from '../assets/label-logo-bw.png';
import { labelPixels, type LabelSize } from './labelSize';

export type TagFont = 'black' | 'bold' | 'regular';

export type TagOp =
  | { kind: 'rect'; x: number; y: number; w: number; h: number; fill: 'ink' | 'paper' }
  | { kind: 'line'; x1: number; y1: number; x2: number; y2: number; width: number }
  | { kind: 'text'; text: string; x: number; y: number; size: number; font: TagFont; fill: 'ink' | 'paper';
      align?: 'left' | 'center' | 'right'; baseline?: 'middle' | 'top' | 'bottom' | 'alphabetic' }
  | { kind: 'qr'; data: string; x: number; y: number; size: number }
  | { kind: 'logo'; x: number; y: number; w: number; h: number };

/** Width of a line of text at a size; the canvas in the browser, an estimate in tests. */
export type Measure = (text: string, size: number, font: TagFont) => number;

/** The box a design lays out in: whole printer dots, plus the dpi to turn inches into dots. */
export interface TagBox {
  w: number;
  h: number;
  dpi: number;
}

export interface TagDesign<T> {
  /** For the print job name and errors ("Price tag"). */
  name: string;
  layout: (data: T, box: TagBox, measure: Measure) => TagOp[];
}

export function boxFor(size: LabelSize): TagBox {
  const { w, h } = labelPixels(size);
  return { w, h, dpi: size.dpi };
}

/** Dots for a length in inches. */
export const dots = (box: TagBox, inches: number) => Math.max(1, Math.round(inches * box.dpi));

/** The largest whole size from `start` down to `min` at which `text` fits `maxW`. */
export function fitSize(measure: Measure, text: string, maxW: number, start: number, min: number, font: TagFont): number {
  let size = Math.floor(start);
  while (size > min && measure(text, size, font) > maxW) size -= 1;
  return Math.max(1, size);
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

/** A thin frame around the whole label (the edge of the stock). */
export function frame(box: TagBox, width = 2): TagOp[] {
  return [
    { kind: 'rect', x: 0, y: 0, w: box.w, h: width, fill: 'ink' },
    { kind: 'rect', x: 0, y: box.h - width, w: box.w, h: width, fill: 'ink' },
    { kind: 'rect', x: 0, y: 0, w: width, h: box.h, fill: 'ink' },
    { kind: 'rect', x: box.w - width, y: 0, w: width, h: box.h, fill: 'ink' },
  ];
}

/** QR modules for a code (error correction H, as on the price tag). */
export function qrModules(data: string): number {
  return QRCode.create(data, { errorCorrectionLevel: 'H' }).modules.size;
}

/**
 * Dots per QR module for a side: whole dots, one quiet module each side. A phone or the store scanners read a
 * module of 3 dots (0.015 in at 203 dpi) reliably; fewer is a risk, so layouts use this to check.
 */
export function qrDotsPerModule(data: string, side: number): number {
  return Math.floor(side / (qrModules(data) + 2));
}

/** Measure from a hidden canvas; a rough estimate when there is none (tests, node). */
export const estimateMeasure: Measure = (text, size, font) =>
  text.length * size * (font === 'black' ? 0.68 : font === 'bold' ? 0.58 : 0.53);

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

/** Black and white only: the thermal printer prints black; white is the bare stock. */
export function paintTag(ctx: CanvasRenderingContext2D, ops: TagOp[], logo?: CanvasImageSource | null): void {
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
      ctx.textBaseline = op.baseline ?? 'middle';
      ctx.textAlign = op.align ?? 'left';
      ctx.fillText(op.text, op.x, op.y);
    } else if (op.kind === 'logo') {
      if (logo) ctx.drawImage(logo, op.x, op.y, op.w, op.h);
    } else {
      // Whole modules on whole dots, a quiet zone of one module, centered in its square.
      const qr = QRCode.create(op.data, { errorCorrectionLevel: 'H' });
      const n = qr.modules.size;
      const cell = Math.max(1, Math.floor(op.size / (n + 2)));
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

/** Snap every dot to black or white, so the printer never dithers a gray edge. */
export function snapToInk(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    const v = lum < 140 ? 0 : 255;
    d[i] = v;
    d[i + 1] = v;
    d[i + 2] = v;
    d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
}

let logoPromise: Promise<HTMLImageElement | null> | null = null;

/** The black-and-white store logo (the one the print server's price tag used), loaded once. */
export function loadLogo(): Promise<HTMLImageElement | null> {
  if (!logoPromise) {
    logoPromise = new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = logoUrl;
    });
  }
  return logoPromise;
}

/** The logo's width over its height (406 x 100). */
export const LOGO_ASPECT = 4.06;

/** A design drawn at a size, as a base64 PNG (no data: prefix) ready for `/print/image-copies`. */
export async function renderTagPng<T>(design: TagDesign<T>, data: T, size: LabelSize): Promise<string> {
  const box = boxFor(size);
  const canvas = document.createElement('canvas');
  canvas.width = box.w;
  canvas.height = box.h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error(`This browser cannot draw the ${design.name.toLowerCase()}.`);
  const ops = design.layout(data, box, canvasMeasure(ctx));
  const logo = ops.some((op) => op.kind === 'logo') ? await loadLogo() : null;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, box.w, box.h);
  paintTag(ctx, ops, logo);
  snapToInk(ctx, box.w, box.h);
  return canvas.toDataURL('image/png').split(',')[1] ?? '';
}
