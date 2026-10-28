import { beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_LABEL_SIZE,
  effectiveLabelSize,
  labelPixels,
  parseLabelSize,
  presetFor,
  readStationLabelSize,
  writeStationLabelSize,
} from './labelSize';
import { compareVersions, printServerState } from './printServerState';
import { layoutPriceTag, parsePrice } from './tags/priceTag';
import { layoutTestLabel, rulerTicks } from './tags/testLabel';
import { boxFor, estimateMeasure, qrDotsPerModule, type TagBox, type TagOp } from './tagCanvas';

const measure = estimateMeasure;

describe('label size setting', () => {
  beforeEach(() => localStorage.clear());

  it('this computer beats the store, the store beats the default', () => {
    const store = { w_in: 2.25, h_in: 1.25, dpi: 203 };
    const station = { w_in: 3, h_in: 2, dpi: 300 };
    expect(effectiveLabelSize(store, station)).toEqual(station);
    expect(effectiveLabelSize(store, null)).toEqual(store);
    expect(effectiveLabelSize(null, null)).toEqual(DEFAULT_LABEL_SIZE);
    expect(DEFAULT_LABEL_SIZE).toEqual({ w_in: 1.5, h_in: 1, dpi: 203 });
    // A broken override does not hide the store's size.
    expect(effectiveLabelSize(store, { w_in: 40, h_in: 1, dpi: 203 })).toEqual(store);
  });

  it('accepts typed sizes and refuses typos', () => {
    expect(parseLabelSize({ w_in: '2.25', h_in: '1.25', dpi: 300 })).toEqual({ w_in: 2.25, h_in: 1.25, dpi: 300 });
    expect(parseLabelSize({ w_in: 1.5, h_in: 1 })).toEqual({ w_in: 1.5, h_in: 1, dpi: 203 });
    expect(parseLabelSize({ w_in: 0.2, h_in: 1, dpi: 203 })).toBeNull();
    expect(parseLabelSize({ w_in: 1.5, h_in: 1, dpi: 600 })).toBeNull();
    expect(parseLabelSize('1.5x1')).toBeNull();
  });

  it('draws one pixel per printer dot', () => {
    expect(labelPixels({ w_in: 1.5, h_in: 1, dpi: 203 })).toEqual({ w: 305, h: 203 });
    expect(labelPixels({ w_in: 2.25, h_in: 1.25, dpi: 203 })).toEqual({ w: 457, h: 254 });
    expect(labelPixels({ w_in: 1.5, h_in: 1, dpi: 300 })).toEqual({ w: 450, h: 300 });
    expect(presetFor({ w_in: 2.25, h_in: 1.25 })).toBe('2.25x1.25');
    expect(presetFor({ w_in: 2, h_in: 1 })).toBeNull();
  });

  it('keeps this computer’s override in its browser', () => {
    writeStationLabelSize({ w_in: 3, h_in: 2, dpi: 203 });
    expect(readStationLabelSize()).toEqual({ w_in: 3, h_in: 2, dpi: 203 });
    writeStationLabelSize(null);
    expect(readStationLabelSize()).toBeNull();
  });
});

const SIZES: Record<string, TagBox> = {
  '1.5x1': boxFor({ w_in: 1.5, h_in: 1, dpi: 203 }),
  '2.25x1.25': boxFor({ w_in: 2.25, h_in: 1.25, dpi: 203 }),
  '3x2': boxFor({ w_in: 3, h_in: 2, dpi: 203 }),
  '1.25x1.25': boxFor({ w_in: 1.25, h_in: 1.25, dpi: 203 }),
  '1.5x1@300': boxFor({ w_in: 1.5, h_in: 1, dpi: 300 }),
};

function textBounds(op: Extract<TagOp, { kind: 'text' }>) {
  const w = measure(op.text, op.size, op.font);
  const left = op.align === 'center' ? op.x - w / 2 : op.align === 'right' ? op.x - w : op.x;
  const cap = op.baseline === 'bottom' ? 0.72 : op.baseline === 'alphabetic' ? 0.8 : 0;
  const top = op.baseline === 'top' ? op.y : cap ? op.y - op.size * cap : op.y - op.size / 2;
  return { left, right: left + w, top, bottom: top + op.size * (cap || 1) };
}

const TAG = {
  text: '$1,249.99',
  qr_data: 'ITM0104829',
  product_title: 'KitchenAid Artisan 5 qt Stand Mixer, Empire Red, with the pouring shield',
  product_brand: 'KitchenAid',
  include_text: true,
  retail_text: 'Retail $449.99',
};

describe('price tag at any size', () => {
  it.each(Object.entries(SIZES))('on %s everything stays on the label and the QR scans', (_, box) => {
    const ops = layoutPriceTag(TAG, box, measure);
    for (const op of ops) {
      if (op.kind !== 'text') continue;
      const b = textBounds(op);
      expect(b.left, op.text).toBeGreaterThanOrEqual(0);
      expect(b.right, op.text).toBeLessThanOrEqual(box.w + 0.5);
      expect(b.top, op.text).toBeGreaterThanOrEqual(0);
      expect(b.bottom, op.text).toBeLessThanOrEqual(box.h + 0.5);
    }
    const qr = ops.find((op) => op.kind === 'qr');
    expect(qr && qr.kind === 'qr' && qrDotsPerModule(qr.data, qr.size)).toBeGreaterThanOrEqual(3);
    const texts = ops.flatMap((op) => (op.kind === 'text' ? [op.text] : []));
    expect(texts).toEqual(expect.arrayContaining(['$', '1,249', '.99', 'Retail $449.99']));
    expect(ops.some((op) => op.kind === 'logo')).toBe(true);
  });

  it('keeps its proportions: the band is the left third and the top half', () => {
    for (const box of Object.values(SIZES)) {
      const band = layoutPriceTag(TAG, box, measure).find((op) => op.kind === 'rect' && op.fill === 'ink' && op.w > 2 && op.h > 2);
      expect(band).toMatchObject({ x: 0, y: 0, w: Math.floor(box.w / 3), h: Math.floor(box.h / 2) });
    }
  });

  it('scales type with the label', () => {
    const dollars = (box: TagBox) => {
      const op = layoutPriceTag({ ...TAG, text: '$24.99' }, box, measure).find((o) => o.kind === 'text' && o.text === '24');
      return op && op.kind === 'text' ? op.size : 0;
    };
    expect(dollars(SIZES['3x2'])).toBeGreaterThan(dollars(SIZES['2.25x1.25']));
    expect(dollars(SIZES['2.25x1.25'])).toBeGreaterThan(dollars(SIZES['1.5x1']));
  });

  it('reads prices like the print server did', () => {
    expect(parsePrice('$1249.5')).toEqual({ dollars: '1,249', cents: '.50' });
    expect(parsePrice('$0.75')).toEqual({ dollars: '0', cents: '.75' });
    expect(parsePrice('12')).toEqual({ dollars: '12', cents: '.00' });
    expect(parsePrice('N/A')).toBeNull();
    // Under a dollar: $ and cents only.
    const texts = layoutPriceTag({ ...TAG, text: '$0.75' }, SIZES['1.5x1'], measure)
      .flatMap((op) => (op.kind === 'text' ? [op.text] : []));
    expect(texts).toContain('.75');
    expect(texts).not.toContain('0');
  });
});

describe('test label', () => {
  it('ticks every quarter inch, longest on the inch', () => {
    const ticks = rulerTicks(305, 203);
    expect(ticks.map((t) => t.at)).toEqual([51, 102, 152, 203, 254]);
    expect(ticks[3].quarter).toBe(0);
  });

  it('says the size it was drawn for', () => {
    const size = { w_in: 2.25, h_in: 1.25, dpi: 203 as const };
    const texts = layoutTestLabel({ size }, boxFor(size), measure).flatMap((op) => (op.kind === 'text' ? [op.text] : []));
    expect(texts[0]).toBe('2.25 x 1.25 in');
    expect(texts[1]).toContain('203 dpi');
  });
});

describe('print server chip', () => {
  it('Offline, Needs update below the published version, else Online', () => {
    expect(printServerState(false, '1.9.9', '1.9.9')).toBe('offline');
    expect(printServerState(true, '1.9.8', '1.9.9')).toBe('needs_update');
    expect(printServerState(true, '1.9.9', '1.10.0')).toBe('needs_update');
    expect(printServerState(true, '1.9.9', '1.9.9')).toBe('online');
    expect(printServerState(true, '2.0.0', '1.9.9')).toBe('online');
    expect(printServerState(true, '1.9.9', undefined)).toBe('online');
    expect(compareVersions('1.9.10', '1.9.9')).toBe(1);
  });
});
