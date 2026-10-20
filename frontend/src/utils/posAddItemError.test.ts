import { AxiosError, type AxiosResponse } from 'axios';
import { describe, expect, it } from 'vitest';
import { parsePosAddItemError, snackbarVariantForPosAddItemError } from './posAddItemError';

function failure(status: number, data: Record<string, unknown>): AxiosError {
  const err = new AxiosError('Request failed');
  err.response = { status, data } as AxiosResponse;
  return err;
}

describe('parsePosAddItemError', () => {
  it('shows the sold dialog data only for a sold item with no other unit', () => {
    const parsed = parsePosAddItemError(
      failure(400, { code: 'ITEM_ALREADY_SOLD', item_id: 7, sku: 'ITM1', title: 'Lamp' }),
    );
    expect(parsed).toMatchObject({ kind: 'already_sold', itemId: 7, sku: 'ITM1', title: 'Lamp' });
  });

  it('answers an item already on the sale with its own plain message, not the sold dialog', () => {
    const parsed = parsePosAddItemError(
      failure(400, { code: 'ITEM_ALREADY_IN_CART', detail: 'ITM1 is already on this sale.', sku: 'ITM1' }),
    );
    expect(parsed.kind).toBe('already_in_cart');
    expect(parsed.message).toBe('ITM1 is already on this sale.');
    expect(snackbarVariantForPosAddItemError(parsed.kind)).toBe('warning');
  });

  it('keeps the other kinds', () => {
    expect(parsePosAddItemError(failure(404, { code: 'ITEM_NOT_FOUND' })).kind).toBe('not_found');
    expect(parsePosAddItemError(failure(400, { code: 'ITEM_ON_HOLD', can_override: true })).kind).toBe('item_on_hold');
    expect(parsePosAddItemError(new Error('x')).kind).toBe('network');
  });
});
