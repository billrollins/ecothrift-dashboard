import { describe, expect, it } from 'vitest';
import {
  layoutRestorationTag,
  sentLabel,
  TAG_H,
  TAG_W,
  tagDpiForStock,
  workWords,
  wrapWords,
  type Measure,
  type TagOp,
} from './restorationTag';

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

const texts = (ops: TagOp[]) => ops.flatMap((op) => (op.kind === 'text' ? [op.text] : []));

describe('restoration tag', () => {
  it('says RESTORATION, the scannable SKU, the work, and when and by whom; never a price', () => {
    const ops = layoutRestorationTag(INPUT, measure);
    const words = texts(ops);
    expect(words[0]).toBe('RESTORATION');
    expect(words).toContain('ITM0104829');
    expect(words).toContain('TEST · ASSEMBLE');
    expect(words).toContain('WED OCT 28');
    expect(words).toContain('Ashley');
    expect(words.some((w) => w.includes('$'))).toBe(false);
    const qr = ops.find((op) => op.kind === 'qr');
    expect(qr).toMatchObject({ data: 'ITM0104829' });
  });

  it('keeps every line inside the tag, the title to two lines', () => {
    const ops = layoutRestorationTag(INPUT, measure);
    for (const op of ops) {
      if (op.kind !== 'text') continue;
      const w = measure(op.text, op.size, op.font);
      const left = op.align === 'center' ? op.x - w / 2 : op.x;
      expect(left).toBeGreaterThanOrEqual(0);
      expect(left + w).toBeLessThanOrEqual(TAG_W);
      expect(op.y + op.size / 2).toBeLessThanOrEqual(TAG_H);
    }
    const title = texts(ops).filter((t) => t.startsWith('KitchenAid') || t.endsWith('…'));
    expect(title.length).toBeLessThanOrEqual(2);
  });

  it('many needs go on two lines; a holdout says HOLDOUT instead', () => {
    const all = { ...INPUT, needs: ['Test', 'Clean', 'Assemble', 'Repair', 'Check parts'] };
    const words = texts(layoutRestorationTag(all, measure));
    expect(words).toContain('TEST · CLEAN · ASSEMBLE');
    expect(words).toContain('REPAIR · CHECK PARTS');
    expect(workWords({ needs: ['Assemble'], holdout: true })).toBe('HOLDOUT · SELL AS IS');
  });

  it('reads the date as a calendar day, and scales to the stock', () => {
    expect(sentLabel('2026-10-28')).toBe('WED OCT 28');
    expect(sentLabel('')).toBe('');
    expect(tagDpiForStock('3x2')).toBe(203);
    expect(tagDpiForStock('1.5x1')).toBe(406);
    expect(tagDpiForStock(undefined)).toBe(203);
  });

  it('wraps words and marks a cut', () => {
    expect(wrapWords(measure, 'one two three four', 10, 'regular', 60, 1)).toEqual(['one two…']);
  });
});
