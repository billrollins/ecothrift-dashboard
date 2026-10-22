/**
 * The brand frame, drawn as vector on a canvas (creative-method.md: words and logos are live type, photos are
 * separate plates). One template per layout, each with photo ZONES the editor fills from the library:
 *
 *   hero   one full photo          hero3  one big photo over three small ones          grid4  2 x 2
 *
 * Every frame: the hook in big dark-green type on top, the photos, and a brand-green bar with the logo,
 * address, hours and the short Thrift+ line. The canvas is 1080 CSS px wide (Facebook's feed width) and is
 * exported at 2x, so a 4:5 post saves as 2160 x 2700 PNG. 9:16 (stories) is listed for later channels; its
 * top and bottom 250 px stay clear of words when it is turned on.
 */
import type { SocialLayout, SocialSize } from '../../../api/marketing.api';

export type FrameSize = SocialSize | '9:16';

export const FRAME_WIDTH = 1080;
export const EXPORT_SCALE = 2;
export const FRAME_HEIGHTS: Record<FrameSize, number> = { '1:1': 1080, '4:5': 1350, '9:16': 1920 };
export const LAYOUT_ZONES: Record<SocialLayout, number> = { hero: 1, hero3: 4, grid4: 4 };
export const LAYOUT_LABELS: Record<SocialLayout, string> = { hero: 'Single hero', hero3: 'Hero + 3', grid4: '2 x 2 grid' };

export const FRAME_COLORS = {
  page: '#ffffff',
  hook: '#1b5e20',
  bar: '#2e7d32',
  barText: '#ffffff',
  barSoft: '#e8f5e9',
  empty: '#f0f7f0',
  emptyLine: '#60ad5e',
};

const MARGIN = 40;
const GAP = 14;
const RADIUS = 18;
const FONT = 'Inter, "Segoe UI", system-ui, sans-serif';
/** Short on purpose: the full Thrift+ line is in the caption (creative-method.md, social posts). */
export const FRAME_THRIFT_LINE = 'Thrift+ members earn ThriftBucks · Free to join at any register';

export interface Rect { x: number; y: number; w: number; h: number }

export interface FrameGeometry {
  width: number;
  height: number;
  hook: Rect | null;
  photos: Rect;
  bar: Rect;
  zones: Rect[];
}

const BAR_HEIGHT = 178;

function hookHeight(size: FrameSize): number {
  return size === '1:1' ? 170 : 210;
}

/** Where everything sits. `withHook` false: an extra photo's frame (no hook, the photo takes the room). */
export function frameGeometry(layout: SocialLayout, size: FrameSize, withHook = true): FrameGeometry {
  const width = FRAME_WIDTH;
  const height = FRAME_HEIGHTS[size];
  // 9:16 keeps words out of the top and bottom 250 px (Stories put their own chrome there).
  const safe = size === '9:16' ? 250 : 0;
  const barH = BAR_HEIGHT;
  const bar = { x: 0, y: height - barH - safe, w: width, h: barH + safe };
  const hook = withHook ? { x: MARGIN, y: MARGIN + safe, w: width - MARGIN * 2, h: hookHeight(size) - MARGIN } : null;
  const top = hook ? hook.y + hook.h + GAP : MARGIN + safe;
  const photos = { x: MARGIN, y: top, w: width - MARGIN * 2, h: bar.y - MARGIN / 2 - top };
  return { width, height, hook, photos, bar, zones: zoneRects(layout, photos) };
}

export function zoneRects(layout: SocialLayout, area: Rect): Rect[] {
  const { x, y, w, h } = area;
  if (layout === 'hero') return [{ x, y, w, h }];
  if (layout === 'grid4') {
    const cw = (w - GAP) / 2;
    const ch = (h - GAP) / 2;
    return [
      { x, y, w: cw, h: ch },
      { x: x + cw + GAP, y, w: cw, h: ch },
      { x, y: y + ch + GAP, w: cw, h: ch },
      { x: x + cw + GAP, y: y + ch + GAP, w: cw, h: ch },
    ];
  }
  const smallH = Math.round((h - GAP) * 0.34);
  const heroH = h - GAP - smallH;
  const sw = (w - GAP * 2) / 3;
  return [
    { x, y, w, h: heroH },
    ...[0, 1, 2].map((i) => ({ x: x + i * (sw + GAP), y: y + heroH + GAP, w: sw, h: smallH })),
  ];
}

/** Which zone a point (in frame px) falls in, or -1. */
export function zoneAt(geometry: FrameGeometry, px: number, py: number): number {
  return geometry.zones.findIndex((z) => px >= z.x && px <= z.x + z.w && py >= z.y && py <= z.y + z.h);
}

/** Source crop that fills `zone` without stretching (object-fit: cover). */
export function coverCrop(imgW: number, imgH: number, zone: Rect): { sx: number; sy: number; sw: number; sh: number } {
  const scale = Math.max(zone.w / imgW, zone.h / imgH);
  const sw = zone.w / scale;
  const sh = zone.h / scale;
  return { sx: (imgW - sw) / 2, sy: (imgH - sh) / 2, sw, sh };
}

type Measure = (text: string) => number;

/** Greedy word wrap; the last line gets an ellipsis when the words do not fit in `maxLines`. */
export function wrapLines(text: string, maxWidth: number, maxLines: number, measure: Measure): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (let i = 0; i < words.length; i += 1) {
    const next = line ? `${line} ${words[i]}` : words[i];
    if (measure(next) <= maxWidth || !line) {
      line = next;
      continue;
    }
    lines.push(line);
    line = words[i];
    if (lines.length === maxLines) {
      lines[maxLines - 1] = `${lines[maxLines - 1]}…`;
      return lines;
    }
  }
  if (line) lines.push(line);
  return lines.slice(0, maxLines);
}

/** The biggest hook size (from 84 px down to 52 px) that fits two lines. */
export function fitHook(text: string, rect: Rect, measureAt: (px: number) => Measure): { px: number; lines: string[] } {
  for (let px = 84; px >= 52; px -= 4) {
    const measure = measureAt(px);
    const lines = wrapLines(text, rect.w, 2, measure);
    const fits = lines.length * px * 1.12 <= rect.h && !lines.some((l) => l.endsWith('…'));
    if (fits) return { px, lines };
  }
  const px = 52;
  return { px, lines: wrapLines(text, rect.w, 2, measureAt(px)) };
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

export interface FrameInput {
  layout: SocialLayout;
  size: FrameSize;
  hook: string;
  address: string;
  hours: string;
  logo: HTMLImageElement | null;
  /** One per zone; null draws an empty, numbered zone (editor only). */
  photos: Array<HTMLImageElement | ImageBitmap | null>;
  withHook?: boolean;
  /** Editor: highlight a zone (the one being filled or dragged over). */
  activeZone?: number;
  /** Export: leave empty zones blank instead of numbering them. */
  forExport?: boolean;
}

/** Draw the whole frame onto `ctx` at `scale` (1 = 1080 wide). */
export function drawFrame(ctx: CanvasRenderingContext2D, input: FrameInput, scale = 1): FrameGeometry {
  const g = frameGeometry(input.layout, input.size, input.withHook !== false);
  ctx.save();
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.fillStyle = FRAME_COLORS.page;
  ctx.fillRect(0, 0, g.width, g.height);

  if (g.hook) {
    const measureAt = (px: number) => {
      ctx.font = `800 ${px}px ${FONT}`;
      return (t: string) => ctx.measureText(t).width;
    };
    const fit = fitHook(input.hook || '', g.hook, measureAt);
    ctx.font = `800 ${fit.px}px ${FONT}`;
    ctx.fillStyle = FRAME_COLORS.hook;
    ctx.textBaseline = 'top';
    const lineH = fit.px * 1.12;
    const blockH = fit.lines.length * lineH;
    const top = g.hook.y + Math.max(0, (g.hook.h - blockH) / 2);
    fit.lines.forEach((line, i) => ctx.fillText(line, g.hook!.x, top + i * lineH));
  }

  g.zones.forEach((zone, i) => {
    const img = input.photos[i] ?? null;
    ctx.save();
    roundRect(ctx, zone, RADIUS);
    ctx.clip();
    if (img) {
      const w = 'naturalWidth' in img ? img.naturalWidth : img.width;
      const h = 'naturalHeight' in img ? img.naturalHeight : img.height;
      const crop = coverCrop(w, h, zone);
      ctx.drawImage(img, crop.sx, crop.sy, crop.sw, crop.sh, zone.x, zone.y, zone.w, zone.h);
    } else {
      ctx.fillStyle = FRAME_COLORS.empty;
      ctx.fillRect(zone.x, zone.y, zone.w, zone.h);
      if (!input.forExport) {
        ctx.fillStyle = FRAME_COLORS.emptyLine;
        ctx.font = `700 ${Math.min(96, zone.h / 3)}px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`+${i + 1}`, zone.x + zone.w / 2, zone.y + zone.h / 2);
        ctx.textAlign = 'start';
      }
    }
    ctx.restore();
    if (input.activeZone === i && !input.forExport) {
      ctx.save();
      roundRect(ctx, zone, RADIUS);
      ctx.lineWidth = 10;
      ctx.strokeStyle = '#F0C766';
      ctx.stroke();
      ctx.restore();
    }
  });

  // Brand bar: logo and address on one row, the hours under them, the short Thrift+ line at the bottom.
  const bar = g.bar;
  ctx.fillStyle = FRAME_COLORS.bar;
  ctx.fillRect(bar.x, bar.y, bar.w, bar.h);
  const pad = MARGIN;
  const logoH = 56;
  let logoW = 0;
  if (input.logo && input.logo.naturalWidth) {
    logoW = (input.logo.naturalWidth / input.logo.naturalHeight) * logoH;
    ctx.drawImage(input.logo, pad, bar.y + 22, logoW, logoH);
  }
  const textW = bar.w - pad * 2;
  ctx.fillStyle = FRAME_COLORS.barText;
  ctx.textBaseline = 'top';
  ctx.textAlign = 'right';
  ctx.font = `700 28px ${FONT}`;
  ctx.fillText(input.address || '', bar.w - pad, bar.y + 36, textW - logoW - 24);
  ctx.textAlign = 'left';
  ctx.font = `600 26px ${FONT}`;
  ctx.fillText(input.hours || '', pad, bar.y + 92, textW);
  ctx.fillStyle = FRAME_COLORS.barSoft;
  ctx.font = `500 23px ${FONT}`;
  ctx.fillText(FRAME_THRIFT_LINE, pad, bar.y + 132, textW);
  ctx.restore();
  return g;
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

/** Render the frame at export size and hand back the PNG. */
export async function renderPng(input: FrameInput): Promise<Blob> {
  const height = FRAME_HEIGHTS[input.size];
  const canvas = document.createElement('canvas');
  canvas.width = FRAME_WIDTH * EXPORT_SCALE;
  canvas.height = height * EXPORT_SCALE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser cannot draw the frame.');
  drawFrame(ctx, { ...input, forExport: true, activeZone: -1 }, EXPORT_SCALE);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not save the image.'))), 'image/png');
  });
}

/**
 * The images Post it saves: the main frame (the template's zones), then each extra photo in a single-hero frame
 * without the hook, so every picture carries the brand bar.
 */
export function exportPlan(layout: SocialLayout, photoCount: number): Array<{ layout: SocialLayout; from: number; count: number; withHook: boolean }> {
  const zones = LAYOUT_ZONES[layout];
  const plan = [{ layout, from: 0, count: zones, withHook: true }];
  for (let i = zones; i < photoCount; i += 1) plan.push({ layout: 'hero' as SocialLayout, from: i, count: 1, withHook: false });
  return plan;
}
