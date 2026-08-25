import { describe, expect, it, vi } from 'vitest';
import {
  buildReceivePartPayloads,
  destinationToDispatch,
  evenSplitShares,
  familyAfterReceive,
  mintSequenceValid,
  parentRetailAfterPart,
  productChoicePayload,
  receiveDefaultPrice,
  receiveDefaultRetail,
  receiveProductReady,
  receiveReady,
  receiveScaleGrades,
  runRestorationReceive,
  splitBalances,
} from './restorationReceive';
import type { RestorationJobDTO } from '../../../types/inventory.types';

describe('retail split', () => {
  it('drops parent retail by the running part sum', () => {
    expect(parentRetailAfterPart(100, [20, 15], 0)).toBe(80);
    expect(parentRetailAfterPart(100, [20, 15], 1)).toBe(65);
  });

  it('balances when main plus parts equal the starting retail', () => {
    expect(splitBalances(100, 65, [20, 15])).toBe(true);
    expect(splitBalances(100, 70, [20, 15])).toBe(false);
    expect(familyAfterReceive(65, [20, 15])).toBe(100);
  });

  it('refuses a mint sequence that would not drop the parent', () => {
    expect(mintSequenceValid(40, [])).toBe(true);
    expect(mintSequenceValid(40, [10])).toBe(true);
    expect(mintSequenceValid(40, [0])).toBe(true);
    expect(mintSequenceValid(40, [40])).toBe(false);
    expect(mintSequenceValid(40, [10, 0])).toBe(true);
  });

  it('splits the family evenly and keeps the pennies on the main item', () => {
    expect(evenSplitShares(40, 2)).toEqual(['20.00', '20.00']);
    expect(evenSplitShares(40, 3)).toEqual(['13.34', '13.33', '13.33']);
  });
});

describe('productChoicePayload', () => {
  it('keeps the current product by sending nothing', () => {
    expect(productChoicePayload({ mode: 'keep' })).toEqual({});
  });

  it('points at an existing product', () => {
    expect(productChoicePayload({ mode: 'existing', productId: 9 })).toEqual({
      product_mode: 'existing',
      product_id: 9,
    });
  });

  it('sends none for a salvage skip', () => {
    expect(productChoicePayload({ mode: 'none' })).toEqual({ product_mode: 'none' });
  });

  it('creates a product from the identity fields', () => {
    expect(
      productChoicePayload({
        mode: 'new',
        title: ' Salvaged motor ',
        brand: 'Generic',
        category: 'Motors',
        model: 'X1',
        upc: '',
      }),
    ).toEqual({
      product_mode: 'new',
      title: 'Salvaged motor',
      brand: 'Generic',
      category: 'Motors',
      model: 'X1',
      upc: '',
    });
  });
});

describe('receiveReady', () => {
  it('needs a shelf price on the main item', () => {
    expect(
      receiveReady({
        mainPrice: '',
        mainProduct: { mode: 'keep' },
        parts: [],
        startingRetail: 40,
      }),
    ).toBe(false);
    expect(
      receiveReady({
        mainPrice: '24.00',
        mainProduct: { mode: 'keep' },
        parts: [],
        startingRetail: 40,
      }),
    ).toBe(true);
  });

  it('needs a picked or titled product when the main item is remapped', () => {
    expect(
      receiveReady({
        mainPrice: '24.00',
        mainProduct: { mode: 'existing', productId: 0 },
        parts: [],
        startingRetail: 40,
      }),
    ).toBe(false);
    expect(
      receiveReady({
        mainPrice: '24.00',
        mainProduct: { mode: 'new', title: '', brand: '', category: '', model: '', upc: '' },
        parts: [],
        startingRetail: 40,
      }),
    ).toBe(false);
    expect(receiveProductReady({ mode: 'existing', productId: 12 })).toBe(true);
  });

  it('needs a product, price, and positive retail on every part', () => {
    expect(
      receiveReady({
        mainPrice: '24.00',
        mainProduct: { mode: 'keep' },
        parts: [{ product: { mode: 'existing', productId: 0 }, price: '8.00', retail: '10.00' }],
        startingRetail: 40,
      }),
    ).toBe(false);
    expect(
      receiveReady({
        mainPrice: '24.00',
        mainProduct: { mode: 'keep' },
        parts: [{ product: { mode: 'existing', productId: 9 }, price: '8.00', retail: '10.00' }],
        startingRetail: 40,
      }),
    ).toBe(true);
  });

  it('treats a salvage part as ready with no product and no retail share', () => {
    expect(receiveProductReady({ mode: 'none' })).toBe(true);
    expect(
      receiveReady({
        mainPrice: '24.00',
        mainProduct: { mode: 'keep' },
        parts: [{ product: { mode: 'none' }, price: '0.00', retail: '0.00', dispatch: 'salvage' }],
        startingRetail: 40,
      }),
    ).toBe(true);
  });

  it('lets the main item leave as salvage at $0', () => {
    expect(
      receiveReady({
        mainPrice: '0.00',
        mainProduct: { mode: 'keep' },
        mainDispatch: 'salvage',
        parts: [],
        startingRetail: 40,
      }),
    ).toBe(true);
  });
});

describe('receive defaults', () => {
  it('uses original retail and the achieved grade value', () => {
    const job = {
      retail: '80.00',
      price: '40.00',
      final_grade: 'Working',
      grade_values: { Working: 55, Repairable: 30 },
      items: [{ retail: '80.00' }],
    } as unknown as RestorationJobDTO;
    expect(receiveDefaultRetail(job)).toBe('80.00');
    expect(receiveDefaultPrice(job)).toBe('55.00');
  });

  it('matches the achieved grade without caring about case', () => {
    const job = {
      retail: '20',
      final_grade: 'working',
      grade_values: { Working: 12 },
      items: [],
    } as unknown as RestorationJobDTO;
    expect(receiveDefaultPrice(job)).toBe('12.00');
  });
});

describe('receiveScaleGrades', () => {
  it('uses the scale order, then the priced keys', () => {
    const job = {
      scale: 'Functional',
      grade_values: { Working: 80, 'Parts-only': 20 },
    } as unknown as RestorationJobDTO;
    expect(receiveScaleGrades(job, { Functional: ['Working', 'Repairable', 'Parts-only'] })).toEqual([
      'Working',
      'Repairable',
      'Parts-only',
    ]);
    expect(receiveScaleGrades(job, {})).toEqual(['Working', 'Parts-only']);
  });
});

describe('buildReceivePartPayloads', () => {
  it('writes a decreasing parent_retail and the product choice', () => {
    const parts = buildReceivePartPayloads(40, [
      {
        outputId: 2,
        product: { mode: 'existing', productId: 9 },
        retail: '10.00',
        price: '8.00',
        condition: 'good',
        dispatch: 'on_shelf',
        notes: 'Motor',
        specifications: {},
      },
      {
        outputId: 3,
        product: {
          mode: 'new',
          title: 'Cord',
          brand: '',
          category: '',
          model: '',
          upc: '',
        },
        retail: '5.00',
        price: '4.00',
        condition: 'fair',
        dispatch: 'on_shelf',
        notes: 'Cord',
        specifications: { color: 'black' },
      },
    ]);
    expect(parts[0].payload.parent_retail).toBe('30.00');
    expect(parts[0].payload.product_id).toBe(9);
    expect(parts[1].payload.parent_retail).toBe('25.00');
    expect(parts[1].payload.product_mode).toBe('new');
    expect(parts[1].payload.title).toBe('Cord');
    expect(parts[1].payload.dispatch).toBe('on_shelf');
  });

  it('mints a salvage part with no catalog and leaves parent retail alone', () => {
    const parts = buildReceivePartPayloads(40, [
      {
        outputId: 2,
        product: { mode: 'none' },
        retail: '12.00',
        price: '8.00',
        condition: 'salvage',
        dispatch: 'salvage',
        notes: 'Hex nut',
        specifications: { size: '10mm' },
      },
    ]);
    expect(parts[0].payload.product_mode).toBe('none');
    expect(parts[0].payload.retail).toBe('0.00');
    expect(parts[0].payload.price).toBe('0.00');
    expect(parts[0].payload.parent_retail).toBe('40.00');
    expect(parts[0].payload.specifications).toEqual({});
  });
});

describe('destinationToDispatch', () => {
  it('maps a finish destination onto a Processing dispatch', () => {
    expect(destinationToDispatch('processing')).toBe('on_shelf');
    expect(destinationToDispatch('storage')).toBe('back_storage');
    expect(destinationToDispatch('salvage')).toBe('salvage');
    expect(destinationToDispatch('online_sales')).toBe('online_sales');
  });
});

describe('runRestorationReceive', () => {
  it('remaps the main item, mints each part, then checks in, then prints', async () => {
    const order: string[] = [];
    const remap = vi.fn(async (itemId: number) => {
      order.push(`remap:${itemId}`);
    });
    const mint = vi.fn(async (id: number) => {
      order.push(`mint:${id}`);
    });
    const checkIn = vi.fn(async () => {
      order.push('checkin');
      return { printed_items_preview: [{ id: 1, sku: 'ITM1', title: 'A', price: '10', brand: '', product_number: null }] };
    });
    const printLabels = vi.fn(async () => {
      order.push('print');
    });
    await runRestorationReceive({
      jobId: 15,
      submit: {
        main: { price: '24.00', retail: '25.00' },
        mainProduct: { mode: 'existing', productId: 44 },
        mainItemIds: [7],
        parts: [
          { outputId: 2, payload: { product_id: 9, retail: '10', price: '8', parent_retail: '30' } },
          { outputId: 3, payload: { product_id: 10, retail: '5', price: '4', parent_retail: '25' } },
        ],
        print: true,
      },
      remap,
      mint,
      checkIn,
      printLabels,
    });
    expect(order).toEqual(['remap:7', 'mint:2', 'mint:3', 'checkin', 'print']);
    expect(remap).toHaveBeenCalledWith(7, { product_mode: 'existing', product_id: 44 });
    expect(checkIn).toHaveBeenCalledWith(15, { price: '24.00', retail: '25.00' });
  });

  it('skips remap when the main product is kept', async () => {
    const remap = vi.fn();
    const mint = vi.fn();
    const checkIn = vi.fn(async () => ({}));
    await runRestorationReceive({
      jobId: 15,
      submit: {
        main: { price: '24.00' },
        mainProduct: { mode: 'keep' },
        mainItemIds: [7],
        parts: [],
        print: false,
      },
      remap,
      mint,
      checkIn,
    });
    expect(remap).not.toHaveBeenCalled();
    expect(mint).not.toHaveBeenCalled();
    expect(checkIn).toHaveBeenCalledTimes(1);
  });
});
