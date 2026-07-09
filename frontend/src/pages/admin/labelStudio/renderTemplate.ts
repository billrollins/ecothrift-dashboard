/**
 * Client-side renderer for Custom Label templates.
 *
 * Produces a monochrome raster at print DPI from a `LabelDefinition` + variable
 * values + optional background image. Shared by the designer canvas, print
 * dialog, and (Phase 1) dialog preview.
 */
import QRCode from 'qrcode';
import JsBarcode from 'jsbarcode';
import type {
  LabelBarcodeElement,
  LabelDefinition,
  LabelElement,
  LabelQrElement,
  LabelTextElement,
} from '../../../api/labels.api';

export const LABEL_RENDER_DPI = 203;

const FONT_FAMILIES: Record<string, string> = {
  arial: 'Arial, Helvetica, sans-serif',
  consolas: 'Consolas, "Courier New", monospace',
  georgia: 'Georgia, "Times New Roman", serif',
};

const QR_ECC: Record<string, 'L' | 'M' | 'Q' | 'H'> = {
  L: 'L',
  M: 'M',
  Q: 'Q',
  H: 'H',
};

export interface RenderInput {
  widthIn: number;
  heightIn: number;
  definition: LabelDefinition;
  values: Record<string, string>;
  background?: HTMLImageElement | null;
}

export function elementPayload(el: LabelElement, values: Record<string, string>): string {
  if ('literal' in el && el.literal != null) return el.literal;
  if ('variable' in el && el.variable) return values[el.variable] ?? '';
  return '';
}

function drawText(
  ctx: CanvasRenderingContext2D,
  el: LabelTextElement,
  values: Record<string, string>,
  w: number,
  h: number,
) {
  const text = elementPayload(el, values);
  if (!text) return;
  const px = (el.size_pt * LABEL_RENDER_DPI) / 72;
  const weight = el.bold ? 'bold ' : '';
  ctx.fillStyle = '#000000';
  ctx.font = `${weight}${px}px ${FONT_FAMILIES[el.font] ?? FONT_FAMILIES.arial}`;
  ctx.textAlign = el.align;
  ctx.textBaseline = 'top';
  ctx.fillText(text, (el.x_pct / 100) * w, (el.y_pct / 100) * h);
}

async function drawQr(
  ctx: CanvasRenderingContext2D,
  el: LabelQrElement,
  values: Record<string, string>,
  w: number,
  h: number,
) {
  const payload = elementPayload(el, values) || ' ';
  const side = Math.max(1, Math.round((Math.min(el.w_pct, el.h_pct) / 100) * Math.min(w, h)));
  const x = (el.x_pct / 100) * w;
  const y = (el.y_pct / 100) * h;
  const canvas = document.createElement('canvas');
  await QRCode.toCanvas(canvas, payload, {
    errorCorrectionLevel: QR_ECC[el.ecc] ?? 'M',
    margin: 0,
    width: side,
    color: { dark: '#000000', light: '#ffffff' },
  });
  ctx.drawImage(canvas, x, y, side, side);
}

function drawBarcode(
  ctx: CanvasRenderingContext2D,
  el: LabelBarcodeElement,
  values: Record<string, string>,
  w: number,
  h: number,
) {
  const payload = elementPayload(el, values) || '0';
  const boxW = Math.max(1, Math.round((el.w_pct / 100) * w));
  const boxH = Math.max(1, Math.round((el.h_pct / 100) * h));
  const x = (el.x_pct / 100) * w;
  const y = (el.y_pct / 100) * h;
  const canvas = document.createElement('canvas');
  try {
    JsBarcode(canvas, payload, {
      format: 'CODE128',
      displayValue: el.show_text !== false,
      margin: 0,
      width: 2,
      height: Math.max(20, boxH * (el.show_text !== false ? 0.7 : 0.95)),
      background: '#ffffff',
      lineColor: '#000000',
      fontSize: Math.max(10, Math.round(boxH * 0.18)),
    });
  } catch {
    // Invalid payload for Code128 — draw a placeholder box so layout is still visible.
    ctx.strokeStyle = '#000000';
    ctx.strokeRect(x, y, boxW, boxH);
    return;
  }
  ctx.drawImage(canvas, x, y, boxW, boxH);
}

/** Render the label to a canvas (white background, grayscale, black marks). */
export async function renderLabelToCanvas(input: RenderInput): Promise<HTMLCanvasElement> {
  const w = Math.max(1, Math.round(input.widthIn * LABEL_RENDER_DPI));
  const h = Math.max(1, Math.round(input.heightIn * LABEL_RENDER_DPI));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);

  if (input.background) {
    ctx.save();
    ctx.filter = 'grayscale(1)';
    ctx.drawImage(input.background, 0, 0, w, h);
    ctx.restore();
  }

  for (const el of input.definition.elements ?? []) {
    if (el.type === 'text') {
      drawText(ctx, el, input.values, w, h);
    } else if (el.type === 'qr') {
      await drawQr(ctx, el, input.values, w, h);
    } else if (el.type === 'barcode') {
      drawBarcode(ctx, el, input.values, w, h);
    }
  }
  return canvas;
}

export function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load background image'));
    img.src = url;
  });
}

/** PNG base64 (no data: prefix) for `/print/image-copies`. */
export function canvasToBase64Png(canvas: HTMLCanvasElement): string {
  return canvas.toDataURL('image/png').split(',')[1] ?? '';
}

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}
