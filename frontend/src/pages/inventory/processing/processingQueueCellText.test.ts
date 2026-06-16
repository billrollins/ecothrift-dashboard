import { describe, expect, it } from 'vitest';

import { effectiveRowQty, processingIdentityHoverTooltip, processingRowBookmark, queueAttachedProductHint, queueQtyText, queueTitleText } from './processingQueueCellText';

const group = {
  memberRowNumbers: [2, 3],
  memberRowIds: [102, 103],
  totalQty: 15,
  totalDispositioned: 4,
};

describe('queueTitleText (P7 collapse)', () => {
  it('plain row shows bookmark title', () => {
    expect(queueTitleText({ title: 'LEGO Star Wars' })).toBe('LEGO Star Wars');
    expect(
      queueTitleText({
        title: 'Red Headband',
        standardizedIdentity: { title: 'hdbnd red', brand: '', model: '' },
      }),
    ).toBe('hdbnd red');
  });

  it('master row gets ⊟ prefix and member row list', () => {
    expect(queueTitleText({ title: 'LEGO Star Wars', collapsedGroup: group })).toBe(
      '⊟ LEGO Star Wars (+rows 2, 3)',
    );
  });

  it('member row gets ↳ prefix', () => {
    expect(queueTitleText({ title: 'LEGO Star Wars', collapseMasterId: 101 })).toBe('↳ LEGO Star Wars');
  });

  it('empty title falls back to em dash', () => {
    expect(queueTitleText({ title: '' })).toBe('—');
  });
});

describe('queueQtyText (P7 collapse)', () => {
  it('plain row shows own dispositioned/qty', () => {
    expect(queueQtyText({ qtyDispositioned: 1, qty: 5 })).toBe('1 / 5');
  });

  it('master row shows COMBINED group quantities', () => {
    expect(queueQtyText({ qtyDispositioned: 1, qty: 5, collapsedGroup: group })).toBe('4 / 15');
  });

  it('large values use locale separators', () => {
    expect(queueQtyText({ qtyDispositioned: 1000, qty: 2500 })).toBe('1,000 / 2,500');
  });
});

describe('effectiveRowQty (P7 collapse)', () => {
  it('plain row uses own quantities and server remaining/overage when present', () => {
    expect(effectiveRowQty({ qty: 5, qtyDispositioned: 2, qtyRemaining: 3, qtyOverage: 0 })).toEqual({
      qty: 5,
      dispositioned: 2,
      remaining: 3,
      overage: 0,
      isGroup: false,
    });
  });

  it('plain row derives remaining/overage when server fields absent', () => {
    expect(effectiveRowQty({ qty: 5, qtyDispositioned: 7 })).toEqual({
      qty: 5,
      dispositioned: 7,
      remaining: 0,
      overage: 2,
      isGroup: false,
    });
  });

  it("master uses COMBINED group totals — the owner's 5/3/7 group reads Expected 15", () => {
    // Master's own row is 5/5 (filled first), but the group has 10 left.
    expect(effectiveRowQty({ qty: 5, qtyDispositioned: 5, qtyRemaining: 0, collapsedGroup: group })).toEqual({
      qty: 15,
      dispositioned: 4,
      remaining: 11,
      overage: 0,
      isGroup: true,
    });
  });

  it('group overage computed from combined totals', () => {
    const over = { ...group, totalDispositioned: 20 };
    expect(effectiveRowQty({ qty: 5, qtyDispositioned: 5, collapsedGroup: over }).overage).toBe(5);
    expect(effectiveRowQty({ qty: 5, qtyDispositioned: 5, collapsedGroup: over }).remaining).toBe(0);
  });
});

describe('queueAttachedProductHint', () => {
  it('shows attached product when it differs from bookmark', () => {
    expect(
      queueAttachedProductHint(
        {
          title: 'Red Headband',
          standardizedIdentity: { title: 'hdbnd red', brand: 'Vendor', model: '' },
          product: {
            id: 1,
            product_number: 'P1',
            title: 'Red Headband',
            brand: 'Acme',
            model: '',
            specs: {},
            identifiers: {},
            tags: [],
            taxonomy: '',
            category: '',
            upc: '',
          },
        },
        'title',
      ),
    ).toBe('Product title: Red Headband');
  });

  it('returns empty when product matches bookmark', () => {
    expect(
      queueAttachedProductHint(
        {
          title: 'hdbnd red',
          standardizedIdentity: { title: 'hdbnd red', brand: 'Vendor', model: '' },
          product: {
            id: 1,
            product_number: 'P1',
            title: 'hdbnd red',
            brand: 'Vendor',
            model: '',
            specs: {},
            identifiers: {},
            tags: [],
            taxonomy: '',
            category: '',
            upc: '',
          },
        },
        'title',
      ),
    ).toBe('');
  });
});

describe('processingIdentityHoverTooltip', () => {
  it('shows both when display differs from standardized', () => {
    expect(processingIdentityHoverTooltip('Red Headband', 'hdbnd red', 'title')).toBe(
      'Showing: Red Headband\nStandardized title: hdbnd red',
    );
  });

  it('shows standardized only when values match', () => {
    expect(processingIdentityHoverTooltip('Acme Widget', 'Acme Widget', 'title')).toBe(
      'Standardized title: Acme Widget',
    );
  });

  it('falls back to display when no standardized value', () => {
    expect(processingIdentityHoverTooltip('Shelf label', undefined, 'brand')).toBe('Shelf label');
  });
});

describe('processingRowBookmark', () => {
  it('uses bookmark fields instead of coalesced row display values', () => {
    expect(
      processingRowBookmark({
        category: 'Apparel',
        identifiers: { upc: '111' },
        standardizedIdentity: {
          title: 'hdbnd red',
          brand: 'Vendor',
          model: 'M1',
          category: 'Accessories',
          identifiers: { upc: '222' },
        },
      }),
    ).toEqual({
      title: 'hdbnd red',
      brand: 'Vendor',
      model: 'M1',
      category: 'Accessories',
      identifiers: { upc: '222' },
    });
  });
});
