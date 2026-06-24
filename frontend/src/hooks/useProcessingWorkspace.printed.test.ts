import { describe, expect, it } from 'vitest';
import { printedPreviewToLabelInputs } from './useProcessingWorkspace';

describe('printedPreviewToLabelInputs', () => {
  it('preserves item id for mark-printed after local print', () => {
    const rows = [
      {
        id: 42,
        sku: 'ET-000042',
        title: 'Widget',
        price: '9.99',
        brand: 'Acme',
        product_number: 'P-100',
      },
    ];
    expect(printedPreviewToLabelInputs(rows)).toEqual([
      {
        id: 42,
        sku: 'ET-000042',
        price: '9.99',
        product_title: 'Widget',
        product_brand: 'Acme',
        product_number: 'P-100',
      },
    ]);
  });
});
