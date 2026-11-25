import { describe, expect, it } from 'vitest';
import type { ItemCheckInDTO, ProcessingWorkspaceRowDTO } from '../../../types/inventory.types';
import { checkInStart, lastCheckInForProduct, retailDiffersFromRow } from './processingCheckInDefaults';

function checkIn(id: number, productId: number, at: string, defaults: ItemCheckInDTO['defaults']): ItemCheckInDTO {
  return {
    id, quantity: 1, items: [], created_at: at, created_by: null, dispute_count: 0, defaults,
    product: { id: productId } as ItemCheckInDTO['product'],
  };
}

const ROW = { itemCheckIns: [] as ItemCheckInDTO[], condition: 'like_new', dispatch: 'on_shelf' };

describe('where a check-in starts (#223)', () => {
  it('the first check-in of a product on the row starts from the row', () => {
    const s = checkInStart(ROW, 5, { retail: '20.00', price: '9.99' });
    expect(s).toMatchObject({ retail: '20.00', price: '9.99', from: 'row' });
  });

  it('a later check-in of that product starts from the LAST check-in, not the row', () => {
    const row = {
      ...ROW,
      itemCheckIns: [
        checkIn(1, 5, '2026-11-24T10:00:00Z', { price: '7.00', retail: '18.00', condition: 'good' }),
        checkIn(2, 5, '2026-11-24T11:00:00Z', { price: '6.50', retail: '17.00', condition: 'fair', dispatch: 'on_shelf' }),
        checkIn(3, 8, '2026-11-24T12:00:00Z', { price: '1.00', retail: '2.00' }),
      ],
    };
    expect(lastCheckInForProduct(row.itemCheckIns, 5)?.id).toBe(2);
    expect(checkInStart(row, 5, { retail: '20.00', price: '9.99' })).toMatchObject({
      retail: '17.00', price: '6.50', condition: 'fair', from: 'last', fromCheckInId: 2,
    });
    // Another product on the same row still starts from the row.
    expect(checkInStart(row, 9, { retail: '20.00', price: '9.99' }).from).toBe('row');
  });

  it('does not carry over an "unknown" condition (not a choice on the form)', () => {
    const row = { ...ROW, itemCheckIns: [checkIn(1, 5, '2026-11-24T10:00:00Z', { price: '7.00', condition: 'unknown' })] };
    expect(checkInStart(row, 5, { retail: '', price: '' }).condition).toBe('like_new');
  });

  it('never starts a new check-in in Restoration (it needs its own request)', () => {
    const row = { ...ROW, itemCheckIns: [checkIn(1, 5, '2026-11-24T10:00:00Z', { price: '7.00', dispatch: 'restoration' })] };
    expect(checkInStart(row, 5, { retail: '', price: '' }).dispatch).toBe('on_shelf');
  });
});

describe('the red "differs from the row" line (#223)', () => {
  const row = (over: Partial<ProcessingWorkspaceRowDTO> = {}) =>
    ({ unitRetail: '20.00', productLinks: {}, ...over }) as Pick<ProcessingWorkspaceRowDTO, 'unitRetail' | 'productLinks'>;

  it('shows when a plain product\'s retail differs from the row', () => {
    expect(retailDiffersFromRow(row(), 5, '24.99')).toEqual({ rowRetail: '20.00' });
    expect(retailDiffersFromRow(row(), 5, '20')).toBeNull();
    expect(retailDiffersFromRow(row({ unitRetail: null }), 5, '24.99')).toEqual({ rowRetail: '' });
  });

  it('never shows for a set, a part or a pack', () => {
    expect(retailDiffersFromRow(row({ productLinks: { 5: { role: 'set', checkIns: 1, manifestUnits: 10 } } }), 5, '2.00')).toBeNull();
    expect(retailDiffersFromRow(row({ productLinks: { 5: { role: 'part', checkIns: 4, manifestUnits: 1 } } }), 5, '5.00')).toBeNull();
    expect(retailDiffersFromRow(row(), 5, '60.00', { isPack: true })).toBeNull();
  });
});
