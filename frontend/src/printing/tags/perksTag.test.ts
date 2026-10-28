import { describe, expect, it } from 'vitest';
import {
  headerLines,
  layoutPerksTag,
  perksPrice,
  PERKS_HEADER,
  STRIP_AS_IS,
  STRIP_RETURNS,
  type PerksTagData,
} from './perksTag';
import { boxFor, qrDotsPerModule, type Measure, type TagBox, type TagOp } from '../tagCanvas';

// Arial-ish widths: black is wider than bold, bold than regular.
const measure: Measure = (text, size, font) => text.length * size * (font === 'black' ? 0.72 : font === 'bold' ? 0.6 : 0.55);

const DATA: PerksTagData = {
  text: '$12.00',
  qr_data: 'ITM0226342',
  product_title: 'Hamilton Beach 2-Slice Toaster, Black, with the wide slots and the crumb tray',
  product_brand: 'Hamilton Beach',
  include_text: true,
  retail_text: 'Retail $49.99',
  as_is: false,
};

const SIZES = {
  '2.25x1.25': boxFor({ w_in: 2.25, h_in: 1.25, dpi: 203 }),
  '1.5x1': boxFor({ w_in: 1.5, h_in: 1, dpi: 203 }),
  '3x2': boxFor({ w_in: 3, h_in: 2, dpi: 203 }),
  '2.25x1.25@300': boxFor({ w_in: 2.25, h_in: 1.25, dpi: 300 }),
};

type TextOp = Extract<TagOp, { kind: 'text' }>;
const textOps = (ops: TagOp[]) => ops.filter((op): op is TextOp => op.kind === 'text');
const texts = (ops: TagOp[]) => textOps(ops).map((op) => op.text);
const qrOf = (ops: TagOp[]) => ops.find((op): op is Extract<TagOp, { kind: 'qr' }> => op.kind === 'qr');

function inside(ops: TagOp[], box: TagBox) {
  for (const op of textOps(ops)) {
    const w = measure(op.text, op.size, op.font);
    const left = op.align === 'center' ? op.x - w / 2 : op.align === 'right' ? op.x - w : op.x;
    expect(left, op.text).toBeGreaterThanOrEqual(0);
    expect(left + w, op.text).toBeLessThanOrEqual(box.w + 0.5);
    const top = op.baseline === 'top' ? op.y : op.baseline === 'bottom' || op.baseline === 'alphabetic' ? op.y - op.size : op.y - op.size / 2;
    expect(top, op.text).toBeGreaterThanOrEqual(-0.5);
    expect(top + op.size, op.text).toBeLessThanOrEqual(box.h + 0.5);
  }
  const qr = qrOf(ops)!;
  expect(qr.x).toBeGreaterThanOrEqual(0);
  expect(qr.y).toBeGreaterThanOrEqual(0);
  expect(qr.x + qr.size).toBeLessThanOrEqual(box.w);
  expect(qr.y + qr.size).toBeLessThanOrEqual(box.h);
}

describe('Thrift+ Perks price tag (owner 2026-10-28, G3 / G4)', () => {
  it.each(Object.entries(SIZES))('on %s: retail struck, OUR PRICE, the price, the SKU, the QR link and the strip', (_, box) => {
    const ops = layoutPerksTag(DATA, box, measure);
    const words = texts(ops);
    expect(words).toContain('Retail $49.99');
    expect(words).toContain('OUR PRICE');
    expect(words).toContain('$12');
    expect(words).toContain('ITM0226342');
    expect(words).toContain(STRIP_RETURNS);
    expect(words.join(' ')).toContain('Hamilton Beach');
    expect(qrOf(ops)).toMatchObject({ data: 'HTTPS://ECOTHRIFT.US/I/ITM0226342' });
    // Never below whole 3-dot modules: the store scanners and phones read it.
    expect(qrDotsPerModule(qrOf(ops)!.data, qrOf(ops)!.size)).toBeGreaterThanOrEqual(3);
    // The retail line is struck through.
    const retail = textOps(ops).find((op) => op.text === 'Retail $49.99')!;
    expect(ops.some((op) => op.kind === 'line' && op.y1 === op.y2 && op.y1 > retail.y && op.y1 < retail.y + retail.size)).toBe(true);
    inside(ops, box);
  });

  it.each(Object.entries(SIZES))('on %s: the header says THRIFT+ PERKS (or THRIFT+ over PERKS) in paper on ink', (_, box) => {
    const ops = layoutPerksTag(DATA, box, measure);
    const header = textOps(ops).filter((op) => op.font === 'black' && op.fill === 'paper').map((op) => op.text).join(' ');
    expect(header).toBe(PERKS_HEADER);
  });

  it('2.25 x 1.25 matches the drawing: the strip full width at the bottom, the price the biggest thing', () => {
    const box = SIZES['2.25x1.25'];
    expect(box).toMatchObject({ w: 457, h: 254 });
    const ops = layoutPerksTag(DATA, box, measure);
    const strip = ops.find((op) => op.kind === 'rect' && op.fill === 'ink' && op.x === 0 && op.w === box.w && op.y > box.h / 2);
    expect(strip).toMatchObject({ y: 212, h: 42 });
    const price = textOps(ops).find((op) => op.text === '$12')!;
    expect(Math.max(...textOps(ops).map((op) => op.size))).toBe(price.size);
    expect(texts(ops)).toEqual(expect.arrayContaining(['Lower price', '+ easy returns']));
    // The title is two lines at most: bold, then regular with an ellipsis.
    const title = textOps(ops).filter((op) => op.text.startsWith('Hamilton') || op.text.startsWith('Toaster'));
    expect(title).toHaveLength(2);
    expect(title[1].text.endsWith('…') || title[0].text.endsWith('…')).toBe(true);
  });

  it.each(Object.entries(SIZES))('AS IS on %s: the AS IS strip, and no returns promise', (_, box) => {
    const ops = layoutPerksTag({ ...DATA, as_is: true }, box, measure);
    const words = texts(ops);
    expect(words).toContain(STRIP_AS_IS);
    expect(words).not.toContain(STRIP_RETURNS);
    expect(words).not.toContain('+ easy returns');
    expect(words.some((w) => /return/i.test(w) && w !== STRIP_AS_IS)).toBe(false);
    inside(ops, box);
  });

  it('AS IS keeps "Lower price / with Thrift+" where there is room', () => {
    const words = texts(layoutPerksTag({ ...DATA, as_is: true }, SIZES['2.25x1.25'], measure));
    expect(words).toEqual(expect.arrayContaining(['Lower price', 'with Thrift+']));
  });

  it('no retail: no struck line; a cents price prints its cents; N/A when the tag prints no price', () => {
    const box = SIZES['2.25x1.25'];
    const ops = layoutPerksTag({ ...DATA, retail_text: undefined, text: '$7.50' }, box, measure);
    expect(texts(ops).some((t) => t.startsWith('Retail'))).toBe(false);
    expect(texts(ops)).toContain('$7.50');
    expect(texts(layoutPerksTag({ ...DATA, include_text: false }, box, measure))).toContain('N/A');
    expect(perksPrice('$1,234.00')).toBe('$1,234');
    expect(perksPrice('N/A')).toBeNull();
  });

  it('a big price shrinks to fit the left zone', () => {
    const box = SIZES['1.5x1'];
    const ops = layoutPerksTag({ ...DATA, text: '$1,299.99' }, box, measure);
    expect(texts(ops)).toContain('$1,299.99');
    inside(ops, box);
  });

  it('when room is short the promise lines go first; the QR, price and strip stay', () => {
    // A short, wide label: the right zone has little height for the QR and two lines.
    const box = boxFor({ w_in: 3, h_in: 0.75, dpi: 203 });
    const ops = layoutPerksTag(DATA, box, measure);
    const words = texts(ops);
    expect(words).not.toContain('+ easy returns');
    expect(words).toContain('$12');
    expect(words).toContain(STRIP_RETURNS);
    expect(qrDotsPerModule(qrOf(ops)!.data, qrOf(ops)!.size)).toBeGreaterThanOrEqual(3);
  });

  it('header stacks THRIFT+ over PERKS only when that prints clearly bigger', () => {
    expect(headerLines(measure, 157, 40).lines).toEqual([PERKS_HEADER]);
    expect(headerLines(measure, 70, 60).lines).toEqual(['THRIFT+', 'PERKS']);
  });
});
