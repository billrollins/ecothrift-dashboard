import { describe, expect, it } from 'vitest';
import type { ManifestRawRow, StandardColumnDefinition } from '../../../api/inventory.api';
import {
  buildBucketPreviewDict,
  bucketMappedFieldCount,
  computeFormulaPreviewGrid,
  manifestBucketSampleKey,
  manifestBucketSampleKeyToId,
} from './formulaPreviewSnapshot';

describe('formulaPreviewSnapshot', () => {
  it('manifestBucketSampleKey is stable prefix', () => {
    expect(manifestBucketSampleKey('identifiers')).toBe('__manifest_bucket_identifiers');
    expect(manifestBucketSampleKeyToId('__manifest_bucket_identifiers')).toBe('identifiers');
    expect(manifestBucketSampleKeyToId('quantity')).toBeNull();
  });

  it('buildBucketPreviewDict skips empty trimmed values', () => {
    const raw = { Lot: '' };
    const { preview } = buildBucketPreviewDict(
      {
        'tracking.lot_id': 'TRIM([Lot])',
      },
      'tracking',
      raw,
    );
    expect(preview.lot_id).toBeUndefined();
  });

  it('bucketMappedFieldCount counts dotted keys with non-empty formulas', () => {
    expect(
      bucketMappedFieldCount(
        {
          'identifiers.asin': '[ASIN]',
          'identifiers.sku': '',
          quantity: '[Q]',
        },
        'identifiers',
      ),
    ).toBe(1);
  });

  it('computeFormulaPreviewGrid appends bucket columns after flat targets', () => {
    const columns: StandardColumnDefinition[] = [
      { key: 'quantity', label: 'Quantity', required: false },
      { key: 'brand', label: 'Brand', required: false },
    ];
    const formulas: Record<string, string> = {
      quantity: '[QTY]',
      'identifiers.sku': '[SKU]',
      'identifiers.asin': 'TRIM([ASIN])',
    };
    const rows: ManifestRawRow[] = [
      {
        row_number: 1,
        raw: { QTY: '2', SKU: 'S1', ASIN: 'B00TEST' },
      },
    ];
    const bid = manifestBucketSampleKey('identifiers');
    const { previewTargets, previewRows } = computeFormulaPreviewGrid(
      formulas,
      columns,
      rows,
      ['identifiers'],
    );
    expect(previewTargets.indexOf('quantity')).toBe(0);
    expect(previewTargets.indexOf(bid)).toBe(1);
    expect(previewTargets).toHaveLength(2);
    const cell = previewRows[0].cells[bid];
    expect(cell).toBeTruthy();
    const parsed = JSON.parse(cell!) as Record<string, string>;
    expect(parsed.sku).toBe('S1');
    expect(parsed.asin).toBe('B00TEST');
  });
});
