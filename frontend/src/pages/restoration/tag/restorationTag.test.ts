import { describe, expect, it } from 'vitest';
import { layoutRestorationTag, sentLabel, workWords } from './restorationTag';
import { boxFor, qrDotsPerModule, wrapWords, type Measure, type TagBox, type TagOp } from '../../../printing/tagCanvas';

// Arial-ish widths: black is wider than bold, bold than regular.
const measure: Measure = (text, size, font) => text.length * size * (font === 'black' ? 0.72 : font === 'bold' ? 0.6 : 0.55);

const INPUT = {
  sku: 'ITM0104829',
  title: 'KitchenAid Artisan 5 qt Stand Mixer, Empire Red, with the pouring shield and the flat beater',
  needs: ['Test', 'Assemble'],
  holdout: false,
  sent_on: '2026-10-28',
  sent_by: 'Ashley',
};

const SIZES = {
  '1.5x1': boxFor({ w_in: 1.5, h_in: 1, dpi: 203 }),
  '2.25x1.25': boxFor({ w_in: 2.25, h_in: 1.25, dpi: 203 }),
  '3x2': boxFor({ w_in: 3, h_in: 2, dpi: 203 }),
  '1.5x1@300': boxFor({ w_in: 1.5, h_in: 1, dpi: 300 }),
};

const texts = (ops: TagOp[]) => ops.flatMap((op) => (op.kind === 'text' ? [op.text] : []));
/** The work, on one line or stacked on two. */
const work = (ops: TagOp[]) => ops.filter((op): op is Extract<TagOp, { kind: 'text' }> =>
  op.kind === 'text' && op.font === 'black' && /^(TEST|ASSEMBLE|CLEAN|REPAIR|HOLDOUT)/.test(op.text));

function inside(ops: TagOp[], box: TagBox) {
  for (const op of ops) {
    if (op.kind !== 'text') continue;
    const w = measure(op.text, op.size, op.font);
    const left = op.align === 'center' ? op.x - w / 2 : op.align === 'right' ? op.x - w : op.x;
    expect(left, op.text).toBeGreaterThanOrEqual(0);
    expect(left + w, op.text).toBeLessThanOrEqual(box.w + 0.5);
    const top = op.baseline === 'top' ? op.y : op.baseline === 'bottom' ? op.y - op.size : op.y - op.size / 2;
    expect(top, op.text).toBeGreaterThanOrEqual(0);
    expect(top + op.size, op.text).toBeLessThanOrEqual(box.h + 0.5);
  }
}

describe('restoration tag', () => {
  it.each(Object.entries(SIZES))('on %s: RESTORATION, the SKU, the work, sent and by; never a price', (_, box) => {
    const ops = layoutRestorationTag(INPUT, box, measure);
    const words = texts(ops);
    expect(words[0]).toBe('RESTORATION');
    expect(words).toContain('ITM0104829');
    expect(work(ops).map((op) => op.text).join(' · ')).toBe('TEST · ASSEMBLE');
    expect(words).toContain('WED OCT 28');
    expect(words).toContain('Ashley');
    expect(words.some((w) => w.includes('$'))).toBe(false);
    expect(ops.find((op) => op.kind === 'qr')).toMatchObject({ data: 'ITM0104829' });
    inside(ops, box);
  });

  it('keeps the QR scannable on 1.5 x 1 (at least 3 dots a module) and the SKU big', () => {
    const box = SIZES['1.5x1'];
    const ops = layoutRestorationTag(INPUT, box, measure);
    const qr = ops.find((op) => op.kind === 'qr');
    expect(qr && qr.kind === 'qr' && qrDotsPerModule(qr.data, qr.size)).toBeGreaterThanOrEqual(3);
    const sku = ops.find((op) => op.kind === 'text' && op.text === 'ITM0104829');
    expect(sku && sku.kind === 'text' && sku.size).toBeGreaterThanOrEqual(18); // about 0.09 in tall
    // The work in big words: as tall as the SKU or close to it.
    expect(Math.min(...work(ops).map((op) => op.size))).toBeGreaterThanOrEqual(16);
  });

  it('the title gets one line on small stock and two on 3 x 2', () => {
    const titleLines = (box: TagBox) =>
      texts(layoutRestorationTag(INPUT, box, measure)).filter((t) => t.startsWith('KitchenAid') || t.endsWith('…'));
    expect(titleLines(SIZES['1.5x1']).length).toBeLessThanOrEqual(1);
    expect(titleLines(SIZES['3x2']).length).toBe(2);
  });

  it('scales with the label: 3 x 2 is drawn twice as big as 1.5 x 1', () => {
    const size = (box: TagBox) => {
      const op = layoutRestorationTag(INPUT, box, measure).find((o) => o.kind === 'qr');
      return op && op.kind === 'qr' ? op.size : 0;
    };
    expect(size(SIZES['3x2']) / size(SIZES['1.5x1'])).toBeCloseTo(2, 0);
  });

  it('many needs go on two lines; a holdout says HOLDOUT instead', () => {
    const all = { ...INPUT, needs: ['Test', 'Clean', 'Assemble', 'Repair', 'Check parts'] };
    for (const box of Object.values(SIZES)) {
      const ops = layoutRestorationTag(all, box, measure);
      expect(texts(ops)).toContain('TEST · CLEAN · ASSEMBLE');
      expect(texts(ops)).toContain('REPAIR · CHECK PARTS');
      inside(ops, box);
    }
    expect(workWords({ needs: ['Assemble'], holdout: true })).toBe('HOLDOUT · SELL AS IS');
  });

  it('reads the date as a calendar day', () => {
    expect(sentLabel('2026-10-28')).toBe('WED OCT 28');
    expect(sentLabel('')).toBe('');
  });

  it('wraps words and marks a cut', () => {
    expect(wrapWords(measure, 'one two three four', 10, 'regular', 60, 1)).toEqual(['one two…']);
  });
});
