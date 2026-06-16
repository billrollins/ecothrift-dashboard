import { describe, expect, it } from 'vitest';

import { rowDetailsToProductEditorDraft } from '../manage/ProductManageDrawer';

describe('rowDetailsToProductEditorDraft', () => {
  it('maps row bookmark fields into a new product draft', () => {
    expect(
      rowDetailsToProductEditorDraft({
        title: 'Candle set',
        brand: 'Vendor',
        model: 'CS-10',
        category: 'Home Decor',
        tags: 'candle, set',
        identifiers: { upc: '012345678905' },
        specifications: { Color: 'Red' },
      }),
    ).toEqual({
      draft: {
        title: 'Candle set',
        brand: 'Vendor',
        model: 'CS-10',
        tagsText: 'candle, set',
        identifiers: { upc: '012345678905' },
        specifications: { color: 'Red' },
      },
      categoryName: 'Home Decor',
    });
  });

  it('defaults brand to Generic when blank', () => {
    expect(rowDetailsToProductEditorDraft({ title: 'Mystery item' }).draft.brand).toBe('Generic');
  });
});
