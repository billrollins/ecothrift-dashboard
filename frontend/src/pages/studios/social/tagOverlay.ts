/**
 * A post photo with its tag overlay (owner 2026-10-22, F6: photo overlays, not templates). Each photo goes out as its
 * own image at the post's size (Facebook feed 4:5 or 1:1), the photo filling it, a small store mark on top, and, on a
 * product photo, the item's tag in the corner the poster picks.
 *
 * The tag's words are the rulebook's (thrift-plus-decisions.md):
 * - "Retail $x" struck through, only when the tag's retail passed the retail check (F1; the server sends null else).
 * - OUR PRICE and the price, as on the member scanner.
 * - "Thrift+ 3-day returns" (W1: the return privilege is the members') or "AS IS" (A1, W9).
 * - "+x.xx ThriftBucks today" over "for Thrift+ members": a number with the unit's name, never "$" (V8), with
 *   "Thrift+ members" in the same view (V10). Today's, because the number changes day to day.
 *
 * Drawn 1080 CSS px wide and saved at 2x as JPEG (a 4:5 photo is 2160 x 2700). Phase 6 adds the other channels'
 * sizes: 9:16 for Stories and TikTok (the top and bottom 250 px stay clear of the tag and the store mark, where the
 * apps put their own buttons; creative-method.md) and 4:3 for Google Business Profile.
 */
import type { PhotoSize, SocialTag, TagCorner } from '../../../api/marketing.api';

export const PHOTO_WIDTH = 1080;
export const EXPORT_SCALE = 2;
export const PHOTO_HEIGHTS: Record<PhotoSize, number> = { '1:1': 1080, '4:5': 1350, '9:16': 1920, '4:3': 810 };
/** Room kept clear at the top and bottom of a size (9:16: the Story and TikTok buttons). */
export const SAFE_EDGE: Record<PhotoSize, number> = { '1:1': 0, '4:5': 0, '9:16': 250, '4:3': 0 };
export const CORNER_LABELS: Record<TagCorner, string> = {
  tl: 'Top left', tr: 'Top right', bl: 'Bottom left', br: 'Bottom right',
};

const FONT = 'Inter, "Segoe UI", system-ui, sans-serif';
const MARGIN = 36;
const CARD_W = 440;
const PAD = 28;
const COLORS = {
  green: '#1b5e20',
  greenSoft: '#2e7d32',
  ink: '#16211b',
  ink2: '#4a5a4f',
  grey: '#6b7280',
  asIs: '#222222',
  mark: 'rgba(27, 94, 32, 0.82)',
};

export interface Rect { x: number; y: number; w: number; h: number }

/** "$12", "$12.50", "$1,200". */
export function money(value: string): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return `$${value}`;
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 })}`;
}

export interface TagWords {
  retail: string | null;
  label: string;
  price: string;
  returns: string;
  bucks: string | null;
  bucksFor: string | null;
}

/** Every word the overlay prints, in one place (the rulebook checks in tagOverlay.test.ts read these). */
export function tagWords(tag: SocialTag): TagWords {
  const bucks = tag.thriftbucks && Number(tag.thriftbucks) > 0 ? Number(tag.thriftbucks).toFixed(2) : null;
  return {
    retail: tag.retail ? `Retail ${money(tag.retail)}` : null,
    label: 'OUR PRICE',
    price: money(tag.price),
    returns: tag.returnable ? 'Thrift+ 3-day returns' : 'AS IS',
    bucks: bucks ? `+${bucks} ThriftBucks today` : null,
    bucksFor: bucks ? 'for Thrift+ members' : null,
  };
}

/** Source crop that fills `box` without stretching (object-fit: cover). */
export function coverCrop(imgW: number, imgH: number, box: Rect): { sx: number; sy: number; sw: number; sh: number } {
  const scale = Math.max(box.w / imgW, box.h / imgH);
  const sw = box.w / scale;
  const sh = box.h / scale;
  return { sx: (imgW - sw) / 2, sy: (imgH - sh) / 2, sw, sh };
}

function roundRect(ctx: CanvasRenderingContext2D, r: Rect, radius: number) {
  ctx.beginPath();
  ctx.moveTo(r.x + radius, r.y);
  ctx.arcTo(r.x + r.w, r.y, r.x + r.w, r.y + r.h, radius);
  ctx.arcTo(r.x + r.w, r.y + r.h, r.x, r.y + r.h, radius);
  ctx.arcTo(r.x, r.y + r.h, r.x, r.y, radius);
  ctx.arcTo(r.x, r.y, r.x + r.w, r.y, radius);
  ctx.closePath();
}

/** The card's height for these words (the lines it stacks). */
export function cardHeight(words: TagWords): number {
  let h = PAD * 2;
  if (words.retail) h += 40;
  h += 28 + 96; // label + price
  h += 18 + 50; // gap + returns pill
  if (words.bucks) h += 18 + 38 + 30;
  return h;
}

/** Where the card sits: `corner` of a `height`-tall photo. */
export function cardRect(corner: TagCorner, height: number, words: TagWords, edge = 0): Rect {
  const h = cardHeight(words);
  const x = corner.endsWith('l') ? MARGIN : PHOTO_WIDTH - MARGIN - CARD_W;
  const y = corner.startsWith('t') ? MARGIN + edge : height - MARGIN - edge - h;
  return { x, y, w: CARD_W, h };
}

function drawCard(ctx: CanvasRenderingContext2D, r: Rect, words: TagWords) {
  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.28)';
  ctx.shadowBlur = 24;
  ctx.shadowOffsetY = 6;
  ctx.fillStyle = '#ffffff';
  roundRect(ctx, r, 24);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  const left = r.x + PAD;
  const inner = r.w - PAD * 2;
  let y = r.y + PAD;
  if (words.retail) {
    ctx.font = `600 28px ${FONT}`;
    ctx.fillStyle = COLORS.grey;
    ctx.fillText(words.retail, left, y + 28, inner);
    const w = Math.min(ctx.measureText(words.retail).width, inner);
    ctx.fillRect(left, y + 18, w, 3);
    y += 40;
  }
  ctx.font = `800 22px ${FONT}`;
  ctx.fillStyle = COLORS.ink2;
  ctx.fillText(words.label, left, y + 22, inner);
  y += 28;
  ctx.font = `800 92px ${FONT}`;
  ctx.fillStyle = COLORS.green;
  ctx.fillText(words.price, left - 4, y + 84, inner + 4);
  y += 96 + 18;

  ctx.font = `800 24px ${FONT}`;
  const pillW = Math.min(ctx.measureText(words.returns).width + 40, inner);
  ctx.fillStyle = words.returns === 'AS IS' ? COLORS.asIs : COLORS.green;
  roundRect(ctx, { x: left, y, w: pillW, h: 50 }, 25);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.fillText(words.returns, left + 20, y + 34, pillW - 40);
  y += 50;

  if (words.bucks && words.bucksFor) {
    y += 18;
    ctx.font = `800 32px ${FONT}`;
    ctx.fillStyle = COLORS.greenSoft;
    ctx.fillText(words.bucks, left, y + 32, inner);
    y += 38;
    ctx.font = `600 22px ${FONT}`;
    ctx.fillStyle = COLORS.ink2;
    ctx.fillText(words.bucksFor, left, y + 24, inner);
  }
  ctx.restore();
}

function drawMark(ctx: CanvasRenderingContext2D, logo: HTMLImageElement, right: boolean, edge = 0) {
  const h = 52;
  const w = Math.round((logo.width / logo.height) * h);
  const box = { x: right ? PHOTO_WIDTH - MARGIN - w - 32 : MARGIN, y: MARGIN + edge, w: w + 32, h: h + 20 };
  ctx.save();
  ctx.fillStyle = COLORS.mark;
  roundRect(ctx, box, box.h / 2);
  ctx.fill();
  ctx.drawImage(logo, box.x + 16, box.y + 10, w, h);
  ctx.restore();
}

export interface TagPhotoInput {
  size: PhotoSize;
  photo: HTMLImageElement | ImageBitmap | null;
  tag: SocialTag | null | undefined;
  overlay: boolean;
  corner: TagCorner;
  logo: HTMLImageElement | null;
}

/** Draw one post photo at `scale` (1 = 1080 wide). */
export function drawTagPhoto(ctx: CanvasRenderingContext2D, input: TagPhotoInput, scale = 1): void {
  const height = PHOTO_HEIGHTS[input.size];
  const edge = SAFE_EDGE[input.size];
  ctx.save();
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.fillStyle = '#eef3ef';
  ctx.fillRect(0, 0, PHOTO_WIDTH, height);
  if (input.photo) {
    const { sx, sy, sw, sh } = coverCrop(input.photo.width, input.photo.height, { x: 0, y: 0, w: PHOTO_WIDTH, h: height });
    ctx.drawImage(input.photo, sx, sy, sw, sh, 0, 0, PHOTO_WIDTH, height);
  }
  const showTag = Boolean(input.tag && input.overlay);
  // The store mark sits top left, or top right when the tag takes the top left.
  if (input.logo) drawMark(ctx, input.logo, showTag && input.corner === 'tl', edge);
  if (showTag && input.tag) {
    const words = tagWords(input.tag);
    drawCard(ctx, cardRect(input.corner, height, words, edge), words);
  }
  ctx.restore();
}

/** Load an image from a blob URL or a same-origin asset. */
export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not load the image.'));
    img.src = src;
  });
}

/** The photo at export size as a JPEG (photos stay small enough to share several at once). */
export async function renderTagJpeg(input: TagPhotoInput): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = PHOTO_WIDTH * EXPORT_SCALE;
  canvas.height = PHOTO_HEIGHTS[input.size] * EXPORT_SCALE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser cannot draw the photo.');
  drawTagPhoto(ctx, input, EXPORT_SCALE);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not save the image.'))), 'image/jpeg', 0.92);
  });
}
