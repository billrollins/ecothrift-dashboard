import { describe, expect, it } from 'vitest';

import {
  buildProductLinksPatch,
  computeManifestProgress,
  formatManifestUnits,
  formatProductLinkSummary,
  manifestUnitsFromItemCount,
  processingRowFieldLayerTooltip,
} from './processingManifestAccounting';

describe('manifestUnitsFromItemCount', () => {
  it('defaults to one item per row unit', () => {
    expect(manifestUnitsFromItemCount(5, undefined)).toBe(5);
  });

  it('accounts for part ratio (10 items = 1 row unit)', () => {
    expect(
      manifestUnitsFromItemCount(20, { role: 'part', checkIns: 10, manifestUnits: 1 }),
    ).toBe(2);
  });

  it('accounts for set ratio (1 item = 10 row units)', () => {
    expect(
      manifestUnitsFromItemCount(2, { role: 'set', checkIns: 1, manifestUnits: 10 }),
    ).toBe(20);
  });
});

describe('computeManifestProgress', () => {
  it('uses manifest accounting when a product link is configured', () => {
    const result = computeManifestProgress(
      {
        productLinks: {
          '42': { role: 'part', checkIns: 10, manifestUnits: 1 },
        },
      },
      [{ productId: 42, totalQty: 25 }],
    );
    expect(result.itemCount).toBe(25);
    expect(result.manifestUnits).toBe(2.5);
    expect(result.usesManifestAccounting).toBe(true);
  });
});

describe('formatManifestUnits', () => {
  it('shows fractional manifest units cleanly', () => {
    expect(formatManifestUnits(2.5)).toBe('2.5');
    expect(formatManifestUnits(3)).toBe('3');
  });
});

describe('formatProductLinkSummary', () => {
  it('summarizes set and part ratios', () => {
    expect(formatProductLinkSummary({ role: 'set', checkIns: 1, manifestUnits: 10 })).toBe('Set 1:10');
    expect(formatProductLinkSummary({ role: 'part', checkIns: 10, manifestUnits: 1 })).toBe('Part 10:1');
    expect(formatProductLinkSummary({ role: null, checkIns: 1, manifestUnits: 1 })).toBe('');
  });
});

describe('processingRowFieldLayerTooltip', () => {
  it('always shows manifest, ai, and final identity layers', () => {
    expect(
      processingRowFieldLayerTooltip({ manifest: 'Set of 10 candles', ai: 'Candle set' }),
    ).toBe('manifest: Set of 10 candles\nai: Candle set\nfinal:');
  });

  it('shows blank layers when no sources exist', () => {
    expect(processingRowFieldLayerTooltip({})).toBe('manifest:\nai:\nfinal:');
    expect(processingRowFieldLayerTooltip(undefined)).toBe('manifest:\nai:\nfinal:');
  });

  it('shows ai and final price layers with manifest line', () => {
    expect(
      processingRowFieldLayerTooltip({ manifest: '7.00', ai: '8.50', final: '9.99' }, 'price'),
    ).toBe('manifest: $7.00\nai: $8.50\nfinal: $9.99');
  });

  it('formats unit retail manifest and ai as currency', () => {
    expect(
      processingRowFieldLayerTooltip({ manifest: '12.00', ai: '10.50', final: '11.00' }, 'unitRetail'),
    ).toBe('manifest: $12.00\nai: 10.50\nfinal: $11.00');
  });
});

describe('buildProductLinksPatch', () => {
  it('keeps attachment when resetting to standard accounting', () => {
    expect(
      buildProductLinksPatch(
        { '42': { role: 'set', checkIns: 1, manifestUnits: 10 } },
        42,
        { role: null, checkIns: 1, manifestUnits: 1 },
      ),
    ).toEqual({
      '42': { role: null, checkIns: 1, manifestUnits: 1 },
    });
  });
});
